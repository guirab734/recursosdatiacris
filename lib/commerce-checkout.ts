import "server-only";
import { randomUUID } from "node:crypto";
import { allProducts, db, demoMode } from "./catalog";
import { calculateQuote } from "./validation";
import {
  shippingRequestSchema,
  orderRequestSchema,
  withShippingBenefit,
} from "./commerce-validation";
import { customerSession } from "./customer-session";
import { verifiedAddress } from "./postal-address";
import {
  quoteShipping,
  ShippingError,
  type ShippingOption as ProviderOption,
} from "./shipping/melhor-envio";
import { fingerprint, type OrderRecord } from "./orders";
import { HttpError } from "./http";
import type { ShippingQuote, CustomerAddress } from "./commerce-types";
import { money, type Quote } from "./types";
import { getPaymentLimits, VeloraError } from "./payments/velora";
import { resolveCoupon, publicCoupon } from "./coupons";
import { couponAmounts } from "./coupon-validation";
import type { AppliedCoupon } from "./coupon-types";

type StoredQuote = ShippingQuote & { provider_options: ProviderOption[] };
export const shippingItems = (items: Quote["items"]) =>
  items.map((item) => ({
    id: item.product_id,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
  }));
const quoteFingerprint = (
  address: CustomerAddress,
  items: Quote["items"],
  coupon: AppliedCoupon | null = null,
) =>
  fingerprint({
    address,
    items: [...items].sort((a, b) => a.product_id.localeCompare(b.product_id)),
    ...(coupon ? { coupon } : {}),
  });
export async function createShippingQuote(
  input: unknown,
): Promise<ShippingQuote> {
  if (demoMode())
    throw new HttpError(
      503,
      "Pedidos e pagamentos ficam disponíveis no catálogo conectado à loja.",
    );
  const data = shippingRequestSchema.parse(input);
  const session = await customerSession(true);
  const { address, local } = await verifiedAddress(data.address);
  const quote = calculateQuote(data.items, await allProducts());
  const coupon = await resolveCoupon(data.coupon_code, quote.total_cents);
  const applied = publicCoupon(coupon);
  const amounts = couponAmounts(quote.total_cents, 0, applied);
  if (quote.total_cents > 1_000_000_000)
    throw new HttpError(400, "Para esse volume, entre em contato com a loja.");
  let providerOptions: ProviderOption[] = [];
  if (!local) {
    try {
      providerOptions = await quoteShipping({
        destinationPostalCode: address.postal_code,
        items: shippingItems(quote.items),
      });
    } catch (e) {
      if (e instanceof ShippingError) throw new HttpError(e.status, e.message);
      throw e;
    }
    if (!providerOptions.length)
      throw new HttpError(
        422,
        "Não encontramos transportadoras para esse CEP. Confira o CEP ou fale com a loja.",
      );
  }
  const options = withShippingBenefit(
    providerOptions.map((o) => ({
      id: o.id,
      name: o.name,
      company: o.company,
      price_cents: o.priceCents,
      min_days: o.minDays,
      max_days: o.maxDays + 1,
    })),
    amounts.discounted_subtotal_cents,
    process.env.FREE_SHIPPING_ALL_SERVICES === "true",
  ).map((option) => {
    const total = couponAmounts(
      quote.total_cents,
      option.charged_cents,
      applied,
    );
    return {
      ...option,
      discount_cents: total.discount_cents,
      total_cents: total.total_cents,
    };
  });
  const result: ShippingQuote = {
    quote_id: randomUUID(),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    local,
    subtotal_cents: quote.total_cents,
    coupon: applied,
    ...amounts,
    free_shipping_threshold: local ? 15000 : 30000,
    options,
    preparation_min_days: 0,
    preparation_max_days: 1,
    preparation_label: "Postagem em até 24 horas úteis",
  };
  const { error } = await db()
    .from("shipping_quotes")
    .insert({
      id: result.quote_id,
      guest_hash: session.guestHash,
      fingerprint: quoteFingerprint(address, quote.items, applied),
      expires_at: result.expires_at,
      snapshot: { ...result, provider_options: providerOptions },
    });
  if (error)
    throw new HttpError(
      503,
      "Não foi possível guardar a cotação. Tente novamente.",
    );
  return result;
}

export async function createOrder(input: unknown): Promise<OrderRecord> {
  if (demoMode())
    throw new HttpError(503, "Pedidos não estão disponíveis na demonstração.");
  const data = orderRequestSchema.parse(input);
  const session = await customerSession(true);
  const requestHash = fingerprint(data);
  const findExistingOrder = async (): Promise<OrderRecord | null> => {
    const { data: existing, error: existingError } = await db()
      .from("orders")
      .select("*")
      .eq("guest_hash", session.guestHash!)
      .eq("idempotency_key", data.idempotency_key)
      .maybeSingle();
    if (existingError)
      throw new HttpError(503, "Não foi possível consultar o pedido.");
    if (!existing) return null;
    if (existing.request_hash !== requestHash)
      throw new HttpError(
        409,
        "O pedido mudou. Recalcule a entrega para continuar.",
      );
    return existing as OrderRecord;
  };
  const existing = await findExistingOrder();
  if (existing) return existing;
  let insertFailure: { code: string; message: string } | null = null;
  try {
    const { data: saved, error } = await db()
      .from("shipping_quotes")
      .select("*")
      .eq("id", data.quote_id)
      .eq("guest_hash", session.guestHash!)
      .maybeSingle();
    if (error) throw new HttpError(503, "Não foi possível conferir a cotação.");
    if (!saved || new Date(saved.expires_at).getTime() <= Date.now())
      throw new HttpError(409, "A cotação expirou. Calcule o frete novamente.");
    const { address, local } = await verifiedAddress(data.address);
    const merchandise = calculateQuote(data.items, await allProducts());
    const coupon = await resolveCoupon(
      data.coupon_code,
      merchandise.total_cents,
    );
    const applied = publicCoupon(coupon);
    if (
      quoteFingerprint(address, merchandise.items, applied) !==
      saved.fingerprint
    )
      throw new HttpError(
        409,
        "Os dados ou preços mudaram. Calcule a entrega novamente.",
      );
    const snapshot = saved.snapshot as StoredQuote;
    const option = local
      ? null
      : snapshot.options.find((o) => o.id === data.service_id);
    if (!local && !option)
      throw new HttpError(400, "Escolha uma opção de entrega.");
    if (
      local &&
      (data.payment_method !== "whatsapp" || data.service_id !== null)
    )
      throw new HttpError(
        400,
        "A entrega em Aracaju é combinada pelo WhatsApp.",
      );
    if (!local && data.payment_method === "whatsapp")
      throw new HttpError(400, "Escolha Pix ou cartão para continuar.");
    const amounts = couponAmounts(
      merchandise.total_cents,
      option?.charged_cents ?? 0,
      applied,
    );
    // Check the merchant's current limits before reserving a coupon or creating
    // an order. This avoids consuming a test coupon for a Pix the gateway rejects.
    if (data.payment_method === "pix") {
      try {
        const limits = await getPaymentLimits();
        if (
          amounts.total_cents < limits.minCents ||
          amounts.total_cents > limits.maxCents
        )
          throw new HttpError(
            422,
            `A provedora aceita Pix de ${money(limits.minCents)} a ${money(limits.maxCents)}. Ajuste o pedido ou escolha atendimento por cartão.`,
          );
      } catch (error) {
        if (error instanceof VeloraError)
          throw new HttpError(
            503,
            "Não foi possível conferir os limites do Pix. Tente novamente em instantes.",
          );
        throw error;
      }
    }
    const row = {
      id: randomUUID(),
      guest_hash: session.guestHash,
      owner_id: session.email === address.email ? session.userId : null,
      customer_email: address.email,
      idempotency_key: data.idempotency_key,
      request_hash: requestHash,
      quote_id: data.quote_id,
      address,
      items: merchandise.items,
      subtotal_cents: merchandise.total_cents,
      shipping_cents: option?.charged_cents ?? 0,
      coupon_id: coupon?.id ?? null,
      coupon: applied,
      discount_cents: amounts.discount_cents,
      total_cents: amounts.total_cents,
      local,
      shipping: option,
      shipping_raw:
        snapshot.provider_options.find((o) => o.id === data.service_id) ?? null,
      payment_method: data.payment_method,
      payment_status: "pending",
      fulfillment_status: local ? "local_contact" : "awaiting_payment",
      fiscal_document:
        process.env.SHIPPING_DECLARATION_AUTHORIZED === "true"
          ? { type: "declaration" }
          : null,
    };
    const created = await db().from("orders").insert(row).select("*").single();
    if (created.error) {
      insertFailure = created.error;
      throw created.error;
    }
    return created.data as OrderRecord;
  } catch (error) {
    // A competing identical request may have consumed the coupon or quote
    // after our first read, even before this attempt reaches the INSERT.
    // Recover the committed order before turning that race into a user error.
    const recovered = await findExistingOrder();
    if (recovered) return recovered;
    if (insertFailure?.message.includes("coupon_"))
      throw new HttpError(
        409,
        "O cupom não está mais disponível para este pedido. Confira ou remova o cupom e calcule a entrega novamente.",
      );
    if (insertFailure?.code === "23505") {
      throw new HttpError(
        409,
        "Já existe um pedido para esta cotação. Consulte Meus pedidos.",
      );
    }
    if (insertFailure)
      throw new HttpError(
        503,
        "Não foi possível registrar o pedido. Tente novamente.",
      );
    throw error;
  }
}

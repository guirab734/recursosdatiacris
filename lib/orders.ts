import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./catalog";
import { customerSession } from "./customer-session";
import { HttpError } from "./http";
import { money } from "./types";
import { orderReference } from "./order-reference";
import type { AdminOrder, CustomerOrder } from "./commerce-types";

export type OrderRecord = Omit<
  AdminOrder,
  "whatsapp_url" | "order_url" | "reference"
> & {
  number: number;
  guest_hash: string;
  owner_id: string | null;
  customer_email: string;
  idempotency_key: string;
  request_hash: string;
  quote_id: string;
  payment_provider_id: string | null;
  payment_started_at: string | null;
  payment_checked_at: string | null;
  shipping_raw: unknown;
  shipping_started_at: string | null;
  shipping_request: unknown;
  fiscal_document: { type: "invoice" | "declaration"; key?: string } | null;
  coupon_id: string | null;
};
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function getOrder(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Pedido não encontrado.");
  const { data, error } = await db()
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HttpError(503, "Não foi possível consultar o pedido.");
  if (!data) throw new HttpError(404, "Pedido não encontrado.");
  return data as OrderRecord;
}
export async function authorizedOrder(id: string) {
  const session = await customerSession();
  const order = await getOrder(id);
  if (
    (!session.guestHash || order.guest_hash !== session.guestHash) &&
    (!session.email || order.customer_email !== session.email) &&
    (!session.userId || order.owner_id !== session.userId)
  )
    throw new HttpError(
      404,
      "Entre na sua conta ou use o navegador em que fez o pedido para acessá-lo.",
    );
  return order;
}
export function orderWhatsApp(order: OrderRecord) {
  const clean = (value: string) =>
    value.replace(/[*_~`<>\u0000-\u001f]/g, " ").trim();
  const a = order.address;
  const address = `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""}, ${a.neighborhood}, ${a.city}/${a.state}, CEP ${a.postal_code}`;
  const freight = order.local
    ? order.coupon?.kind === "final_total"
      ? "Entrega em Aracaju incluída no total do cupom. Vamos combinar a entrega."
      : order.subtotal_cents - (order.discount_cents || 0) >= 15000
      ? "Entrega grátis em Aracaju."
      : "Gostaria de combinar a melhor opção de entrega em Aracaju e o valor do frete."
    : `${order.shipping?.company} ${order.shipping?.name}: ${money(order.shipping_cents)}. Prazo estimado: ${order.shipping?.min_days} a ${order.shipping?.max_days} dias úteis, incluindo preparação.`;
  const payment =
    order.payment_status === "paid"
      ? "O pagamento já está confirmado. Gostaria de acompanhar meu pedido."
      : order.payment_method === "card"
        ? "Quero pagar via cartão. Pode confirmar a taxa da provedora e o valor final antes do pagamento?"
        : order.local
          ? "Vamos combinar o pagamento e a entrega?"
          : "Gostaria de falar sobre meu pedido.";
  const discount = order.coupon && order.discount_cents > 0
    ? `\nCupom ${clean(order.coupon.code)}: -${money(order.discount_cents)}` : "";
  const message = `Olá, Tia Cris! Meu pedido é ${orderReference(order.id)}.\n\n${order.items.map((item) => `${item.quantity} × ${clean(item.name)}: ${money(item.subtotal_cents)}`).join("\n")}\n\nProdutos: ${money(order.subtotal_cents)}${discount}\n${freight}\n${order.local && order.coupon?.kind !== "final_total" && order.subtotal_cents - (order.discount_cents || 0) < 15000 ? "Total dos produtos, frete a combinar" : "Total do pedido"}: ${money(order.total_cents)}\n\nNome: ${clean(a.name)}\nContato: ${a.phone}\nEndereço: ${clean(address)}\n\n${payment}`;
  const phone = process.env.WHATSAPP_NUMBER?.replace(/\D/g, "");
  if (!phone || !/^\d{10,15}$/.test(phone))
    throw new HttpError(503, "Atendimento temporariamente indisponível.");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
export function customerOrder(order: OrderRecord): CustomerOrder {
  const { document: _document, ...address } = order.address;
  return {
    id: order.id,
    reference: orderReference(order.id),
    created_at: order.created_at,
    updated_at: order.updated_at,
    address,
    items: order.items,
    subtotal_cents: order.subtotal_cents,
    shipping_cents: order.shipping_cents,
    coupon: order.coupon ?? null,
    discount_cents: order.discount_cents ?? 0,
    total_cents: order.total_cents,
    local: order.local,
    shipping: order.shipping,
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    pix: order.payment_status === "pending" ? order.pix : null,
    tracking_code: order.tracking_code,
    tracking_url: order.tracking_url,
    tracking_events: order.tracking_events,
    tracking_updated_at: order.tracking_updated_at,
    whatsapp_url: orderWhatsApp(order),
    order_url: `/pedidos/${order.id}`,
  };
}
export function adminOrder(order: OrderRecord): AdminOrder {
  return {
    ...customerOrder(order),
    address: order.address,
    shipping_provider_id: order.shipping_provider_id,
    label_url: order.label_url,
    last_error: order.last_error,
    notes: order.notes,
    paid_at: order.paid_at,
    posted_at: order.posted_at,
    delivered_at: order.delivered_at,
    needs_review: order.needs_review,
  };
}
export async function orderEvent(id: string, kind: string, message: string) {
  const { error } = await db()
    .from("order_events")
    .insert({ order_id: id, kind, message });
  if (error)
    throw new HttpError(
      503,
      "Não foi possível registrar a atualização do pedido.",
    );
}
export async function updateOrder(id: string, values: Partial<OrderRecord>) {
  const { error } = await db().from("orders").update(values).eq("id", id);
  if (error) throw new HttpError(503, "Não foi possível atualizar o pedido.");
}
export async function enqueueOrderJob(
  id: string,
  kind: "payment_sync" | "shipping_prepare" | "shipping_sync",
  delaySeconds = 0,
) {
  const { error } = await db()
    .from("order_jobs")
    .upsert(
      {
        order_id: id,
        kind,
        run_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        done: false,
      },
      { onConflict: "order_id,kind" },
    );
  if (error)
    throw new HttpError(
      503,
      "Não foi possível agendar o acompanhamento do pedido.",
    );
}

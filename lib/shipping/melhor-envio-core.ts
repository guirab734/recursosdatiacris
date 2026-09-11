import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type ShippingItem = {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};
export type ShippingPackage = {
  height: number;
  width: number;
  length: number;
  weight: number;
};
export type ShippingOption = {
  id: string;
  company: string;
  name: string;
  priceCents: number;
  minDays: number;
  maxDays: number;
  packages: ShippingPackage[];
  /** Provider quote snapshot, stored exclusively on the server. */
  raw: Record<string, unknown>;
};
export type QuoteShippingInput = {
  destinationPostalCode: string;
  items: ShippingItem[];
};
export type ShippingParty = {
  name: string;
  email: string;
  phone: string;
  document?: string;
  companyDocument?: string;
  stateRegister?: string;
  address: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
};
export type ShippingFiscalDocument =
  | { type: "invoice"; key: string }
  | { type: "declaration"; authorized: true; key?: string };
export type PrepareShippingOrder = {
  orderId: string;
  paymentStatus: "paid";
  recipient: ShippingParty;
  items: ShippingItem[];
  option: ShippingOption;
  fiscalDocument: ShippingFiscalDocument;
  existingShipmentId?: string;
  /** Persist uncertainty in the order before permitting another attempt. */
  previousAttemptUncertain?: boolean;
};
export type ShipmentSnapshot = {
  id: string;
  protocol: string | null;
  status: string;
  trackingCode: string | null;
  trackingUrl: string | null;
  paidAt: string | null;
  generatedAt: string | null;
  postedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  updatedAt: string | null;
};
export type MelhorEnvioConfig = {
  token: string;
  contactEmail: string;
  sandbox?: boolean;
  sender: Partial<ShippingParty>;
  parcel: ShippingPackage;
  /** per_order follows the merchant's confirmed parcel for the entire order. */
  packing: { mode: "per_item" } | { mode: "per_order"; maxItems?: number };
  services?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class ShippingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}
export class ShippingOperationUncertainError extends ShippingError {
  constructor() {
    super(
      "O Melhor Envio não confirmou a criação. Confira o carrinho no Melhor Envio antes de tentar novamente.",
      "shipment_creation_uncertain",
      409,
    );
    this.name = "ShippingOperationUncertainError";
  }
}

const itemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(99),
  unitPriceCents: z.number().int().min(1).max(10_000_000),
});
const itemsSchema = z.array(itemSchema).min(1).max(100);
const parcelSchema = z.object({
  height: z.coerce.number().positive().max(300),
  width: z.coerce.number().positive().max(300),
  length: z.coerce.number().positive().max(300),
  weight: z.coerce.number().positive().max(300),
});
const textSchema = z.string().trim().min(1).max(200);
const partySchema = z
  .object({
    name: textSchema,
    email: z.email().max(254),
    phone: z.string().regex(/^\d{10,13}$/),
    document: z
      .string()
      .regex(/^\d{11}$/)
      .optional(),
    companyDocument: z
      .string()
      .regex(/^\d{14}$/)
      .optional(),
    stateRegister: z.string().max(30).optional(),
    address: textSchema,
    number: z.string().trim().min(1).max(30),
    complement: z.string().trim().max(150).optional(),
    district: textSchema,
    city: textSchema,
    state: z.string().regex(/^[A-Z]{2}$/),
    postalCode: z.string().regex(/^\d{8}$/),
  })
  .refine((party) => !!party.document !== !!party.companyDocument, {
    message: "Informe um CPF ou CNPJ para o envio.",
  });
const uuidSchema = z.uuid();
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const optionalText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function currencyCents(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value))
    return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(cents)
    ? cents
    : null;
}
function validDay(value: unknown): number | null {
  const number = Number(value);
  return value != null &&
    Number.isInteger(number) &&
    number >= 0 &&
    number <= 365
    ? number
    : null;
}
function validTrackingUrl(value: unknown, trackingCode: string | null) {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (
        url.protocol === "https:" &&
        ["melhorrastreio.com.br", "www.melhorrastreio.com.br"].includes(
          url.hostname,
        ) &&
        !url.username &&
        !url.password
      )
        return url.toString();
    } catch {
      /* Use the documented tracking code below. */
    }
  }
  return trackingCode && /^[A-Za-z0-9-]{5,60}$/.test(trackingCode)
    ? `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(trackingCode)}`
    : null;
}

export function normalizeShippingQuote(raw: unknown): ShippingOption[] {
  if (!Array.isArray(raw))
    throw new ShippingError(
      "Não foi possível consultar os fretes.",
      "invalid_shipping_response",
    );
  return raw
    .flatMap((entry) => {
      const row = object(entry);
      const company = optionalText(object(row.company).name);
      const name = optionalText(row.name);
      const id = Number(row.id);
      const priceCents = currencyCents(row.custom_price ?? row.price);
      const range = object(row.custom_delivery_range ?? row.delivery_range);
      const minDays = validDay(
        range.min ?? row.custom_delivery_time ?? row.delivery_time,
      );
      const maxDays = validDay(
        range.max ?? row.custom_delivery_time ?? row.delivery_time,
      );
      if (
        row.error ||
        !company ||
        !name ||
        !Number.isInteger(id) ||
        id < 1 ||
        priceCents === null ||
        minDays === null ||
        maxDays === null ||
        minDays > maxDays ||
        (row.currency && !["R$", "BRL"].includes(String(row.currency)))
      )
        return [];
      // These services need agency/fiscal XML setup that this integration does not collect.
      if (/azul|latam|buslog/i.test(company)) return [];
      if (!Array.isArray(row.packages) || !row.packages.length) return [];
      const packages: ShippingPackage[] = [];
      for (const entry of row.packages) {
        const pkg = object(entry);
        const parsed = parcelSchema.safeParse({
          ...object(pkg.dimensions),
          weight: pkg.weight,
        });
        if (!parsed.success) return [];
        packages.push(parsed.data);
      }
      // These services only allow a single package per shipment/cart request.
      if (
        packages.length > 1 &&
        (/correios|j\s*(?:&|e)\s*t|loggi/i.test(company) || id === 27)
      )
        return [];
      return [
        {
          id: String(id),
          company,
          name,
          priceCents,
          minDays,
          maxDays,
          packages,
          raw: row,
        },
      ];
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.maxDays - b.maxDays);
}

export function normalizeShipment(
  raw: unknown,
  expectedId?: string,
): ShipmentSnapshot {
  const row = object(raw);
  const id = uuidSchema.safeParse(row.id);
  if (
    !id.success ||
    (expectedId && id.data !== expectedId) ||
    !optionalText(row.status)
  )
    throw new ShippingError(
      "O Melhor Envio retornou um envio inválido.",
      "invalid_shipment_response",
    );
  const trackingCode =
    optionalText(row.tracking) ??
    optionalText(row.melhorenvio_tracking) ??
    optionalText(row.self_tracking);
  return {
    id: id.data,
    protocol: optionalText(row.protocol),
    status: String(row.status),
    trackingCode,
    trackingUrl: validTrackingUrl(row.tracking_url, trackingCode),
    paidAt: optionalText(row.paid_at),
    generatedAt: optionalText(row.generated_at),
    postedAt: optionalText(row.posted_at),
    deliveredAt: optionalText(row.delivered_at),
    canceledAt: optionalText(row.canceled_at),
    updatedAt: optionalText(row.updated_at),
  };
}

export function verifyMelhorEnvioWebhook(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature))
    return false;
  const supplied = Buffer.from(signature, "base64");
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function createMelhorEnvioClient(config: MelhorEnvioConfig) {
  const requestFetch = config.fetch ?? fetch;
  const base = config.sandbox
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br";
  async function request(
    path: string,
    body?: unknown,
    creation = false,
  ): Promise<unknown> {
    if (!config.token || !z.email().safeParse(config.contactEmail).success)
      throw new ShippingError(
        "Configure a integração e o contato do Melhor Envio.",
        "shipping_not_configured",
        503,
      );
    let response: Response;
    try {
      response = await requestFetch(`${base}/api/v2${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": `Recursos da Tia Cris (${config.contactEmail})`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
      });
    } catch {
      if (creation) throw new ShippingOperationUncertainError();
      throw new ShippingError(
        "O Melhor Envio está demorando para responder. Tente novamente.",
        "shipping_unavailable",
      );
    }
    if (!response.ok) {
      if (creation && (response.status >= 500 || response.status === 408))
        throw new ShippingOperationUncertainError();
      throw new ShippingError(
        response.status === 422
          ? "Revise os dados do envio e do documento fiscal no painel."
          : "Não foi possível consultar o Melhor Envio.",
        response.status === 422
          ? "shipping_data_rejected"
          : "shipping_provider_error",
        response.status === 422 ? 422 : 502,
      );
    }
    try {
      return await response.json();
    } catch {
      if (creation) throw new ShippingOperationUncertainError();
      throw new ShippingError(
        "Resposta inválida do Melhor Envio.",
        "invalid_shipping_response",
      );
    }
  }

  async function quoteShipping(
    input: QuoteShippingInput,
  ): Promise<ShippingOption[]> {
    const items = itemsSchema.parse(input.items);
    const postalCode = z
      .string()
      .regex(/^\d{8}$/)
      .parse(input.destinationPostalCode);
    const origin = z
      .string()
      .regex(/^\d{8}$/)
      .safeParse(config.sender.postalCode);
    if (!origin.success)
      throw new ShippingError(
        "Configure o CEP de origem do envio.",
        "shipping_not_configured",
        503,
      );
    const parcel = parcelSchema.parse(config.parcel);
    let packaging: Record<string, unknown>;
    if (config.packing.mode === "per_order") {
      const count = items.reduce((sum, item) => sum + item.quantity, 0);
      if (
        config.packing.maxItems !== undefined &&
        (!Number.isInteger(config.packing.maxItems) ||
          config.packing.maxItems < 1 ||
          count > config.packing.maxItems)
      )
        throw new ShippingError(
          "Este pedido precisa de uma embalagem especial. Combine o envio pelo WhatsApp.",
          "shipping_package_capacity",
          422,
        );
      packaging = {
        volumes: [
          {
            ...parcel,
            insurance:
              items.reduce(
                (sum, item) => sum + item.quantity * item.unitPriceCents,
                0,
              ) / 100,
          },
        ],
      };
    } else {
      packaging = {
        products: items.map((item) => ({
          id: item.id,
          ...parcel,
          quantity: item.quantity,
          insurance_value: item.unitPriceCents / 100,
        })),
      };
    }
    const raw = await request("/me/shipment/calculate", {
      from: { postal_code: origin.data },
      to: { postal_code: postalCode },
      ...packaging,
      options: { receipt: false, own_hand: false },
      ...(config.services ? { services: config.services } : {}),
    });
    return normalizeShippingQuote(raw);
  }

  async function getSender(): Promise<ShippingParty> {
    const profile = object(await request("/me"));
    const accountPhone = object(profile.phone);
    const document = optionalText(profile.document)?.replace(/\D/g, "");
    const phone =
      optionalText(accountPhone.phone) ?? optionalText(profile.phone) ?? "";
    const data = partySchema.safeParse({
      name:
        optionalText(profile.name) ??
        [profile.firstname, profile.lastname].filter(Boolean).join(" "),
      email: profile.email,
      phone: phone.replace(/\D/g, ""),
      ...(profile.document_type === "cpf" && document ? { document } : {}),
      ...(profile.document_type === "cnpj" && document
        ? { companyDocument: document }
        : {}),
      ...config.sender,
    });
    if (!data.success)
      throw new ShippingError(
        "Complete os dados do remetente nas configurações de envio.",
        "shipping_sender_incomplete",
        422,
      );
    return data.data;
  }

  async function syncShipment(id: string): Promise<ShipmentSnapshot> {
    uuidSchema.parse(id);
    const raw = object(
      await request("/me/shipment/tracking", { orders: [id] }),
    );
    return normalizeShipment(raw[id], id);
  }

  async function prepareShipment(
    order: PrepareShippingOrder,
  ): Promise<ShipmentSnapshot> {
    uuidSchema.parse(order.orderId);
    if (order.paymentStatus !== "paid")
      throw new ShippingError(
        "O pedido precisa estar pago para preparar o envio.",
        "order_not_paid",
        409,
      );
    if (order.existingShipmentId) return syncShipment(order.existingShipmentId);
    if (order.previousAttemptUncertain)
      throw new ShippingOperationUncertainError();
    const recipient = partySchema.parse(order.recipient);
    const items = itemsSchema.parse(order.items);
    const verified = normalizeShippingQuote([order.option.raw]).find(
      (option) => option.id === order.option.id,
    );
    if (!verified || verified.priceCents !== order.option.priceCents)
      throw new ShippingError(
        "A cotação salva não corresponde ao serviço escolhido.",
        "invalid_shipping_quote",
        422,
      );
    const fiscalDocument = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("invoice"),
          key: z.string().regex(/^\d{44}$/),
        }),
        z.object({
          type: z.literal("declaration"),
          authorized: z.literal(true),
          key: z
            .string()
            .regex(/^\d{44}$/)
            .optional(),
        }),
      ])
      .safeParse(order.fiscalDocument);
    if (!fiscalDocument.success)
      throw new ShippingError(
        "Informe o documento de envio no painel do pedido.",
        "shipping_fiscal_document_required",
        422,
      );
    const sender = await getSender();
    if (
      fiscalDocument.data.type === "invoice" &&
      (!sender.companyDocument || !sender.stateRegister)
    )
      throw new ShippingError(
        "Configure o CNPJ e a inscrição estadual do remetente para enviar com nota fiscal.",
        "shipping_sender_invoice_required",
        422,
      );
    if (
      fiscalDocument.data.type === "declaration" &&
      sender.stateRegister &&
      sender.stateRegister !== "ISENTO"
    )
      throw new ShippingError(
        "Este cadastro possui inscrição estadual. Confira o documento exigido para o envio.",
        "shipping_fiscal_document_required",
        422,
      );
    const partyPayload = (party: ShippingParty) => ({
      name: party.name,
      email: party.email,
      phone: party.phone,
      ...(party.document
        ? { document: party.document }
        : { company_document: party.companyDocument }),
      ...(party.stateRegister ? { state_register: party.stateRegister } : {}),
      address: party.address,
      number: party.number,
      complement: party.complement ?? "",
      district: party.district,
      city: party.city,
      state_abbr: party.state,
      postal_code: party.postalCode,
      country_id: "BR",
    });
    const response = await request(
      "/me/cart",
      {
        service: Number(verified.id),
        from: partyPayload(sender),
        to: partyPayload(recipient),
        products: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitary_value: item.unitPriceCents / 100,
        })),
        volumes: verified.packages,
        options: {
          insurance_value:
            items.reduce(
              (sum, item) => sum + item.quantity * item.unitPriceCents,
              0,
            ) / 100,
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: fiscalDocument.data.type === "declaration",
          ...(fiscalDocument.data.type === "invoice"
            ? { invoice: { key: fiscalDocument.data.key } }
            : fiscalDocument.data.key
              ? { dce: { key: fiscalDocument.data.key } }
              : {}),
          platform: "Recursos da Tia Cris",
          tags: [{ tag: `tia-cris:${order.orderId}`, url: null }],
        },
      },
      true,
    );
    try {
      return normalizeShipment(response);
    } catch {
      // A successful HTTP response without its identifier must not create a second label.
      throw new ShippingOperationUncertainError();
    }
  }

  async function generateAndPrintLabel(
    id: string,
  ): Promise<{ url: string; shipment: ShipmentSnapshot }> {
    const shipment = await syncShipment(id);
    if (
      !shipment.paidAt ||
      !["released", "generated", "received", "posted", "delivered"].includes(
        shipment.status,
      )
    )
      throw new ShippingError(
        "Pague o frete no Melhor Envio para liberar a etiqueta.",
        "shipping_payment_required",
        409,
      );
    if (!shipment.generatedAt) {
      const response = object(
        await request("/me/shipment/generate", { orders: [id] }),
      );
      if (object(response[id]).status !== true)
        throw new ShippingError(
          "A etiqueta ainda não foi liberada para impressão.",
          "shipping_label_not_ready",
          409,
        );
    }
    const printed = object(
      await request("/me/shipment/print", { orders: [id], mode: "private" }),
    );
    const url = optionalText(printed.url);
    if (!url)
      throw new ShippingError(
        "O Melhor Envio não retornou a etiqueta.",
        "invalid_shipping_response",
      );
    const parsed = new URL(url);
    if (parsed.origin !== base || parsed.username || parsed.password)
      throw new ShippingError(
        "O Melhor Envio retornou um link de etiqueta inválido.",
        "invalid_shipping_response",
      );
    // Generation changes the provider state. Return a fresh, authenticated
    // snapshot instead of retaining the earlier "released" state or inventing
    // a generated timestamp before the provider reports it.
    const updatedShipment = await syncShipment(id);
    return { url: parsed.toString(), shipment: updatedShipment };
  }

  return {
    quoteShipping,
    getSender,
    prepareShipment,
    syncShipment,
    generateAndPrintLabel,
  };
}

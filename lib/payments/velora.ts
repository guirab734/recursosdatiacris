import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Contract: https://velorapay.com.br/docs#payments and #webhooks-overview.
// The interactive reference is newer than llms-full.txt (May 2026).
const API_ORIGIN = "https://api.velorapay.com.br";
const ORDER_DESCRIPTION = "Pedido Recursos da Tia Cris ";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_WEBHOOK_BYTES = 64 * 1024;
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const identifier = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const orderIdentifier = z.uuid();
const pixInput = z.object({
  orderId: orderIdentifier,
  amountCents: z.number().int().positive().max(1_000_000_000),
  name: z.string().trim().min(3).max(150),
  document: z.string().regex(/^(?:\d{11}|\d{14})$/),
  email: z.email().optional(),
  phone: z
    .string()
    .regex(/^\d{10,13}$/)
    .optional(),
});

export type CreatePixInput = z.infer<typeof pixInput>;
export type PaymentStatus =
  "pending" | "paid" | "failed" | "cancelled" | "unknown";

export type PixPayment = {
  providerId: string;
  orderId: string;
  amountCents: number;
  pixCopyPaste: string;
  qrCode: string | null;
  expiresAt: string | null;
  isTest: boolean;
};

export type VerifiedPayment = {
  providerId: string;
  orderId: string | null;
  amountCents: number;
  status: PaymentStatus;
  providerStatus: string;
  currency: "BRL";
  isTest: boolean;
  type: string;
};

export type VeloraWebhook = {
  deliveryId: string | null;
  event: "payment.created" | "payment.confirmed" | "payment.failed";
  providerId: string;
  timestamp: string;
  isTest: boolean;
};

export class VeloraError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "unavailable"
      | "rejected"
      | "invalid_response"
      | "test_payment",
    public readonly httpStatus?: number,
  ) {
    // Never propagate provider response bodies: they can include payer data.
    super(
      code === "not_configured"
        ? "O pagamento por Pix ainda não está configurado."
        : "Não foi possível confirmar o Pix com a provedora. Tente novamente em instantes.",
    );
    this.name = "VeloraError";
  }
}

function credentials() {
  const key = process.env.VELORA_PUBLIC_KEY || process.env.velora_publickey;
  const secret = process.env.VELORA_SECRET_KEY || process.env.velora_secretkey;
  if (!key || !secret) throw new VeloraError("not_configured");
  return { key, secret };
}

export function veloraConfigured() {
  return Boolean(
    (process.env.VELORA_PUBLIC_KEY || process.env.velora_publickey) &&
    (process.env.VELORA_SECRET_KEY || process.env.velora_secretkey),
  );
}

export function veloraWebhookConfigured() {
  return Boolean(process.env.VELORA_WEBHOOK_SECRET);
}

async function request(path: string, body?: unknown, idempotencyKey?: string) {
  const { key, secret } = credentials();
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": key,
        "x-api-secret": secret,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Do not retry a money endpoint here. The persisted order owns retries.
    throw new VeloraError("unavailable");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new VeloraError(
      response.status < 500 && response.status !== 429
        ? "rejected"
        : "unavailable",
      response.status,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new VeloraError("invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new VeloraError("invalid_response");
    }
    chunks.push(chunk.value);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return z.object({ data: z.record(z.string(), z.unknown()) }).parse(value)
      .data;
  } catch {
    throw new VeloraError("invalid_response");
  }
}

function amountToCents(value: unknown) {
  // Velora amounts are BRL decimals, never cents. Avoid permissive coercion.
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(String(value))
  ) {
    throw new VeloraError("invalid_response");
  }
  const [whole, decimals = ""] = String(value).split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0)
    throw new VeloraError("invalid_response");
  return cents;
}

/** Merchant-specific limits, read through the authenticated server connection. */
export async function getPaymentLimits(): Promise<{
  minCents: number;
  maxCents: number;
}> {
  const data = await request("/payments/limits");
  const parsed = z
    .object({
      CASH_IN: z.object({ minAmount: z.unknown(), maxAmount: z.unknown() }),
    })
    .safeParse(data);
  if (!parsed.success) throw new VeloraError("invalid_response");
  const minCents = amountToCents(parsed.data.CASH_IN.minAmount);
  const maxCents = amountToCents(parsed.data.CASH_IN.maxAmount);
  if (maxCents < minCents) throw new VeloraError("invalid_response");
  return { minCents, maxCents };
}

function paymentIdentifier(value: unknown) {
  const result = identifier.safeParse(value);
  if (!result.success) throw new VeloraError("invalid_response");
  return result.data;
}

function pngDataUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 600_000) return null;
  const base64 = value.replace(/^data:image\/png;base64,/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (
    bytes.length < 8 ||
    !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return null;
  return `data:image/png;base64,${base64}`;
}

function knownExpiration(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return null;
  return new Date(value).toISOString();
}

export async function createPix(input: CreatePixInput): Promise<PixPayment> {
  const clean = pixInput.parse(input);
  const callbackUrl = process.env.VELORA_WEBHOOK_URL;
  if (callbackUrl) {
    const url = new URL(callbackUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      callbackUrl.length > 500
    )
      throw new VeloraError("not_configured");
  }
  const data = await request(
    "/payments/create",
    {
      amount: clean.amountCents / 100,
      payerName: clean.name,
      payerDocument: clean.document,
      description: `${ORDER_DESCRIPTION}${clean.orderId}`,
      source: "recursosdatiacris.com.br",
      paymentMethod: "PIX",
      ...(callbackUrl ? { callbackUrl } : {}),
    },
    `payment-${clean.orderId}`,
  );
  const providerId = paymentIdentifier(data.transactionId);
  const amountCents = amountToCents(data.amount);
  const copyPaste = data.copyPaste;
  const isTest =
    data.isTest === true ||
    (typeof copyPaste === "string" && copyPaste.startsWith("SANDBOX-PIX-"));
  if (isTest && process.env.VELORA_MODE !== "test")
    throw new VeloraError("test_payment");
  if (
    amountCents !== clean.amountCents ||
    typeof copyPaste !== "string" ||
    copyPaste.length < 10 ||
    copyPaste.length > 4096 ||
    (!isTest && !copyPaste.startsWith("000201")) ||
    !["PENDING", "PROCESSING", "COMPLETED"].includes(String(data.status))
  )
    throw new VeloraError("invalid_response");
  return {
    providerId,
    orderId: clean.orderId,
    amountCents,
    pixCopyPaste: copyPaste,
    qrCode: pngDataUrl(data.qrCodeBase64),
    // The public contract does not promise a Pix expiration time.
    expiresAt: knownExpiration(data.expiresAt),
    isTest,
  };
}

export async function getPayment(providerId: string): Promise<VerifiedPayment> {
  const requestedId = paymentIdentifier(providerId);
  const data = await request(`/payments/${encodeURIComponent(requestedId)}`);
  const returnedId = paymentIdentifier(data.transactionId);
  if (returnedId !== requestedId || data.type !== "CASH_IN")
    throw new VeloraError("invalid_response");
  const providerStatus =
    typeof data.status === "string" ? data.status : "UNKNOWN";
  const status: PaymentStatus =
    providerStatus === "COMPLETED"
      ? "paid"
      : ["PENDING", "PROCESSING"].includes(providerStatus)
        ? "pending"
        : providerStatus === "FAILED"
          ? "failed"
          : providerStatus === "CANCELLED"
            ? "cancelled"
            : "unknown";
  const description =
    typeof data.description === "string" ? data.description : "";
  const parsedOrder = orderIdentifier.safeParse(
    description.startsWith(ORDER_DESCRIPTION)
      ? description.slice(ORDER_DESCRIPTION.length)
      : null,
  );
  return {
    providerId: returnedId,
    orderId: parsedOrder.success ? parsedOrder.data : null,
    amountCents: amountToCents(data.amount),
    status,
    providerStatus,
    currency: "BRL",
    isTest: data.isTest === true,
    type: "CASH_IN",
  };
}

/** Authentication only. A signed event is never proof that an order is paid. */
export function verifyWebhook(
  rawBody: string | Uint8Array,
  headers: Headers,
  now = Date.now(),
) {
  const secret = process.env.VELORA_WEBHOOK_SECRET;
  if (!secret || Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) return false;
  // Current branded header, unbranded docs alias, and documented legacy header.
  const signatures = [
    headers.get("x-velorapay-signature"),
    headers.get("x-velora-signature"),
    headers.get("v-signature"),
  ].filter((value): value is string => value !== null);
  if (signatures.length === 0) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  for (const signature of signatures) {
    const hex = signature.replace(/^sha256=/, "");
    if (!/^[a-fA-F0-9]{64}$/.test(hex)) return false;
    if (!timingSafeEqual(expected, Buffer.from(hex, "hex"))) return false;
  }
  try {
    const body: unknown = JSON.parse(Buffer.from(rawBody).toString("utf8"));
    const parsed = z.object({ timestamp: z.string() }).parse(body);
    const timestamp = Date.parse(parsed.timestamp);
    // Timestamp comes from the signed body, not an editable unsigned header.
    return (
      Number.isFinite(timestamp) &&
      Number.isFinite(now) &&
      Math.abs(now - timestamp) <= WEBHOOK_TOLERANCE_MS
    );
  } catch {
    return false;
  }
}

/** Call only after verifyWebhook; reconcile providerId through getPayment. */
export function parseWebhook(
  rawBody: string | Uint8Array,
): VeloraWebhook | null {
  try {
    const parsed = z
      .object({
        event: z.enum([
          "payment.created",
          "payment.confirmed",
          "payment.failed",
        ]),
        deliveryId: identifier.nullish(),
        timestamp: z.string(),
        data: z.object({
          transactionId: identifier,
          isTest: z.boolean().optional(),
        }),
      })
      .parse(JSON.parse(Buffer.from(rawBody).toString("utf8")));
    return {
      event: parsed.event,
      deliveryId: parsed.deliveryId || null,
      providerId: parsed.data.transactionId,
      timestamp: parsed.timestamp,
      isTest: parsed.data.isTest === true,
    };
  } catch {
    return null;
  }
}

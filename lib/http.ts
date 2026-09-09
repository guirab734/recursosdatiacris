import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { configured, db } from "./catalog";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      { error: error.issues[0]?.message || "Confira os dados informados." },
      400,
    );
  console.error(
    "api_error",
    error instanceof Error ? error.message : "unknown",
  );
  return json(
    { error: "Não foi possível concluir. Tente novamente em instantes." },
    500,
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN;
  if (!expected || origin !== new URL(expected).origin)
    throw new HttpError(403, "Origem da requisição não permitida.");
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Envie os dados em JSON.");
  const raw = await limitedBody(request, 64 * 1024);
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new HttpError(400, "Dados inválidos.");
  }
}
export async function limitedBody(request: Request, max: number) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "Arquivo ou formulário muito grande.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new HttpError(413, "Arquivo ou formulário muito grande.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
const limits = new Map<string, { count: number; until: number }>();
export async function rateLimit(
  request: Request,
  scope: string,
  limit = 30,
  seconds = 60,
) {
  // Configure the reverse proxy to replace x-forwarded-for, never append untrusted input.
  const ip =
    process.env.TRUST_PROXY_HEADERS === "true"
      ? (
          request.headers.get("x-forwarded-for")?.split(",")[0] || "shared"
        ).trim()
      : "shared";
  const bucket = createHash("sha256").update(`${scope}:${ip}`).digest("hex");
  if (configured()) {
    const { data, error } = await db().rpc("consume_rate_limit", {
      bucket_key: bucket,
      max_requests: limit,
      window_seconds: seconds,
    });
    if (error)
      throw new HttpError(503, "Serviço temporariamente indisponível.");
    if (!data)
      throw new HttpError(
        429,
        "Muitas tentativas. Aguarde um momento e tente novamente.",
      );
    return;
  }
  const now = Date.now();
  for (const [k, v] of limits) {
    if (v.until < now) limits.delete(k);
  }
  const current = limits.get(bucket);
  if (!current) {
    limits.set(bucket, { count: 1, until: now + seconds * 1000 });
    return;
  }
  if (current.count >= limit)
    throw new HttpError(
      429,
      "Muitas tentativas. Aguarde um momento e tente novamente.",
    );
  current.count++;
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const mediaTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
} as const;
export const mediaTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);
export const uploadRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("prepare"),
      type: mediaTypeSchema,
      size: z.number().int().min(1).max(MAX_MEDIA_BYTES),
    })
    .strict(),
  z
    .object({ action: z.literal("complete"), receipt: z.string().max(3000) })
    .strict(),
]);
const receiptSchema = z
  .object({
    stage: z.enum(["upload", "verified"]),
    id: z.uuid(),
    user: z.uuid(),
    path: z.string().max(150),
    mime: mediaTypeSchema,
    size: z.number().int().min(1).max(MAX_MEDIA_BYTES),
    expires: z.number().int().positive(),
  })
  .strict();
export type UploadReceipt = z.infer<typeof receiptSchema>;
const signature = (payload: string, key: string) =>
  createHmac("sha256", key)
    .update("recursos-da-tia-cris:media-upload:v1\n")
    .update(payload)
    .digest();
export function signUploadReceipt(receipt: UploadReceipt, key: string) {
  if (!key) throw new Error("Upload signing key is missing");
  const payload = Buffer.from(
    JSON.stringify(receiptSchema.parse(receipt)),
  ).toString("base64url");
  return `${payload}.${signature(payload, key).toString("base64url")}`;
}
export function verifyUploadReceipt(
  value: string,
  key: string,
  user: string,
  stage: UploadReceipt["stage"],
  now = Date.now(),
): UploadReceipt {
  if (!key || value.length > 3000) throw new Error("Invalid upload receipt");
  const pieces = value.split(".");
  if (pieces.length !== 2 || !pieces.every((p) => /^[A-Za-z0-9_-]+$/.test(p)))
    throw new Error("Invalid upload receipt");
  const actual = Buffer.from(pieces[1], "base64url");
  const expected = signature(pieces[0], key);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Invalid upload receipt");
  const receipt = receiptSchema.parse(
    JSON.parse(Buffer.from(pieces[0], "base64url").toString("utf8")),
  );
  const path = `${receipt.user}/${receipt.id}.${mediaTypes[receipt.mime]}`;
  if (
    receipt.user !== user ||
    receipt.stage !== stage ||
    receipt.path !== path ||
    receipt.expires <= now
  )
    throw new Error("Expired or invalid upload receipt");
  return receipt;
}

// BMFF brands matter because AVIF/HEIC also use ftyp; WebM shares EBML with Matroska.
export function detectMediaType(
  bytes: Uint8Array,
): keyof typeof mediaTypes | null {
  const b = Buffer.from(bytes);
  if (b.length < 12) return null;
  if (b.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg";
  if (
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.toString("ascii", 12, 16) === "IHDR"
  )
    return "image/png";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (b.toString("ascii", 4, 8) === "ftyp") {
    const brands = new Set([
      "isom",
      "iso2",
      "iso3",
      "iso4",
      "iso5",
      "iso6",
      "mp41",
      "mp42",
      "avc1",
      "M4V ",
      "MSNV",
      "dash",
    ]);
    const boxSize = b.readUInt32BE(0);
    if (
      boxSize >= 16 &&
      boxSize <= b.length &&
      brands.has(b.toString("ascii", 8, 12))
    )
      return "video/mp4";
  }
  if (b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) {
    const head = b.subarray(4, Math.min(b.length, 4096));
    if (head.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])))
      return "video/webm";
  }
  return null;
}
export function validateUploadedBytes(
  bytes: Uint8Array,
  expected: Pick<UploadReceipt, "mime" | "size">,
  storedType: string,
) {
  if (
    !bytes.length ||
    bytes.length > MAX_MEDIA_BYTES ||
    bytes.length !== expected.size
  )
    throw new Error(
      "O tamanho do arquivo mudou. Envie novamente, com até 20 MB.",
    );
  if (
    storedType.split(";")[0].trim().toLowerCase() !== expected.mime ||
    detectMediaType(bytes) !== expected.mime
  )
    throw new Error("Formato inválido. Use JPG, PNG, WebP, MP4 ou WebM.");
}

import "server-only";
import { db } from "./catalog";
import { HttpError } from "./http";
import type { Media } from "./types";
import { verifyUploadReceipt, type UploadReceipt } from "./media-validation";

export function mediaPublicUrl(path: string) {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/products-media/${path}`;
}
export function readMediaReceipt(
  receipt: string,
  userId: string,
  stage: UploadReceipt["stage"],
) {
  try {
    return verifyUploadReceipt(
      receipt,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      userId,
      stage,
    );
  } catch {
    throw new HttpError(
      400,
      "O envio expirou ou é inválido. Anexe o arquivo novamente.",
    );
  }
}
export async function assertPendingUpload(url: string) {
  const { data, error } = await db()
    .from("media_cleanup")
    .select("state,not_before")
    .eq("url", url)
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    data.state !== "pending" ||
    Date.parse(data.not_before) <= Date.now()
  )
    throw new HttpError(
      409,
      "O arquivo expirou. Anexe novamente antes de salvar.",
    );
  return Date.parse(data.not_before);
}
export async function assertProductMedia(media: Media[], userId: string) {
  if (!media.length) return;
  const { data: saved, error } = await db()
    .from("product_media")
    .select("id,type,url")
    .in(
      "url",
      media.map((m) => m.url),
    );
  if (error) throw error;
  for (const item of media) {
    if (
      saved?.some(
        (s) => s.id === item.id && s.type === item.type && s.url === item.url,
      )
    )
      continue;
    if (!item.upload_receipt)
      throw new HttpError(
        400,
        "Anexe os novos arquivos pela biblioteca da loja.",
      );
    const receipt = readMediaReceipt(item.upload_receipt, userId, "verified");
    if (
      receipt.id !== item.id ||
      mediaPublicUrl(receipt.path) !== item.url ||
      (receipt.mime.startsWith("image/") ? "image" : "video") !== item.type
    )
      throw new HttpError(400, "O arquivo não corresponde ao envio validado.");
    await assertPendingUpload(item.url);
  }
}

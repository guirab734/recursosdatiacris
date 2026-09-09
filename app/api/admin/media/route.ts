import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/catalog";
import {
  failure,
  json,
  sameOrigin,
  limitedBody,
  rateLimit,
  HttpError,
} from "@/lib/http";
function detect(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return { type: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { type: "image/png", ext: "png" };
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return { type: "image/webp", ext: "webp" };
  if (b.toString("ascii", 4, 8) === "ftyp")
    return { type: "video/mp4", ext: "mp4" };
  if (b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return { type: "video/webm", ext: "webm" };
  return null;
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { client, user } = await requireAdmin();
    await rateLimit(request, "uploads", 30);
    const bytes = await limitedBody(request, 21 * 1024 * 1024);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024)
      throw new HttpError(400, "Escolha um arquivo de até 20 MB.");
    const data = new Uint8Array(await file.arrayBuffer());
    const kind = detect(data);
    if (!kind || kind.type !== file.type)
      throw new HttpError(
        400,
        "Formato inválido. Use JPG, PNG, WebP, MP4 ou WebM.",
      );
    const id = randomUUID();
    const path = `${user.id}/${id}.${kind.ext}`;
    const { error } = await client.storage
      .from("products-media")
      .upload(path, data, { contentType: kind.type, upsert: false });
    if (error) throw error;
    const { data: result } = client.storage
      .from("products-media")
      .getPublicUrl(path);
    const { error: queueError } = await db()
      .from("media_cleanup")
      .insert({
        url: result.publicUrl,
        not_before: new Date(Date.now() + 86400000).toISOString(),
      });
    if (queueError) {
      await client.storage.from("products-media").remove([path]);
      throw queueError;
    }
    return json({
      media: {
        id,
        type: kind.type.startsWith("image") ? "image" : "video",
        url: result.publicUrl,
        position: 0,
      },
    });
  } catch (error) {
    return failure(error);
  }
}

import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/catalog";
import {
  failure,
  json,
  sameOrigin,
  readJson,
  rateLimit,
  HttpError,
  limitedBody,
} from "@/lib/http";
import {
  assertPendingUpload,
  mediaPublicUrl,
  readMediaReceipt,
} from "@/lib/media-upload";
import {
  MAX_MEDIA_BYTES,
  mediaTypes,
  signUploadReceipt,
  uploadRequestSchema,
  validateUploadedBytes,
  type UploadReceipt,
} from "@/lib/media-validation";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { client, user } = await requireAdmin();
    const body = uploadRequestSchema.parse(await readJson(request));
    await rateLimit(request, `uploads-${body.action}`, 30);
    if (body.action === "prepare") {
      const id = randomUUID();
      const path = `${user.id}/${id}.${mediaTypes[body.type]}`;
      const expires = Date.now() + 2 * 60 * 60 * 1000;
      // Persist cleanup before issuing a token. Abandoned/retried uploads remain
      // collectible, even if the browser never calls complete.
      const { error: queueError } = await db()
        .from("media_cleanup")
        .insert({
          url: mediaPublicUrl(path),
          not_before: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      if (queueError) throw queueError;
      const { data, error } = await client.storage
        .from("products-media")
        .createSignedUploadUrl(path, { upsert: false });
      if (error) throw error;
      const receipt: UploadReceipt = {
        stage: "upload",
        id,
        user: user.id,
        path,
        mime: body.type,
        size: body.size,
        expires,
      };
      return json({
        uploadUrl: data.signedUrl,
        receipt: signUploadReceipt(
          receipt,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ),
      });
    }
    const receipt = readMediaReceipt(body.receipt, user.id, "upload");
    const url = mediaPublicUrl(receipt.path);
    const expires = await assertPendingUpload(url);
    const { data: info, error } = await client.storage
      .from("products-media")
      .info(receipt.path);
    if (error || !info)
      throw new HttpError(
        400,
        "O envio não terminou. Aguarde e tente novamente.",
      );
    if (info.size !== receipt.size || info.size > MAX_MEDIA_BYTES)
      throw new HttpError(
        400,
        "O tamanho do arquivo mudou. Envie novamente, com até 20 MB.",
      );
    // This server-to-Storage download is not a browser request body, so it does
    // not hit Vercel's 4.5 MB incoming payload limit. Never fetch a client URL.
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new HttpError(
        400,
        "Não foi possível verificar o arquivo. Tente novamente.",
      );
    const bytes = await limitedBody(
      new Request(url, {
        method: "POST",
        body: response.body,
        headers: {
          "content-length": response.headers.get("content-length") || "0",
        },
        duplex: "half",
      } as RequestInit),
      MAX_MEDIA_BYTES,
    );
    try {
      validateUploadedBytes(
        bytes,
        receipt,
        info.contentType || response.headers.get("content-type") || "",
      );
    } catch (validationError) {
      // Leave invalid objects in the queue until after the 2-hour token expiry:
      // early deletion would allow a still-valid upload URL to recreate them.
      throw new HttpError(
        400,
        validationError instanceof Error
          ? validationError.message
          : "Arquivo inválido.",
      );
    }
    // The DB trigger also prevents saving if cleanup claims this file afterwards.
    await assertPendingUpload(url);
    return json({
      media: {
        id: receipt.id,
        type: receipt.mime.startsWith("image/") ? "image" : "video",
        url,
        position: 0,
        upload_receipt: signUploadReceipt(
          { ...receipt, stage: "verified", expires },
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ),
      },
    });
  } catch (error) {
    return failure(error);
  }
}

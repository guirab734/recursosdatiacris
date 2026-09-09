import "server-only";
import { db } from "./catalog";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const signedUploadPath = new RegExp(
  `^${uuid}/${uuid}\\.(?:jpg|png|webp|mp4|webm)$`,
  "i",
);
export function mediaDeletionNotBefore(
  path: string,
  createdAt?: string,
): number | null {
  if (!signedUploadPath.test(path)) return null;
  const created = Date.parse(createdAt || "");
  if (!Number.isFinite(created))
    throw new Error("Storage creation time is missing");
  // Tokens are issued before the object exists and last two hours. Keep the
  // object non-overwritable until that window closes, plus clock/network margin.
  return created + (2 * 60 + 5) * 60 * 1000;
}
// The durable queue is filled inside the product transaction. Failed cleanup is retried
// on the next admin visit/write; newly uploaded files have a 24-hour editing grace period.
export async function cleanupMedia() {
  const client = db();
  const { data, error } = await client.rpc("claim_media_cleanup");
  if (error) {
    console.error("media_cleanup_queue", error.code);
    return;
  }
  const prefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/products-media/`;
  for (const row of (data || []) as { url: string }[]) {
    if (!row.url.startsWith(prefix)) continue;
    const path = row.url.slice(prefix.length);
    if (!path || path.includes("..")) continue;
    if (signedUploadPath.test(path)) {
      const { data: info, error: infoError } = await client.storage
        .from("products-media")
        .info(path);
      if (infoError) {
        // Missing objects can be abandoned uploads whose original 24-hour
        // cleanup grace has elapsed. Other failures retain the retry lease.
        if (
          infoError.status !== 404 &&
          infoError.statusCode !== "404" &&
          !("code" in infoError && infoError.code === "NoSuchKey")
        ) {
          console.error("media_cleanup_info", infoError.name);
          continue;
        }
      } else {
        let notBefore: number;
        try {
          notBefore = mediaDeletionNotBefore(path, info?.createdAt)!;
        } catch {
          console.error("media_cleanup_info", "missing_created_at");
          continue;
        }
        if (notBefore > Date.now()) {
          // queue_removed_media can shorten not_before during product saves.
          // Keep state=deleting so the DB guard blocks attaching a removed file.
          const { error: postponeError } = await client
            .from("media_cleanup")
            .update({ not_before: new Date(notBefore).toISOString() })
            .eq("url", row.url)
            .eq("state", "deleting");
          if (postponeError)
            console.error("media_cleanup_postpone", postponeError.code);
          continue;
        }
      }
    }
    const { error: deleteError } = await client.storage
      .from("products-media")
      .remove([path]);
    if (deleteError) {
      console.error("media_cleanup_file", deleteError.name);
      continue;
    }
    await client
      .from("media_cleanup")
      .update({ state: "deleted" })
      .eq("url", row.url)
      .eq("state", "deleting");
  }
}

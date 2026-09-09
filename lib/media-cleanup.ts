import "server-only";
import { db } from "./catalog";
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

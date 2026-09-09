import { z } from "zod";
import { db, demoMode, allProducts } from "@/lib/catalog";
import {
  failure,
  json,
  readJson,
  sameOrigin,
  rateLimit,
  HttpError,
} from "@/lib/http";
const schema = z
  .object({
    kind: z.enum(["view", "cart_add", "whatsapp"]),
    product_ids: z.array(z.uuid()).min(1).max(50),
    event_id: z.uuid(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "events", 45);
    const event = schema.parse(await readJson(request));
    if (demoMode()) return json({ ok: true, demo: true });
    const ids = [...new Set(event.product_ids)];
    const { data, error } = await db()
      .from("products")
      .select("id")
      .in("id", ids)
      .eq("active", true);
    if (error) throw error;
    if (data.length !== ids.length)
      throw new HttpError(400, "Recurso indisponível.");
    const { error: insertError } = await db()
      .from("analytics_events")
      .insert({ id: event.event_id, kind: event.kind, product_ids: ids });
    if (insertError && insertError.code !== "23505") throw insertError;
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

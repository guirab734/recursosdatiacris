import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/catalog";
import { verifyMelhorEnvioWebhook } from "@/lib/shipping/melhor-envio";
import { enqueueOrderJob } from "@/lib/orders";
import { processOrderJobs } from "@/lib/order-processing";
import { json, failure, HttpError, limitedBody } from "@/lib/http";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const secret = process.env.MELHOR_ENVIO_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "Webhook indisponível.");
    const raw = new TextDecoder().decode(await limitedBody(request, 64 * 1024));
    if (
      !verifyMelhorEnvioWebhook(
        raw,
        request.headers.get("x-me-signature") || "",
        secret,
      )
    )
      throw new HttpError(401, "Assinatura inválida.");
    const parsed = JSON.parse(raw);
    const id = z.uuid().safeParse(parsed.data?.id ?? parsed.id);
    if (!id.success) return json({ received: true });
    const { data, error } = await db()
      .from("orders")
      .select("id")
      .eq("shipping_provider_id", id.data)
      .maybeSingle();
    if (error) throw new HttpError(503, "Tente novamente.");
    if (data) await enqueueOrderJob(data.id, "shipping_sync");
    after(async () => {
      await processOrderJobs(3).catch(() => console.error("order_jobs_failed"));
    });
    return json({ received: true });
  } catch (e) {
    return failure(e);
  }
}

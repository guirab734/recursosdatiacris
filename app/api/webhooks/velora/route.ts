import { after } from "next/server";
import { db } from "@/lib/catalog";
import {
  verifyWebhook,
  parseWebhook,
  veloraWebhookConfigured,
} from "@/lib/payments/velora";
import { getOrder } from "@/lib/orders";
import { syncOrderPayment, processOrderJobs } from "@/lib/order-processing";
import { json, failure, HttpError, limitedBody } from "@/lib/http";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    if (!veloraWebhookConfigured())
      throw new HttpError(503, "Webhook indisponível.");
    const body = await limitedBody(request, 64 * 1024);
    if (!verifyWebhook(body, request.headers))
      throw new HttpError(401, "Assinatura inválida.");
    const event = parseWebhook(body);
    if (!event || event.isTest) return json({ received: true });
    const { data, error } = await db()
      .from("orders")
      .select("id")
      .eq("payment_provider_id", event.providerId)
      .maybeSingle();
    if (error) throw new HttpError(503, "Tente novamente.");
    // A callback can arrive before createPix has returned. Ask for redelivery.
    if (!data)
      throw new HttpError(503, "Pagamento ainda não associado ao pedido.");
    await syncOrderPayment(await getOrder(data.id));
    after(async () => {
      await processOrderJobs(5).catch(() => console.error("order_jobs_failed"));
    });
    return json({ received: true });
  } catch (e) {
    return failure(e);
  }
}

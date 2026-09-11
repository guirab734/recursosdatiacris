import { after } from "next/server";
import { authorizedOrder, customerOrder } from "@/lib/orders";
import {
  processOrderJobs,
  syncOrderPayment,
  syncOrderShipment,
} from "@/lib/order-processing";
import { sameOrigin, rateLimit, json, failure } from "@/lib/http";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    let order = await authorizedOrder((await context.params).id);
    await rateLimit(request, `order_sync:${order.id}`, 4);
    if (["pending", "creating"].includes(order.payment_status))
      order = await syncOrderPayment(order);
    if (
      order.shipping_provider_id &&
      (!order.tracking_updated_at ||
        Date.now() - new Date(order.tracking_updated_at).getTime() > 120_000)
    )
      order = await syncOrderShipment(order);
    after(async () => {
      await processOrderJobs(2).catch(() => console.error("order_jobs_failed"));
    });
    return json({ order: customerOrder(order) });
  } catch (e) {
    return failure(e);
  }
}

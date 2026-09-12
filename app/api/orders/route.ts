import { after } from "next/server";
import { db } from "@/lib/catalog";
import { createOrder } from "@/lib/commerce-checkout";
import { customerSession } from "@/lib/customer-session";
import { customerOrder, type OrderRecord } from "@/lib/orders";
import { startPix, processOrderJobs } from "@/lib/order-processing";
import {
  sameOrigin,
  rateLimit,
  readJson,
  json,
  failure,
  HttpError,
} from "@/lib/http";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "orders_create", 20);
    let order = await createOrder(await readJson(request));
    if (order.payment_method === "pix") order = await startPix(order);
    after(async () => {
      await processOrderJobs(3).catch(() => console.error("order_jobs_failed"));
    });
    const result = customerOrder(order);
    return json({
      order: result,
      order_url: result.order_url,
      whatsapp_url: result.whatsapp_url,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function GET() {
  try {
    const session = await customerSession();
    const groups: OrderRecord[][] = [];
    for (const [field, value] of [
      ["guest_hash", session.guestHash],
      ["customer_email", session.email],
      ["owner_id", session.userId],
    ] as const) {
      if (!value) continue;
      const { data, error } = await db()
        .from("orders")
        .select("*")
        .eq(field, value)
        .neq("fulfillment_status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error)
        throw new HttpError(503, "Não foi possível carregar seus pedidos.");
      groups.push(data as OrderRecord[]);
    }
    const orders = [
      ...new Map(groups.flat().map((order) => [order.id, order])).values(),
    ]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(customerOrder);
    return json({ orders, authenticated: !!session.email });
  } catch (e) {
    return failure(e);
  }
}

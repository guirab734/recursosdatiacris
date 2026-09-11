import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/catalog";
import { adminOrder, type OrderRecord } from "@/lib/orders";
import { failure, json, HttpError } from "@/lib/http";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = Math.max(
      1,
      Math.min(10000, Number(url.searchParams.get("page")) || 1),
    );
    let query = db()
      .from("orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * 30, page * 30 - 1);
    const status = url.searchParams.get("status");
    if (status === "pending")
      query = query.in("payment_status", ["pending", "creating"]);
    if (status === "to_post")
      query = query
        .eq("payment_status", "paid")
        .in("fulfillment_status", [
          "preparing",
          "freight_pending",
          "ready_to_post",
          "local_contact",
        ]);
    if (status === "posted" || status === "delivered")
      query = query.eq("fulfillment_status", status);
    if (status === "attention")
      query = query.or("needs_review.eq.true,fulfillment_status.eq.attention");
    const search = url.searchParams.get("search")?.trim().slice(0, 100);
    if (search) {
      if (/^#?\d{1,12}$/.test(search))
        query = query.eq("number", Number(search.replace("#", "")));
      else
        query = query.ilike(
          "address->>name",
          `%${search.replace(/[%_\\]/g, "\\$&")}%`,
        );
    }
    const [orders, summary] = await Promise.all([
      query,
      db().rpc("commerce_order_summary"),
    ]);
    if (orders.error || summary.error)
      throw new HttpError(503, "Não foi possível carregar os pedidos.");
    return json({
      orders: (orders.data as OrderRecord[]).map(adminOrder),
      summary: summary.data,
      page,
      total: orders.count,
      page_size: 30,
    });
  } catch (e) {
    return failure(e);
  }
}

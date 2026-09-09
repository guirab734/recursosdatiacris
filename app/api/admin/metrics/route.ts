import { requireAdmin } from "@/lib/auth";
import { failure, json } from "@/lib/http";
export async function GET() {
  try {
    const { client } = await requireAdmin();
    const { data, error } = await client.rpc("admin_metrics");
    if (error) throw error;
    return json({
      total_products: data.total_products,
      active_products: data.active_products,
      views: data.views,
      cart_adds: data.cart_adds,
      whatsapp_clicks: data.whatsapp_clicks,
      popular: data.popular,
      daily: data.daily,
    });
  } catch (error) {
    return failure(error);
  }
}

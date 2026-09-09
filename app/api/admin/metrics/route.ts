import { requireAdmin } from "@/lib/auth";
import { failure, json } from "@/lib/http";
export async function GET() {
  try {
    const { client } = await requireAdmin();
    const { data, error } = await client.rpc("admin_metrics");
    if (error) throw error;
    return json(data);
  } catch (error) {
    return failure(error);
  }
}

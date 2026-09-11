import { authorizedOrder, customerOrder } from "@/lib/orders";
import { failure, json } from "@/lib/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return json({
      order: customerOrder(await authorizedOrder((await context.params).id)),
    });
  } catch (e) {
    return failure(e);
  }
}

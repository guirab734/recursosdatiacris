import { failure, json, rateLimit } from "@/lib/http";
import { postalAddress } from "@/lib/postal-address";
export async function GET(
  request: Request,
  context: { params: Promise<{ cep: string }> },
) {
  try {
    await rateLimit(request, "postal", 90);
    return json(await postalAddress((await context.params).cep));
  } catch (e) {
    return failure(e);
  }
}

import { createShippingQuote } from "@/lib/commerce-checkout";
import { sameOrigin, rateLimit, readJson, json, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "shipping_quote", 40);
    return json(await createShippingQuote(await readJson(request)));
  } catch (e) {
    return failure(e);
  }
}

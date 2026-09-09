import { allProducts, demoMode } from "@/lib/catalog";
import { cartSchema, calculateQuote } from "@/lib/validation";
import {
  failure,
  json,
  readJson,
  sameOrigin,
  rateLimit,
  HttpError,
} from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "cart", 60);
    const { items } = cartSchema.parse(await readJson(request));
    const products = await allProducts();
    try {
      return json(calculateQuote(items, products, demoMode()));
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
  } catch (error) {
    return failure(error);
  }
}

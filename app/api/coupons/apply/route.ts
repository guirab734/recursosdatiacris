import { allProducts } from "@/lib/catalog";
import { cartSchema, calculateQuote } from "@/lib/validation";
import { couponCodeSchema, couponAmounts } from "@/lib/coupon-validation";
import { resolveCoupon, publicCoupon } from "@/lib/coupons";
import { sameOrigin, rateLimit, readJson, json, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "coupon_apply", 30);
    const data = cartSchema.extend({ coupon_code: couponCodeSchema }).strict().parse(await readJson(request));
    const quote = calculateQuote(data.items, await allProducts());
    const coupon = await resolveCoupon(data.coupon_code, quote.total_cents);
    return json({ coupon: publicCoupon(coupon), subtotal_cents: quote.total_cents, ...couponAmounts(quote.total_cents, 0, coupon) });
  } catch (error) { return failure(error); }
}

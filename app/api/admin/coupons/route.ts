import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/catalog";
import { couponSchema } from "@/lib/coupon-validation";
import { sameOrigin, rateLimit, readJson, json, failure, HttpError } from "@/lib/http";
export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await db().from("coupons").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) throw new HttpError(503, "Não foi possível carregar os cupons.");
    return json({ coupons: data });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await requireAdmin();
    await rateLimit(request, "admin-coupon-write", 60);
    const coupon = couponSchema.parse(await readJson(request));
    const { data, error } = await db().from("coupons").insert(coupon).select("*").single();
    if (error?.code === "23505") throw new HttpError(409, "Já existe um cupom com esse código.");
    if (error) throw new HttpError(503, "Não foi possível salvar o cupom.");
    return json({ coupon: data }, 201);
  } catch (error) { return failure(error); }
}

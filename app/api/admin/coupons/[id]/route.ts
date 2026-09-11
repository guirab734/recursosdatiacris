import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/catalog";
import { couponSchema } from "@/lib/coupon-validation";
import { sameOrigin, rateLimit, readJson, json, failure, HttpError } from "@/lib/http";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    await requireAdmin();
    await rateLimit(request, "admin-coupon-write", 60);
    const id = z.uuid().parse((await context.params).id);
    const input = await readJson(request);
    const coupon = z.union([z.object({ active: z.boolean() }).strict(), couponSchema]).parse(input);
    const { data, error } = await db().from("coupons").update(coupon).eq("id", id).select("*").maybeSingle();
    if (error?.code === "23505") throw new HttpError(409, "Já existe um cupom com esse código.");
    if (error) throw new HttpError(503, "Não foi possível salvar o cupom.");
    if (!data) throw new HttpError(404, "Cupom não encontrado.");
    return json({ coupon: data });
  } catch (error) { return failure(error); }
}

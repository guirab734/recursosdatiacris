import "server-only";
import { db, demoMode } from "./catalog";
import { HttpError } from "./http";
import { couponAvailable } from "./coupon-validation";
import type { Coupon, AppliedCoupon } from "./coupon-types";

export const publicCoupon = (c: Coupon | null): AppliedCoupon | null => c ? { code: c.code, kind: c.kind, amount: c.amount } : null;
export async function resolveCoupon(code: string | undefined, subtotal: number): Promise<Coupon | null> {
  if (!code) return null;
  if (demoMode()) throw new HttpError(503, "Cupons ficam disponíveis no catálogo conectado à loja.");
  const { data, error } = await db().from("coupons").select("*").eq("code", code).maybeSingle();
  if (error) throw new HttpError(503, "Não foi possível conferir o cupom. Tente novamente.");
  if (!data || !couponAvailable(data as Coupon, subtotal))
    throw new HttpError(422, "Cupom indisponível para este pedido. Confira o código, a validade e o valor mínimo.");
  if (data.kind === "final_total" && subtotal < data.amount)
    throw new HttpError(422, "O total dos produtos precisa alcançar o valor final do cupom.");
  return data as Coupon;
}

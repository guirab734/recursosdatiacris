import { z } from "zod";
import type { AppliedCoupon, Coupon } from "./coupon-types";

export const couponCodeSchema = z.string().trim().toUpperCase().min(3).max(32)
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Use letras, números, hífen ou sublinhado no cupom.");
export const couponSchema = z.object({
  code: couponCodeSchema,
  description: z.string().trim().max(200).refine(s => !/[<>\u0000-\u001f]/.test(s)).default(""),
  kind: z.enum(["percentage", "fixed", "final_total"]),
  amount: z.number().int().positive().max(1_000_000_000),
  active: z.boolean(),
  min_subtotal_cents: z.number().int().min(0).max(1_000_000_000).default(0),
  max_uses: z.number().int().min(1).max(1_000_000).nullable().default(null),
  starts_at: z.iso.datetime({ offset: true }).nullable().default(null),
  expires_at: z.iso.datetime({ offset: true }).nullable().default(null),
}).strict().superRefine((c, ctx) => {
  if (c.kind === "percentage" && c.amount > 99)
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Informe uma porcentagem entre 1 e 99." });
  if (c.kind !== "percentage" && c.amount < 25)
    ctx.addIssue({ code: "custom", path: ["amount"], message: "O valor mínimo é R$ 0,25." });
  if (c.starts_at && c.expires_at && new Date(c.expires_at) <= new Date(c.starts_at))
    ctx.addIssue({ code: "custom", path: ["expires_at"], message: "O término deve ser depois do início." });
});

export function couponAvailable(coupon: Coupon, subtotal: number, now = Date.now()) {
  return coupon.active && subtotal >= coupon.min_subtotal_cents &&
    (!coupon.starts_at || Date.parse(coupon.starts_at) <= now) &&
    (!coupon.expires_at || Date.parse(coupon.expires_at) > now) &&
    (coupon.max_uses === null || coupon.uses_count < coupon.max_uses);
}

export function couponAmounts(subtotal: number, shipping: number, coupon: AppliedCoupon | null) {
  const before = subtotal + shipping;
  if (!coupon) return { discount_cents: 0, total_cents: before, discounted_subtotal_cents: subtotal };
  // Regular promotions affect merchandise. The total-price coupon covers the
  // selected shipping charge too, without charging less than the gateway floor.
  const requested = coupon.kind === "final_total" ? Math.max(0, before - coupon.amount)
    : coupon.kind === "percentage" ? Math.floor(subtotal * coupon.amount / 100) : coupon.amount;
  const discount = Math.min(requested, Math.max(0, (coupon.kind === "final_total" ? before : subtotal) - 25));
  return {
    discount_cents: discount,
    total_cents: before - discount,
    discounted_subtotal_cents: coupon.kind === "final_total" ? Math.max(25, subtotal - discount) : subtotal - discount,
  };
}

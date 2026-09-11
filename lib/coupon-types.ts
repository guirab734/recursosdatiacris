export type CouponKind = "percentage" | "fixed" | "final_total";
export type AppliedCoupon = { code: string; kind: CouponKind; amount: number };
export type Coupon = AppliedCoupon & {
  id: string;
  description: string;
  active: boolean;
  min_subtotal_cents: number;
  max_uses: number | null;
  uses_count: number;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
};

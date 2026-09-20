import { eq, sql } from "drizzle-orm";
import { db, couponsTable } from "@workspace/db";

export interface CouponApplication {
  coupon: typeof couponsTable.$inferSelect;
  /** Final amount the student should pay/record, after discount, floored at 0. */
  discountedAmount: number;
  /** planPrice - discountedAmount, for the record kept on med_payments. */
  discountAmount: number;
}

/**
 * Validates a coupon code against a membership plan's list price and
 * returns the discounted amount, or a plain error string. Coupons only
 * ever apply to membership plans (client request) — there's no book
 * purchase flow for this to plug into.
 *
 * Does NOT increment usedCount — callers do that themselves inside the
 * same request, only once they know the payment/registration row the
 * coupon is being applied to actually got created (see POST /auth/register
 * and POST /payments). That keeps a failed registration/payment attempt
 * from burning a use of a limited-use code.
 */
export async function validateCoupon(rawCode: string, planPrice: number): Promise<CouponApplication | { error: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { error: "Enter a coupon code" };
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
  if (!coupon || !coupon.active) return { error: "Invalid coupon code" };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { error: "This coupon has expired" };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { error: "This coupon has already been fully redeemed" };

  const discountValue = Number(coupon.discountValue);
  const rawDiscount = coupon.discountType === "percent" ? planPrice * (discountValue / 100) : discountValue;
  const discountAmount = Math.min(Math.max(rawDiscount, 0), planPrice);
  const discountedAmount = Math.round((planPrice - discountAmount) * 100) / 100;
  return { coupon, discountedAmount, discountAmount: Math.round(discountAmount * 100) / 100 };
}

/** Call once a coupon has actually been applied to a created payment row.
 * Uses an atomic SQL increment (not read-then-write) so concurrent
 * redemptions of a limited-use code can't both read the same usedCount and
 * silently under-count. */
export async function markCouponUsed(couponId: number): Promise<void> {
  await db.update(couponsTable).set({ usedCount: sql`${couponsTable.usedCount} + 1` }).where(eq(couponsTable.id, couponId));
}

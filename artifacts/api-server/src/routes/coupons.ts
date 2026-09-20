import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, couponsTable, membershipPlansTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { validateCoupon } from "../lib/coupons";

const router: IRouter = Router();

function serializeCoupon(row: typeof couponsTable.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType as "percent" | "fixed",
    discountValue: Number(row.discountValue),
    active: row.active,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

const CouponBody = z.object({
  code: z.string().trim().min(2).max(40),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().positive(),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
});

router.get("/coupons", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
  res.json(rows.map(serializeCoupon));
});

router.post("/coupons", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CouponBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid coupon" }); return; }
  const code = parsed.data.code.toUpperCase();
  if (parsed.data.discountType === "percent" && parsed.data.discountValue > 100) { res.status(400).json({ error: "A percent discount can't exceed 100" }); return; }
  const [existing] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
  if (existing) { res.status(409).json({ error: "A coupon with this code already exists" }); return; }
  const [row] = await db.insert(couponsTable).values({
    code, discountType: parsed.data.discountType, discountValue: String(parsed.data.discountValue),
    maxUses: parsed.data.maxUses ?? null, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  }).returning();
  res.status(201).json(serializeCoupon(row!));
});

router.patch("/coupons/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = CouponBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid update" }); return; }
  if (parsed.data.discountType === "percent" && parsed.data.discountValue !== undefined && parsed.data.discountValue > 100) { res.status(400).json({ error: "A percent discount can't exceed 100" }); return; }
  const update: Partial<typeof couponsTable.$inferInsert> = {};
  if (parsed.data.code !== undefined) update.code = parsed.data.code.toUpperCase();
  if (parsed.data.discountType !== undefined) update.discountType = parsed.data.discountType;
  if (parsed.data.discountValue !== undefined) update.discountValue = String(parsed.data.discountValue);
  if (parsed.data.maxUses !== undefined) update.maxUses = parsed.data.maxUses;
  if (parsed.data.expiresAt !== undefined) update.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  const [row] = await db.update(couponsTable).set(update).where(eq(couponsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Coupon not found" }); return; }
  res.json(serializeCoupon(row));
});

router.delete("/coupons/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid coupon id" }); return; }
  await db.delete(couponsTable).where(eq(couponsTable.id, id));
  res.json({ ok: true });
});

// Public — the registration form calls this before an account even
// exists yet, and the renew-membership form calls it the same way, both to
// preview a coupon's discount against the plan the student picked before
// submitting payment proof. See POST /auth/register and POST /payments for
// where the same validateCoupon() helper is used to actually apply it.
router.post("/coupons/validate", async (req, res): Promise<void> => {
  const parsed = z.object({ code: z.string().min(1), planId: z.coerce.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const [plan] = await db.select().from(membershipPlansTable).where(and(eq(membershipPlansTable.id, parsed.data.planId), eq(membershipPlansTable.active, true)));
  if (!plan) { res.status(400).json({ error: "Selected plan is not available" }); return; }
  const result = await validateCoupon(parsed.data.code, Number(plan.price));
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  res.json({ valid: true, discountedAmount: result.discountedAmount, discountAmount: result.discountAmount, currency: plan.currency });
});

export default router;

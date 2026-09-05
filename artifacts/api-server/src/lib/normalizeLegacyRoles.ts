import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Older seed data used a separate "superadmin" role alongside "admin", with
 * no actual difference in permissions — every admin-only route treats them
 * identically (see isAdminRole in middlewares/auth.ts). That split caused a
 * real bug: the admin frontend's own client-side gate only checked for the
 * literal string "admin", so an account still carrying "superadmin" got
 * shown "you're not an admin" even though every API call it made succeeded.
 *
 * Rather than keep threading a "these two strings are equivalent" special
 * case through every role check forever, this runs once at boot and folds
 * any remaining "superadmin" rows into "admin" for good. Idempotent and
 * cheap — a no-op once there are no legacy rows left.
 */
export async function normalizeLegacyRoles(): Promise<void> {
  const updated = await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.role, "superadmin")).returning({ id: usersTable.id });
  if (updated.length > 0) {
    logger.info({ count: updated.length, userIds: updated.map((u) => u.id) }, "[migrate] Normalized legacy 'superadmin' role to 'admin'");
  }
}

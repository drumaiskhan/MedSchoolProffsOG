import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

const DEFAULT_ADMIN_EMAIL = "umais0khan@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "Umaiskhan000";

/**
 * On first boot (no admin account exists yet), creates one using
 * DEFAULT_ADMIN_EMAIL/DEFAULT_ADMIN_PASSWORD env vars if set, otherwise the
 * hardcoded defaults below. This exists so a fresh deploy (Railway, Render,
 * local dev) has a working admin login immediately — no manual SQL insert,
 * no ADMIN_SIGNUP_CODE bootstrap dance.
 *
 * The seeded account should have its email/password changed from
 * Admin -> Platform settings -> Your account right after first login —
 * that's exactly what that panel is for. On Railway/Render, set
 * DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD as real env vars instead of
 * relying on the hardcoded fallback, if you'd rather not have this
 * repository's default credentials be the ones that get seeded.
 *
 * Called after normalizeLegacyRoles(), so any legacy "superadmin" row has
 * already become "admin" by the time this checks for an existing admin.
 */
export async function seedDefaultAdmin(): Promise<void> {
  const [existingAdmin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  if (existingAdmin) return;

  const email = (process.env.DEFAULT_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
  const password = process.env.DEFAULT_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  const [emailTaken] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (emailTaken) {
    logger.warn({ email }, "[seed] Default admin email is already taken by a non-admin account — skipping admin seed. Create an admin manually via /admin-signup/1.");
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(usersTable).values({
    name: "Admin",
    email,
    passwordHash,
    role: "admin",
    status: "ACTIVE",
    emailVerified: true,
  });

  logger.info({ email }, "[seed] Created default admin account — change its email/password from Admin -> Platform settings -> Your account as soon as you log in.");
}

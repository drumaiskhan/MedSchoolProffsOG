import { Router, type IRouter } from "express";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  usersTable,
  institutionsTable,
  programsTable,
  academicYearsTable,
  batchesTable,
  emailVerificationTokensTable,
  passwordResetTokensTable,
  platformSettingsTable,
  auditLogsTable,
  paymentsTable,
  membershipPlansTable,
} from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signSession,
  generateOneTimeToken,
  generateOtp,
  hashToken,
  verifySession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../lib/auth";
import { createDeviceSession, DeviceLimitError, revokeAllForUser, revokeByTokenId } from "../lib/deviceSessions";
import { sendEmail, otpEmailHtml, resetPasswordEmailHtml, welcomeEmailHtml } from "../lib/email";
import { checkRateLimit } from "../lib/rateLimit";
import { requireAuth } from "../middlewares/auth";
import { banIfTrialExpired } from "../lib/trial";
import { getSetting } from "../lib/settings";
import { getPublicAppUrl } from "../lib/publicAppUrl";
import { resolveFileUrl } from "../lib/storage";
import { validateCoupon, markCouponUsed, type CouponApplication } from "../lib/coupons";

const router: IRouter = Router();

// NOT process.env.APP_URL directly — that var is a comma-separated CORS
// allow-list (see app.ts), and using it verbatim here is what produced the
// broken multi-origin reset-password link. getPublicAppUrl() resolves it to
// the one canonical URL emails should point at. See that helper's comment
// for the full story.
const APP_URL = getPublicAppUrl();
const MAX_LOGIN_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // shorter than the old 24h link — a code is meant to be typed in right away
const MAX_OTP_ATTEMPTS = 5;

// Bug fix: this used to return the legacy free-text `institution`/`program`
// columns, which registration (see /auth/register below) never actually
// writes to — it only sets institutionId/programId/academicYearId, the
// proper FK trio. Every student who signed up through the current
// registration flow therefore had a blank Institution/Programme on their
// profile page (and in every other place that read those same two
// columns), even though they'd picked a real college, MBBS/BDS, and year
// at signup. Now resolves the real names from the FKs, with the legacy
// text columns kept only as a fallback for any pre-existing row that has
// them but no FK set. Also now includes the student's academic year
// (number + label, e.g. 3 / "3rd Year") and their profile picture, neither
// of which this response exposed at all before.
async function userPublicView(user: typeof usersTable.$inferSelect) {
  const [institution] = user.institutionId ? await db.select().from(institutionsTable).where(eq(institutionsTable.id, user.institutionId)) : [];
  const [program] = user.programId ? await db.select().from(programsTable).where(eq(programsTable.id, user.programId)) : [];
  const [academicYear] = user.academicYearId ? await db.select().from(academicYearsTable).where(eq(academicYearsTable.id, user.academicYearId)) : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    institution: institution?.name ?? user.institution,
    program: program?.kind ?? user.program,
    programKind: program?.kind ?? null,
    academicYear: academicYear?.label ?? null,
    yearNumber: academicYear?.yearNumber ?? null,
    institutionId: user.institutionId,
    programId: user.programId,
    academicYearId: user.academicYearId,
    batchId: user.batchId,
    rollNumber: user.rollNumber,
    phone: user.phone,
    profilePicturePath: user.profilePicturePath,
    profilePictureUrl: resolveFileUrl(user.profilePicturePath),
  };
}

/** The session id (`sid`) carried by the request's cookie/bearer token, if it verifies. */
function requestSession(req: import("express").Request): { sid: string | null; userId: number | null } {
  const raw = req.cookies?.[SESSION_COOKIE_NAME] || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  const payload = raw ? verifySession(raw) : null;
  return { sid: payload?.sid ?? null, userId: payload?.sub ?? null };
}

// Registers this browser as a signed-in device (enforcing the per-account
// device limit — see lib/deviceSessions.ts), then sets the cookie. Throws
// DeviceLimitError when the account is already on its maximum number of
// devices; callers turn that into a 403 via sendDeviceLimit().
async function setSessionCookie(req: import("express").Request, res: import("express").Response, user: typeof usersTable.$inferSelect) {
  // Signing in again from a browser that already holds a session for this same
  // account replaces that session rather than taking a second slot.
  const existing = requestSession(req);
  const replace = existing.userId === user.id ? existing.sid : null;
  const sid = await createDeviceSession(user, req, replace);
  const token = signSession({
    sub: user.id,
    role: user.role,
    passwordChangedAt: Math.floor(user.passwordChangedAt.getTime() / 1000),
    sid,
  });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  return token;
}

function sendDeviceLimit(res: import("express").Response, err: unknown): boolean {
  if (err instanceof DeviceLimitError) {
    res.status(403).json({ error: err.message, code: err.code, limit: err.limit });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Student registration
// ---------------------------------------------------------------------------

const RegisterSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().min(6).max(30), // WhatsApp number — required so admin/support can reach the student
  rollNumber: z.string().min(1).max(60).optional(),
  institutionId: z.coerce.number().int().positive(),
  // Program + year drive content visibility directly (see
  // lib/contentVisibility.ts) — MBBS runs 1st-5th year, BDS runs 1st-4th.
  programKind: z.enum(["MBBS", "BDS"]),
  yearNumber: z.coerce.number().int().min(1).max(5),
  // Payment is collected as part of account creation — students choose a
  // plan and submit proof up front rather than registering "free" first.
  planId: z.coerce.number().int().positive(),
  // Optional — validated against med_coupons in the handler below (same
  // validateCoupon() helper POST /coupons/validate uses), discounts the
  // amount recorded on the signup payment row. Coupons only ever apply to
  // membership plans, never to books.
  couponCode: z.string().trim().max(40).optional(),
  method: z.string().max(60).optional(),
  reference: z.string().max(120).optional(),
  paymentDate: z.string().max(20).optional(),
  // Required — an account can no longer be created without evidence of
  // payment. This is what /uploads/payment-proof-signup returns; the
  // registration form uploads the file first and only then submits.
  proofPath: z.string().min(1, "Please upload your payment proof before submitting").max(500),
});

const YEAR_ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" };
const MAX_YEAR_BY_PROGRAM: Record<"MBBS" | "BDS", number> = { MBBS: 5, BDS: 4 };

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details" });
    return;
  }
  const data = parsed.data;
  const email = data.email.toLowerCase().trim();

  if (data.yearNumber > MAX_YEAR_BY_PROGRAM[data.programKind]) {
    res.status(400).json({ error: `${data.programKind} only goes up to ${data.programKind === "MBBS" ? "5th" : "4th"} year (final year)` });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const [institution] = await db.select().from(institutionsTable).where(and(eq(institutionsTable.id, data.institutionId), eq(institutionsTable.active, true)));
  if (!institution) {
    res.status(400).json({ error: "Please select a valid college" });
    return;
  }

  // Find-or-create the underlying Program/AcademicYear rows for this
  // college + MBBS/BDS + year. Content visibility is driven by
  // program.kind + academicYear.yearNumber (not these row IDs), so
  // provisioning them here — rather than requiring an admin to pre-create
  // every college's programs/years — keeps signup to just "pick your
  // program and year" while admin can still fine-tune batches under them.
  let [program] = await db.select().from(programsTable).where(and(eq(programsTable.institutionId, institution.id), eq(programsTable.kind, data.programKind)));
  if (!program) {
    [program] = await db.insert(programsTable).values({ institutionId: institution.id, name: data.programKind, kind: data.programKind, active: true }).returning();
  }
  let [academicYear] = await db.select().from(academicYearsTable).where(and(eq(academicYearsTable.programId, program.id), eq(academicYearsTable.yearNumber, data.yearNumber)));
  if (!academicYear) {
    const label = `${YEAR_ORDINAL[data.yearNumber]} Year${data.yearNumber === MAX_YEAR_BY_PROGRAM[data.programKind] ? " (Final)" : ""}`;
    [academicYear] = await db.insert(academicYearsTable).values({ programId: program.id, label, yearNumber: data.yearNumber, active: true }).returning();
  }

  const [plan] = await db.select().from(membershipPlansTable).where(and(eq(membershipPlansTable.id, data.planId), eq(membershipPlansTable.active, true)));
  if (!plan) {
    res.status(400).json({ error: "Please select a valid membership plan" });
    return;
  }

  // Optional coupon (plans only — see lib/coupons.ts). Validated before any
  // row is created so a bad code fails the whole signup cleanly, same as
  // an invalid plan/institution above.
  let couponApplied: CouponApplication | null = null;
  if (data.couponCode) {
    const result = await validateCoupon(data.couponCode, Number(plan.price));
    if ("error" in result) { res.status(400).json({ error: result.error }); return; }
    couponApplied = result;
  }

  const passwordHash = await hashPassword(data.password);
  const [created] = await db
    .insert(usersTable)
    .values({
      name: data.name.trim(),
      email,
      passwordHash,
      role: "student",
      status: "PAYMENT_PENDING_REVIEW",
      emailVerified: false,
      institutionId: institution.id,
      programId: program.id,
      academicYearId: academicYear.id,
      rollNumber: data.rollNumber?.trim(),
      phone: data.phone.trim(),
      institution: institution.name,
      program: program.name,
    })
    .returning();

  await db.insert(paymentsTable).values({
    userId: created.id,
    planId: plan.id,
    planName: plan.name,
    amount: couponApplied ? String(couponApplied.discountedAmount) : plan.price,
    currency: plan.currency,
    duration: plan.duration,
    durationUnit: plan.durationUnit,
    method: data.method || "Not specified",
    reference: data.reference || `SIGNUP-${created.id}-${Date.now().toString(36).toUpperCase()}`,
    paymentDate: data.paymentDate || new Date().toISOString().slice(0, 10),
    proofPath: data.proofPath ?? null,
    status: "PAYMENT_PENDING_REVIEW",
    couponCode: couponApplied?.coupon.code ?? null,
    discountAmount: couponApplied ? String(couponApplied.discountAmount) : null,
  });
  if (couponApplied) await markCouponUsed(couponApplied.coupon.id);

  const { code, hash } = generateOtp();
  await db.insert(emailVerificationTokensTable).values({
    userId: created.id,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });
  await sendEmail(email, "Verify your MedschoolProffs account", otpEmailHtml(created.name, code));

  await db.insert(auditLogsTable).values({ actorId: created.id, action: "USER_REGISTERED", entity: "user", entityId: created.id });

  res.status(201).json({ user: await userPublicView(created), message: "Account created and payment submitted. Enter the verification code we emailed you — an admin will review your payment shortly and activate your access." });
});

// ---------------------------------------------------------------------------
// Admin registration — gated behind an invite code the super-admin controls.
// Frontend exposes this only at the obscure /admin-signup/1 route; the real
// gate is the ADMIN_SIGNUP_CODE, changeable any time from Admin > Settings.
// ---------------------------------------------------------------------------

const AdminRegisterSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(128),
  inviteCode: z.string().min(1),
});

router.post("/auth/admin/register", async (req, res): Promise<void> => {
  const parsed = AdminRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details" });
    return;
  }
  const data = parsed.data;

  const expectedCode = await getSetting("ADMIN_SIGNUP_CODE", null);
  if (!expectedCode) {
    res.status(403).json({ error: "Admin sign-up is currently disabled. Ask an existing admin to set an invite code." });
    return;
  }
  if (data.inviteCode !== expectedCode) {
    res.status(403).json({ error: "Invalid invite code." });
    return;
  }

  const email = data.email.toLowerCase().trim();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(data.password);
  const [created] = await db
    .insert(usersTable)
    .values({
      name: data.name.trim(),
      email,
      passwordHash,
      role: "admin",
      status: "ACTIVE",
      emailVerified: true,
    })
    .returning();

  await db.insert(auditLogsTable).values({ actorId: created.id, action: "ADMIN_REGISTERED", entity: "user", entityId: created.id });

  const token = await setSessionCookie(req, res, created);
  res.status(201).json({ token, user: await userPublicView(created) });
});

// ---------------------------------------------------------------------------
// Login / logout / me
// ---------------------------------------------------------------------------

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();

  const ip = req.ip || "unknown";
  const limit = checkRateLimit(`login:${ip}:${email}`, 10, 5 * 60 * 1000);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many login attempts. Please try again in a few minutes." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    res.status(423).json({ error: "This account is temporarily locked due to repeated failed logins. Try again later." });
    return;
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await db.update(usersTable).set({ failedLoginAttempts: attempts, lockedUntil }).where(eq(usersTable.id, user.id));
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.role === "student" && !user.emailVerified) {
    res.status(403).json({ error: "Please verify your email before logging in.", code: "EMAIL_NOT_VERIFIED" });
    return;
  }

  // A student whose ACTIVE status came from an admin-granted trial
  // (POST /students/:id/trial) that has since expired gets banned right
  // here, before they can even sign back in — see banIfTrialExpired for
  // why this can't just trust `user.status`. Falls through to the
  // SUSPENDED check right below once it has.
  if (user.role === "student" && user.status === "ACTIVE" && (await banIfTrialExpired(user.id))) {
    res.status(403).json({ error: "Your trial period has ended. Contact support or ask about a membership to regain access." });
    return;
  }

  if (user.status === "SUSPENDED") {
    res.status(403).json({ error: "This account has been suspended. Contact support for help." });
    return;
  }

  // Rejected accounts already got the specific reason by email (see
  // PATCH /students/:id/status) — no need to repeat it here, just block
  // the login itself.
  if (user.status === "REJECTED") {
    res.status(403).json({ error: "Your account application was not approved. Check your email for details, or contact support." });
    return;
  }

  // Device limit is checked before anything is recorded as a successful login,
  // so a blocked attempt doesn't touch lastLoginAt.
  let token: string;
  try {
    token = await setSessionCookie(req, res, user);
  } catch (err) {
    if (sendDeviceLimit(res, err)) return;
    throw err;
  }
  await db.update(usersTable).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  res.json({ token, user: await userPublicView(user) });
});

// Frees this device's slot so the student can sign in somewhere else.
router.post("/auth/logout", async (req, res): Promise<void> => {
  const { sid } = requestSession(req);
  if (sid) await revokeByTokenId(sid).catch(() => undefined);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.status(204).send();
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(await userPublicView(user));
});

const UpdateMeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  // Required only when changing email — a stolen session shouldn't be able
  // to silently take over the account's login identity.
  currentPassword: z.string().optional(),
  // Optional profile picture — the storagePath returned by
  // POST /uploads/profile-picture. Deliberately optional everywhere: this
  // schema field, the upload UI in Profile.tsx, and the column itself are
  // all nullable, so a student can use the app fully without ever setting
  // one. Pass an empty string to remove an existing picture.
  profilePicturePath: z.string().max(500).nullable().optional(),
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { email, currentPassword, profilePicturePath, ...rest } = parsed.data;

  const updates: Partial<typeof usersTable.$inferInsert> = { ...rest };
  // Empty string from the "remove photo" action means clear it, not
  // literally store "" as the path.
  if (profilePicturePath !== undefined) updates.profilePicturePath = profilePicturePath || null;

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (normalizedEmail !== user.email) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
        res.status(401).json({ error: "Current password is required to change your email" });
        return;
      }
      const [taken] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
      if (taken) { res.status(409).json({ error: "That email is already in use" }); return; }
      updates.email = normalizedEmail;
    }
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(await userPublicView(user));
});

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = z.object({ email: z.string().email(), otp: z.string().min(4).max(8) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email and code are required" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const ip = req.ip || "unknown";
  const limit = checkRateLimit(`verify-otp:${ip}:${email}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many attempts. Please try again later." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(400).json({ error: "This code is invalid or has expired." });
    return;
  }
  if (user.emailVerified) {
    res.json({ message: "Email already verified. You can now log in." });
    return;
  }

  // Most recent still-usable code for this account — resending invalidates
  // nothing explicitly, but only the latest one is ever checked, so an
  // older code in a student's inbox from a previous resend simply stops
  // working once a newer one has been requested.
  const [record] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(and(eq(emailVerificationTokensTable.userId, user.id), isNull(emailVerificationTokensTable.usedAt), gt(emailVerificationTokensTable.expiresAt, new Date())))
    .orderBy(desc(emailVerificationTokensTable.createdAt))
    .limit(1);

  if (!record) {
    res.status(400).json({ error: "This code is invalid or has expired. Request a new one." });
    return;
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
    return;
  }

  const otpHash = hashToken(parsed.data.otp.trim());
  if (otpHash !== record.tokenHash) {
    await db.update(emailVerificationTokensTable).set({ attempts: record.attempts + 1 }).where(eq(emailVerificationTokensTable.id, record.id));
    res.status(400).json({ error: "Incorrect code. Please try again." });
    return;
  }

  await db.update(emailVerificationTokensTable).set({ usedAt: new Date() }).where(eq(emailVerificationTokensTable.id, record.id));
  // Only bump UNVERIFIED -> VERIFIED here. Registration already puts the
  // student in PAYMENT_PENDING_REVIEW (their payment proof is submitted at
  // signup — see /auth/register), and confirming the OTP only proves the
  // email address, not the payment. Overwriting that to "VERIFIED"
  // unconditionally used to silently drop the account out of the
  // admin's payment queue state and skip straight past manual review.
  // Same CASE-based pattern as the admin-triggered
  // POST /students/:id/verify-email route in routes/medschool.ts, kept in
  // sync intentionally — a student should never be able to self-activate
  // past a pending payment just by confirming their inbox.
  const [verifiedUser] = await db
    .update(usersTable)
    .set({ emailVerified: true, status: sql`CASE WHEN ${usersTable.status} = 'UNVERIFIED' THEN 'VERIFIED' ELSE ${usersTable.status} END` })
    .where(eq(usersTable.id, user.id))
    .returning();

  // Fire-and-forget, same as every other transactional email in this file —
  // a slow/down mail provider should never delay or fail the verification
  // response itself.
  if (verifiedUser) {
    void sendEmail(verifiedUser.email, "Welcome to MedschoolProffs", welcomeEmailHtml(verifiedUser.name, `${APP_URL}/login`)).catch(() => {});
  }

  res.json({
    message:
      verifiedUser?.status === "PAYMENT_PENDING_REVIEW"
        ? "Email verified. Your payment is now awaiting admin review — you'll be notified once your account is activated."
        : "Email verified. You can now log in.",
  });
});

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const ip = req.ip || "unknown";
  const limit = checkRateLimit(`resend-otp:${ip}:${email}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  // Always respond success to avoid leaking whether an email is registered.
  if (user && !user.emailVerified) {
    const { code, hash } = generateOtp();
    await db.insert(emailVerificationTokensTable).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + OTP_EXPIRY_MS) });
    await sendEmail(email, "Verify your MedschoolProffs account", otpEmailHtml(user.name, code));
  }
  res.json({ message: "If that email is registered and unverified, a new verification code has been sent." });
});

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const ip = req.ip || "unknown";
  const limit = checkRateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (user) {
    const { raw, hash } = generateOneTimeToken();
    await db.insert(passwordResetTokensTable).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    await sendEmail(email, "Reset your MedschoolProffs password", resetPasswordEmailHtml(user.name, `${APP_URL}/reset-password?token=${raw}`));
  }
  res.json({ message: "If that email is registered, a password reset link has been sent." });
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = z.object({ token: z.string().min(1), password: z.string().min(8).max(128) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const tokenHash = hashToken(parsed.data.token);
  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(and(eq(passwordResetTokensTable.tokenHash, tokenHash), isNull(passwordResetTokensTable.usedAt), gt(passwordResetTokensTable.expiresAt, new Date())));

  if (!record) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(usersTable).set({ passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null }).where(eq(usersTable.id, record.userId));
  await db.update(passwordResetTokensTable).set({ usedAt: new Date() }).where(eq(passwordResetTokensTable.id, record.id));
  // Old tokens stop working on a password change anyway; free their device slots too.
  await revokeAllForUser(record.userId);

  res.json({ message: "Password updated. You can now log in with your new password." });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(usersTable).set({ passwordHash, passwordChangedAt: new Date() }).where(eq(usersTable.id, user.id));
  await revokeAllForUser(user.id); // every token is void after a password change — free the device slots
  res.json({ message: "Password changed." });
});

export default router;

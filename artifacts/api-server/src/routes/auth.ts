import { Router, type IRouter } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
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
  hashToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../lib/auth";
import { sendEmail, verificationEmailHtml, resetPasswordEmailHtml } from "../lib/email";
import { checkRateLimit } from "../lib/rateLimit";
import { requireAuth } from "../middlewares/auth";
import { getSetting } from "../lib/settings";

const router: IRouter = Router();

const APP_URL = process.env.APP_URL || "http://localhost:5173";
const MAX_LOGIN_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

function userPublicView(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    institution: user.institution,
    program: user.program,
    institutionId: user.institutionId,
    programId: user.programId,
    academicYearId: user.academicYearId,
    batchId: user.batchId,
    rollNumber: user.rollNumber,
    phone: user.phone,
  };
}

function setSessionCookie(res: import("express").Response, user: typeof usersTable.$inferSelect) {
  const token = signSession({
    sub: user.id,
    role: user.role,
    passwordChangedAt: Math.floor(user.passwordChangedAt.getTime() / 1000),
  });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  return token;
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
  method: z.string().max(60).optional(),
  reference: z.string().max(120).optional(),
  paymentDate: z.string().max(20).optional(),
  proofPath: z.string().max(500).optional(),
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
    amount: plan.price,
    currency: plan.currency,
    duration: plan.duration,
    durationUnit: plan.durationUnit,
    method: data.method || "Not specified",
    reference: data.reference || `SIGNUP-${created.id}-${Date.now().toString(36).toUpperCase()}`,
    paymentDate: data.paymentDate || new Date().toISOString().slice(0, 10),
    proofPath: data.proofPath ?? null,
    status: "PAYMENT_PENDING_REVIEW",
  });

  const { raw, hash } = generateOneTimeToken();
  await db.insert(emailVerificationTokensTable).values({
    userId: created.id,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await sendEmail(email, "Verify your MedschoolProffs account", verificationEmailHtml(created.name, `${APP_URL}/verify-email?token=${raw}`));

  await db.insert(auditLogsTable).values({ actorId: created.id, action: "USER_REGISTERED", entity: "user", entityId: created.id });

  res.status(201).json({ user: userPublicView(created), message: "Account created and payment submitted. Please verify your email — an admin will review your payment shortly and activate your access." });
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

  const token = setSessionCookie(res, created);
  res.status(201).json({ token, user: userPublicView(created) });
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

  if (user.status === "SUSPENDED") {
    res.status(403).json({ error: "This account has been suspended. Contact support for help." });
    return;
  }

  await db.update(usersTable).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const token = setSessionCookie(res, user);
  res.json({ token, user: userPublicView(user) });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.status(204).send();
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(userPublicView(user));
});

const UpdateMeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  // Required only when changing email — a stolen session shouldn't be able
  // to silently take over the account's login identity.
  currentPassword: z.string().optional(),
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { email, currentPassword, ...rest } = parsed.data;

  const updates: Partial<typeof usersTable.$inferInsert> = { ...rest };

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
  res.json(userPublicView(user));
});

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A verification token is required" });
    return;
  }
  const tokenHash = hashToken(parsed.data.token);
  const [record] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(and(eq(emailVerificationTokensTable.tokenHash, tokenHash), isNull(emailVerificationTokensTable.usedAt), gt(emailVerificationTokensTable.expiresAt, new Date())));

  if (!record) {
    res.status(400).json({ error: "This verification link is invalid or has expired." });
    return;
  }

  await db.update(emailVerificationTokensTable).set({ usedAt: new Date() }).where(eq(emailVerificationTokensTable.id, record.id));
  await db.update(usersTable).set({ emailVerified: true, status: "VERIFIED" }).where(eq(usersTable.id, record.userId));

  res.json({ message: "Email verified. You can now log in." });
});

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  // Always respond success to avoid leaking whether an email is registered.
  if (user && !user.emailVerified) {
    const { raw, hash } = generateOneTimeToken();
    await db.insert(emailVerificationTokensTable).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    await sendEmail(email, "Verify your MedschoolProffs account", verificationEmailHtml(user.name, `${APP_URL}/verify-email?token=${raw}`));
  }
  res.json({ message: "If that email is registered and unverified, a new verification link has been sent." });
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
  res.json({ message: "Password changed." });
});

export default router;

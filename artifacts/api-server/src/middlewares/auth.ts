import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { SESSION_COOKIE_NAME, verifySession } from "../lib/auth";
import { getSetting } from "../lib/settings";
import { getStudentTargeting, isTargetVisible } from "../lib/contentVisibility";

export interface AuthedUser {
  id: number;
  role: string;
  status: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

// One admin role. Any legacy "superadmin" rows are converted to "admin" at
// boot (see lib/normalizeLegacyRoles.ts), so this only ever needs to check
// one value.
export function isAdminRole(role: string): boolean {
  return role === "admin";
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return null;
}

// TEMPORARY: verbose diagnostic logging for a login redirect-loop bug in
// production. Prints to the platform's log stream (Railway "Deploy Logs" /
// stdout) so it can be read directly rather than caught live in browser
// DevTools, which was infeasible here due to a hard-redirect on failure.
// Safe to remove once the auth flow is confirmed working — it logs no
// secrets, only which branch of the check was hit.
function debugAuth(req: Request, reason: string, extra?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log("[auth-debug]", req.method, req.originalUrl, "-", reason, extra ?? "");
}

/** Populates req.user when a valid session is present, but never rejects the request. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const hasCookieHeader = Boolean(req.headers.cookie);
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  const token = extractToken(req);

  if (!token) {
    debugAuth(req, "no token found", { hasCookieHeader, cookieNamesSeen: req.cookies ? Object.keys(req.cookies) : [] });
    return next();
  }

  const payload = verifySession(token);
  if (!payload) {
    debugAuth(req, "token failed JWT verification (bad signature or expired)", { tokenSource: cookieToken ? "cookie" : "bearer" });
    return next();
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.sub));
  if (!user) {
    debugAuth(req, "token valid but no matching user row", { userId: payload.sub });
    return next();
  }

  // if the password changed after this token was issued, the token is stale — reject it
  const userChangedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
  if (userChangedAtSec > payload.passwordChangedAt) {
    debugAuth(req, "token rejected: passwordChangedAt is newer than token", {
      userChangedAtSec,
      tokenIssuedForChangedAtSec: payload.passwordChangedAt,
    });
    return next();
  }

  req.user = { id: user.id, role: user.role, status: user.status, email: user.email, name: user.name };
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  if (!isAdminRole(req.user.role)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}

/** Blocks students whose membership isn't ACTIVE (admins always pass). */
export async function requireActiveMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  if (isAdminRole(req.user.role)) { next(); return; }
  if (req.user.status === "ACTIVE") { next(); return; }

  // General Trial Mode — an admin-flipped, platform-wide switch (separate
  // from any individual student's membership/status, and from the existing
  // per-student POST /students/:id/trial grant) that opens every
  // membership-gated route to every signed-in student at once, e.g. for a
  // free trial week or launch promo, without creating/touching a single
  // med_memberships row. See GET/PATCH /admin/settings's GLOBAL_TRIAL_MODE
  // key and AdminSettings.tsx's "General trial mode" toggle. Defaults to
  // off — the setting must be the exact string "true" — so a missing/unset
  // key (fresh install, or the settings lookup itself failing below) never
  // accidentally opens the whole site.
  //
  // GLOBAL_TRIAL_PROGRAM / GLOBAL_TRIAL_YEAR optionally narrow that switch
  // to one program (MBBS/BDS) and/or one academic year instead of every
  // student — e.g. a trial week for MBBS Year 1 only. Empty string on
  // either key (the default) means "no restriction on that axis", so
  // leaving both blank reproduces the original every-student behavior
  // exactly. Uses the same programTargetKind/yearTargetNumber matching
  // rule as modules/blocks/exams (lib/contentVisibility.ts's
  // isTargetVisible) for consistency with how targeting already works
  // everywhere else in the app.
  let globalTrialEnabled = false;
  let trialProgram = "";
  let trialYear = "";
  try {
    globalTrialEnabled = (await getSetting("GLOBAL_TRIAL_MODE", "false")) === "true";
    if (globalTrialEnabled) {
      trialProgram = (await getSetting("GLOBAL_TRIAL_PROGRAM", "")) ?? "";
      trialYear = (await getSetting("GLOBAL_TRIAL_YEAR", "")) ?? "";
    }
  } catch {
    globalTrialEnabled = false;
  }
  if (globalTrialEnabled) {
    if (!trialProgram && !trialYear) { next(); return; }
    try {
      const targeting = await getStudentTargeting(req.user.id);
      const yearNum = trialYear ? Number(trialYear) : null;
      if (isTargetVisible(trialProgram || null, yearNum, targeting)) { next(); return; }
    } catch {
      // fails closed — a lookup error here should not silently grant access
    }
  }

  res.status(403).json({ error: "An active membership is required to access this content." });
}

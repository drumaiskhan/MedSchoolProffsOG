import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { SESSION_COOKIE_NAME, verifySession } from "../lib/auth";
import { banIfTrialExpired, trialGrantsAccess, type TrialFeature } from "../lib/trial";
import { isSessionActive } from "../lib/deviceSessions";

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

  // The token must belong to a device session that is still active. This is
  // what enforces the per-account device limit and lets an admin sign a
  // device out. Tokens minted before device sessions existed carry no `sid`
  // and are treated as signed out (one re-login, then everything is tracked).
  if (!payload.sid || !(await isSessionActive(payload.sid, user.id))) {
    debugAuth(req, "token rejected: device session missing, revoked or expired", { userId: user.id, hasSid: Boolean(payload.sid) });
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

/** Core "does this user currently have active-membership-gated access"
 * check, factored out of requireMembershipFor below so a route that needs a
 * soft yes/no doesn't have to re-implement admin bypass + trial-mode logic
 * itself and risk drifting out of sync with the real gate. Never touches
 * the response — safe to call from inside a route handler.
 *
 * Order: admins always pass, then a student with an ACTIVE membership, then
 * General Trial Mode (lib/trial.ts) — an admin-flipped, platform-wide
 * switch that opens membership-gated routes to signed-in students without
 * creating or touching a single med_memberships row, so switching it off
 * (or letting its end date pass) instantly restores normal per-student
 * gating with nothing to clean up. The trial can be narrowed to a program,
 * to any set of academic years, and to a chosen set of features — `feature`
 * says which one THIS route belongs to, so a trial that only unlocks the
 * MCQ bank doesn't also unlock flashcards. Separate from the per-student
 * POST /students/:id/trial grant, which is unaffected either way.
 *
 * A status of "ACTIVE" is set by both a real membership grant AND a
 * per-student trial grant (POST /students/:id/trial) — nothing flips it
 * back when a trial's expiresAt passes, so this can't just trust the
 * status column: banIfTrialExpired checks whether the thing that actually
 * made this account ACTIVE was a trial that has since expired, and if so
 * bans the account (status SUSPENDED, every session revoked) on the spot
 * instead of quietly denying just this one request. */
export async function hasActiveMembership(user: AuthedUser, feature?: TrialFeature | readonly TrialFeature[]): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  if (user.status === "ACTIVE") {
    if (await banIfTrialExpired(user.id)) return false;
    return true;
  }
  return trialGrantsAccess(user.id, feature);
}

type FeatureResolver = TrialFeature | readonly TrialFeature[] | ((req: Request) => TrialFeature | readonly TrialFeature[]);

/** Blocks students whose membership isn't ACTIVE (admins always pass),
 * unless the platform-wide trial is on and covers `feature` for them.
 * `feature` may be a function of the request for routes that serve more than
 * one feature depending on their query (GET /mcqs serves both the MCQ bank
 * and past-paper practice). */
export function requireMembershipFor(feature?: FeatureResolver) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    const resolved = typeof feature === "function" ? feature(req) : feature;
    if (await hasActiveMembership(req.user, resolved)) { next(); return; }
    res.status(403).json({ error: "An active membership is required to access this content." });
  };
}

/** Feature-agnostic variant, kept so existing imports keep compiling — only
 * a full-access trial opens routes gated this way. Prefer
 * requireMembershipFor("<feature>") on anything new. */
export const requireActiveMembership = requireMembershipFor();

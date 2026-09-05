import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { SESSION_COOKIE_NAME, verifySession } from "../lib/auth";

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
export function requireActiveMembership(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  if (isAdminRole(req.user.role)) return next();
  if (req.user.status !== "ACTIVE") {
    res.status(403).json({ error: "An active membership is required to access this content." });
    return;
  }
  next();
}

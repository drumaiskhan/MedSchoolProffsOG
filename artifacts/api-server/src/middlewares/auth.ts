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

/** Populates req.user when a valid session is present, but never rejects the request. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) return next();
  const payload = verifySession(token);
  if (!payload) return next();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.sub));
  if (!user) return next();

  // if the password changed after this token was issued, the token is stale — reject it
  if (Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.passwordChangedAt) return next();

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

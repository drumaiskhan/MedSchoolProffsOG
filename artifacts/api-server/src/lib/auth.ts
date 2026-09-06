import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.warn("[auth] JWT_SECRET is not set. Using an insecure default — set JWT_SECRET in production.");
}

const JWT_EXPIRY = "7d";
const BCRYPT_ROUNDS = 12;

export interface SessionPayload {
  sub: number; // user id
  role: string; // student | admin (legacy "superadmin" rows are normalized to "admin" at boot — see lib/normalizeLegacyRoles.ts)
  passwordChangedAt: number; // ms epoch, used to invalidate tokens after password change
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Generates a URL-safe random token and returns both the raw token (to email/send)
 *  and its sha256 hash (to store in the DB). Never store the raw token. */
export function generateOneTimeToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export const SESSION_COOKIE_NAME = "medschool_session";

// This deployment is always split-domain: the frontend(s) run on Netlify
// and the API server runs on a separate host (Railway/Render). Cross-site
// fetch/XHR calls only carry cookies when they're set as
// SameSite=None; Secure — SameSite=Lax (the old default here) is silently
// dropped on JS-initiated cross-origin requests, which caused login to
// succeed (200) but the very next /me check to come back 401 and bounce
// the user straight back to /login. Hardcoded to "none"/secure rather than
// gated behind an env var so this can't regress by forgetting to set
// COOKIE_CROSS_SITE=true on the API host.
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "none" as const,
  secure: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

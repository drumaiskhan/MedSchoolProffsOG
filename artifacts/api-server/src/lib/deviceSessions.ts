import crypto from "node:crypto";
import type { Request } from "express";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db, userSessionsTable } from "@workspace/db";
import { getSetting } from "./settings";
import { SESSION_TTL_MS } from "./auth";

/**
 * Device limit. Every login creates a row in med_user_sessions and the JWT
 * carries its id (`sid`); the auth middleware only honours a token whose row
 * is still active. A student may hold at most `limit` active rows at once.
 *
 *   limit = users.max_devices ?? DEFAULT_MAX_DEVICES setting ?? 2
 *   0 = unlimited. Admin accounts are never limited (so an admin can't lock
 *   themselves out), though their sessions are still recorded.
 */
export const DEFAULT_MAX_DEVICES = 2;
export const MAX_DEVICES_CEILING = 50;
export const DEVICE_LIMIT_SETTING = "DEFAULT_MAX_DEVICES";

export class DeviceLimitError extends Error {
  code = "DEVICE_LIMIT_REACHED" as const;
  limit: number;
  constructor(limit: number) {
    super(
      `This account is already signed in on ${limit} device${limit === 1 ? "" : "s"}, which is the maximum. ` +
        "Sign out on one of them first, or contact support to have your devices reset.",
    );
    this.limit = limit;
  }
}

/** Parses a stored limit. Returns null for anything that isn't a whole number 0..50. */
export function parseDeviceLimit(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0 || n > MAX_DEVICES_CEILING) return null;
  return n;
}

export async function getDefaultDeviceLimit(): Promise<number> {
  return parseDeviceLimit(await getSetting(DEVICE_LIMIT_SETTING, null)) ?? DEFAULT_MAX_DEVICES;
}

/** The limit that applies to this user right now (0 = unlimited). */
export async function getEffectiveDeviceLimit(user: { role: string; maxDevices: number | null }): Promise<number> {
  if (user.role === "admin") return 0;
  return user.maxDevices ?? (await getDefaultDeviceLimit());
}

/** "Chrome on Windows", "Safari on iPhone", … — display only, never used for security decisions. */
export function describeDevice(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";
  const os = /iPhone/i.test(ua) ? "iPhone"
    : /iPad/i.test(ua) ? "iPad"
    : /Android/i.test(ua) ? "Android"
    : /Windows/i.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua) ? "Mac"
    : /CrOS/i.test(ua) ? "ChromeOS"
    : /Linux/i.test(ua) ? "Linux"
    : null;
  const browser = /Edg\//i.test(ua) ? "Edge"
    : /OPR\/|Opera/i.test(ua) ? "Opera"
    : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
    : /Firefox|FxiOS/i.test(ua) ? "Firefox"
    : /Chrome|CriOS/i.test(ua) ? "Chrome"
    : /Safari/i.test(ua) ? "Safari"
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return (first || req.ip || null)?.slice(0, 64) ?? null;
}

const now = () => new Date();
const activeWhere = (userId: number) =>
  and(eq(userSessionsTable.userId, userId), isNull(userSessionsTable.revokedAt), gt(userSessionsTable.expiresAt, now()));

/**
 * Registers a new signed-in device for `user` or throws DeviceLimitError.
 * `replaceTokenId` is the session cookie the browser already holds: signing in
 * again from the same browser replaces that session instead of using a second
 * slot. The check-and-insert runs under a per-user advisory lock so two
 * simultaneous logins can't both squeeze past the limit.
 */
export async function createDeviceSession(
  user: { id: number; role: string; maxDevices: number | null },
  req: Request,
  replaceTokenId?: string | null,
): Promise<string> {
  const limit = await getEffectiveDeviceLimit(user);
  const tokenId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id})`);
    if (replaceTokenId) {
      await tx
        .update(userSessionsTable)
        .set({ revokedAt: now() })
        .where(and(eq(userSessionsTable.userId, user.id), eq(userSessionsTable.tokenId, replaceTokenId), isNull(userSessionsTable.revokedAt)));
    }
    if (limit > 0) {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(userSessionsTable)
        .where(activeWhere(user.id));
      if ((row?.n ?? 0) >= limit) throw new DeviceLimitError(limit);
    }
    await tx.insert(userSessionsTable).values({
      userId: user.id,
      tokenId,
      deviceLabel: describeDevice(req.headers["user-agent"]),
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    // housekeeping: forget rows that ended more than 30 days ago
    await tx
      .delete(userSessionsTable)
      .where(and(eq(userSessionsTable.userId, user.id), lte(userSessionsTable.expiresAt, new Date(Date.now() - 30 * 24 * 3600 * 1000))));
  });
  return tokenId;
}

const TOUCH_EVERY_MS = 10 * 60 * 1000;

/** True when `tokenId` is a live session of `userId`. Also refreshes last_seen_at (at most every 10 min). */
export async function isSessionActive(tokenId: string, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: userSessionsTable.id, lastSeenAt: userSessionsTable.lastSeenAt })
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.tokenId, tokenId), eq(userSessionsTable.userId, userId), isNull(userSessionsTable.revokedAt), gt(userSessionsTable.expiresAt, now())));
  if (!row) return false;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    void db.update(userSessionsTable).set({ lastSeenAt: now() }).where(eq(userSessionsTable.id, row.id)).catch(() => undefined);
  }
  return true;
}

export async function revokeByTokenId(tokenId: string): Promise<void> {
  await db.update(userSessionsTable).set({ revokedAt: now() }).where(and(eq(userSessionsTable.tokenId, tokenId), isNull(userSessionsTable.revokedAt)));
}

export async function revokeAllForUser(userId: number): Promise<number> {
  const rows = await db
    .update(userSessionsTable)
    .set({ revokedAt: now() })
    .where(and(eq(userSessionsTable.userId, userId), isNull(userSessionsTable.revokedAt)))
    .returning({ id: userSessionsTable.id });
  return rows.length;
}

export async function revokeOneForUser(userId: number, sessionId: number): Promise<boolean> {
  const rows = await db
    .update(userSessionsTable)
    .set({ revokedAt: now() })
    .where(and(eq(userSessionsTable.id, sessionId), eq(userSessionsTable.userId, userId), isNull(userSessionsTable.revokedAt)))
    .returning({ id: userSessionsTable.id });
  return rows.length > 0;
}

export async function listActiveSessions(userId: number) {
  return db.select().from(userSessionsTable).where(activeWhere(userId)).orderBy(desc(userSessionsTable.lastSeenAt));
}


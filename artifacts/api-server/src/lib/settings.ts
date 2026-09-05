import { eq } from "drizzle-orm";
import { db, platformSettingsTable } from "@workspace/db";

const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function getSetting(key: string, fallback: string | null = null): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  const value = row?.value ?? fallback;
  if (value !== null) cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
  cache.delete(key);
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(platformSettingsTable);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

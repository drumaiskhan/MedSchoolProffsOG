import { eq } from "drizzle-orm";
import { db, platformSettingsTable } from "@workspace/db";

// Design & Branding — stored as plain hex strings (admin UI uses native
// <input type="color">), applied client-side as CSS vars (see each
// frontend's src/lib/theme.ts). These are the shipped defaults so a fresh
// install already matches the reference design before an admin touches
// anything; getThemeSettings() below fills in any key that isn't yet saved.
export const THEME_KEYS = ["THEME_PRIMARY", "THEME_SECONDARY", "THEME_ACCENT", "THEME_BACKGROUND", "THEME_CARD", "THEME_TEXT", "THEME_MODE"] as const;
export const DEFAULT_THEME: Record<(typeof THEME_KEYS)[number], string> = {
  THEME_PRIMARY: "#173B57",
  THEME_SECONDARY: "#315A75",
  THEME_ACCENT: "#16A6A3",
  THEME_BACKGROUND: "#F5F8FA",
  THEME_CARD: "#FFFFFF",
  THEME_TEXT: "#102443",
  THEME_MODE: "light",
};

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

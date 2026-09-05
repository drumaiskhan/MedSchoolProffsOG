import { Router, type IRouter } from "express";
import { z } from "zod";
import { auditLogsTable, db } from "@workspace/db";
import { getAllSettings, setSetting } from "../lib/settings";
import { requireAdmin } from "../middlewares/auth";
import { resolveFileUrl } from "../lib/storage";

const router: IRouter = Router();

// Keys that are safe to expose to any admin. Secrets (SMTP creds etc.) should
// live in real environment variables, never in this table.
const EDITABLE_KEYS = [
  "ADMIN_SIGNUP_CODE",
  "SUPPORT_EMAIL",
  // WhatsApp number students can message for support — digits only (with
  // country code, no +/spaces), used to build a wa.me link on the student
  // side. Shown on /site-content so both the student app and the public
  // footer can render a "Chat on WhatsApp" button.
  "SUPPORT_WHATSAPP",
  "PLATFORM_NAME",
  "PLATFORM_TAGLINE",
  "DEFAULT_CURRENCY",
  "PAYMENT_INSTRUCTIONS",
  "ANNOUNCEMENT_BANNER",
  "REGISTRATION_ENABLED",
  // Payment collection details — shown to students when they submit payment
  "PAYMENT_ACCOUNT_HOLDER",
  "PAYMENT_ACCOUNT_NUMBER",
  "PAYMENT_BANK_NAME",
  "PAYMENT_IFSC_OR_ROUTING",
  "PAYMENT_UPI_ID",
  "PAYMENT_QR_CODE_PATH",
  "PAYMENT_RAAST_ID",
  "PAYMENT_WALLET_PROVIDER",
  "PAYMENT_WALLET_NUMBER",
  "PAYMENT_WALLET_ACCOUNT_NAME",
  // Advanced payments — multiple bank accounts and per-method toggles, each
  // stored as a JSON array/object string (same pattern as FEATURES_LIST /
  // QUICK_LINKS below). Supersedes the single-account fields above, which
  // stay in place for backward compatibility with older deployments.
  "PAYMENT_BANK_ACCOUNTS", // JSON array of {id,label,accountHolder,bankName,accountNumber,ifsc,branch,isPrimary}
  "PAYMENT_METHODS_CONFIG", // JSON array of {key,label,type,enabled,instructions,fields:{...}}
  "PAYMENT_LATE_FEE_NOTE",
  "PAYMENT_REFUND_POLICY",
  // Website favicon — storage path from the uploads endpoint, resolved to a
  // URL for the browser via /site-content and /payment-details.
  "SITE_FAVICON_PATH",
  // Site content — footer, social links, contact info, feature highlights
  "PLATFORM_DESCRIPTION",
  "SOCIAL_FACEBOOK",
  "SOCIAL_YOUTUBE",
  "SOCIAL_LINKEDIN",
  "SOCIAL_INSTAGRAM",
  "CONTACT_EMAIL",
  "CONTACT_LOCATION",
  "SUPPORT_HOURS",
  "COPYRIGHT_NOTICE",
  "FEATURES_LIST", // JSON string array, e.g. ["30,000+ MCQs","Topic-wise Practice"]
  "QUICK_LINKS", // JSON array of {label,url}
  // AI provider for "Ask AI to explain" (MCQs + flashcards) and admin
  // explanation generation. Falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY
  // / GEMINI_API_KEY env vars if none of these is set — see lib/aiExplain.ts.
  // The key itself is masked on the way out (see withAiKeyMasked below);
  // only the PATCH body carries the real value.
  "AI_PROVIDER", // "anthropic" | "openai" | "gemini" | "custom"
  "AI_API_KEY",
  "AI_MODEL", // optional override; each provider has a sensible default if left blank
  "AI_BASE_URL", // required only when AI_PROVIDER = "custom" — an OpenAI-compatible /chat/completions base URL
] as const;

// Subset visible to students at signup — everything else in admin settings
// (invite codes etc.) stays admin-only.
const PUBLIC_PAYMENT_KEYS = [
  "PAYMENT_INSTRUCTIONS",
  "PAYMENT_ACCOUNT_HOLDER",
  "PAYMENT_ACCOUNT_NUMBER",
  "PAYMENT_BANK_NAME",
  "PAYMENT_IFSC_OR_ROUTING",
  "PAYMENT_UPI_ID",
  "PAYMENT_QR_CODE_PATH",
  "PAYMENT_RAAST_ID",
  "PAYMENT_WALLET_PROVIDER",
  "PAYMENT_WALLET_NUMBER",
  "PAYMENT_WALLET_ACCOUNT_NAME",
  "PAYMENT_BANK_ACCOUNTS",
  "PAYMENT_METHODS_CONFIG",
  "PAYMENT_LATE_FEE_NOTE",
  "PAYMENT_REFUND_POLICY",
  "DEFAULT_CURRENCY",
] as const;

// Resolves the raw storage-path settings (SITE_FAVICON_PATH, PAYMENT_QR_CODE_PATH)
// into browser-loadable URLs alongside the raw values, so neither the admin
// editor nor the public payment page has to duplicate resolveFileUrl's
// storage-backend logic on the client. These extra keys aren't in
// EDITABLE_KEYS, so the PATCH schema below silently ignores them if ever
// posted back.
function withResolvedMedia(view: Record<string, string>): Record<string, string> {
  return { ...view, SITE_FAVICON_URL: resolveFileUrl(view.SITE_FAVICON_PATH) ?? "", PAYMENT_QR_CODE_URL: resolveFileUrl(view.PAYMENT_QR_CODE_PATH) ?? "" };
}

// AI_API_KEY is a secret — never send the real value back down once saved.
// The admin UI shows AI_API_KEY_SET/AI_API_KEY_MASKED and only sends a new
// AI_API_KEY in the PATCH body when the admin is actually changing it.
function withAiKeyMasked(view: Record<string, string>): Record<string, string> {
  const raw = view.AI_API_KEY ?? "";
  const { AI_API_KEY: _drop, ...rest } = view;
  return { ...rest, AI_API_KEY_SET: raw ? "true" : "false", AI_API_KEY_MASKED: raw ? `${"•".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}` : "" };
}

router.get("/payment-details", async (_req, res): Promise<void> => {
  const settings = await getAllSettings();
  const view: Record<string, string> = Object.fromEntries(PUBLIC_PAYMENT_KEYS.map((key) => [key, settings[key] ?? ""]));
  // Pre-parsed for convenience so the frontend doesn't need a try/catch on
  // every render; the raw JSON strings above stay for the admin editor.
  let bankAccounts: unknown[] = [];
  let methods: unknown[] = [];
  try { bankAccounts = JSON.parse(view.PAYMENT_BANK_ACCOUNTS || "[]"); } catch { bankAccounts = []; }
  try { methods = JSON.parse(view.PAYMENT_METHODS_CONFIG || "[]"); } catch { methods = []; }
  res.json({ ...withResolvedMedia(view), bankAccounts, methods });
});

router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getAllSettings();
  const view = Object.fromEntries(EDITABLE_KEYS.map((key) => [key, settings[key] ?? ""]));
  // Not an editable setting — tells the admin UI whether uploads (favicon,
  // payment QR, payment proofs, books, team photos) are going to durable
  // object storage or to this server's local disk. Local disk doesn't
  // survive redeploys/restarts on most hosts (Vercel, Railway, Render
  // without a persistent volume), which is why an upload can appear to
  // succeed and then show a broken image moments later — see storage.ts.
  const storageBackend = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
  res.json({ ...withAiKeyMasked(withResolvedMedia(view)), STORAGE_BACKEND: storageBackend });
});

const SettingsBody = z.object(Object.fromEntries(EDITABLE_KEYS.map((key) => [key, z.string().max(4000).optional()])) as Record<(typeof EDITABLE_KEYS)[number], z.ZodOptional<z.ZodString>>);

router.patch("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    // AI_API_KEY comes back masked from GET — an empty string here means
    // "the admin didn't touch this field," not "clear the key."
    if (key === "AI_API_KEY" && value === "") continue;
    await setSetting(key, value);
  }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "SETTINGS_UPDATED", entity: "platform_settings", metadata: JSON.stringify(Object.keys(parsed.data)) });
  const settings = await getAllSettings();
  res.json(withAiKeyMasked(withResolvedMedia(Object.fromEntries(EDITABLE_KEYS.map((key) => [key, settings[key] ?? ""])))));
});

router.post("/admin/settings/rotate-admin-code", requireAdmin, async (req, res): Promise<void> => {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  await setSetting("ADMIN_SIGNUP_CODE", code);
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "ADMIN_CODE_ROTATED", entity: "platform_settings" });
  res.json({ ADMIN_SIGNUP_CODE: code });
});

export default router;

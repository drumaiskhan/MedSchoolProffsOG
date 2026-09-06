import { Router, type IRouter } from "express";
import { z } from "zod";
import { auditLogsTable, db } from "@workspace/db";
import { getAllSettings, setSetting } from "../lib/settings";
import { requireAdmin } from "../middlewares/auth";
import { resolveFileUrl, testSupabaseConnection, testCloudinaryConnection } from "../lib/storage";

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
  // Persistent file storage (Supabase Storage) — same "configurable from the
  // admin panel, no server env-var access needed" pattern as the AI keys
  // above. Without these set (here or as env vars), uploads fall back to
  // this server's local disk, which is wiped on redeploy/restart on most
  // hosts (Netlify included) — see lib/storage.ts. SUPABASE_SERVICE_ROLE_KEY
  // is masked on the way out the same way AI_API_KEY is.
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET", // optional — defaults to "medschool-uploads"
  // Cloudinary — used for large files (books/resources, or anything over
  // ~5MB regardless of folder). Same masked-secret pattern as
  // SUPABASE_SERVICE_ROLE_KEY for CLOUDINARY_API_SECRET.
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
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

// Secrets — never sent back down in full once saved. The admin UI shows a
// masked preview per key and only sends a new value in the PATCH body when
// the admin is actually changing it (see the blank-value skip in the PATCH
// handler below).
const SECRET_KEYS = ["AI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CLOUDINARY_API_SECRET"] as const;
function withSecretsMasked(view: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  const rest = { ...view };
  for (const key of SECRET_KEYS) {
    const raw = rest[key] ?? "";
    delete rest[key];
    masked[`${key}_SET`] = raw ? "true" : "false";
    masked[`${key}_MASKED`] = raw ? `${"•".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}` : "";
  }
  return { ...rest, ...masked };
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
  // Not an editable setting — tells the admin UI which storage backends are
  // actually configured and reachable for uploads, since there's no local-
  // disk fallback anymore (see storage.ts) — an upload throws outright if
  // neither is set. Checks the DB-backed settings first (the ones the admin
  // can set right here) before falling back to env vars.
  const supabaseConfigured = !!((view.SUPABASE_URL && view.SUPABASE_SERVICE_ROLE_KEY) || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));
  const cloudinaryConfigured = !!((view.CLOUDINARY_CLOUD_NAME && view.CLOUDINARY_API_KEY && view.CLOUDINARY_API_SECRET) || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));
  res.json({ ...withSecretsMasked(withResolvedMedia(view)), SUPABASE_CONFIGURED: String(supabaseConfigured), CLOUDINARY_CONFIGURED: String(cloudinaryConfigured) });
});

const SettingsBody = z.object(Object.fromEntries(EDITABLE_KEYS.map((key) => [key, z.string().max(4000).optional()])) as Record<(typeof EDITABLE_KEYS)[number], z.ZodOptional<z.ZodString>>);

router.patch("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    // Secret fields come back masked from GET — an empty string here means
    // "the admin didn't touch this field," not "clear the key."
    if ((SECRET_KEYS as readonly string[]).includes(key) && value === "") continue;
    await setSetting(key, value);
  }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "SETTINGS_UPDATED", entity: "platform_settings", metadata: JSON.stringify(Object.keys(parsed.data)) });
  const settings = await getAllSettings();
  res.json(withSecretsMasked(withResolvedMedia(Object.fromEntries(EDITABLE_KEYS.map((key) => [key, settings[key] ?? ""])))));
});

router.post("/admin/settings/rotate-admin-code", requireAdmin, async (req, res): Promise<void> => {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  await setSetting("ADMIN_SIGNUP_CODE", code);
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "ADMIN_CODE_ROTATED", entity: "platform_settings" });
  res.json({ ADMIN_SIGNUP_CODE: code });
});

// Real connectivity check, as opposed to the presence-only
// SUPABASE_CONFIGURED / CLOUDINARY_CONFIGURED flags on GET /admin/settings
// above (which only mean "the fields aren't blank," not "this actually
// works" — the source of the falsely-green "Configured" badge). Makes one
// cheap, read-only call to each provider using whatever is currently saved
// and reports the real reason if something's wrong (bad key, wrong bucket
// name, bucket not public, etc.) instead of a generic failure.
router.post("/admin/settings/test-storage", requireAdmin, async (_req, res): Promise<void> => {
  const [supabase, cloudinary] = await Promise.all([testSupabaseConnection(), testCloudinaryConnection()]);
  res.json({ supabase, cloudinary });
});

export default router;

import { Router, type IRouter } from "express";
import { z } from "zod";
import { auditLogsTable, db } from "@workspace/db";
import { getAllSettings, setSetting, THEME_KEYS, DEFAULT_THEME } from "../lib/settings";
import { requireAdmin } from "../middlewares/auth";
import { resolveFileUrl, testCloudinaryConnection, setCachedCloudinaryCloudName } from "../lib/storage";
import { sendTestEmail, BREVO_MAX_SLOTS } from "../lib/email";
import { TRIAL_FEATURE_OPTIONS } from "../lib/trial";
import { parseDeviceLimit, MAX_DEVICES_CEILING } from "../lib/deviceSessions";

const router: IRouter = Router();

// Keys that are safe to expose to any admin. Secrets (SMTP creds etc.) should
// live in real environment variables, never in this table.
const EDITABLE_KEYS = [
  "ADMIN_SIGNUP_CODE",
  // Default cap on simultaneously signed-in devices per student account
  // (whole number, 0 = unlimited; blank = 2). Per-student overrides live on
  // med_users.max_devices — see lib/deviceSessions.ts.
  "DEFAULT_MAX_DEVICES",
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
  // Same "on"/"off" pattern as REGISTRATION_ENABLED — off removes the "AI
  // Visualizer" link from the student sidebar (frontend-student's SideNav)
  // and the route itself refuses direct access; on brings both back.
  "AI_VISUALIZER_ENABLED",
  // Same on/off pattern as AI_VISUALIZER_ENABLED above, but for the "Ask AI
  // to explain differently" button itself — the one that shows up on MCQs
  // (Practice.tsx), flashcards (Flashcards.tsx), and anywhere else those
  // components are reused (e.g. past-paper practice, since past papers are
  // just MCQs practiced through the same Practice screen). Defaults to ON
  // (missing/unset means enabled); "false" hides the button everywhere it
  // appears and the backing routes (POST /mcqs/:id/ask-ai, POST
  // /flashcards/:id/ask-ai) refuse directly too — see explanations.ts.
  // Doesn't touch AI_AUTO_EXPLAIN_ON_IMPORT or any admin-side AI generation
  // (bulk explanations, AI-generated MCQs/flashcards) — this only gates the
  // student-facing on-demand button.
  "AI_EXPLAIN_ENABLED",
  // General Trial Mode — unlike REGISTRATION_ENABLED/AI_VISUALIZER_ENABLED
  // above (which default to ON, "false" is the opt-out), this defaults to
  // OFF: only the exact string "true" enables it (see
  // requireMembershipFor in middlewares/auth.ts, lib/trial.ts). While on,
  // signed-in students get access to the membership-gated features the
  // trial covers, regardless of their own membership/payment status — no individual
  // med_memberships rows are created or changed, so switching it back off
  // instantly restores normal per-student gating with nothing to clean up.
  // Distinct from the existing per-student POST /students/:id/trial grant,
  // which is unaffected either way. Also readable by students (mirrored
  // into site-content.ts) so the app can show a "trial mode is on" banner.
  "GLOBAL_TRIAL_MODE",
  // Scopes GLOBAL_TRIAL_MODE to a specific program (MBBS/BDS) and/or
  // academic year instead of opening the whole platform. Empty string
  // (the default) on either key means "no restriction on that axis" —
  // matching the same null-means-everyone convention modules/blocks/exams
  // already use for programTargetKind/yearTargetNumber (see
  // lib/contentVisibility.ts). A student with no program/year set on
  // their profile only matches when both are left unrestricted. Read
  // together with GLOBAL_TRIAL_MODE by lib/trial.ts
  // (middlewares/auth.ts) — leaving both blank preserves the previous
  // "every student" behavior exactly.
  "GLOBAL_TRIAL_PROGRAM", // "" | "MBBS" | "BDS"
  // Comma-separated academic years the trial covers ("1,2,3"; empty = every
  // year). Supersedes the old single-year GLOBAL_TRIAL_YEAR below, which is
  // kept only as a read-fallback in lib/trial.ts for sites that saved one.
  "GLOBAL_TRIAL_YEARS",
  "GLOBAL_TRIAL_YEAR", // legacy single year — no longer written by the admin UI
  // JSON array of the feature keys the trial unlocks (see
  // TRIAL_FEATURE_OPTIONS in lib/trial.ts). Blank = the default set.
  "GLOBAL_TRIAL_FEATURES",
  // Optional "YYYY-MM-DD" — the trial switches itself off after that day.
  "GLOBAL_TRIAL_ENDS_AT",
  // Daily cap on MCQs a trial-only student may submit (summed across
  // practice sessions, resets at UTC midnight). Applies to BOTH trial paths
  // equally — General Trial Mode above and an admin's per-student trial
  // grant (Students → grant trial) — never to a paying student. Whole
  // number; 0 = unlimited; blank defaults to 50. See lib/trial.ts
  // getTrialDailyMcqLimit / trialDailyMcqCapError, enforced in POST
  // /practice-sessions (routes/analytics.ts).
  "TRIAL_DAILY_MCQ_LIMIT",
  // Optional decorative photo for the student Dashboard's greeting card
  // (see frontend-student's Dashboard component) — falls back to a plain
  // decorative pattern when unset.
  "DASHBOARD_HERO_IMAGE_PATH",
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
  // SEO — browser tab title, Google's listing, and link-preview title/
  // description (og:*/twitter:*), plus the name used in the Organization/
  // WebSite structured data. Public (see SITE_CONTENT_KEYS in
  // site-content.ts) — read by useSeoSync in the student app, which patches
  // index.html's static defaults once the page loads. See that hook's
  // comment for the one thing this can't do: a non-JS-executing scraper
  // (some link-preview bots) still sees index.html's baked-in defaults,
  // since this only updates the live DOM after JS runs.
  "SEO_TITLE",
  "SEO_DESCRIPTION",
  // AI provider for "Ask AI to explain" (MCQs + flashcards) and admin
  // explanation generation. Falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY
  // / GEMINI_API_KEY env vars if none of these is set — see lib/aiExplain.ts.
  // The key itself is masked on the way out (see withAiKeyMasked below);
  // only the PATCH body carries the real value.
  "AI_PROVIDER", // "anthropic" | "openai" | "gemini" | "custom"
  "AI_API_KEY",
  "AI_MODEL", // optional override; each provider has a sensible default if left blank
  "AI_BASE_URL", // required only when AI_PROVIDER = "custom" — an OpenAI-compatible /chat/completions base URL
  // Up to five optional backup providers — same shape as
  // AI_PROVIDER/AI_API_KEY/AI_MODEL/AI_BASE_URL above (suffixed _2.._6),
  // tried in order automatically whenever an earlier provider's request
  // fails (outage, rate limit, bad/expired key, timeout), so one provider
  // "going off" doesn't take "Ask AI to explain" down with it — the request
  // just moves on to the next configured one. See resolveProviders() /
  // DB_SLOT_SUFFIXES in lib/aiExplain.ts. Leaving a slot blank just means
  // it isn't configured — earlier slots (and any env-var keys) still work
  // exactly as before.
  "AI_PROVIDER_2",
  "AI_API_KEY_2",
  "AI_MODEL_2",
  "AI_BASE_URL_2",
  "AI_PROVIDER_3",
  "AI_API_KEY_3",
  "AI_MODEL_3",
  "AI_BASE_URL_3",
  "AI_PROVIDER_4",
  "AI_API_KEY_4",
  "AI_MODEL_4",
  "AI_BASE_URL_4",
  "AI_PROVIDER_5",
  "AI_API_KEY_5",
  "AI_MODEL_5",
  "AI_BASE_URL_5",
  "AI_PROVIDER_6",
  "AI_API_KEY_6",
  "AI_MODEL_6",
  "AI_BASE_URL_6",
  // Round 3, item 4b: auto-generate explanations (+ hints) at MCQ-import
  // time instead of only on-demand via "Ask AI to explain". Boolean-ish
  // string, same "on"/"off"-by-presence pattern as REGISTRATION_ENABLED —
  // parsed with the same truthy check (see mcq-import.ts). Reuses
  // AI_PROVIDER/AI_API_KEY above; AI_AUTO_EXPLAIN_MODEL is an OPTIONAL
  // override so a cheaper/faster model can be used for bulk generation
  // without configuring a whole second provider/key.
  "AI_AUTO_EXPLAIN_ON_IMPORT",
  "AI_AUTO_EXPLAIN_MODEL",
  // Persistent file storage — Cloudinary is the only upload backend (see
  // lib/storage.ts; Supabase is used for this app's Postgres database only,
  // not for storage). Same "configurable from the admin panel, no server
  // env-var access needed" pattern as the AI keys above. CLOUDINARY_API_SECRET
  // is masked on the way out the same way AI_API_KEY is.
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  // Backup Cloudinary account — same numbered-slot convention the AI
  // provider backups above use ("_2" suffix). When the primary account's
  // upload fails for any reason (full on its plan quota, bad/expired key,
  // outage), uploadFile() in lib/storage.ts automatically retries on this
  // account instead. Entirely optional — leaving these blank behaves
  // exactly as before (primary-only, throws if it fails).
  "CLOUDINARY_CLOUD_NAME_2",
  "CLOUDINARY_API_KEY_2",
  "CLOUDINARY_API_SECRET_2",
  // Transactional email — same "configurable from the admin panel, no
  // server env-var access needed" pattern as AI/Cloudinary above. EMAIL_
  // PROVIDER picks which of the three sections below is actually used
  // (see resolveEmailConfig() in lib/email.ts); the other sections' fields
  // can stay filled in without being active, so switching providers back
  // and forth doesn't lose anything already typed in. Falls back to the
  // matching env vars (BREVO_API_KEY, SMTP_HOST, etc.) if EMAIL_PROVIDER
  // isn't set at all, so an existing env-var-only deployment is unaffected.
  "EMAIL_PROVIDER", // "brevo" | "smtp" | "custom" | ""
  "MAIL_FROM",
  "MAIL_FROM_NAME",
  "BREVO_API_KEY",
  // Extra Brevo accounts (slots 2-5) — each free Brevo plan has its own
  // daily quota, so more slots = more headroom, and a dead key just falls
  // through to the next one. Slot 1 is BREVO_API_KEY above and always uses
  // MAIL_FROM; slots 2-5 may each carry their own verified sender (Brevo only
  // sends from addresses verified on the sending account). See
  // BrevoSlot / sendViaBrevo in lib/email.ts.
  "BREVO_API_KEY_2",
  "BREVO_SENDER_EMAIL_2",
  "BREVO_API_KEY_3",
  "BREVO_SENDER_EMAIL_3",
  "BREVO_API_KEY_4",
  "BREVO_SENDER_EMAIL_4",
  "BREVO_API_KEY_5",
  "BREVO_SENDER_EMAIL_5",
  "BREVO_SLOT_STRATEGY", // "failover" (default) | "round_robin"
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "CUSTOM_EMAIL_API_URL",
  "CUSTOM_EMAIL_API_KEY",
  "CUSTOM_EMAIL_API_KEY_HEADER",
  "CUSTOM_EMAIL_API_KEY_PREFIX",
  // Design & Branding — see lib/settings.ts THEME_KEYS/DEFAULT_THEME. Also
  // mirrored into site-content.ts's SITE_CONTENT_KEYS since these need to be
  // public (signed-out pages like /login are themed too), unlike the rest
  // of this admin-only list.
  ...THEME_KEYS,
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
// THEME_* keys fall back to DEFAULT_THEME (not "") so a fresh install's
// admin panel already shows the reference palette instead of blank color
// pickers, and so PATCH-ing an unrelated setting doesn't blank them out.
function withThemeDefaults(view: Record<string, string>): Record<string, string> {
  const out = { ...view };
  for (const key of THEME_KEYS) if (!out[key]) out[key] = DEFAULT_THEME[key];
  return out;
}

function withResolvedMedia(view: Record<string, string>): Record<string, string> {
  return { ...view, SITE_FAVICON_URL: resolveFileUrl(view.SITE_FAVICON_PATH) ?? "", PAYMENT_QR_CODE_URL: resolveFileUrl(view.PAYMENT_QR_CODE_PATH) ?? "", DASHBOARD_HERO_IMAGE_URL: resolveFileUrl(view.DASHBOARD_HERO_IMAGE_PATH) ?? "" };
}

// Not editable settings — read-only extras the admin page needs alongside
// the saved values. TRIAL_FEATURE_OPTIONS is the single source of truth for
// which features a General Trial can unlock (lib/trial.ts), sent down as JSON
// so the settings page renders exactly the toggles the server enforces
// instead of keeping its own copy of the list.
function withAdminExtras(view: Record<string, string>): Record<string, string> {
  return { ...view, TRIAL_FEATURE_OPTIONS: JSON.stringify(TRIAL_FEATURE_OPTIONS), BREVO_MAX_SLOTS: String(BREVO_MAX_SLOTS) };
}

// Secrets — never sent back down in full once saved. The admin UI shows a
// masked preview per key and only sends a new value in the PATCH body when
// the admin is actually changing it (see the blank-value skip in the PATCH
// handler below).
// Sent in place of a secret's value to clear it. Must match CLEAR_SECRET in
// frontend-admin/src/pages/AdminSettings.tsx.
const CLEAR_SECRET = "__CLEAR__";
const SECRET_KEYS = ["BREVO_API_KEY_2", "BREVO_API_KEY_3", "BREVO_API_KEY_4", "BREVO_API_KEY_5", "AI_API_KEY", "AI_API_KEY_2", "AI_API_KEY_3", "AI_API_KEY_4", "AI_API_KEY_5", "AI_API_KEY_6", "CLOUDINARY_API_SECRET", "CLOUDINARY_API_SECRET_2", "BREVO_API_KEY", "SMTP_PASS", "CUSTOM_EMAIL_API_KEY"] as const;
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

// One-time backfill for methods saved before accountNumber/accountName lived
// on the method object itself: older admin UI wrote wallet numbers/account
// names to dynamically-named keys (PAYMENT_RAAST_NUMBER, PAYMENT_JAZZCASH_
// ACCOUNT_NAME, etc.) that PUBLIC_PAYMENT_KEYS never exposed to students.
// Read those legacy keys once per request (cheap — `settings` is already in
// memory) and copy them onto the matching method, without overwriting a
// value already saved the new way.
function backfillMethodAccounts(methods: unknown[], settings: Record<string, string>): unknown[] {
  return methods.map((raw) => {
    if (typeof raw !== "object" || raw === null || !("key" in raw)) return raw;
    const m = raw as { key: string; accountNumber?: string; accountName?: string };
    const legacyNumber = settings[`PAYMENT_${String(m.key).toUpperCase()}_NUMBER`];
    const legacyName = settings[`PAYMENT_${String(m.key).toUpperCase()}_ACCOUNT_NAME`];
    return {
      ...m,
      accountNumber: m.accountNumber || legacyNumber || "",
      accountName: m.accountName || legacyName || "",
    };
  });
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
  res.json({ ...withResolvedMedia(view), bankAccounts, methods: backfillMethodAccounts(methods, settings) });
});

router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getAllSettings();
  const view = Object.fromEntries(EDITABLE_KEYS.map((key) => [key, settings[key] ?? ""]));
  // Not an editable setting — tells the admin UI whether Cloudinary (the
  // only upload backend, see storage.ts) is actually configured, since
  // there's no local-disk fallback — an upload throws outright if it isn't
  // set. Checks the DB-backed settings first (the ones the admin can set
  // right here) before falling back to env vars.
  const cloudinaryConfigured = !!((view.CLOUDINARY_CLOUD_NAME && view.CLOUDINARY_API_KEY && view.CLOUDINARY_API_SECRET) || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));
  // Same presence-only check for the backup Cloudinary slot — DB-only, no
  // env-var fallback (see resolveCloudinaryConfig in lib/storage.ts).
  const cloudinaryBackupConfigured = !!(view.CLOUDINARY_CLOUD_NAME_2 && view.CLOUDINARY_API_KEY_2 && view.CLOUDINARY_API_SECRET_2);
  // Same presence-only flag for email — "a provider looks configured,"
  // not "sending actually works" (use POST /admin/settings/test-email for
  // that, same distinction as CLOUDINARY_CONFIGURED above).
  const emailConfigured = !!(
    (view.EMAIL_PROVIDER === "brevo" && (view.BREVO_API_KEY || view.BREVO_API_KEY_2 || view.BREVO_API_KEY_3 || view.BREVO_API_KEY_4 || view.BREVO_API_KEY_5)) ||
    (view.EMAIL_PROVIDER === "smtp" && view.SMTP_HOST && view.SMTP_PORT && view.SMTP_USER && view.SMTP_PASS) ||
    (view.EMAIL_PROVIDER === "custom" && view.CUSTOM_EMAIL_API_URL) ||
    process.env.BREVO_API_KEY || process.env.CUSTOM_EMAIL_API_URL ||
    (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
  res.json({ ...withAdminExtras(withSecretsMasked(withResolvedMedia(withThemeDefaults(view)))), CLOUDINARY_CONFIGURED: String(cloudinaryConfigured), CLOUDINARY_BACKUP_CONFIGURED: String(cloudinaryBackupConfigured), EMAIL_CONFIGURED: String(emailConfigured) });
});

const SettingsBody = z.object(Object.fromEntries(EDITABLE_KEYS.map((key) => [key, z.string().max(4000).optional()])) as Record<(typeof EDITABLE_KEYS)[number], z.ZodOptional<z.ZodString>>);

router.patch("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const deviceLimit = parsed.data.DEFAULT_MAX_DEVICES;
  if (deviceLimit !== undefined && deviceLimit.trim() !== "" && parseDeviceLimit(deviceLimit) === null) {
    res.status(400).json({ error: `Default device limit must be a whole number from 0 (unlimited) to ${MAX_DEVICES_CEILING}.` });
    return;
  }
  const trialMcqLimit = parsed.data.TRIAL_DAILY_MCQ_LIMIT;
  if (trialMcqLimit !== undefined && trialMcqLimit.trim() !== "" && !(Number.isInteger(Number(trialMcqLimit)) && Number(trialMcqLimit) >= 0)) {
    res.status(400).json({ error: "Trial daily MCQ limit must be a whole number, 0 or more (0 = unlimited)." });
    return;
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    // Secret fields come back masked from GET — an empty string here means
    // "the admin didn't touch this field," not "clear the key."
    if ((SECRET_KEYS as readonly string[]).includes(key)) {
      if (value === "") continue;
      // Explicit "delete this saved secret" (e.g. removing a backup Brevo
      // account) — blank can't mean that, it already means "unchanged".
      if (value === CLEAR_SECRET) { await setSetting(key, ""); continue; }
    }
    await setSetting(key, value);
    // Root-cause fix (round 3, items 2/6/8): push a new cloud name into
    // storage.ts's synchronous resolveFileUrl() cache immediately, instead
    // of waiting for its 15s lazy-refresh window. Without this, an admin
    // saving Cloudinary settings and then immediately testing an upload
    // could still see "isn't loading back" for up to 15 seconds.
    if (key === "CLOUDINARY_CLOUD_NAME" && value) setCachedCloudinaryCloudName(value);
    if (key === "CLOUDINARY_CLOUD_NAME_2" && value) setCachedCloudinaryCloudName(value, "_2");
  }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "SETTINGS_UPDATED", entity: "platform_settings", metadata: JSON.stringify(Object.keys(parsed.data)) });
  const settings = await getAllSettings();
  res.json(withAdminExtras(withSecretsMasked(withResolvedMedia(withThemeDefaults(Object.fromEntries(EDITABLE_KEYS.map((key) => [key, settings[key] ?? ""])))))));
});

router.post("/admin/settings/rotate-admin-code", requireAdmin, async (req, res): Promise<void> => {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  await setSetting("ADMIN_SIGNUP_CODE", code);
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "ADMIN_CODE_ROTATED", entity: "platform_settings" });
  res.json({ ADMIN_SIGNUP_CODE: code });
});

// Real connectivity check, as opposed to the presence-only
// CLOUDINARY_CONFIGURED flag on GET /admin/settings above (which only means
// "the fields aren't blank," not "this actually works" — the source of the
// falsely-green "Configured" badge). Makes one cheap, read-only call using
// whatever is currently saved and reports the real reason if something's
// wrong (bad key, wrong cloud name, etc.) instead of a generic failure.
router.post("/admin/settings/test-storage", requireAdmin, async (_req, res): Promise<void> => {
  const cloudinary = await testCloudinaryConnection();
  // Backup slot is optional — only actually pinged if something's saved
  // there, otherwise this just returns the same "Not configured" shape the
  // primary slot returns when it's empty, rather than skipping the field
  // entirely (keeps the response shape constant either way).
  const cloudinaryBackup = await testCloudinaryConnection("_2");
  res.json({ cloudinary, cloudinaryBackup });
});

// Real connectivity check for email, same reasoning as test-storage above —
// EMAIL_CONFIGURED only means "the fields aren't blank." Sends an actual
// test email using whatever's currently saved (DB settings, or env vars if
// none are saved) to an address the admin provides — usually their own —
// and reports the real provider error if something's wrong (bad API key,
// wrong SMTP creds, unreachable custom endpoint) instead of a generic
// failure.
router.post("/admin/settings/test-email", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({ to: z.string().email(), slot: z.number().int().min(1).max(BREVO_MAX_SLOTS).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid email address is required" }); return; }
  try {
    // `slot` (Brevo only) tests one specific account with no failover; leave
    // it out to test the whole setup exactly as real emails are sent.
    await sendTestEmail(parsed.data.to, parsed.data.slot);
    res.json({ ok: true });
  } catch (err) {
    // 200, not an error status — same reasoning as POST /test-storage:
    // the request itself succeeded, it's the *provider* that failed, and
    // the frontend needs the { ok: false, error } body either way to show
    // what went wrong, not a thrown ApiRequestError.
    res.json({ ok: false, error: err instanceof Error ? err.message : "Could not send test email" });
  }
});

export default router;

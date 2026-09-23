import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { db, membershipsTable, practiceAttemptsTable, usersTable } from "@workspace/db";
import { getSetting } from "./settings";
import { getStudentTargeting } from "./contentVisibility";
import { revokeAllForUser } from "./deviceSessions";

/**
 * General Trial Mode — one place that owns how the platform-wide trial is
 * configured, so the access gate (middlewares/auth.ts), the books listing,
 * the public /site-content bundle and the admin settings page can never
 * drift apart on what "trial mode is on" means.
 *
 * Settings keys (all in platform_settings, all plain strings):
 *   GLOBAL_TRIAL_MODE      "true" turns the trial on — anything else is off.
 *   GLOBAL_TRIAL_PROGRAM   "" (every program) | "MBBS" | "BDS".
 *   GLOBAL_TRIAL_YEARS     Comma-separated academic years, e.g. "1,2,3".
 *                          Empty = every year. Replaces the old
 *                          single-year GLOBAL_TRIAL_YEAR, which is still read
 *                          as a fallback so a site that saved a single year
 *                          before this existed keeps working unchanged.
 *   GLOBAL_TRIAL_FEATURES  JSON array of feature keys (see below) the trial
 *                          unlocks. Not saved yet (blank) = the default set
 *                          (everything membership-gated, but NOT paid books).
 *                          "[]" = a trial that unlocks nothing.
 *   GLOBAL_TRIAL_ENDS_AT   Optional "YYYY-MM-DD". The trial switches itself
 *                          off after the end of that day (UTC).
 *
 * Nothing here ever writes to memberships — turning the trial off (or
 * letting it expire) instantly restores normal per-student gating.
 */

export const TRIAL_FEATURE_OPTIONS = [
  { key: "mcqs", label: "MCQ bank & practice", description: "The question bank and practice sessions (Blocks → Modules → Subjects → Topics).", defaultOn: true },
  { key: "past_papers", label: "Past papers", description: "Opening and practising past papers.", defaultOn: true },
  { key: "exams", label: "Pre-Proffs exams", description: "Listing and sitting Pre-Proffs exams.", defaultOn: true },
  { key: "flashcards", label: "Flashcards", description: "Flashcard decks and review.", defaultOn: true },
  { key: "resources", label: "Resources", description: "Study resources and files.", defaultOn: true },
  { key: "ai_explain", label: "Ask AI to explain", description: "The on-demand \"Ask AI to explain differently\" button on MCQs and flashcards.", defaultOn: true },
  { key: "ai_visualizer", label: "AI Visualizer", description: "AI-generated diagrams and step-by-step visual explanations.", defaultOn: true },
  { key: "challenges", label: "Challenge a friend", description: "Head-to-head quiz challenges.", defaultOn: true },
  // Off by default: books are sold one by one (see routes/books.ts) and were
  // never part of the old all-or-nothing trial. Turning this on opens EVERY
  // paid book to trial students, so it has to be a deliberate choice.
  { key: "books", label: "Paid books", description: "Unlocks every paid book for trial students. Leave off to keep books purchase-only.", defaultOn: false },
] as const;

export type TrialFeature = (typeof TRIAL_FEATURE_OPTIONS)[number]["key"];

const ALL_FEATURE_KEYS: readonly string[] = TRIAL_FEATURE_OPTIONS.map((o) => o.key);
const DEFAULT_FEATURES: TrialFeature[] = TRIAL_FEATURE_OPTIONS.filter((o) => o.defaultOn).map((o) => o.key);

export interface TrialConfig {
  /** Trial switch is on AND the end date (if any) hasn't passed. */
  active: boolean;
  /** "" = every program. */
  program: string;
  /** [] = every year. */
  years: number[];
  features: TrialFeature[];
  /** ISO timestamp the trial ends at, or null for open-ended. */
  endsAt: string | null;
}

const OFF: TrialConfig = { active: false, program: "", years: [], features: DEFAULT_FEATURES, endsAt: null };

export function parseTrialYears(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const years = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  return Array.from(new Set(years)).sort((a, b) => a - b);
}

export function parseTrialFeatures(raw: string | null | undefined): TrialFeature[] {
  if (!raw || !raw.trim()) return DEFAULT_FEATURES;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_FEATURES;
    return Array.from(new Set(parsed.filter((k): k is TrialFeature => typeof k === "string" && ALL_FEATURE_KEYS.includes(k))));
  } catch {
    return DEFAULT_FEATURES;
  }
}

function parseEndsAt(raw: string | null | undefined): number | null {
  const value = raw?.trim();
  if (!value) return null;
  // A bare date means "through the end of that day", not "until midnight
  // at the start of it" — otherwise a trial set to end on the 31st would
  // stop working on the morning of the 31st.
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T23:59:59.999Z`) : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Reads the trial configuration. Fails closed — any settings lookup error
 * reads as "trial off", never as "trial on". */
export async function getTrialConfig(): Promise<TrialConfig> {
  try {
    if ((await getSetting("GLOBAL_TRIAL_MODE", "false")) !== "true") return OFF;
    const [program, yearsRaw, legacyYear, featuresRaw, endsAtRaw] = await Promise.all([
      getSetting("GLOBAL_TRIAL_PROGRAM", ""),
      getSetting("GLOBAL_TRIAL_YEARS", ""),
      getSetting("GLOBAL_TRIAL_YEAR", ""),
      getSetting("GLOBAL_TRIAL_FEATURES", ""),
      getSetting("GLOBAL_TRIAL_ENDS_AT", ""),
    ]);
    const endsAtMs = parseEndsAt(endsAtRaw);
    if (endsAtMs !== null && Date.now() > endsAtMs) return OFF;
    const years = parseTrialYears(yearsRaw);
    return {
      active: true,
      program: (program ?? "").trim().toUpperCase(),
      years: years.length ? years : parseTrialYears(legacyYear),
      features: parseTrialFeatures(featuresRaw),
      endsAt: endsAtMs !== null ? new Date(endsAtMs).toISOString() : null,
    };
  } catch {
    return OFF;
  }
}

/** Does this trial cover the given feature? Several features means "any of
 * them" (a route shared by two features, e.g. practice sessions, which both
 * the MCQ bank and past papers save through). No feature at all means the
 * route isn't tied to one, so only a trial that covers every default
 * feature — a full-access trial — opens it. */
export function trialCoversFeature(config: TrialConfig, feature?: TrialFeature | readonly TrialFeature[]): boolean {
  if (!config.active) return false;
  if (feature === undefined) return DEFAULT_FEATURES.every((f) => config.features.includes(f));
  const wanted = Array.isArray(feature) ? (feature as readonly TrialFeature[]) : [feature as TrialFeature];
  return wanted.some((f) => config.features.includes(f));
}

/** True when the trial (if scoped) includes this student. A student with no
 * program/year on their profile only matches an unrestricted trial. */
export async function studentInTrialScope(config: TrialConfig, userId: number): Promise<boolean> {
  if (!config.program && !config.years.length) return true;
  try {
    const targeting = await getStudentTargeting(userId);
    const programOk = !config.program || targeting.programKind === config.program;
    const yearOk = !config.years.length || (targeting.yearNumber !== null && config.years.includes(targeting.yearNumber));
    return programOk && yearOk;
  } catch {
    return false; // a lookup error must not silently grant access
  }
}

/** The one call the access gate and the books listing both make. */
export async function trialGrantsAccess(userId: number, feature?: TrialFeature | readonly TrialFeature[]): Promise<boolean> {
  const config = await getTrialConfig();
  if (!trialCoversFeature(config, feature)) return false;
  return studentInTrialScope(config, userId);
}

/** Shape exposed on the public /site-content bundle so the student app can
 * word its banner and mark locked features without re-deriving defaults. */
export function publicTrialView(config: TrialConfig) {
  return { active: config.active, program: config.program, years: config.years, features: config.features, endsAt: config.endsAt };
}

// ---------------------------------------------------------------------------
// Daily MCQ cap for trial-only students (TRIAL_DAILY_MCQ_LIMIT)
// ---------------------------------------------------------------------------

/** True when this student's access to `feature` right now comes ONLY from a
 * trial — a real paid (non-trial) ACTIVE membership means "no cap" here,
 * regardless of whether a trial would also cover them. A student with no
 * membership at all who's covered by General Trial Mode counts as
 * trial-only too, same as one with an admin-granted per-student trial. */
export async function studentIsTrialOnly(userId: number, feature: TrialFeature | readonly TrialFeature[]): Promise<boolean> {
  const [paidActive] = await db
    .select({ id: membershipsTable.id })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.status, "ACTIVE"), eq(membershipsTable.isTrial, false), gt(membershipsTable.expiresAt, new Date())))
    .limit(1);
  if (paidActive) return false;
  return trialGrantsAccess(userId, feature);
}

/** How many MCQs (summed across practice sessions, not per-session) a
 * trial-only student may submit in one UTC calendar day. Setting key
 * TRIAL_DAILY_MCQ_LIMIT — a whole number, 0 = unlimited; blank/unset
 * defaults to 50. Applies to BOTH trial paths (an admin's per-student trial
 * grant — POST /students/:id/trial — and General Trial Mode above) equally;
 * whichever got the student trial access counts the same toward this cap.
 * Paying students are never capped — see studentIsTrialOnly. */
export async function getTrialDailyMcqLimit(): Promise<number> {
  const raw = await getSetting("TRIAL_DAILY_MCQ_LIMIT", "50");
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 50;
}

export interface TrialMcqStatus {
  /** False for a paying student or an unlimited (0) cap — nothing to show. */
  limited: boolean;
  /** The configured cap. 0 means unlimited. */
  limit: number;
  /** MCQs already submitted today (UTC), summed across sessions. */
  used: number;
  /** limit - used, floored at 0. Infinity when `limited` is false. */
  remaining: number;
}

/** One place that answers "how is this student doing against today's trial
 * MCQ cap" — shared by trialDailyMcqCapError (submit-time enforcement,
 * below) and GET /student/trial-mcq-usage (the Practice page's "X of Y MCQs
 * used today" bar), so the two can never disagree on what "used today"
 * means. */
export async function getTrialDailyMcqStatus(userId: number): Promise<TrialMcqStatus> {
  const limit = await getTrialDailyMcqLimit();
  if (limit === 0 || !(await studentIsTrialOnly(userId, ["mcqs", "past_papers"]))) {
    return { limited: false, limit, used: 0, remaining: Infinity };
  }
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${practiceAttemptsTable.totalQuestions}), 0)` })
    .from(practiceAttemptsTable)
    .where(and(eq(practiceAttemptsTable.userId, userId), gte(practiceAttemptsTable.createdAt, startOfDay)));
  const used = Number(row?.used ?? 0);
  return { limited: true, limit, used, remaining: Math.max(0, limit - used) };
}

/** Returns a user-facing error message if submitting `count` more MCQs
 * today would put a trial-only student over TRIAL_DAILY_MCQ_LIMIT, or null
 * if the submission is fine — not a trial-only student, the cap is
 * unlimited (0), or they still have room today. The one call POST
 * /practice-sessions makes before recording a session. */
export async function trialDailyMcqCapError(userId: number, count: number): Promise<string | null> {
  const status = await getTrialDailyMcqStatus(userId);
  if (!status.limited) return null;
  if (count <= status.remaining) return null;
  return status.remaining <= 0
    ? `Trial accounts are limited to ${status.limit} MCQs a day. You've used all ${status.limit} for today — come back tomorrow, or ask about upgrading for unlimited access.`
    : `Trial accounts are limited to ${status.limit} MCQs a day. You have ${status.remaining} left today — try a smaller set, or ask about upgrading for unlimited access.`;
}

// ---------------------------------------------------------------------------
// Strict trial-expiry enforcement (per-student trial, POST /students/:id/trial)
// ---------------------------------------------------------------------------

/** Nothing flips a per-student trial's membership row or the account's
 * `status` back automatically once its `expiresAt` passes — the same lazy
 * pattern GET /admin/dashboard already relies on for accurate counts (see
 * that route's comment). This is the one place that acts on it, called from
 * hasActiveMembership (middlewares/auth.ts) on every membership-gated
 * request. Once an admin-granted trial has expired, the account is banned
 * outright — status SUSPENDED, every signed-in session revoked — rather
 * than just quietly losing feature access, so an expired trial can never
 * keep browsing on whatever's left of a still-valid JWT. Mirrors DELETE
 * /students/:id/trial's manual "end trial early" path exactly, just
 * triggered by the clock instead of an admin click.
 *
 * Returns true if this call just banned the account (so the caller should
 * treat the current request as denied immediately). */
export async function banIfTrialExpired(userId: number): Promise<boolean> {
  const [trial] = await db
    .select()
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.status, "ACTIVE"), eq(membershipsTable.isTrial, true)))
    .orderBy(desc(membershipsTable.expiresAt))
    .limit(1);
  if (!trial || trial.expiresAt.getTime() > Date.now()) return false;

  await db.update(membershipsTable).set({ status: "SUSPENDED", suspendedReason: "Trial period ended" }).where(eq(membershipsTable.id, trial.id));
  await db.update(usersTable).set({ status: "SUSPENDED", statusMessage: "Your trial period ended. Contact support or ask about a membership to regain access." }).where(eq(usersTable.id, userId));
  await revokeAllForUser(userId).catch(() => {});
  return true;
}

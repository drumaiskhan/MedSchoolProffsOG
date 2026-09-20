import { getSetting } from "./settings";
import { getStudentTargeting } from "./contentVisibility";

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

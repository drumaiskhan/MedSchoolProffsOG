// Pure helpers for the dashboard (no React, no fetching) so the wording and
// bucketing rules can be unit-tested and nothing in the JSX is a magic value.
import type { ProgressDay, ProgressTrend } from '@/lib/api';

/** How many rows/cards each dashboard list shows. */
export const DASH_LIMITS = { notifications: 5, upNext: 3, streakDays: 7 } as const;

/** Analytics ranges offered on the dashboard (must match RANGE_DAYS in api-server routes/analytics.ts). */
export const ANALYTICS_RANGES = ['7d', '30d', '3m', '1y'] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
/** The hero card is not tied to the range switcher; it always reads the widest window the API offers. */
export const HERO_RANGE: AnalyticsRange = '1y';

// Night is its own bucket (it picks the moon glyph) even though it shares
// "Good evening" as a greeting — nobody wants an app wishing them "good night"
// while they're still up studying at 1 a.m. The sun sets around 18:00 for most
// of our students, so the sunset glyph only covers 17:00-18:00; from 18:00 on
// (dark outside) the greeting shows a moon, not a sun.
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export const dayPartForHour = (hour: number): DayPart => (hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 18 ? 'evening' : 'night');
export const DAY_PART_LABEL: Record<DayPart, string> = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good evening' };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", then a short date. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Whole days from `now` until `iso` (never negative); null when there is no date. */
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / DAY)) : null;
}

/** Local calendar-day key (YYYY-MM-DD) for a Date, using the browser's own time zone. */
export const localDayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parses a YYYY-MM-DD key as a LOCAL date (new Date('2026-09-21') would be UTC and can land on the wrong day). */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * The last `days` calendar days, oldest -> today. Uses the API's `daily` when it
 * is there; an older API build only sends per-session `history`, so bucket that
 * by local day instead (sessions + average score, question counts unknown -> 0).
 */
export function weekDays(trend: Pick<ProgressTrend, 'daily' | 'history'> | null | undefined, days = 7, now = new Date()): ProgressDay[] {
  if (trend?.daily?.length) return trend.daily.slice(-days);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  const acc = new Map(keys.map((k) => [k, { sessions: 0, sum: 0 }]));
  for (const h of trend?.history ?? []) {
    const bucket = acc.get(localDayKey(new Date(h.date)));
    if (bucket) { bucket.sessions += 1; bucket.sum += h.scorePercent; }
  }
  return keys.map((date) => {
    const b = acc.get(date)!;
    return { date, sessions: b.sessions, questions: 0, scorePercent: b.sessions ? Math.round((b.sum / b.sessions) * 10) / 10 : null };
  });
}

/** Weekday for a bar/coin label ("Mon"), plus the day of the month ("21"). */
export function dayLabel(key: string): { weekday: string; dayOfMonth: string; long: string } {
  const d = parseDayKey(key);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    dayOfMonth: String(d.getDate()),
    long: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
  };
}

export interface HeroSignals {
  hasActivity: boolean;
  streak: number;
  practicedToday: boolean;
  atRisk: boolean;
  questionsToday: number;
  sessionsThisWeek: number;
}

/** The one-line nudge under the greeting — chosen from the student's real numbers, not a fixed slogan. */
export function heroMessage(s: HeroSignals): string {
  if (!s.hasActivity) return 'Answer your first set of questions and your progress starts building right here.';
  if (s.practicedToday) return s.questionsToday > 0 ? `${s.questionsToday} question${s.questionsToday === 1 ? '' : 's'} done today — that's a day well spent.` : 'You practised today — that keeps your streak going.';
  if (s.atRisk) return `Practise today to keep your ${s.streak}-day streak alive — one short session does it.`;
  if (s.sessionsThisWeek > 0) return 'One session today starts a fresh streak.';
  return 'A short session today gets you back on track.';
}

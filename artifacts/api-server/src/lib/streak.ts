// Streak helpers shared by the analytics, progress, dashboard and leaderboard
// routes.
//
// Background: `users.current_streak` is only ever rewritten when a student
// finishes a practice session (bumpStreak in routes/analytics.ts). A student
// who stops practising therefore kept showing their old streak forever —
// "12 day streak" three weeks after their last session — on the dashboard and
// (now) the leaderboard. The stored number is still the source of truth for
// "how long was the run", but whether that run is still ALIVE depends on the
// last practice date, so every read goes through liveStreak().
//
// Days are UTC calendar days, exactly like bumpStreak, so the two always agree.

export function utcDay(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export interface StreakSource {
  currentStreak: number | null;
  longestStreak: number | null;
  lastPracticeDate: string | null;
}

export interface LiveStreak {
  /** Streak as it stands right now — 0 once a full day has been missed. */
  current: number;
  /** Best run ever (never lower than the live current run). */
  longest: number;
  /** The student has already practised today (UTC). */
  practicedToday: boolean;
  /** Practised yesterday but not yet today — the run breaks at midnight UTC. */
  atRisk: boolean;
}

export function liveStreak(user: StreakSource | null | undefined): LiveStreak {
  const stored = user?.currentStreak ?? 0;
  const last = user?.lastPracticeDate ?? null;
  const practicedToday = last === utcDay(0);
  const alive = practicedToday || last === utcDay(-1);
  const current = alive ? stored : 0;
  return {
    current,
    longest: Math.max(user?.longestStreak ?? 0, current),
    practicedToday,
    atRisk: !practicedToday && alive && current > 0,
  };
}

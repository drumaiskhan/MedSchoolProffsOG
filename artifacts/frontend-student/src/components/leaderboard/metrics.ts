// Pure ranking logic for the leaderboard — no React, no fetching — so the
// ordering rules live in one place and can be reasoned about (and unit
// tested) on their own.
import type { LeaderboardRow } from '@/lib/api';

export type MetricKey = 'points' | 'accuracy' | 'streak' | 'questions';

/** Accuracy is only ranked once a student has answered this many questions in
 * the selected period — otherwise one lucky 1/1 would beat everybody. */
export const MIN_QUESTIONS_FOR_ACCURACY = 10;

export interface Metric {
  key: MetricKey;
  label: string;
  /** Unit shown under the big number. */
  unit: string;
  /** One-line explanation shown under the tabs. */
  note: string;
  value: (row: LeaderboardRow) => number;
  format: (value: number) => string;
  /** Rows that don't qualify are listed after the ranked ones, without a place. */
  qualifies: (row: LeaderboardRow) => boolean;
}

const int = (v: number) => Math.round(v).toLocaleString();

export const METRICS: Record<MetricKey, Metric> = {
  points: {
    key: 'points', label: 'Points', unit: 'pts',
    note: '10 points per correct answer, −3 per wrong one — accuracy beats volume.',
    value: (r) => r.points, format: int, qualifies: () => true,
  },
  accuracy: {
    key: 'accuracy', label: 'Accuracy', unit: 'correct',
    note: `Ranked among students who answered ${MIN_QUESTIONS_FOR_ACCURACY}+ questions in this period.`,
    value: (r) => r.accuracy, format: (v) => `${(Math.round(v * 10) / 10).toString()}%`, qualifies: (r) => r.questionsAnswered >= MIN_QUESTIONS_FOR_ACCURACY,
  },
  streak: {
    key: 'streak', label: 'Streak', unit: 'day streak',
    note: 'Live streaks — miss a whole day and it resets to zero.',
    value: (r) => r.currentStreak ?? 0, format: int, qualifies: (r) => (r.currentStreak ?? 0) > 0,
  },
  questions: {
    key: 'questions', label: 'Questions', unit: 'answered',
    note: 'Total questions answered in this period.',
    value: (r) => r.questionsAnswered, format: int, qualifies: () => true,
  },
};

export const METRIC_ORDER: MetricKey[] = ['points', 'accuracy', 'streak', 'questions'];

export interface RankedRow extends LeaderboardRow {
  /** 1-based place under the selected metric, or null when the row doesn't qualify for it. */
  position: number | null;
}

// Same tie-break chain the API uses for points (points → accuracy → volume → id)
// so switching tabs never reshuffles equal students at random.
const tieBreak = (a: LeaderboardRow, b: LeaderboardRow) => b.points - a.points || b.accuracy - a.accuracy || b.questionsAnswered - a.questionsAnswered || a.userId - b.userId;

export function rankRows(rows: LeaderboardRow[], key: MetricKey): RankedRow[] {
  const metric = METRICS[key];
  const ranked = rows
    .filter(metric.qualifies)
    .sort((a, b) => metric.value(b) - metric.value(a) || (key === 'streak' ? (b.longestStreak ?? 0) - (a.longestStreak ?? 0) : 0) || tieBreak(a, b));
  const unranked = rows.filter((r) => !metric.qualifies(r)).sort(tieBreak);
  return [
    ...ranked.map((r, i): RankedRow => ({ ...r, position: i + 1 })),
    ...unranked.map((r): RankedRow => ({ ...r, position: null })),
  ];
}

/** Share of ranked students the given place is ahead of (0–100), or null with fewer than two ranked. */
export function beatPercent(position: number, rankedCount: number): number | null {
  if (rankedCount < 2) return null;
  return Math.round(((rankedCount - position) / (rankedCount - 1)) * 100);
}

/** Who is directly above (or, if leading, directly below) `you` and by how much. */
export function neighbour(you: RankedRow, rows: RankedRow[], metric: Metric): { row: RankedRow; diff: number; direction: 'above' | 'below' } | null {
  if (you.position == null) return null;
  const target = you.position > 1 ? you.position - 1 : 2;
  const other = rows.find((r) => r.position === target);
  if (!other) return null;
  return { row: other, diff: Math.abs(metric.value(other) - metric.value(you)), direction: you.position > 1 ? 'above' : 'below' };
}

export function placeTone(position: number | null, isYou: boolean): 'gold' | 'silver' | 'bronze' | 'you' | 'plain' {
  if (position === 1) return 'gold';
  if (position === 2) return 'silver';
  if (position === 3) return 'bronze';
  return isYou ? 'you' : 'plain';
}

// One row of the ranked list: raised card, place medal, avatar, name and
// college, a progress bar (relative to the best value on screen), the headline
// number for the active metric and a streak badge.
import { Flame } from 'lucide-react';
import { initials } from '@/lib/shared';
import { Avatar3D, Medal } from '@/lib/fx3d';
import { placeTone, type Metric, type RankedRow } from './metrics';

export function StreakBadge({ days, className = '' }: { days: number | undefined; className?: string }) {
  const n = days ?? 0;
  if (n <= 0) return null;
  return <span className={`inline-flex items-center gap-1 rounded-full bg-[#fff0cb] px-2 py-0.5 text-[10px] font-extrabold text-[#94651c] ring-1 ring-inset ring-[#e0a72f]/30 dark:bg-[#f5a623]/20 dark:text-[#ffd98a] ${className}`} title={`${n}-day streak`} data-testid="badge-streak"><Flame size={10} fill="currentColor" />{n}</span>;
}

export function RankRowCard({ row, metric, max, index }: { row: RankedRow; metric: Metric; max: number; index: number }) {
  const value = metric.value(row);
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  const ranked = row.position != null;
  return <div id={row.isYou ? 'lb-you-row' : undefined} className={`lb-rise d3-card flex items-center gap-3 p-3 sm:gap-4 sm:p-4 ${row.isYou ? 'ring-2 ring-primary/50' : ''} ${ranked ? '' : 'opacity-75'}`} style={{ ['--i' as string]: index }} data-testid={`row-leaderboard-${row.userId}`}>
    <Medal tone={placeTone(row.position, row.isYou)} size={34}>{row.position ?? '–'}</Medal>
    <Avatar3D text={initials(row.name)} size={42} className="shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5"><span className="truncate text-sm font-extrabold">{row.name}</span>{row.isYou && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-primary">you</span>}</div>
      {row.institution && <div className="truncate text-[11px] text-muted-foreground">{row.institution}</div>}
      <div className="d3-well mt-2 h-1.5 overflow-hidden rounded-full"><div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-700" style={{ width: `${ranked ? pct : 0}%` }} /></div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] font-semibold text-muted-foreground"><span>{row.accuracy}% accuracy</span><span>{row.questionsAnswered.toLocaleString()} questions</span><span>{row.sessions} sessions</span></div>
    </div>
    <div className="shrink-0 text-right">
      <div className="text-lg font-extrabold leading-5 tabular-nums" data-testid={`value-leaderboard-${row.userId}`}>{ranked || metric.key === 'points' || metric.key === 'questions' ? metric.format(value) : '—'}</div>
      <div className="text-[9px] font-bold uppercase tracking-[.1em] text-muted-foreground">{metric.unit}</div>
      {metric.key !== 'streak' && <StreakBadge days={row.currentStreak} className="mt-1.5" />}
    </div>
  </div>;
}

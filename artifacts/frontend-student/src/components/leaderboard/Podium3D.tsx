// Top-three podium. Each block is drawn as three faces (front, lit top,
// shaded side) with clip-path + gradients — see .podium-* in index.css. The
// winner's crown floats; a highlight sweeps across each front face.
import { Crown, Flame } from 'lucide-react';
import { initials } from '@/lib/shared';
import { Avatar3D, Count, Medal } from '@/lib/fx3d';
import type { Metric, RankedRow } from './metrics';

type Place = 1 | 2 | 3;

const PLACE: Record<Place, { tone: 'gold' | 'silver' | 'bronze'; order: string; block: string; avatar: number; delay: string }> = {
  1: { tone: 'gold', order: 'order-2', block: 'h-28 sm:h-40', avatar: 64, delay: '0s' },
  2: { tone: 'silver', order: 'order-1', block: 'h-20 sm:h-32', avatar: 54, delay: '1.4s' },
  3: { tone: 'bronze', order: 'order-3', block: 'h-16 sm:h-24', avatar: 54, delay: '2.6s' },
};

function Slot({ row, place, metric }: { row: RankedRow; place: Place; metric: Metric }) {
  const cfg = PLACE[place];
  const value = metric.value(row);
  const decimals = metric.key === 'accuracy' && value % 1 ? 1 : 0;
  const suffix = metric.key === 'accuracy' ? '%' : metric.key === 'points' ? ' pts' : metric.key === 'streak' ? ' d' : ' q';
  return <div className={`podium-col ${cfg.order}`} data-testid={`podium-place-${place}`}>
    <div className="relative flex flex-col items-center">
      {place === 1 && <Crown size={30} className="crown-float mb-1 text-[#f2c94c]" fill="currentColor" />}
      <Avatar3D text={initials(row.name)} size={cfg.avatar} ring={cfg.tone} />
      <div className="-mt-2.5 relative z-10"><Medal tone={cfg.tone} size={24}>{place}</Medal></div>
    </div>
    <div className="mt-2 flex max-w-full flex-col items-center px-1 text-center">
      <div className="max-w-[92px] truncate text-xs font-extrabold sm:max-w-[150px] sm:text-sm">{row.name}</div>
      {row.isYou && <span className="mt-0.5 rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-primary">you</span>}
      {row.institution && <div className="max-w-[92px] truncate text-[9px] font-semibold text-muted-foreground sm:max-w-[150px] sm:text-[10px]">{row.institution}</div>}
      <div className="mt-1 font-mono-app text-[13px] font-bold tabular-nums text-[#8a5a12] dark:text-[#f2c94c]"><Count value={value} decimals={decimals} suffix={suffix} /></div>
      {metric.key !== 'streak' && (row.currentStreak ?? 0) > 0 && <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#fff0cb] px-2 py-0.5 text-[10px] font-extrabold text-[#94651c] dark:bg-[#f5a623]/20 dark:text-[#ffd98a]"><Flame size={10} fill="currentColor" />{row.currentStreak}</div>}
    </div>
    <div className="mt-3 w-full">
      <div className={`podium-block podium-block--${cfg.tone} ${cfg.block}`} style={{ ['--shine-delay' as string]: cfg.delay }}>
        <div className="podium-top" /><div className="podium-side" />
        <div className="podium-front"><span className="podium-num text-4xl sm:text-5xl" style={{ ['--medal-ink' as string]: cfg.tone === 'gold' ? '#5a3f05' : cfg.tone === 'silver' ? '#3b4656' : '#5a3212' }}>{place}</span></div>
      </div>
    </div>
  </div>;
}

export function Podium3D({ rows, metric }: { rows: RankedRow[]; metric: Metric }) {
  const [first, second, third] = rows;
  if (!first) return null;
  return <div id="lb-podium" className="podium-stage d3-card mt-5 overflow-hidden rounded-3xl px-3 pb-0 pt-8 sm:px-8" data-testid="podium">
    <div className="flex items-end justify-center gap-1 sm:gap-4">
      {second && <Slot row={second} place={2} metric={metric} />}
      <Slot row={first} place={1} metric={metric} />
      {third && <Slot row={third} place={3} metric={metric} />}
    </div>
    <div className="mx-auto -mt-px h-3 w-[96%] rounded-b-[999px] bg-gradient-to-b from-black/20 to-transparent opacity-60 blur-[2px]" aria-hidden="true" />
  </div>;
}

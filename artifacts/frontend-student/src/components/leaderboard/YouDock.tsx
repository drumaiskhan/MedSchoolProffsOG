// Floating "where am I" bar. Slides up while neither the hero nor your own row
// is on screen, so on a long board you can always see your place and jump back
// to it. Sits above the phone tab bar (md:hidden) and bottom-right on desktop.
import { ArrowUp } from 'lucide-react';
import { Medal } from '@/lib/fx3d';
import { StreakBadge } from './RankRow';
import { placeTone, type Metric, type RankedRow } from './metrics';

export function YouDock({ you, metric, show, onJump }: { you: RankedRow | null; metric: Metric; show: boolean; onJump: () => void }) {
  if (!you) return null;
  const value = you.position != null ? metric.format(metric.value(you)) : '—';
  return <div className="lb-dock pointer-events-none fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-30 md:inset-x-auto md:bottom-6 md:right-8 md:w-[26rem]" data-show={show ? 'true' : 'false'} aria-hidden={!show} data-testid="dock-you">
    <div className="d3-card pointer-events-auto flex items-center gap-3 rounded-2xl bg-card/95 px-3 py-2.5 backdrop-blur-md" style={{ boxShadow: 'var(--raise-2)' }}>
      <Medal tone={placeTone(you.position, true)} size={38}>{you.position ?? '–'}</Medal>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-xs font-extrabold">Your place</div>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground"><span className="tabular-nums text-foreground">{value}</span><span>{metric.unit}</span><StreakBadge days={you.currentStreak} /></div>
      </div>
      <button type="button" onClick={onJump} tabIndex={show ? 0 : -1} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[11px] font-extrabold text-primary-foreground" data-testid="button-jump-to-me"><ArrowUp size={13} /> Jump to me</button>
    </div>
  </div>;
}

// The dark "stage" at the top of the leaderboard: where you stand (rank,
// percentile, gap to the next student) and your streak (flame, best run,
// today's status and the last 14 days as coins).
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, Flame, Target, Trophy, Zap, BookOpen } from 'lucide-react';
import type { StreakCard } from '@/lib/api';
import { Count, FlameIcon, Medal } from '@/lib/fx3d';
import { beatPercent, neighbour, placeTone, type Metric, type RankedRow } from './metrics';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayLetter(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAY[d.getUTCDay()];
}

function StreakPanel({ streak, fallbackDays }: { streak: StreakCard | undefined; fallbackDays: number }) {
  const current = streak?.currentStreak ?? fallbackDays;
  const longest = Math.max(streak?.longestStreak ?? 0, current);
  const days = streak?.days ?? [];
  const today = days.length ? days[days.length - 1].date : null;
  const status = !streak ? null
    : streak.practicedToday ? { tone: 'ok' as const, text: current > 1 ? `Done for today — day ${current} is locked in` : 'Done for today — streak started' }
    : streak.atRisk ? { tone: 'risk' as const, text: `Practise today to keep your ${current}-day streak alive` }
    : { tone: 'cold' as const, text: 'Answer one question today to start a new streak' };
  return <div className="lb-tile flex flex-col p-4 sm:p-5" data-testid="panel-streak">
    <div className="flex items-center gap-4">
      <div className="grid w-16 shrink-0 place-items-center" style={{ height: 80 }}><FlameIcon size={58} lit={current > 0} /></div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl leading-none tabular-nums text-white" data-testid="text-streak-current"><Count value={current} /></span>
          <span className="text-xs font-extrabold uppercase tracking-[.12em] text-white/60">day streak</span>
        </div>
        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-white/65"><Trophy size={12} className="text-[#f2c94c]" /> Best run: <span className="text-white" data-testid="text-streak-best">{longest} {longest === 1 ? 'day' : 'days'}</span></div>
      </div>
    </div>

    {status && <div className={['mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-extrabold leading-4', status.tone === 'ok' ? 'bg-[#2fbf86]/20 text-[#7ff0bf]' : status.tone === 'risk' ? 'streak-alert bg-[#f5a623]/25 text-[#ffd98a]' : 'bg-white/10 text-white/75'].join(' ')} data-testid={`streak-status-${status.tone}`}>
      {status.tone === 'ok' ? <CheckCircle2 size={14} className="shrink-0" /> : <Flame size={14} className="shrink-0" />}{status.text}
    </div>}

    <div className="mt-4">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[.14em] text-white/45">Last 14 days</div>
      <div className="grid grid-cols-7 gap-x-1.5 gap-y-2.5 sm:grid-cols-[repeat(14,minmax(0,1fr))]" data-testid="streak-days">
        {days.length ? days.map((d) => {
          const on = d.sessions > 0;
          return <div key={d.date} className="flex flex-col items-center gap-1" title={`${d.date}: ${on ? `${d.sessions} session${d.sessions === 1 ? '' : 's'} · ${d.questions} questions` : 'no practice'}`}>
            <span className={['day-coin aspect-square w-full max-w-[22px]', on ? 'day-coin--on' : 'day-coin--off', d.date === today ? 'day-coin--today' : ''].join(' ')}>{on && <Flame size={11} className="text-white/90" fill="currentColor" />}</span>
            <span className="text-[9px] font-bold text-white/40">{dayLetter(d.date)}</span>
          </div>;
        }) : Array.from({ length: 14 }, (_, i) => <div key={i} className="flex flex-col items-center gap-1"><span className="day-coin day-coin--off aspect-square w-full max-w-[22px]" /><span className="text-[9px] text-transparent">.</span></div>)}
      </div>
    </div>
  </div>;
}

function StatChip({ icon: Icon, label, children }: { icon: typeof Zap; label: string; children: ReactNode }) {
  return <div className="lb-tile flex items-center gap-2.5 px-3 py-2.5">
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[#9fe3c8]"><Icon size={15} /></span>
    <div className="min-w-0"><div className="truncate text-base font-extrabold leading-5 tabular-nums text-white">{children}</div><div className="truncate text-[9px] font-bold uppercase tracking-[.12em] text-white/50">{label}</div></div>
  </div>;
}

export function StandingHero({ you, ranked, rankedCount, metric, streak, periodLabel }: {
  you: RankedRow | null; ranked: RankedRow[]; rankedCount: number; metric: Metric; streak: StreakCard | undefined; periodLabel: string;
}) {
  const position = you?.position ?? null;
  const beat = position != null ? beatPercent(position, rankedCount) : null;
  const topPercent = position != null && rankedCount > 0 ? Math.max(1, Math.ceil((position / rankedCount) * 100)) : null;
  const near = you && position != null ? neighbour(you, ranked, metric) : null;

  return <section id="lb-hero" className="lb-hero rounded-[1.75rem] p-4 sm:p-7" data-testid="banner-your-rank">
    <div className="hero-grid" />
    <div className="orb -left-16 -top-24 size-72 bg-[hsl(var(--sidebar-primary))]" style={{ opacity: 0.28 }} />
    <div className="orb -bottom-28 right-10 size-64 bg-[#f5a623]" style={{ opacity: 0.16, animationDelay: '-6s' }} />
    <div className="relative grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col">
        <div className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">Your standing · {periodLabel}</div>
        {you && position != null ? <>
          <div className="mt-4 flex items-center gap-4 sm:gap-5">
            <Medal tone={placeTone(position, true)} size={92} className="shrink-0"><span data-testid="text-your-rank">#{position}</span></Medal>
            <div className="min-w-0">
              <div className="font-display text-3xl leading-tight text-white sm:text-4xl">{topPercent != null && rankedCount > 3 ? <>Top {topPercent}%</> : position === 1 ? 'You lead' : 'On the podium'}</div>
              {beat != null && <p className="mt-1 text-xs font-bold leading-5 text-white/70" data-testid="text-beat-percent">You are doing better than {beat}% of other players.</p>}
            </div>
          </div>
          {near && <div className="lb-tile mt-4 flex items-center gap-3 px-3.5 py-3 text-xs font-bold leading-5 text-white/80" data-testid="text-rank-gap">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[#ffd98a]"><Zap size={15} /></span>
            <span className="min-w-0">{near.direction === 'above'
              ? <>{near.diff === 0 ? 'Level with' : <><b className="text-white">{metric.format(near.diff)}</b> {metric.key === 'accuracy' ? 'behind' : `${metric.unit} to pass`}</>} <b className="text-white">{near.row.name}</b> (#{near.row.position})</>
              : <>You’re <b className="text-white">{metric.format(near.diff)}</b> {metric.key === 'accuracy' ? 'ahead of' : `${metric.unit} clear of`} <b className="text-white">{near.row.name}</b></>}</span>
          </div>}
        </> : <div className="mt-4">
          <div className="font-display text-3xl leading-tight text-white sm:text-4xl">{you ? 'Not ranked here yet' : 'Join the board'}</div>
          <p className="mt-2 max-w-sm text-xs font-bold leading-5 text-white/70">{you && metric.key === 'accuracy' ? 'Answer a few more questions to qualify for the accuracy ranking.' : you && metric.key === 'streak' ? 'Practise today to start your streak and climb this board.' : 'Finish a practice session in this period and you’ll appear here.'}</p>
          <Link href="/blocks" className="d3-key mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold" data-testid="link-start-practising"><BookOpen size={14} /> Start practising</Link>
        </div>}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:mt-auto lg:pt-5">
          <StatChip icon={Trophy} label="Points"><Count value={you?.points ?? 0} /></StatChip>
          <StatChip icon={Target} label="Accuracy"><Count value={you?.accuracy ?? 0} decimals={you && you.accuracy % 1 ? 1 : 0} suffix="%" /></StatChip>
          <StatChip icon={Zap} label="Questions"><Count value={you?.questionsAnswered ?? 0} /></StatChip>
          <StatChip icon={CheckCircle2} label="Sessions"><Count value={you?.sessions ?? 0} /></StatChip>
        </div>
      </div>
      <StreakPanel streak={streak} fallbackDays={you?.currentStreak ?? 0} />
    </div>
  </section>;
}

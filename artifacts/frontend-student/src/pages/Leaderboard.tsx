// Leaderboard (v37 rebuild): live standing hero with streak, 3D podium, four
// ranking metrics (points / accuracy / streak / questions), search, and a
// floating "your place" dock. Ranking rules live in components/leaderboard/
// metrics.ts; the API is unchanged apart from three extra streak fields per
// row and GET /leaderboard/streak (routes/analytics.ts).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Flame, RotateCcw, Search, Target, Trophy, Users, X, Zap } from 'lucide-react';
import { analyticsApi, ApiRequestError } from '@/lib/api';
import { EmptyState, SectionHeader, SkeletonPage } from '@/lib/shared';
import { SegTabs, prefersReducedMotion, useAnyVisible } from '@/lib/fx3d';
import { METRICS, METRIC_ORDER, rankRows, type MetricKey } from '@/components/leaderboard/metrics';
import { StandingHero } from '@/components/leaderboard/StandingHero';
import { Podium3D } from '@/components/leaderboard/Podium3D';
import { RankRowCard } from '@/components/leaderboard/RankRow';
import { YouDock } from '@/components/leaderboard/YouDock';

const RANGES: Array<{ value: string; label: string }> = [
  { value: '7d', label: 'Weekly' }, { value: '30d', label: 'Monthly' }, { value: '3m', label: 'Quarterly' }, { value: '1y', label: 'Yearly' },
];
const METRIC_ICON: Record<MetricKey, typeof Trophy> = { points: Trophy, accuracy: Target, streak: Flame, questions: Zap };

function LiveBadge() {
  return <span className="d3-well inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex size-1.5 rounded-full bg-primary" /></span>Live</span>;
}

function Leaderboard() {
  const [range, setRange] = useState('30d');
  const [metricKey, setMetricKey] = useState<MetricKey>('points');
  const [search, setSearch] = useState('');

  const board = useQuery({ queryKey: ['leaderboard', range], queryFn: () => analyticsApi.leaderboard(range), refetchInterval: 10_000, refetchIntervalInBackground: true });
  // Separate + non-fatal: an API build without /leaderboard/streak just loses
  // the 14-day coins; the flame falls back to the streak on your board row.
  const streakQ = useQuery({ queryKey: ['leaderboard-streak'], queryFn: () => analyticsApi.streak(), staleTime: 30_000, refetchInterval: 60_000, retry: false });

  const metric = METRICS[metricKey];
  const ranked = useMemo(() => rankRows(board.data ?? [], metricKey), [board.data, metricKey]);
  const qualified = ranked.filter((r) => r.position != null);
  const you = ranked.find((r) => r.isYou) ?? null;
  const top3 = qualified.slice(0, 3);
  const q = search.trim().toLowerCase();
  const listRows = q ? ranked.filter((r) => r.name.toLowerCase().includes(q) || (r.institution ?? '').toLowerCase().includes(q)) : ranked.slice(top3.length);
  const maxValue = qualified.reduce((m, r) => Math.max(m, metric.value(r)), 0);
  const periodLabel = (RANGES.find((r) => r.value === range)?.label ?? 'Monthly').toLowerCase();

  const youInPodium = !!you && !q && top3.some((r) => r.isYou);
  const ready = !board.isLoading;
  const heroVisible = useAnyVisible(['lb-hero'], [ready]);
  const youVisible = useAnyVisible([youInPodium ? 'lb-podium' : 'lb-you-row'], [ready, youInPodium, ranked, q]);
  const dockShow = !!you && ready && !heroVisible && !youVisible;
  const jumpToMe = () => {
    const el = document.getElementById(youInPodium ? 'lb-podium' : 'lb-you-row') ?? document.getElementById('lb-hero');
    el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  };

  const header = <SectionHeader eyebrow="Community" title="Leaderboard" description="See how you rank against other students — and keep your streak alive." action={<LiveBadge />} />;
  if (board.isLoading) return <div>{header}<SkeletonPage /></div>;

  return <div>
    {header}
    {board.isError ? <EmptyState
      icon={AlertTriangle}
      title="Couldn't load the leaderboard"
      body={board.error instanceof ApiRequestError ? board.error.message : 'Something went wrong reaching the server. Check your connection and try again.'}
      action={<button onClick={() => board.refetch()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-retry-leaderboard"><RotateCcw size={13} /> Try again</button>}
    /> : <>
      <StandingHero you={you} ranked={ranked} rankedCount={qualified.length} metric={metric} streak={streakQ.data} periodLabel={periodLabel} />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegTabs ariaLabel="Time range" className="lg:w-[26rem]" value={range} onChange={(v: string) => setRange(v)} options={RANGES.map((r) => ({ value: r.value, label: r.label, testId: `button-range-${r.value}` }))} />
        <SegTabs ariaLabel="Rank by" scroll className="lg:w-[30rem]" value={metricKey} onChange={(v: MetricKey) => setMetricKey(v)}
          options={METRIC_ORDER.map((k) => { const Icon = METRIC_ICON[k]; return { value: k, label: <><Icon size={13} />{METRICS[k].label}</>, testId: `button-metric-${k}` }; })} />
      </div>
      <p className="mt-2.5 px-1 text-[11px] font-semibold text-muted-foreground" data-testid="text-metric-note">{metric.note}</p>

      {!board.data?.length ? <div className="mt-4"><EmptyState icon={Trophy} title="No activity yet" body="Complete a practice session to appear on the leaderboard." /></div> : <>
        {!q && top3.length > 0 && <Podium3D rows={top3} metric={metric} />}
        {!q && top3.length === 0 && <div className="mt-4"><EmptyState icon={metric.key === 'streak' ? Flame : Users} title={metric.key === 'streak' ? 'Nobody has a live streak yet' : 'Nobody qualifies yet'} body={metric.key === 'streak' ? 'Practise today and yours could be the first one on the board.' : 'Answer a few more questions and the ranking will fill in.'} /></div>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e: { target: { value: string } }) => setSearch(e.target.value)} placeholder="Find a student or college…" aria-label="Search the leaderboard" className="h-11 w-full rounded-2xl border border-border bg-card pl-10 pr-9 text-xs font-semibold outline-none" data-testid="input-leaderboard-search" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="no-3d absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X size={13} /></button>}
          </div>
          <span className="text-[11px] font-bold text-muted-foreground">{q ? `${listRows.length} match${listRows.length === 1 ? '' : 'es'}` : `${qualified.length} ranked${ranked.length > qualified.length ? ` · ${ranked.length - qualified.length} unranked` : ''}`}</span>
        </div>

        <div key={`${range}-${metricKey}-${q ? 'q' : 'all'}`} className="mt-3 space-y-2.5" data-testid="list-leaderboard">
          {listRows.map((row, i) => <RankRowCard key={row.userId} row={row} metric={metric} max={maxValue} index={i} />)}
          {!listRows.length && <EmptyState icon={Search} title={q ? 'No one matches that search' : 'That’s the whole podium'} body={q ? 'Try a different name or college.' : 'Everyone on this board is already up on the podium.'} />}
        </div>
      </>}
      <YouDock you={you} metric={metric} show={dockShow} onJump={jumpToMe} />
    </>}
  </div>;
}

export default Leaderboard;

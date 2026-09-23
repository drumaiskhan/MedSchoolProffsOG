// Student dashboard (route page, code-split via React.lazy() in App.tsx).
//
// Everything on this page comes from a query or a helper — no fixed numbers,
// names, slogans or statuses:
//   * greeting / streak / nudge   -> /leaderboard/streak + /student/progress
//   * "continue where you left"   -> /student/continue-learning (the module the
//                                    student most recently practised, and the
//                                    exact topic to carry on with)
//   * membership                  -> /student/dashboard + the site-content trial
//   * chart                       -> /student/progress `daily` (7 local days)
// The 3D look is layered shadows/gradients/2D motion only — see index.css v39
// and the v34 note about real 3D transforms.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight, Sparkles, ShieldCheck, Crown } from 'lucide-react';
import { useGetStudentDashboard } from '@workspace/api-client-react';
import { analyticsApi, siteContentApi } from '@/lib/api';
import { SegTabs, useCurrentHour } from '@/lib/fx3d';
import { ErrorState, OPEN_SEARCH_EVENT, OPEN_SEARCH_HREF, PROGRESS_ANCHOR_HREF, QUICK_LINK_TILES, SectionHeader, SkeletonPage, useNavLocks } from '@/lib/shared';
import { DashHero } from '@/components/dashboard/DashHero';
import {
  ActivityFeed, MembershipCard, ProgressCard, QuickTiles, RANGE_OPTIONS, RangeTiles, ResumeCard, UpNext, WeekPulse,
  membershipView, resumeAction, type QuickTile,
} from '@/components/dashboard/DashCards';
import { HERO_RANGE, heroMessage, localDayKey, weekDays, type AnalyticsRange } from '@/components/dashboard/dash-utils';

const SITE_CONTENT_STALE_MS = 5 * 60 * 1000;
/** The "Practice MCQs" tile is locked by the same trial feature as Blocks. */
const PRACTICE_HREF = '/practice';
const BLOCKS_HREF = '/blocks';

function Dashboard() {
  const q = useGetStudentDashboard();
  const d = q.data;
  const [range, setRange] = useState<AnalyticsRange>('7d');
  // Recomputed once a minute (see useCurrentHour) so the hero's greeting
  // and sun/moon glyph actually roll over to the next time-of-day bucket
  // if this tab is left open, instead of freezing at whatever it was when
  // the dashboard last rendered.
  const hour = useCurrentHour();

  // Same ['site-content'] query the Shell already runs — react-query dedupes it.
  const siteContent = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: SITE_CONTENT_STALE_MS });
  const heroStats = useQuery({ queryKey: ['analytics', HERO_RANGE], queryFn: () => analyticsApi.get(HERO_RANGE) });
  const rangeStats = useQuery({ queryKey: ['analytics', range], queryFn: () => analyticsApi.get(range) });
  const trend = useQuery({ queryKey: ['progress-trend'], queryFn: analyticsApi.progress });
  const streak = useQuery({ queryKey: ['streak-card'], queryFn: () => analyticsApi.streak(), retry: false });
  const cont = useQuery({ queryKey: ['continue-learning'], queryFn: analyticsApi.continueLearning });
  const isLocked = useNavLocks(d?.user);

  if (q.isLoading) return <SkeletonPage />;
  if (q.isError || !d) return <ErrorState retry={() => q.refetch()} />;

  const modules = d.modules ?? [];
  const modulesCompleted = modules.filter((m) => m.progress >= 100).length;
  const resume = cont.data?.resume ?? null;
  const upNext = cont.data?.upNext ?? [];
  const starter = upNext[0] ?? null;
  const action = resumeAction(resume, starter);
  const membership = membershipView({ status: d.membershipStatus, expiry: d.membershipExpiry, trial: siteContent.data?.trial });

  const days = weekDays(trend.data);
  const today = days.find((day) => day.date === localDayKey(new Date()));
  const message = heroMessage({
    hasActivity: (heroStats.data?.totalSessions ?? 0) > 0 || !!resume,
    streak: streak.data?.currentStreak ?? trend.data?.currentStreak ?? d.streak ?? 0,
    practicedToday: streak.data?.practicedToday ?? false,
    atRisk: streak.data?.atRisk ?? false,
    questionsToday: today?.questions ?? 0,
    sessionsThisWeek: days.reduce((sum, day) => sum + day.sessions, 0),
  });

  const MembershipIcon = membership.tone === 'active' ? ShieldCheck : membership.tone === 'trial' ? Sparkles : Crown;
  const chip = <Link href="/payments" className={`dash-chip-link dash-chip-link--${membership.tone}`} data-testid="chip-dashboard-membership"><MembershipIcon size={12} /> {membership.title}<span>{membership.badge}</span></Link>;

  const tiles: QuickTile[] = QUICK_LINK_TILES.map((tile) => {
    const isSearch = tile.href === OPEN_SEARCH_HREF;
    const isProgressAnchor = tile.href === PROGRESS_ANCHOR_HREF;
    const isPractice = tile.href === PRACTICE_HREF;
    const href = isPractice ? action.href : tile.href;
    const testId = `link-quick-${tile.label.toLowerCase().replaceAll(' ', '-')}`;
    const onClick = isSearch
      ? () => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))
      : isProgressAnchor
        ? () => {
          const section = document.getElementById('progress-profile');
          if (!section) return;
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Brief highlight so an in-page jump reads as "you arrived".
          section.classList.add('dash-flash');
          window.setTimeout(() => section.classList.remove('dash-flash'), 1100);
        }
        : undefined;
    return { key: tile.label, label: tile.label, sub: tile.sub, icon: tile.icon, hue: tile.hue, href, onClick, testId, locked: !isSearch && !isProgressAnchor && isLocked(isPractice ? BLOCKS_HREF : tile.href) };
  });

  return <div className="dash" data-testid="page-dashboard">
    <div className="dash-row-2 dash-top">
      <DashHero
        firstName={d.user?.name?.split(' ')[0] || 'there'}
        hour={hour}
        message={message}
        streak={streak.data}
        action={action}
        chip={chip}
        heroImageUrl={siteContent.data?.dashboardHeroImageUrl || null}
      />
      <ProgressCard overallProgress={d.progress ?? 0} analytics={heroStats.data} modulesCompleted={modulesCompleted} moduleTotal={modules.length} loading={heroStats.isLoading} />
    </div>

    <section className="dash-section">
      <SectionHeader eyebrow="Pick up where you left off" title="Continue learning" action={<Link href="/blocks" className="dash-link" data-testid="link-all-modules">View all <ArrowRight size={13} /></Link>} />
      <ResumeCard resume={resume} starter={starter} loading={cont.isLoading} />
    </section>

    <section className="dash-section">
      <SectionHeader eyebrow="Jump back in" title="Quick links" />
      <QuickTiles tiles={tiles} />
    </section>

    <div className="dash-row-2">
      <section className="dash-section">
        <SectionHeader eyebrow="Where you stand" title="Progress profile" action={<Link href="/progress" className="dash-link" data-testid="link-full-progress">Full progress <ArrowRight size={13} /></Link>} />
        <WeekPulse trend={trend.data} loading={trend.isLoading} openPracticeHref={action.href} />
      </section>
      <div className="dash-stack">
        <section className="dash-section">
          <SectionHeader eyebrow="Fresh territory" title="Recommended for you" />
          <UpNext modules={resume ? upNext : upNext.slice(1)} loading={cont.isLoading} />
        </section>
        <MembershipCard view={membership} />
      </div>
    </div>

    <div className="dash-row-2">
      <section className="dash-section">
        <SectionHeader eyebrow="Track your pace" title="Analytics dashboard" action={<SegTabs<AnalyticsRange> options={RANGE_OPTIONS} value={range} onChange={setRange} ariaLabel="Analytics range" className="dash-range-tabs" />} />
        <RangeTiles analytics={rangeStats.data} loading={rangeStats.isLoading} />
      </section>
      <section className="dash-section">
        <SectionHeader eyebrow="In the loop" title="Recent activity" action={<Link href="/notifications" className="dash-link" data-testid="link-all-notifications">See all</Link>} />
        <ActivityFeed items={d.notifications ?? []} />
      </section>
    </div>
  </div>;
}

export default Dashboard;

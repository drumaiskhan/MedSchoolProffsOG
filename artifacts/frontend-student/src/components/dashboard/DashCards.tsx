// Dashboard cards. Every number and label comes from a query or a helper in
// dash-utils.ts; the only literals left are UI copy. All motion is 2D
// (opacity / translate / scale / stroke-dashoffset) and switched off for
// prefers-reduced-motion in index.css.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, Crown, Flame, Lock, Play, ShieldCheck, Sparkles, Target, Trophy } from 'lucide-react';
import { Count, prefersReducedMotion } from '@/lib/fx3d';
import { SubjectIcon, tileStyle } from '@/lib/subject-icons';
import type { Analytics, ContinueModule, ContinueResume, ProgressTrend, TrialStatus } from '@/lib/api';
import { EmptyState, ProgressBadge, progressVerdict, trialFeatureSummary, trialScopeLabel } from '@/lib/shared';
import { ANALYTICS_RANGES, DASH_LIMITS, dayLabel, daysUntil, localDayKey, timeAgo, weekDays, type AnalyticsRange } from './dash-utils';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
const clampPct = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

/* ------------------------------------------------------------------ ring */

/** Animated progress ring: the arc draws in, the number counts up. Anything above 0 shows at least a sliver so 1% is still visible. */
export function ProgressRing({ value, size = 128, stroke = 13, caption }: { value: number; size?: number; stroke?: number; caption?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pct = clampPct(value);
  const visible = pct > 0 ? Math.max(pct, 2.5) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(prefersReducedMotion() ? visible : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setDrawn(visible); return; }
    const id = requestAnimationFrame(() => setDrawn(visible));
    return () => cancelAnimationFrame(id);
  }, [visible]);
  return <div className="dash-ring" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct)}% of the question bank covered`} data-testid="ring-dashboard-progress">
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={`rg${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="hsl(var(--accent))" /><stop offset="1" stopColor="hsl(var(--primary))" /></linearGradient>
      </defs>
      <circle className="dash-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle className="dash-ring__arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={`url(#rg${uid})`}
        strokeDasharray={c} strokeDashoffset={c * (1 - drawn / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    <div className="dash-ring__center"><span className="dash-ring__value"><Count value={pct} suffix="%" /></span>{caption && <span className="dash-ring__caption">{caption}</span>}</div>
  </div>;
}

/* ------------------------------------------------------- progress + stats */

/** Hues for the glossy stat icons (HSL hue; tileStyle() turns one into a lit, bevelled tile). */
const HUE = { teal: 168, green: 150, violet: 268, amber: 38, blue: 208 } as const;

function StatCell({ icon: Icon, label, children, hue, testId }: { icon: typeof Target; label: string; children: ReactNode; hue: number; testId: string }) {
  return <div className="dash-stat" data-testid={testId}>
    <span className="dash-stat__icon" style={tileStyle(hue)}><Icon size={16} /></span>
    <span className="dash-stat__value">{children}</span>
    <span className="dash-stat__label">{label}</span>
  </div>;
}

export function ProgressCard({ overallProgress, analytics, modulesCompleted, moduleTotal, loading }: {
  overallProgress: number; analytics: Analytics | undefined; modulesCompleted: number; moduleTotal: number; loading: boolean;
}) {
  return <section className="dash-card dash-progress" data-testid="card-dashboard-progress">
    <header className="dash-card__head">
      <span className="dash-eyebrow">Your progress</span>
      <Link href="/progress" className="dash-link" data-testid="link-progress-view-all">View all <ArrowRight size={13} /></Link>
    </header>
    <div className="dash-progress__body">
      <ProgressRing value={overallProgress} caption="of the bank" />
      <div className="dash-stats">
        <StatCell icon={Target} label="Questions answered" hue={HUE.teal} testId="stat-questions-attempted">{loading ? <span className="skeleton dash-skel" /> : <Count value={analytics?.questionsAnswered ?? 0} />}</StatCell>
        <StatCell icon={CheckCircle2} label="Accuracy" hue={HUE.green} testId="stat-accuracy">{loading ? <span className="skeleton dash-skel" /> : <Count value={analytics?.averageScore ?? 0} decimals={1} suffix="%" />}</StatCell>
        <StatCell icon={BookOpen} label="Modules completed" hue={HUE.violet} testId="stat-modules-completed"><Count value={modulesCompleted} />{moduleTotal > 0 && <small> / {moduleTotal}</small>}</StatCell>
        <StatCell icon={Trophy} label="Best streak" hue={HUE.amber} testId="stat-best-streak">{loading ? <span className="skeleton dash-skel" /> : <><Count value={analytics?.longestStreak ?? 0} /><small> d</small></>}</StatCell>
      </div>
    </div>
  </section>;
}

/* -------------------------------------------------------------- resume card */

export interface ResumeAction { href: string; label: string; hint: string | null }

/** Where the "Resume" button goes: the exact topic when there is one, else the module. */
export function resumeAction(resume: ContinueResume | null, starter: ContinueModule | null): ResumeAction {
  if (resume) {
    const topic = resume.topic;
    if (topic) {
      const verb = topic.state === 'continue' ? 'Resume' : topic.state === 'next' ? 'Start next topic' : 'Review';
      return { href: `/practice?topic=${topic.id}`, label: verb, hint: topic.name };
    }
    return { href: `/modules/${resume.id}`, label: 'Resume', hint: resume.name };
  }
  if (starter) return { href: `/modules/${starter.id}`, label: 'Start learning', hint: starter.name };
  return { href: '/blocks', label: 'Browse blocks', hint: null };
}

function Meter({ value, label }: { value: number; label: string }) {
  const [w, setW] = useState(prefersReducedMotion() ? clampPct(value) : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setW(clampPct(value)); return; }
    const id = requestAnimationFrame(() => setW(clampPct(value)));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <div className="dash-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
    <span className="dash-meter__fill" style={{ width: `${w}%` }} />
  </div>;
}

export function ResumeCard({ resume, starter, loading }: { resume: ContinueResume | null; starter: ContinueModule | null; loading: boolean }) {
  if (loading) return <div className="skeleton dash-resume-skel" />;
  const mod = resume ?? starter;
  if (!mod) return <EmptyState icon={BookOpen} title="No modules yet" body="Your academic team hasn't published any modules yet." />;
  const action = resumeAction(resume, starter);
  const topic = resume?.topic ?? null;
  return <article className="dash-card dash-resume" data-testid={`card-continue-${mod.id}`}>
    <span className="dash-resume__glow" aria-hidden="true" />
    <SubjectIcon name={resume?.subject?.name ?? mod.name} iconUrl={mod.iconUrl} size="lg" className="dash-resume__icon" />
    <div className="dash-resume__body">
      <span className="dash-eyebrow">{resume ? 'Continue where you left off' : 'Start here'}</span>
      <h3 className="dash-resume__title"><Link href={action.href} className="dash-resume__stretch">{mod.name}</Link></h3>
      {resume && (resume.subject || topic) && <p className="dash-resume__crumbs">{[resume.subject?.name, topic?.name].filter(Boolean).join('  ›  ')}</p>}
      {!resume && <p className="dash-resume__crumbs">{mod.subjectCount} subject{mod.subjectCount === 1 ? '' : 's'} · {mod.mcqCount} questions</p>}
      {resume && <div className="dash-chips">
        <span className="dash-chip"><Clock3 size={11} /> {timeAgo(resume.lastPracticedAt)}</span>
        <span className="dash-chip"><Target size={11} /> {Math.round(resume.lastScorePercent)}% last score</span>
        {topic && topic.questionCount > 0 && <span className="dash-chip">{topic.attempted}/{topic.questionCount} in topic</span>}
      </div>}
      <div className="dash-resume__meter">
        <Meter value={mod.progress} label={`${mod.name} progress`} />
        <span className="dash-resume__pct"><Count value={mod.progress} suffix="%" /></span>
      </div>
      <div className="dash-resume__footrow">
        <p className="dash-resume__foot">{mod.attempted} of {mod.mcqCount} questions covered</p>
        {resume && <Link href={`/modules/${resume.id}`} className="dash-resume__module" data-testid={`link-open-module-${resume.id}`}>Open module <ChevronRight size={12} /></Link>}
      </div>
    </div>
    <span className="dash-key dash-key--go" aria-hidden="true"><Play size={13} fill="currentColor" /> {action.label}</span>
  </article>;
}

export function UpNext({ modules, loading }: { modules: ContinueModule[]; loading: boolean }) {
  const list = modules.slice(0, DASH_LIMITS.upNext);
  return <div className="dash-list">
    {loading && Array.from({ length: DASH_LIMITS.upNext }, (_, i) => <div key={i} className="skeleton dash-row-skel" />)}
    {!loading && list.map((m, i) => <Link href={`/modules/${m.id}`} key={m.id} className="dash-row card-lift" style={{ ['--i' as string]: i }} data-testid={`card-recommended-${m.id}`}>
      <SubjectIcon name={m.name} iconUrl={m.iconUrl} size="sm" />
      <span className="dash-row__text"><strong>{m.name}</strong><small>{m.mcqCount} MCQs{m.progress > 0 ? ` · ${m.progress}% done` : ' · not started'}</small></span>
      <ChevronRight size={15} className="dash-row__chev" />
    </Link>)}
    {!loading && !list.length && <p className="dash-empty">Nothing else to recommend right now — you're through everything published.</p>}
  </div>;
}

/* -------------------------------------------------------------- quick tiles */

export interface QuickTile { key: string; label: string; sub: string; icon: typeof Target; hue: number; locked: boolean; href: string; onClick?: () => void; testId: string }

export function QuickTiles({ tiles }: { tiles: QuickTile[] }) {
  return <div className="dash-tiles">{tiles.map((t, i) => {
    const inner = <>
      <span className="dash-tile__icon" style={tileStyle(t.hue)}><t.icon size={20} />{t.locked && <span className="dash-tile__lock"><Lock size={10} /></span>}</span>
      <span className="dash-tile__label">{t.label}</span>
      <span className="dash-tile__sub">{t.locked ? 'Not in your trial' : t.sub}</span>
    </>;
    const common = { className: cx('dash-tile card-lift group', t.locked && 'dash-tile--locked'), style: { ['--i' as string]: i }, 'data-testid': t.testId } as const;
    return t.onClick
      ? <button key={t.key} type="button" onClick={t.onClick} {...common}>{inner}</button>
      : <Link key={t.key} href={t.locked ? '/payments' : t.href} {...common}>{inner}</Link>;
  })}</div>;
}

/* ---------------------------------------------------------------- week pulse */

/** Last 7 days as bars (average score that day). Tap or hover a bar to read that day. */
export function WeekPulse({ trend, loading, openPracticeHref }: { trend: ProgressTrend | undefined; loading: boolean; openPracticeHref: string }) {
  const days = weekDays(trend);
  const todayKey = localDayKey(new Date());
  const lastActive = [...days].reverse().find((d) => d.sessions > 0);
  const [picked, setPicked] = useState<string | null>(null);
  const selectedKey = picked ?? lastActive?.date ?? days[days.length - 1]?.date;
  const selected = days.find((d) => d.date === selectedKey);
  const sessionsThisWeek = days.reduce((sum, d) => sum + d.sessions, 0);
  const questionsThisWeek = days.reduce((sum, d) => sum + d.questions, 0);
  const verdict = progressVerdict(null, trend);
  const hasAny = sessionsThisWeek > 0;

  if (loading) return <div className="skeleton dash-week-skel" />;
  return <section id="progress-profile" className="dash-card dash-week" data-testid="card-progress-profile">
    <header className="dash-week__head">
      <div>
        <div className="dash-week__score"><span>{trend?.recentAverage != null ? <Count value={trend.recentAverage} decimals={1} suffix="%" /> : '—'}</span><ProgressBadge tone={verdict.tone} label={verdict.label} /></div>
        <p className="dash-week__sub">Average score, last 7 days{trend?.priorAverage != null ? ` (was ${trend.priorAverage}% the week before)` : ''}</p>
      </div>
      <dl className="dash-week__facts">
        <div><dt>day streak</dt><dd><Count value={trend?.currentStreak ?? 0} /></dd></div>
        <div><dt>sessions this week</dt><dd><Count value={sessionsThisWeek} /></dd></div>
      </dl>
    </header>
    <p className="dash-week__msg">{verdict.message}</p>

    <div className="dash-chart" data-testid="chart-progress-history" role="group" aria-label="Average score per day, last 7 days">
      <span className="dash-chart__grid" aria-hidden="true"><i /><i /><i /></span>
      {days.map((d, i) => {
        const label = dayLabel(d.date);
        const has = d.sessions > 0 && d.scorePercent != null;
        const on = d.date === selectedKey;
        return <button key={d.date} type="button" className={cx('dash-bar-col', on && 'is-selected', d.date === todayKey && 'is-today', !has && 'is-empty')} onClick={() => setPicked(d.date)} onMouseEnter={() => setPicked(d.date)} onFocus={() => setPicked(d.date)}
          aria-label={`${label.long}: ${has ? `${d.scorePercent}% average over ${d.sessions} session${d.sessions === 1 ? '' : 's'}` : 'no practice'}`} style={{ ['--i' as string]: i }}>
          <span className="dash-bar-col__value">{has ? `${Math.round(d.scorePercent as number)}` : ''}</span>
          <span className="dash-bar-col__track"><span className="dash-bar-col__bar" style={{ height: has ? `${Math.max(7, clampPct(d.scorePercent as number))}%` : undefined }} /></span>
          <span className="dash-bar-col__day">{label.weekday}</span>
          <span className="dash-bar-col__date">{d.date === todayKey ? 'Today' : label.dayOfMonth}</span>
        </button>;
      })}
    </div>
    <p className="dash-chart__readout" aria-live="polite">
      {selected ? (selected.sessions > 0
        ? <><strong>{dayLabel(selected.date).long}</strong> · {selected.sessions} session{selected.sessions === 1 ? '' : 's'}{selected.questions ? ` · ${selected.questions} questions` : ''}{selected.scorePercent != null ? ` · ${selected.scorePercent}% average` : ''}</>
        : <><strong>{dayLabel(selected.date).long}</strong> · no practice</>) : null}
      {!hasAny && <span> Complete a session to see your week fill in.</span>}
    </p>
    <footer className="dash-week__foot">
      <span><strong><Count value={sessionsThisWeek} /></strong> session{sessionsThisWeek === 1 ? '' : 's'} · <strong><Count value={questionsThisWeek} /></strong> questions this week</span>
      <Link href={openPracticeHref} className="dash-link" data-testid="link-focus-practice">Open practice <ChevronRight size={13} /></Link>
    </footer>
  </section>;
}

/* ---------------------------------------------------------------- membership */

export type MembershipView = { tone: 'active' | 'trial' | 'inactive'; title: string; badge: string; detail: string; cta: { href: string; label: string } | null; remainingDays: number | null };

/** One truthful description of the student's access: paid membership, else a running trial, else none. */
export function membershipView({ status, expiry, trial }: { status: string | undefined; expiry: string | null | undefined; trial: TrialStatus | undefined }): MembershipView {
  const days = daysUntil(expiry);
  if (status === 'ACTIVE') {
    return { tone: 'active', title: 'Active', badge: 'Member', remainingDays: days, cta: null,
      detail: expiry ? `Renews or ends ${new Date(expiry).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Full access' };
  }
  if (trial?.active) {
    const scope = trialScopeLabel(trial.program, trial.years);
    const ends = trial.endsAt ? new Date(trial.endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : null;
    return { tone: 'trial', title: 'Free trial', badge: ends ? `Until ${ends}` : 'Running', remainingDays: daysUntil(trial.endsAt),
      detail: `${trialFeatureSummary(trial.features)} unlocked${scope ? ` · ${scope}` : ''}`, cta: { href: '/payments', label: 'See plans' } };
  }
  return { tone: 'inactive', title: 'Inactive', badge: 'No plan', remainingDays: null, detail: 'No active membership', cta: { href: '/payments', label: 'Get access' } };
}

export function MembershipCard({ view }: { view: MembershipView }) {
  const Icon = view.tone === 'active' ? ShieldCheck : view.tone === 'trial' ? Sparkles : Crown;
  return <section className={cx('dash-card dash-member', `dash-member--${view.tone}`)} data-testid="card-dashboard-membership">
    <header className="dash-card__head"><span className="dash-eyebrow">Membership</span><span className={cx('dash-pill', `dash-pill--${view.tone}`)}>{view.badge}</span></header>
    <div className="dash-member__row">
      <span className={cx('dash-member__icon', `dash-member__icon--${view.tone}`)}><Icon size={20} /></span>
      <div className="dash-member__text">
        <strong data-testid="text-membership-status">{view.title}</strong>
        <small>{view.detail}</small>
      </div>
      {view.remainingDays !== null && <div className="dash-member__days"><strong><Count value={view.remainingDays} /></strong><small>day{view.remainingDays === 1 ? '' : 's'} left</small></div>}
    </div>
    {view.cta && <Link href={view.cta.href} className="dash-key dash-key--wide" data-testid="button-membership-cta">{view.cta.label} <ArrowRight size={14} /></Link>}
  </section>;
}

/* ------------------------------------------------------------ activity feed */

export function ActivityFeed({ items }: { items: Array<{ id: number; title: string; body: string; read: boolean; createdAt: string }> }) {
  const shown = items.slice(0, DASH_LIMITS.notifications);
  return <div className="dash-card dash-feed">
    {shown.map((n, i) => <div key={n.id} className="dash-feed__item" style={{ ['--i' as string]: i }}>
      <span className={cx('dash-feed__dot', !n.read && 'is-unread')} aria-label={n.read ? 'Read' : 'Unread'} />
      <div className="dash-feed__text"><strong>{n.title}</strong><p>{n.body}</p><time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time></div>
    </div>)}
    {!shown.length && <p className="dash-empty">No notifications yet.</p>}
  </div>;
}

/* ----------------------------------------------------------- range analytics */

export function RangeTiles({ analytics, loading }: { analytics: Analytics | undefined; loading: boolean }) {
  const cells: Array<{ label: string; icon: typeof Clock3; hue: number; node: ReactNode }> = [
    { label: 'Total sessions', icon: Clock3, hue: HUE.blue, node: <Count value={analytics?.totalSessions ?? 0} /> },
    { label: 'Average score', icon: Target, hue: HUE.green, node: <Count value={analytics?.averageScore ?? 0} decimals={1} suffix="%" /> },
    { label: 'Questions answered', icon: CheckCircle2, hue: HUE.violet, node: <Count value={analytics?.questionsAnswered ?? 0} /> },
    { label: 'Time spent', icon: Flame, hue: HUE.amber, node: <Count value={analytics?.timeSpentMinutes ?? 0} suffix="m" /> },
  ];
  return <div className="dash-range-tiles">{cells.map((c, i) => <div key={c.label} className="dash-card dash-range-tile" style={{ ['--i' as string]: i }} data-testid={`stat-tile-${c.label.toLowerCase().replaceAll(' ', '-')}`}>
    <span className="dash-stat__icon" style={tileStyle(c.hue)}><c.icon size={16} /></span>
    <span className="dash-range-tile__label">{c.label}</span>
    <span className="dash-range-tile__value">{loading ? <span className="skeleton dash-skel" /> : c.node}</span>
  </div>)}</div>;
}

export const RANGE_OPTIONS = ANALYTICS_RANGES.map((r: AnalyticsRange) => ({ value: r, label: r.toUpperCase(), testId: `button-analytics-range-${r}` }));

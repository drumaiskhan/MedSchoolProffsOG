// v62 — Student 360°, modernized: real trend charts (recharts) instead of a
// hand-rolled sparkline, a pass/fail donut, sortable exam history, and
// richer KPI tiles with trend cues. Still reads only existing endpoints
// (student detail already loaded by the drawer, /admin/exams + attempts,
// /flagged-mcqs, /feedback) — no new API surface, purely presentational.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, ArrowDownRight, ArrowUpRight, Award, CreditCard, Flag, GraduationCap, MessageSquare, ShieldCheck, ArrowUpDown } from 'lucide-react';
import { examsAdminApi, feedbackApi, flaggedMcqsApi, studentsAdminApi, type ExamAttemptRow, type StudentDetail } from '@/lib/api';
import { cn } from '@/lib/shared';
import { computeAchievements, AchievementGallery } from './AchievementCatalog';

type Tab = 'overview' | 'exams' | 'money' | 'reports' | 'badges';
type ExamSort = 'recent' | 'highest' | 'lowest';
const day = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Every exam's attempts, fetched once and shared by all drawers (only exams that have attempts are requested). */
function useAllExamAttempts(enabled: boolean) {
  return useQuery({ queryKey: ['admin-all-exam-attempts'], enabled, staleTime: 5 * 60_000, queryFn: async () => {
    const exams = await examsAdminApi.list();
    const withAttempts = exams.filter((e) => e.attemptCount > 0);
    const lists = await Promise.all(withAttempts.map((e) => examsAdminApi.attempts(e.id).then((rows) => rows.map((r) => ({ ...r, examTitle: e.title }))).catch(() => [])));
    return lists.flat() as Array<ExamAttemptRow & { examTitle: string }>;
  } });
}

// Trend area chart — same shape as the rest of the admin's mini-charts
// (AreaChart + gradient fill), swapped in for the old raw-SVG sparkline so
// it gets hover tooltips and consistent styling for free.
function TrendChart({ pcts }: { pcts: number[] }) {
  if (pcts.length < 2) return <div className="grid h-16 w-full place-items-center text-[10px] text-muted-foreground">Need 2+ attempts for a trend</div>;
  const data = pcts.map((v, i) => ({ i: i + 1, v: Math.round(v) }));
  return <div className="h-16 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
    <defs><linearGradient id="s360-trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.35} /><stop offset="100%" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs>
    <XAxis dataKey="i" hide />
    <RechartsTooltip formatter={(v: number) => [`${v}%`, 'Score']} labelFormatter={(l) => `Attempt ${l}`} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid hsl(var(--border))' }} />
    <Area type="monotone" dataKey="v" stroke="currentColor" strokeWidth={2} fill="url(#s360-trend)" className="text-primary" dot={false} />
  </AreaChart></ResponsiveContainer></div>;
}

// Pass/fail donut — visual companion to the "N/M passed" line so an admin
// can see the ratio without doing the division themselves.
function PassDonut({ passed, failed }: { passed: number; failed: number }) {
  const total = passed + failed;
  if (!total) return null;
  const data = [{ name: 'Passed', value: passed, color: 'hsl(var(--primary))' }, { name: 'Failed', value: failed, color: 'hsl(var(--destructive))' }].filter((d) => d.value > 0);
  return <div className="relative size-12 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius="65%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none">{data.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie></PieChart></ResponsiveContainer></div>;
}

const Tile = ({ label, value, sub, tone, icon: Icon, trend }: { label: string; value: string; sub?: string; tone?: string; icon?: typeof Activity; trend?: 'up' | 'down' | null }) => (
  <div className="rounded-xl border border-border bg-background p-2.5">
    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{Icon && <Icon size={10} />}{label}</div>
    <div className="mt-0.5 flex items-center gap-1"><span className={cn('font-display text-lg leading-tight', tone)}>{value}</span>{trend && (trend === 'up' ? <ArrowUpRight size={12} className="text-primary" /> : <ArrowDownRight size={12} className="text-destructive" />)}</div>
    {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
  </div>
);

export function Student360Panel({ s }: { s: StudentDetail }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [examSort, setExamSort] = useState<ExamSort>('recent');
  const attempts = useAllExamAttempts(true);
  const flags = useQuery({ queryKey: ['admin-flags'], queryFn: flaggedMcqsApi.list, staleTime: 60_000 });
  const feedback = useQuery({ queryKey: ['admin-feedback-all'], queryFn: feedbackApi.listAll, staleTime: 60_000 });
  const challenges = useQuery({ queryKey: ['admin-student-challenges', s.id], queryFn: () => studentsAdminApi.challenges(s.id), staleTime: 60_000 });

  const mine = useMemo(() => (attempts.data ?? []).filter((a) => a.userId === s.id && a.submittedAt).sort((a, b) => +new Date(a.submittedAt!) - +new Date(b.submittedAt!)), [attempts.data, s.id]);
  const pcts = mine.map((a) => Number(a.percentage) || 0);
  const avg = pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : null;
  const passed = mine.filter((a) => a.passed).length;
  const failed = mine.filter((a) => a.passed === false).length;
  // Recent-vs-earlier half comparison — cheap "is this student trending up
  // or down" signal without needing a dedicated trend endpoint.
  const trendDirection = useMemo(() => {
    if (pcts.length < 4) return null;
    const mid = Math.floor(pcts.length / 2);
    const first = pcts.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const second = pcts.slice(mid).reduce((a, b) => a + b, 0) / (pcts.length - mid);
    if (Math.abs(second - first) < 2) return null;
    return second > first ? 'up' : 'down';
  }, [pcts]);
  const myFlags = useMemo(() => (flags.data ?? []).filter((f) => f.userId === s.id), [flags.data, s.id]);
  const myFeedback = useMemo(() => (feedback.data ?? []).filter((f) => f.userId === s.id), [feedback.data, s.id]);
  const paid = useMemo(() => s.payments.filter((p) => p.status === 'approved'), [s.payments]);
  const pending = s.payments.filter((p) => p.status === 'pending').length;
  const totalPaid = paid.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const seen = day(s.lastLoginAt); const joined = day(s.joinedAt);
  const engagement = seen === null ? { label: 'Never signed in', tone: 'bg-muted text-muted-foreground' } : seen <= 3 ? { label: 'Active', tone: 'bg-primary/15 text-primary' } : seen <= 14 ? { label: 'Cooling', tone: 'bg-accent/20 text-accent-text' } : { label: 'Dormant', tone: 'bg-destructive/15 text-destructive' };
  const m = s.activeMembership; const left = m ? Math.ceil((new Date(m.expiresAt).getTime() - Date.now()) / 86400000) : null;
  const risk: string[] = [];
  if (m && left !== null && left <= 7 && left >= 0) risk.push(`Membership ends in ${left} day${left === 1 ? '' : 's'}`);
  if (m && seen !== null && seen > 14) risk.push(`Paying but inactive for ${seen} days`);
  if (!m && s.status === 'ACTIVE') risk.push('Active account without a live membership');
  if (pending) risk.push(`${pending} payment${pending === 1 ? '' : 's'} awaiting review`);
  if (avg !== null && avg < 50) risk.push(`Exam average is ${avg}%`);

  const sortedExams = useMemo(() => {
    const arr = [...mine];
    if (examSort === 'recent') arr.reverse();
    else if (examSort === 'highest') arr.sort((a, b) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0));
    else arr.sort((a, b) => (Number(a.percentage) || 0) - (Number(b.percentage) || 0));
    return arr;
  }, [mine, examSort]);

  const tenureDays = joined ?? 0;
  const achievements = useMemo(
    () => computeAchievements(s, mine, avg, passed, paid, myFeedback.length, myFlags.length, tenureDays, challenges.data),
    [s, mine, avg, passed, paid, myFeedback.length, myFlags.length, tenureDays, challenges.data],
  );
  const earnedAchievements = achievements.filter((a) => a.earned).length;

  const tabs: Array<[Tab, string, typeof Activity, number | null]> = [
    ['overview', 'Overview', Activity, null],
    ['exams', 'Exams', GraduationCap, mine.length || null],
    ['money', 'Payments', CreditCard, s.payments.length || null],
    ['reports', 'Reports', Flag, (myFlags.length + myFeedback.length) || null],
    ['badges', 'Achievements', Award, earnedAchievements || null],
  ];

  return <div className="rounded-2xl border border-border bg-card" data-testid="panel-student-360">
    <div className="flex items-center gap-2 border-b border-border p-3">
      <ShieldCheck size={14} className="text-primary" />
      <div className="text-xs font-extrabold">Student 360°</div>
      {avg !== null && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold', avg >= 50 ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive')}>{avg}% avg</span>}
      <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold', engagement.tone)}>{engagement.label}</span>
    </div>
    <div className="flex gap-1 overflow-x-auto p-2">{tabs.map(([id, label, Icon, count]) => <button key={id} onClick={() => setTab(id)} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold transition-colors', tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} data-testid={`tab360-${id}`}><Icon size={12} />{label}{count != null && <span className={cn('rounded-full px-1.5 text-[10px]', tab === id ? 'bg-white/20' : 'bg-muted')}>{count}</span>}</button>)}</div>
    <div className="animate-in fade-in duration-200 p-3 pt-1" key={tab}>
      {tab === 'overview' && <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile icon={ShieldCheck} label="Membership" value={m ? (m.isTrial ? 'Trial' : 'Active') : 'None'} sub={m ? `${left !== null && left >= 0 ? `${left}d left` : 'expired'} · ${fmtDate(m.expiresAt)}` : s.status.replace(/_/g, ' ').toLowerCase()} tone={m ? 'text-primary' : undefined} />
          <Tile icon={Activity} label="Last seen" value={seen === null ? '—' : seen === 0 ? 'Today' : `${seen}d ago`} sub={`Joined ${joined === null ? '—' : `${joined}d ago`}`} />
          <Tile icon={GraduationCap} label="Streak" value={`${s.currentStreak}d`} sub={`Best ${s.longestStreak}d`} />
          <Tile icon={GraduationCap} label="Exams taken" value={attempts.isLoading ? '…' : String(mine.length)} sub={avg !== null ? `${avg}% average` : 'no submissions'} trend={trendDirection} />
          <Tile icon={CreditCard} label="Total paid" value={paid.length ? `${paid[0].currency} ${totalPaid.toLocaleString()}` : '—'} sub={`${paid.length} approved`} />
          <Tile icon={Flag} label="Reports raised" value={String(myFlags.length)} sub={`${myFeedback.length} feedback`} />
        </div>
        {pcts.length >= 2 && <div className="rounded-xl border border-border bg-background p-2.5">
          <div className="mb-1 flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Score trend</span>{trendDirection && <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-extrabold', trendDirection === 'up' ? 'text-primary' : 'text-destructive')}>{trendDirection === 'up' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{trendDirection === 'up' ? 'Improving' : 'Slipping'}</span>}</div>
          <TrendChart pcts={pcts} />
        </div>}
        {!!risk.length && <div className="rounded-xl border border-accent/40 bg-accent/10 p-2.5"><div className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-accent">Worth a look</div><ul className="space-y-0.5 text-[11px] font-semibold text-accent">{risk.map((r) => <li key={r}>• {r}</li>)}</ul></div>}
        <button onClick={() => setTab('badges')} className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-background p-2.5 text-left transition-colors hover:bg-muted/40" data-testid="button-overview-achievements">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/25 text-accent"><Award size={14} /></div>
          <div className="flex-1"><div className="text-[11px] font-extrabold">{earnedAchievements}/{achievements.length} achievements unlocked</div><div className="text-[10px] text-muted-foreground">Tap to view the full badge gallery</div></div>
          <ArrowUpRight size={13} className="shrink-0 text-muted-foreground" />
        </button>
        <p className="text-[10px] leading-4 text-muted-foreground">Practice-session accuracy isn't available to admins yet; performance here comes from Pre-Proffs exams.</p>
      </div>}

      {tab === 'exams' && (attempts.isLoading ? <div className="py-6 text-center text-xs text-muted-foreground">Loading exam history…</div> : attempts.isError ? <div className="py-6 text-center text-xs text-destructive">Couldn't load exam attempts.</div> : !mine.length ? <div className="py-6 text-center text-xs text-muted-foreground">No submitted exams yet.</div> : <div className="space-y-2.5">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-2.5">
          <PassDonut passed={passed} failed={failed} />
          <div className="flex-1"><div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Trend</div><div className="font-display text-lg">{avg}% avg · {passed}/{mine.length} passed</div></div>
          <div className="w-28"><TrendChart pcts={pcts.slice(-10)} /></div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{mine.length} attempt{mine.length === 1 ? '' : 's'}</span>
          <div className="relative"><select value={examSort} onChange={(e) => setExamSort(e.target.value as ExamSort)} className="h-7 appearance-none rounded-lg border border-border bg-background pl-2.5 pr-6 text-[10px] font-bold" data-testid="select-exam-sort"><option value="recent">Most recent</option><option value="highest">Highest score</option><option value="lowest">Lowest score</option></select><ArrowUpDown size={10} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" /></div>
        </div>
        {sortedExams.slice(0, 8).map((a) => <div key={a.id} className="flex items-center gap-2 rounded-xl border border-border p-2.5 text-xs" data-testid={`row-exam-attempt-${a.id}`}><div className="min-w-0 flex-1"><div className="truncate font-bold">{a.examTitle}</div><div className="text-[10px] text-muted-foreground">Attempt {a.attemptNumber} · {fmtDate(a.submittedAt)} · {a.correctCount}/{a.totalQuestions} correct</div></div><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold', a.passed === false ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary')}>{Math.round(Number(a.percentage) || 0)}%</span></div>)}
      </div>)}

      {tab === 'money' && (!s.payments.length ? <div className="py-6 text-center text-xs text-muted-foreground">No payments submitted.</div> : <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Tile icon={CreditCard} label="Approved" value={String(paid.length)} />
          <Tile icon={CreditCard} label="Pending" value={String(pending)} tone={pending ? 'text-accent' : undefined} />
          <Tile icon={CreditCard} label="Lifetime paid" value={paid.length ? `${paid[0].currency} ${totalPaid.toLocaleString()}` : '—'} />
        </div>
        {s.payments.map((p) => <div key={p.id} className="flex items-center gap-2 rounded-xl border border-border p-2.5 text-xs"><div className="min-w-0 flex-1"><div className="truncate font-bold">{p.planName}</div><div className="text-[10px] text-muted-foreground">{fmtDate(p.paymentDate)} · {p.method}</div></div><div className="text-right"><div className="font-bold">{p.currency} {Number(p.amount).toLocaleString()}</div><div className={cn('text-[10px] font-extrabold capitalize', p.status === 'approved' ? 'text-primary' : p.status === 'pending' ? 'text-accent' : 'text-destructive')}>{p.status}</div></div></div>)}
      </div>)}

      {tab === 'reports' && (!myFlags.length && !myFeedback.length ? <div className="py-6 text-center text-xs text-muted-foreground">Nothing reported or sent by this student.</div> : <div className="space-y-2">
        {myFlags.map((f) => <div key={`f${f.id}`} className="rounded-xl border border-border p-2.5 text-xs"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Flag size={10} /> Flagged question · <span className={f.status === 'open' ? 'text-accent' : 'text-primary'}>{f.status}</span></div><div className="mt-1 line-clamp-2 font-semibold">{f.question ?? 'Question deleted'}</div>{f.reason && <div className="mt-0.5 text-[11px] text-muted-foreground">"{f.reason}"</div>}</div>)}
        {myFeedback.map((f) => <div key={`m${f.id}`} className="rounded-xl border border-border p-2.5 text-xs"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><MessageSquare size={10} /> {f.category} · {f.status}{f.rating ? ` · ${f.rating}★` : ''}</div><div className="mt-1 line-clamp-3">{f.message}</div></div>)}
      </div>)}

      {tab === 'badges' && <AchievementGallery achievements={achievements} />}
    </div>
  </div>;
}

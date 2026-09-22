// "My Progress" — code-split via React.lazy() in App.tsx. Reached from the
// sidebar and from the dashboard's "My Progress" quick link.
//
// One request (GET /student/progress-overview) feeds every tab: MCQ practice,
// past papers, improvement over time, and Pre-Proffs exam results. Pre-Proff
// scores the exam is still holding back arrive as `released: false` and are
// shown as "awaiting release" — this page never has them to leak.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, FileStack, Flame, Hourglass, LineChart, Minus, Sparkles, Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { analyticsApi, type ProgressOverview, type ProgressTopic } from '@/lib/api';
import { Badge, EmptyState, ErrorState, Progress, SectionHeader, SkeletonPage, StatTile, cn } from '@/lib/shared';
import { SubjectIcon } from '@/lib/subject-icons';

type Tab = 'overview' | 'mcqs' | 'papers' | 'improvement' | 'exams';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const pctText = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}%`);
// Same thresholds the rest of the app uses for "how am I doing".
const scoreTone = (n: number | null): 'green' | 'amber' | 'red' | 'neutral' => (n == null ? 'neutral' : n >= 70 ? 'green' : n >= 50 ? 'amber' : 'red');
const barColor = (n: number | null) => (n == null ? 'bg-muted' : n >= 70 ? 'bg-[#3aa66b]' : n >= 50 ? 'bg-[#e0a72f]' : 'bg-[#d1544a]');

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-[10px] text-muted-foreground">not enough data yet</span>;
  const Icon = delta >= 3 ? TrendingUp : delta <= -3 ? TrendingDown : Minus;
  return <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold', delta >= 3 ? 'text-[#287058]' : delta <= -3 ? 'text-[#a34c3e]' : 'text-muted-foreground')}><Icon size={12} />{delta > 0 ? '+' : ''}{delta} pts</span>;
}

function TopicList({ title, tone, topics, empty }: { title: string; tone: 'green' | 'red' | 'blue'; topics: ProgressTopic[]; empty: string }) {
  return <div className="rounded-2xl border border-border bg-card p-5">
    <div className="flex items-center gap-2 text-sm font-extrabold"><span className={cn('size-2 rounded-full', tone === 'green' ? 'bg-[#3aa66b]' : tone === 'red' ? 'bg-[#d1544a]' : 'bg-[#4a86c5]')} />{title}</div>
    {topics.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">{empty}</p> : <ul className="mt-3 space-y-3">
      {topics.map((t) => <li key={t.id}>
        <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-xs font-bold">{t.name}</span><span className="shrink-0 text-xs font-extrabold">{pctText(t.accuracy)}</span></div>
        <div className="mt-1.5"><Progress value={t.accuracy ?? 0} color={barColor(t.accuracy)} /></div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>{t.subject ? `${t.subject} · ` : ''}{t.answered} answered</span><DeltaChip delta={t.delta} /></div>
      </li>)}
    </ul>}
  </div>;
}

function Overview({ d, go }: { d: ProgressOverview; go: (t: Tab) => void }) {
  const { improvement: imp } = d;
  const verdict = imp.trend === 'up' ? { label: 'Improving', text: `Your accuracy is up ${imp.deltaPoints} points versus the two weeks before. Keep this pace.`, tone: 'green' as const }
    : imp.trend === 'down' ? { label: 'Needs more practice', text: `Your accuracy is down ${Math.abs(imp.deltaPoints ?? 0)} points versus the two weeks before — a bit more daily practice should turn it around.`, tone: 'red' as const }
    : imp.trend === 'flat' ? { label: 'Holding steady', text: 'About the same as the two weeks before. Push for a new high in your next session.', tone: 'neutral' as const }
    : { label: 'Getting started', text: 'Practise on a few different days and a trend will show up here.', tone: 'neutral' as const };
  return <div className="space-y-6">
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2"><Sparkles size={15} className="text-primary" /><span className="text-sm font-extrabold">How you're doing</span><Badge tone={verdict.tone}>{verdict.label}</Badge></div>
      <p className="mt-2 text-sm text-muted-foreground">{verdict.text}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { tab: 'mcqs' as const, icon: Target, title: 'MCQ practice', line: `${d.summary.uniqueMcqsAttempted} different questions attempted`, sub: `${pctText(d.summary.accuracy)} overall accuracy` },
        { tab: 'papers' as const, icon: FileStack, title: 'Past papers', line: d.pastPapers.length ? `${d.pastPapers.length} paper${d.pastPapers.length === 1 ? '' : 's'} started` : 'None started yet', sub: d.pastPapers[0] ? `Latest: ${d.pastPapers[0].title}` : 'Try one from Past papers' },
        { tab: 'exams' as const, icon: ClipboardCheck, title: 'Pre-Proffs', line: d.exams.length ? `${d.exams.length} attempt${d.exams.length === 1 ? '' : 's'}` : 'No attempts yet', sub: d.exams[0]?.released ? `Latest: ${pctText(d.exams[0].percentage)}` : d.exams[0] ? 'Latest result awaiting release' : 'Sit one when it opens' },
      ].map((c) => <button key={c.tab} type="button" onClick={() => go(c.tab)} className="card-lift group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left" data-testid={`card-progress-${c.tab}`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><c.icon size={18} /></span>
        <span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">{c.title}</span><span className="mt-0.5 block text-xs">{c.line}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{c.sub}</span></span>
        <ArrowRight size={15} className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <TopicList title="Needs more work" tone="red" topics={imp.needsWork} empty="Answer at least 5 questions in a topic and your weakest ones will show here." />
      <TopicList title="Strongest topics" tone="green" topics={imp.strongest} empty="Your strongest topics will appear once you've answered a few." />
    </div>
  </div>;
}

function McqTab({ d }: { d: ProgressOverview }) {
  if (!d.summary.sessions) return <EmptyState icon={Target} title="No practice sessions yet" body="Finish a practice session and every question you attempt, and how you did, will be tracked here." action={<Link href="/blocks" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">Start practising</Link>} />;
  return <div className="space-y-6">
    <div><h3 className="mb-3 text-sm font-extrabold">Accuracy by subject</h3>
      <div className="rounded-2xl border border-border bg-card p-5">{d.bySubject.length === 0 ? <p className="text-xs text-muted-foreground">Subject breakdown appears once your practice includes subject-tagged questions.</p> : <ul className="space-y-4">
        {d.bySubject.map((s) => <li key={s.id}>
          <div className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2.5"><SubjectIcon name={s.name} size="xs" /><span className="min-w-0 truncate text-xs font-bold">{s.name}</span></span><span className="shrink-0 text-xs font-extrabold">{pctText(s.accuracy)}</span></div>
          <div className="mt-1.5"><Progress value={s.accuracy ?? 0} color={barColor(s.accuracy)} /></div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>{s.answered} answered</span><DeltaChip delta={s.delta} /></div>
        </li>)}
      </ul>}</div>
    </div>
    <div><h3 className="mb-3 text-sm font-extrabold">Recent sessions</h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {d.recentSessions.map((s, i) => <div key={s.id} className={cn('flex items-center gap-3 px-4 py-3.5', i > 0 && 'border-t border-border/70')} data-testid={`row-session-${s.id}`}>
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{s.scope}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(s.date)} · {s.correctCount}/{s.totalQuestions} correct{s.durationMinutes != null ? ` · ${s.durationMinutes} min` : ''} · {s.mode}</div></div>
          <Badge tone={scoreTone(s.scorePercent)}>{Math.round(s.scorePercent)}%</Badge>
        </div>)}
      </div>
    </div>
  </div>;
}

function PapersTab({ d }: { d: ProgressOverview }) {
  if (!d.pastPapers.length) return <EmptyState icon={FileStack} title="No past papers attempted yet" body="Start a session on any past paper and your coverage and accuracy for it will show up here." action={<Link href="/past-papers" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">Browse past papers</Link>} />;
  return <div className="grid gap-3 sm:grid-cols-2">
    {d.pastPapers.map((p) => <div key={p.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-paper-${p.id}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-extrabold">{p.title}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{[p.examBoard, p.year].filter(Boolean).join(' · ') || 'Past paper'} · last attempted {fmtDate(p.lastAttemptAt)}</div></div><Badge tone={scoreTone(p.accuracy)}>{pctText(p.accuracy)}</Badge></div>
      <div className="mt-4"><div className="flex justify-between text-[11px] font-semibold"><span>Coverage</span><span>{p.attemptedQuestions}/{p.totalQuestions} questions</span></div><div className="mt-1.5"><Progress value={p.coveragePercent} /></div></div>
      <Link href={`/practice?pastPaperId=${p.id}`} className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-primary">{p.coveragePercent >= 100 ? 'Practise again' : 'Continue'} <ArrowRight size={12} /></Link>
    </div>)}
  </div>;
}

function ImprovementTab({ d }: { d: ProgressOverview }) {
  const imp = d.improvement;
  const data = imp.weekly.map((w) => ({ week: fmtDate(w.weekStart), accuracy: w.accuracy, questions: w.questions }));
  const hasAny = imp.weekly.some((w) => w.accuracy != null);
  if (!hasAny) return <EmptyState icon={LineChart} title="Nothing to chart yet" body="Your weekly accuracy will build up here as you practise across different weeks." />;
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-4"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">First tracked week</div><div className="mt-1 font-display text-2xl">{pctText(imp.firstAccuracy)}</div></div>
      <div className="rounded-2xl border border-border bg-card p-4"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Latest week</div><div className="mt-1 font-display text-2xl">{pctText(imp.latestAccuracy)}</div></div>
      <div className="rounded-2xl border border-border bg-card p-4"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Last 2 weeks vs before</div><div className="mt-2"><DeltaChip delta={imp.deltaPoints} /></div></div>
    </div>
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-extrabold">Weekly accuracy — last 8 weeks</h3>
      <div className="mt-4 h-56 w-full" data-testid="chart-weekly-accuracy">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs><linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
            <ChartTooltip formatter={(v: number | string, _n, item) => [`${v}% (${(item.payload as { questions: number }).questions} questions)`, 'Accuracy']} />
            <Area type="monotone" dataKey="accuracy" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#progressFill)" connectNulls dot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <TopicList title="Most improved topics" tone="blue" topics={imp.improvedTopics} empty="Practise a topic in two different weeks (3+ questions each) to see improvement." />
      <TopicList title="Needs more work" tone="red" topics={imp.needsWork} empty="No weak topics yet — keep going." />
    </div>
  </div>;
}

function ExamsTab({ d }: { d: ProgressOverview }) {
  if (!d.exams.length) return <EmptyState icon={ClipboardCheck} title="No Pre-Proffs attempts yet" body="Your Pre-Proffs results will be listed here after you submit an exam." action={<Link href="/exams" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">See exams</Link>} />;
  return <div className="space-y-3">
    {d.exams.map((e) => <div key={e.attemptId} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5" data-testid={`row-exam-${e.attemptId}`}>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold">{e.title}</div><div className="mt-0.5 text-[11px] text-muted-foreground">Attempt {e.attemptNumber} · submitted {fmtDate(e.submittedAt)} · {e.totalQuestions} questions</div></div>
      {e.released
        ? <div className="flex items-center gap-3">
          {e.passed != null && <Badge tone={e.passed ? 'green' : 'red'}>{e.passed ? 'Passed' : 'Not passed'}</Badge>}
          <div className="text-right"><div className="font-display text-2xl leading-none">{e.percentage != null ? `${Math.round(e.percentage)}%` : e.score != null ? e.score : `${e.correctCount ?? 0}/${e.totalQuestions}`}</div><div className="mt-1 text-[10px] text-muted-foreground">{e.correctCount ?? 0} correct</div></div>
          <Link href={`/exams/result/${e.attemptId}`} className="inline-flex items-center gap-1 text-xs font-extrabold text-primary">Review <ArrowRight size={12} /></Link>
        </div>
        : <Badge tone="amber"><Hourglass size={11} className="mr-1" /> Result not released yet</Badge>}
    </div>)}
  </div>;
}

function Progress_() {
  const q = useQuery({ queryKey: ['progress-overview'], queryFn: analyticsApi.overview });
  const [tab, setTab] = useState<Tab>('overview');
  if (q.isLoading) return <SkeletonPage />;
  if (!q.data) return <ErrorState retry={() => q.refetch()} />;
  const d = q.data;
  const TABS: Array<{ id: Tab; label: string; icon: typeof Target }> = [
    { id: 'overview', label: 'Overview', icon: Activity }, { id: 'mcqs', label: 'MCQs', icon: Target }, { id: 'papers', label: 'Past papers', icon: FileStack },
    { id: 'improvement', label: 'Improvement', icon: LineChart }, { id: 'exams', label: 'Pre-Proffs', icon: ClipboardCheck },
  ];
  return <div className="space-y-6">
    <SectionHeader eyebrow="Where you stand" title="My progress" description="Your accuracy, past papers and improvement over time — visible only to you." />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile icon={CheckCircle2} bg="bg-[#d7eee4]" fg="text-[#1f7a5c]" label="Questions answered" value={d.summary.questionsAnswered} />
      <StatTile icon={Target} bg="bg-[#dceaf1]" fg="text-[#2c6a8f]" label="Accuracy" value={pctText(d.summary.accuracy)} />
      <StatTile icon={Clock3} bg="bg-[#e6dcf5]" fg="text-[#6b3fa0]" label="Time studied" value={d.summary.timeSpentMinutes >= 60 ? `${Math.floor(d.summary.timeSpentMinutes / 60)}h ${d.summary.timeSpentMinutes % 60}m` : `${d.summary.timeSpentMinutes}m`} />
      <StatTile icon={Flame} bg="bg-[#fff0cb]" fg="text-[#94651c]" label="Day streak" value={d.summary.currentStreak} />
      <StatTile icon={Trophy} bg="bg-[#fbdada]" fg="text-[#b8493f]" label="Active days (30d)" value={d.summary.activeDaysLast30} />
    </div>
    <div role="tablist" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition-colors', tab === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')} data-testid={`tab-progress-${t.id}`}><t.icon size={13} />{t.label}</button>)}
    </div>
    {tab === 'overview' && <Overview d={d} go={setTab} />}
    {tab === 'mcqs' && <McqTab d={d} />}
    {tab === 'papers' && <PapersTab d={d} />}
    {tab === 'improvement' && <ImprovementTab d={d} />}
    {tab === 'exams' && <ExamsTab d={d} />}
  </div>;
}

export default Progress_;

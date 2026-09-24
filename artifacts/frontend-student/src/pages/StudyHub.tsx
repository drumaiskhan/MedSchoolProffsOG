// v60 — Study hub: Daily plan · Mistake review · Weak-area practice. Additive page (/study).
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CalendarCheck, Check, Flame, Layers, Repeat2, Target, Trash2, Zap } from 'lucide-react';
import { analyticsApi, type ProgressTopic } from '@/lib/api';
import { TiltDiv, SegToggle, vars } from '@/lib/tilt';
import { EmptyState, ErrorState, SectionHeader, SkeletonPage, cn } from '@/lib/shared';
import { clearLedger, openMistakes, repeatedMistakes, type Miss } from '@/lib/study';

type Tab = 'plan' | 'mistakes' | 'weak';
const today = () => new Date().toISOString().slice(0, 10);
const DONE_KEY = () => `msp.plan.done.${today()}`;
const readDone = (): string[] => { try { return JSON.parse(localStorage.getItem(DONE_KEY()) ?? '[]'); } catch { return []; } };
const ago = (t: number) => { const d = Math.floor((Date.now() - t) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`; };

function Task({ n, title, sub, mins, href, cta, done, onDone, tone }: { n: number; title: string; sub: string; mins: number; href: string; cta: string; done: boolean; onDone: () => void; tone: string }) {
  return <TiltDiv style={vars({ '--tilt': 3, '--i': n })}><div className={cn('flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-opacity', done && 'opacity-55')} data-testid={`plan-task-${n}`}>
    <button onClick={onDone} aria-label={done ? 'Mark as not done' : 'Mark as done'} className={cn('grid size-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold transition-transform active:scale-90', done ? 'bg-primary text-primary-foreground' : tone)}>{done ? <Check size={16} /> : n}</button>
    <div className="min-w-0 flex-1"><div className={cn('truncate text-sm font-extrabold', done && 'line-through')}>{title}</div><div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{sub} · ~{mins} min</div></div>
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-foreground">{cta}<ArrowRight size={12} /></Link>
  </div></TiltDiv>;
}

function MistakeRow({ m, topic }: { m: Miss; topic?: string }) {
  return <div className="rounded-2xl border border-border bg-card p-3.5" data-testid={`mistake-${m.id}`}>
    <div className="line-clamp-2 text-xs font-semibold leading-5">{m.q}</div>
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
      <span className="rounded-full bg-[#fff1ed] px-2 py-0.5 text-[#a34c3e]">Missed {m.wrong}×</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{ago(m.lastWrong)}</span>
      {m.streak === 1 && <span className="rounded-full bg-[#e6f3ed] px-2 py-0.5 text-[#287058]">1 right since — one more to clear</span>}
      {topic && <span className="max-w-[12rem] truncate rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{topic}</span>}
    </div>
  </div>;
}

export default function StudyHub() {
  const [tab, setTab] = useState<Tab>(() => { const t = new URLSearchParams(window.location.search).get('tab'); return t === 'mistakes' || t === 'weak' ? t : 'plan'; });
  const [sub, setSub] = useState<'recent' | 'repeated' | 'topic'>('recent');
  const [done, setDone] = useState<string[]>(readDone);
  const [tick, setTick] = useState(0);
  const overview = useQuery({ queryKey: ['progress-overview'], queryFn: analyticsApi.overview });
  const resume = useQuery({ queryKey: ['continue-learning'], queryFn: analyticsApi.continueLearning });
  const streak = useQuery({ queryKey: ['streak-card'], queryFn: analyticsApi.streak });
  const topicName = useMemo(() => { const map = new Map<number, string>(); const i = overview.data?.improvement; for (const t of [...(i?.needsWork ?? []), ...(i?.strongest ?? []), ...(i?.improvedTopics ?? [])]) map.set(t.id, t.name); return map; }, [overview.data]);
  const open = useMemo(() => openMistakes(), [tick]);
  const repeated = useMemo(() => repeatedMistakes(), [tick]);
  if (overview.isLoading) return <SkeletonPage />;
  if (overview.isError || !overview.data) return <ErrorState retry={() => overview.refetch()} />;

  const weak = overview.data.improvement.needsWork;
  const toggle = (id: string) => setDone((d) => { const next = d.includes(id) ? d.filter((x) => x !== id) : [...d, id]; try { localStorage.setItem(DONE_KEY(), JSON.stringify(next)); } catch { /* ignore */ } return next; });
  const r = resume.data?.resume;
  const tasks: Array<Omit<Parameters<typeof Task>[0], 'n' | 'done' | 'onDone'> & { id: string }> = [];
  if (open.length) tasks.push({ id: 'mistakes', title: `Clear ${Math.min(open.length, 10)} recent mistakes`, sub: repeated.length ? `${repeated.length} keep coming back` : 'Fresh misses fade fastest', mins: Math.min(open.length, 10) * 1.5, href: `/practice?set=mistakes&count=${open.length > 10 ? 20 : 10}`, cta: 'Start', tone: 'bg-[#fff1ed] text-[#a34c3e]' });
  weak.slice(0, 2).forEach((t: ProgressTopic) => tasks.push({ id: `weak-${t.id}`, title: `Strengthen ${t.name}`, sub: `${t.accuracy ?? 0}% accuracy${t.subject ? ` · ${t.subject}` : ''}`, mins: 12, href: `/practice?topic=${t.id}`, cta: 'Practice', tone: 'bg-[#fff0cb] text-[#8a5a12]' }));
  if (r?.topic && r.topic.state !== 'review') tasks.push({ id: `resume-${r.topic.id}`, title: `${r.topic.state === 'continue' ? 'Finish' : 'Start'} ${r.topic.name}`, sub: `${r.topic.attempted}/${r.topic.questionCount} done · ${r.name}`, mins: Math.max(5, Math.round((r.topic.questionCount - r.topic.attempted) * 1.2)), href: `/practice?topic=${r.topic.id}`, cta: 'Continue', tone: 'bg-[#dceaf1] text-[#32647b]' });
  tasks.push({ id: 'cards', title: 'Review due flashcards', sub: 'Spaced repetition keeps it stuck', mins: 8, href: '/flashcards', cta: 'Review', tone: 'bg-[#e6f3ed] text-[#287058]' });
  const doneCount = tasks.filter((t) => done.includes(t.id)).length;
  const pct = Math.round((doneCount / tasks.length) * 100);
  const C = 2 * Math.PI * 30;

  const byTopic = new Map<string, Miss[]>();
  for (const m of open) { const k = m.topicId ? topicName.get(m.topicId) ?? `Topic #${m.topicId}` : 'Other questions'; byTopic.set(k, [...(byTopic.get(k) ?? []), m]); }
  const shown = sub === 'repeated' ? repeated : open;

  return <div className="max-w-4xl" data-testid="page-study-hub">
    <SectionHeader eyebrow="Study desk" title="Today's study plan" description="Built from your weak topics, unfinished work and recent mistakes."
      action={<SegToggle<Tab> value={tab} onChange={setTab} ariaLabel="Study hub sections" testIdPrefix="study-tab" options={[{ value: 'plan', label: 'Plan' }, { value: 'mistakes', label: `Mistakes${open.length ? ` · ${open.length}` : ''}` }, { value: 'weak', label: 'Weak areas' }]} />} />

    {tab === 'plan' && <div className="grid gap-4">
      <div className="pf-edit flex items-center gap-4 rounded-3xl border border-border bg-card p-4" style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / .09), transparent 60%)' }}>
        <div className="relative size-[4.5rem] shrink-0"><svg viewBox="0 0 72 72" className="pf-ring size-full" style={{ ['--c3' as never]: 'hsl(var(--primary))' }}><circle className="pf-ring__bg" cx="36" cy="36" r="30" strokeWidth="7" style={{ stroke: 'hsl(var(--muted))' }} /><circle className="pf-ring__fg" cx="36" cy="36" r="30" strokeWidth="7" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ filter: 'none' }} /></svg><div className="absolute inset-0 grid place-items-center font-display text-lg">{pct}%</div></div>
        <div className="min-w-0"><div className="font-display text-xl leading-tight">{doneCount === tasks.length ? 'Plan complete — well done' : `${tasks.length - doneCount} step${tasks.length - doneCount === 1 ? '' : 's'} left today`}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarCheck size={12} /> ~{Math.round(tasks.filter((t) => !done.includes(t.id)).reduce((a, t) => a + t.mins, 0))} min</span>{(streak.data?.currentStreak ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-[#8d6420]"><Flame size={12} /> {streak.data?.currentStreak}-day streak</span>}</div></div>
      </div>
      {tasks.map((t, i) => <Task key={t.id} n={i + 1} {...t} done={done.includes(t.id)} onDone={() => toggle(t.id)} />)}
      {!weak.length && !open.length && <p className="text-center text-[11px] text-muted-foreground">Answer a few practice sessions and this plan will sharpen itself around your weak spots.</p>}
    </div>}

    {tab === 'mistakes' && <div className="grid gap-3">
      {!open.length ? <EmptyState icon={Check} title="No open mistakes" body="Missed questions from your practice sessions on this device collect here until you get them right twice in a row." action={<Link href="/blocks" className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground">Start practising</Link>} /> : <>
        <div className="flex flex-wrap items-center gap-2">
          <SegToggle<'recent' | 'repeated' | 'topic'> value={sub} onChange={setSub} ariaLabel="Mistake view" testIdPrefix="mistake-view" options={[{ value: 'recent', label: 'Recent' }, { value: 'repeated', label: `Repeated · ${repeated.length}` }, { value: 'topic', label: 'By topic' }]} />
          <Link href={`/practice?set=mistakes&count=${open.length > 10 ? 20 : 10}`} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground" data-testid="button-retry-mistakes"><Repeat2 size={13} /> Retry mistakes</Link>
          <button onClick={() => { if (confirm('Clear the mistake list on this device?')) { clearLedger(); setTick((x) => x + 1); } }} aria-label="Clear mistake list" className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
        </div>
        {sub === 'topic' ? [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, list]) => <div key={name} className="grid gap-2"><div className="mt-2 flex items-center gap-2 text-xs font-extrabold"><Layers size={13} className="text-primary" />{name}<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{list.length}</span></div>{list.slice(0, 6).map((m) => <MistakeRow key={m.id} m={m} />)}</div>)
          : !shown.length ? <EmptyState icon={Repeat2} title="Nothing repeated yet" body="Questions you miss twice or more will be pinned here." /> : shown.slice(0, 40).map((m) => <MistakeRow key={m.id} m={m} topic={m.topicId ? topicName.get(m.topicId) : undefined} />)}
        <p className="text-center text-[10px] text-muted-foreground">Tracked on this device from your practice sessions.</p></>}
    </div>}

    {tab === 'weak' && <div className="grid gap-3">
      {!weak.length ? <EmptyState icon={Target} title="No weak areas yet" body="Once you've answered enough questions in a topic, the ones below 70% show up here." /> : <>
        <div className="pf-edit rounded-3xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm font-extrabold"><Zap size={15} className="text-primary" /> Practice weak areas</div><p className="mt-1 text-[11px] text-muted-foreground">A mixed set drawn evenly from your weakest topics.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">{[10, 20, 50].map((n) => <Link key={n} href={`/practice?set=weak&count=${n}`} className="rounded-2xl border border-border bg-background py-3 text-center transition-transform hover:-translate-y-0.5 active:scale-95" data-testid={`button-weak-${n}`}><div className="font-display text-2xl">{n}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">questions</div></Link>)}</div></div>
        {weak.map((t) => <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"><AlertTriangle size={16} className="shrink-0 text-[#c9584a]" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold">{t.name}</div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#c9584a]" style={{ width: `${t.accuracy ?? 0}%` }} /></div><div className="mt-1 text-[10px] font-bold text-muted-foreground">{t.accuracy ?? 0}% · {t.answered} answered{t.subject ? ` · ${t.subject}` : ''}</div></div><Link href={`/practice?topic=${t.id}`} className="rounded-xl border border-border px-3 py-2 text-[11px] font-extrabold hover:bg-muted">Practice</Link></div>)}</>}
    </div>}
  </div>;
}

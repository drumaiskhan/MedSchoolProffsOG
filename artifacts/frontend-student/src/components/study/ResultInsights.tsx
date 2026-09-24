// v60 — performance insights shown under the MCQ result score. Pure derivation from the session; no API.
import { Link } from 'wouter';
import { Brain, Target, Zap } from 'lucide-react';
import type { Mcq } from '@workspace/api-client-react';
import { cn } from '@/lib/shared';

const STOP = new Set(['which', 'following', 'patient', 'most', 'likely', 'would', 'about', 'these', 'their', 'there', 'where', 'what', 'years', 'presents', 'shows', 'because', 'after', 'between', 'should', 'cause', 'caused', 'best', 'next', 'statement', 'true', 'false', 'correct', 'answer', 'being', 'therefore', 'seen', 'found', 'used']);
const terms = (s: string) => (s.toLowerCase().match(/[a-z]{6,}/g) ?? []).filter((w) => !STOP.has(w));

export function ResultInsights({ mcqs, answers }: { mcqs: Mcq[]; answers: Record<number, string | null> }) {
  const answered = mcqs.filter((m) => answers[m.id] != null);
  if (answered.length < 3) return null;
  const isOk = (m: Mcq) => answers[m.id] === m.correctAnswer;
  const wrong = answered.filter((m) => !isOk(m));
  const byDiff = ['easy', 'moderate', 'hard'].map((d) => { const xs = answered.filter((m) => (m.difficulty || 'moderate').toLowerCase() === d); return { d, n: xs.length, pct: xs.length ? Math.round((xs.filter(isOk).length / xs.length) * 100) : null }; }).filter((x) => x.n > 0);
  // Weak concepts = terms that show up in missed questions more than in correct ones.
  const score = new Map<string, number>();
  for (const m of answered) for (const w of new Set(terms(m.question + ' ' + m.options.join(' ')))) score.set(w, (score.get(w) ?? 0) + (isOk(m) ? -1 : 2));
  const concepts = [...score.entries()].filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
  const tone = (pct: number) => (pct >= 75 ? 'bg-[#287058]' : pct >= 50 ? 'bg-[#e5a952]' : 'bg-[#c9584a]');
  const weakest = [...byDiff].filter((x) => x.pct !== null).sort((a, b) => (a.pct as number) - (b.pct as number))[0];
  return <div className="mx-auto mt-6 grid max-w-3xl gap-3 md:grid-cols-2" data-testid="card-result-insights">
    <div className="pf-edit rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground"><Target size={12} className="text-primary" /> Accuracy by difficulty</div>
      <div className="mt-3 space-y-2.5">{byDiff.map((x) => <div key={x.d}><div className="flex justify-between text-xs font-bold"><span className="capitalize">{x.d} <span className="font-medium text-muted-foreground">· {x.n}</span></span><span>{x.pct}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-[width] duration-700', tone(x.pct ?? 0))} style={{ width: `${x.pct}%` }} /></div></div>)}</div>
      {weakest && (weakest.pct as number) < 70 && <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Your softest spot this round: <b className="capitalize text-foreground">{weakest.d}</b> questions.</p>}
    </div>
    <div className="pf-edit rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground"><Brain size={12} className="text-primary" /> Weak concepts</div>
      {concepts.length ? <div className="mt-3 flex flex-wrap gap-1.5">{concepts.map((c) => <span key={c} className="rounded-full bg-[#fff0cb] px-2.5 py-1 text-[11px] font-bold capitalize text-[#8a5a12]">{c}</span>)}</div>
        : <p className="mt-3 text-xs leading-5 text-muted-foreground">{wrong.length ? 'Your misses were spread across different ideas — no single concept stands out.' : 'Clean sheet — nothing to flag.'}</p>}
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Terms that appeared more in questions you missed than in ones you got right.</p>
    </div>
    <div className="pf-edit flex flex-wrap items-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 p-4 md:col-span-2">
      <div className="mr-auto flex items-center gap-1.5 text-xs font-extrabold"><Zap size={14} className="text-primary" /> Recommended next</div>
      {!!wrong.length && <Link href={`/practice?set=mistakes&count=${wrong.length >= 20 ? 20 : 10}`} className="rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground" data-testid="link-retry-mistakes">Retry my mistakes</Link>}
      <Link href="/practice?set=weak&count=20" className="rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-extrabold" data-testid="link-practice-weak">Practice weak areas</Link>
      <Link href="/study" className="rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-extrabold">Today's plan</Link>
    </div>
  </div>;
}

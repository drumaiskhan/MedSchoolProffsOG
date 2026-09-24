// v60 — Content Quality Center: health dashboard · duplicate finder · review workflow.
// Built only on existing endpoints (GET /admin/mcqs, /flagged-mcqs, explanation-status, generate-explanation, publish, DELETE /mcqs/:id).
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BookMarked, CheckCircle2, Copy, FileWarning, Flag, Loader2, Rocket, ShieldCheck, Sparkles, Wand2, X } from 'lucide-react';
import { explanationsApi, flaggedMcqsApi, mcqAdminApi, type AdminMcqRow, type FlaggedMcq } from '@/lib/api';
import { Badge, ConfirmDialog, EmptyState, ErrorState, SectionHeader, SkeletonPage, cn } from '@/lib/shared';
import { toast } from '@/hooks/use-toast';
import { findDuplicates, hasExplanation, hasReference, invalidReasons, stageOf, type DupPair, type Stage } from '@/lib/contentQuality';

type Tab = 'health' | 'duplicates' | 'workflow';
type Issue = 'invalid' | 'noExplanation' | 'noReference' | 'reported';
const DISMISS = 'msp.admin.dupes.dismissed';
const dismissedSet = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(DISMISS) ?? '[]')); } catch { return new Set(); } };
const STAGES: Array<{ id: Stage; label: string; hint: string; tone: string }> = [
  { id: 'draft', label: 'Draft', hint: 'Needs an explanation or work', tone: 'bg-muted' },
  { id: 'review', label: 'In review', hint: 'Explanation written, awaiting sign-off', tone: 'bg-info/15' },
  { id: 'approved', label: 'Approved', hint: 'Ready to publish', tone: 'bg-primary/10' },
  { id: 'published', label: 'Published', hint: 'Live for students', tone: 'bg-accent/20' },
];
const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n) + '…' : s);

function Stat({ icon: Icon, label, value, tone, active, onClick }: { icon: typeof Flag; label: string; value: number; tone: string; active?: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={cn('rounded-2xl border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[.98]', active ? 'border-primary ring-2 ring-primary/20' : 'border-border')} data-testid={`stat-${label}`}>
    <div className={cn('grid size-8 place-items-center rounded-lg', tone)}><Icon size={15} /></div>
    <div className="mt-2 font-display text-2xl leading-none">{value}</div><div className="mt-1 text-[11px] font-bold text-muted-foreground">{label}</div>
  </button>;
}

/** "X done · Y remaining" bar for a running AI batch-fix (dedupe, invalid
 * repair, or both) — total is a snapshot of the count when the run
 * started, so the bar fills smoothly even though the underlying list it's
 * drawn from shrinks and gets re-fetched between rounds. */
function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100;
  return <div className="rounded-2xl border border-border bg-card p-3.5 animate-in fade-in slide-in-from-top-1 duration-200" data-testid="progress-ai-fix">
    <div className="flex items-center justify-between text-[11px] font-bold"><span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin text-primary" /> {label}</span><span className="text-muted-foreground">{done} of {total} done{done < total ? ` · ${total - done} remaining` : ''}</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-violet transition-all duration-500" style={{ width: `${pct}%` }} /></div>
  </div>;
}

function Compare({ pair, onClose, onDelete }: { pair: DupPair; onClose: () => void; onDelete: (id: number) => void }) {
  const cols = [pair.a, pair.b];
  const sameOpts = (o: string, other: AdminMcqRow) => other.options.includes(o);
  return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/40 p-3 animate-in fade-in duration-200" onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl rounded-3xl bg-card p-4 shadow-2xl animate-in zoom-in-95 duration-200 md:p-6" data-testid="dialog-compare">
      <div className="flex items-center justify-between"><div><div className="font-display text-xl">Side-by-side comparison</div><div className="text-[11px] font-bold text-muted-foreground">{Math.round(pair.score * 100)}% similar question wording</div></div><button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-xl hover:bg-muted"><X size={16} /></button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{cols.map((m, ci) => { const other = cols[1 - ci]; return <div key={m.id} className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><span>#{m.id} · {m.status} · {m.difficulty}</span><span>{new Date(m.createdAt).toLocaleDateString()}</span></div>
        <p className="mt-2 text-sm font-semibold leading-6">{m.question}</p>
        <div className="mt-3 space-y-1.5">{m.options.map((o) => <div key={o} className={cn('rounded-lg px-2.5 py-1.5 text-xs', o === m.correctAnswer ? 'bg-primary/10 font-bold text-primary' : 'bg-muted/60', !sameOpts(o, other) && 'ring-1 ring-accent')}>{o}{!sameOpts(o, other) && <span className="ml-1.5 text-[9px] font-extrabold uppercase text-accent-text">differs</span>}</div>)}</div>
        <div className="mt-3 line-clamp-3 text-[11px] leading-5 text-muted-foreground">{m.explanation ? clip(m.explanation, 220) : 'No explanation'}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{m.correctAnswer !== other.correctAnswer && <Badge tone="amber">Different answer key</Badge>}{!hasReference(m) && <Badge tone="red">No reference</Badge>}</div>
        <button onClick={() => onDelete(m.id)} className="mt-3 w-full rounded-xl border border-destructive/30 py-2 text-xs font-extrabold text-destructive hover:bg-destructive/5" data-testid={`button-delete-${m.id}`}>Delete this copy</button>
      </div>; })}</div>
    </div>
  </div>;
}

export default function AdminQualityCenter() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('health');
  const [issue, setIssue] = useState<Issue>('invalid');
  const [cmp, setCmp] = useState<DupPair | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(dismissedSet);
  const mcqs = useQuery({ queryKey: ['admin-mcqs-all'], queryFn: mcqAdminApi.list });
  const flags = useQuery({ queryKey: ['admin-flags'], queryFn: flaggedMcqsApi.list });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-mcqs-all'] }); qc.invalidateQueries({ queryKey: ['admin-flags'] }); };
  const fail = (e: unknown) => toast({ title: 'Action failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
  const setStatus = useMutation({ mutationFn: (v: { id: number; s: 'REVIEWED' | 'APPROVED' }) => explanationsApi.setStatus(v.id, v.s), onSuccess: refresh, onError: fail });
  const gen = useMutation({ mutationFn: (id: number) => explanationsApi.generate(id), onSuccess: () => { refresh(); toast({ title: 'Explanation drafted', description: 'Sent to Draft → review it, then approve.' }); }, onError: fail });
  const bulkGen = useMutation({ mutationFn: (ids: number[]) => explanationsApi.bulkGenerate({ mcqIds: ids }), onSuccess: (r) => { refresh(); toast({ title: `Drafted ${r.generated} explanations`, description: r.failed ? `${r.failed} failed` : undefined }); }, onError: fail });
  const publish = useMutation({ mutationFn: (id: number) => mcqAdminApi.publish(id), onSuccess: refresh, onError: fail });
  const resolve = useMutation({ mutationFn: (id: number) => flaggedMcqsApi.updateStatus(id, 'resolved'), onSuccess: refresh, onError: fail });
  const remove = useMutation({ mutationFn: (id: number) => mcqAdminApi.remove(id), onSuccess: () => { setDel(null); setCmp(null); refresh(); toast({ title: 'Question deleted' }); }, onError: fail });

  // "AI Fix" actions — three entry points (the header's combined "AI Fix
  // All", the Duplicates tab's own button, and the Invalid stat/list's own
  // button) all share the same underlying batch loops so there's exactly
  // one place that knows about the 8-per-call cap / re-fetch-between-rounds
  // pattern used to dodge the hosting gateway's timeout (see the batch
  // routes' own comments in explanations.ts for why 8 and why re-fetch).
  // busyKind gates all three buttons at once — only one fix run at a time,
  // so a click on one button can't race a dedupe/repair the other kicked
  // off. progress tracks the currently-running loop for the shared
  // ProgressBar; total is a snapshot taken when that loop starts.
  const [busyKind, setBusyKind] = useState<null | 'all' | 'duplicates' | 'invalid'>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const MAX_FIX_ROUNDS = 15;

  const fixDuplicatesLoop = async (initialDupes: DupPair[]) => {
    const total = initialDupes.length;
    setProgress({ done: 0, total });
    let currentRows = rows;
    let currentDupes = initialDupes;
    let fixedTotal = 0;
    for (let round = 0; round < MAX_FIX_ROUNDS && currentDupes.length; round++) {
      const batch = currentDupes.slice(0, 8);
      const { fixed } = await mcqAdminApi.dedupeBatch(batch.map((p) => ({ id: p.b.id, otherId: p.a.id })));
      fixedTotal += fixed;
      currentRows = await mcqAdminApi.list();
      currentDupes = findDuplicates(currentRows).filter((p) => !hidden.has(`${p.a.id}-${p.b.id}`));
      setProgress({ done: Math.max(0, total - currentDupes.length), total });
    }
    return { fixedTotal, remaining: currentDupes.length };
  };

  const fixInvalidLoop = async () => {
    let currentRows = rows;
    let currentInvalid = currentRows.filter((m) => invalidReasons(m).length);
    const total = currentInvalid.length;
    setProgress({ done: 0, total });
    let fixedTotal = 0;
    for (let round = 0; round < MAX_FIX_ROUNDS && currentInvalid.length; round++) {
      const batch = currentInvalid.slice(0, 8);
      const { fixed } = await mcqAdminApi.repairInvalidBatch(batch.map((m) => ({ id: m.id, reasons: invalidReasons(m) })));
      fixedTotal += fixed;
      currentRows = await mcqAdminApi.list();
      currentInvalid = currentRows.filter((m) => invalidReasons(m).length);
      setProgress({ done: Math.max(0, total - currentInvalid.length), total });
    }
    return { fixedTotal, remaining: currentInvalid.length };
  };

  const runAiFixAll = async () => {
    setBusyKind('all');
    try {
      if (openFlags.length) {
        const r = await flaggedMcqsApi.resolveAll();
        toast({ title: `Resolved ${r.resolved} reported question${r.resolved === 1 ? '' : 's'}` });
      }
      const { fixedTotal, remaining } = await fixDuplicatesLoop(dupes);
      refresh();
      toast({ title: 'AI Fix All complete', description: `${fixedTotal} duplicate question${fixedTotal === 1 ? '' : 's'} rewritten by AI.${remaining ? ` ${remaining} pairs left — run it again to keep going.` : ''}` });
    } catch (e) {
      fail(e);
    } finally {
      setBusyKind(null);
      setProgress(null);
    }
  };

  const runAiFixDuplicates = async () => {
    setBusyKind('duplicates');
    try {
      const { fixedTotal, remaining } = await fixDuplicatesLoop(dupes);
      refresh();
      toast({ title: 'Duplicates fixed', description: `${fixedTotal} question${fixedTotal === 1 ? '' : 's'} rewritten by AI.${remaining ? ` ${remaining} pairs left — run it again to keep going.` : ''}` });
    } catch (e) {
      fail(e);
    } finally {
      setBusyKind(null);
      setProgress(null);
    }
  };

  const runAiFixInvalid = async () => {
    setBusyKind('invalid');
    try {
      const { fixedTotal, remaining } = await fixInvalidLoop();
      refresh();
      toast({ title: 'Invalid questions fixed', description: `${fixedTotal} question${fixedTotal === 1 ? '' : 's'} repaired by AI.${remaining ? ` ${remaining} left — run it again to keep going.` : ''}` });
    } catch (e) {
      fail(e);
    } finally {
      setBusyKind(null);
      setProgress(null);
    }
  };

  const rows: AdminMcqRow[] = mcqs.data ?? [];
  const openFlags = useMemo(() => (flags.data ?? []).filter((f: FlaggedMcq) => f.status === 'open' && !f.mcqDeleted), [flags.data]);
  const dupes = useMemo(() => findDuplicates(rows).filter((p) => !hidden.has(`${p.a.id}-${p.b.id}`)), [rows, hidden]);
  if (mcqs.isLoading) return <SkeletonPage />;
  if (mcqs.isError) return <ErrorState retry={() => mcqs.refetch()} />;

  const invalid = rows.filter((m) => invalidReasons(m).length);
  const noExp = rows.filter((m) => !hasExplanation(m));
  const noRef = rows.filter((m) => !hasReference(m));
  const problem = new Set([...invalid, ...noExp, ...noRef].map((m) => m.id)); openFlags.forEach((f) => problem.add(f.mcqId));
  const health = rows.length ? Math.round(((rows.length - problem.size) / rows.length) * 100) : 100;
  const byStage = (st: Stage) => rows.filter((m) => stageOf(m) === st);
  const approved = byStage('approved');
  const C = 2 * Math.PI * 34;

  const list: Array<{ m?: AdminMcqRow; id: number; text: string; note: string; action: React.ReactNode }> =
    issue === 'invalid' ? invalid.map((m) => ({ m, id: m.id, text: m.question, note: invalidReasons(m).join(' · '), action: <Link href="/admin/mcqs" className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-[11px] font-extrabold hover:bg-muted">Fix in bank <ArrowRight size={11} /></Link> }))
    : issue === 'noExplanation' ? noExp.map((m) => ({ m, id: m.id, text: m.question, note: 'No explanation yet', action: <button disabled={gen.isPending} onClick={() => gen.mutate(m.id)} className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground disabled:opacity-50"><Sparkles size={11} /> Draft with AI</button> }))
    : issue === 'noReference' ? noRef.map((m) => ({ m, id: m.id, text: m.question, note: 'No reference / source cited', action: <Link href="/admin/mcqs" className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-[11px] font-extrabold hover:bg-muted">Add in bank <ArrowRight size={11} /></Link> }))
    : openFlags.map((f) => ({ id: f.mcqId, text: f.question ?? '', note: `${f.reason || 'No reason given'}${f.path ? ` · ${f.path}` : ''}`, action: <button onClick={() => resolve.mutate(f.id)} className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground"><CheckCircle2 size={11} /> Resolve</button> }));

  return <div data-testid="page-quality-center">
    <SectionHeader eyebrow="Question bank" title="Content Quality Center" action={<div className="flex flex-wrap items-center gap-2">
      <button
        disabled={busyKind !== null || (!openFlags.length && !dupes.length)}
        onClick={runAiFixAll}
        title="Resolves every reported question and has AI rewrite duplicate questions so they're no longer near-copies"
        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-violet px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        data-testid="button-ai-fix-all"
      >{busyKind === 'all' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {busyKind === 'all' ? 'Working…' : 'AI Fix All'}</button>
      <div className="flex overflow-hidden rounded-xl border border-border bg-card text-xs font-extrabold">{(['health', 'duplicates', 'workflow'] as Tab[]).map((t) => <button key={t} onClick={() => setTab(t)} className={cn('px-3.5 py-2 capitalize transition-colors', tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t === 'duplicates' ? `Duplicates${dupes.length ? ` · ${dupes.length}` : ''}` : t}</button>)}</div>
    </div>} />

    {progress && <div className="mb-4">
      <ProgressBar label={busyKind === 'invalid' ? 'Repairing invalid questions with AI…' : 'Rewriting duplicates with AI…'} done={progress.done} total={progress.total} />
    </div>}


    {tab === 'health' && <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-5 rounded-3xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="relative size-24 shrink-0"><svg viewBox="0 0 80 80" className="size-full -rotate-90"><circle cx="40" cy="40" r="34" fill="none" strokeWidth="8" className="stroke-muted" /><circle cx="40" cy="40" r="34" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - health / 100)} className={cn('transition-[stroke-dashoffset] duration-1000', health >= 85 ? 'stroke-primary' : health >= 60 ? 'stroke-accent' : 'stroke-destructive')} /></svg><div className="absolute inset-0 grid place-items-center font-display text-2xl">{health}%</div></div>
        <div className="min-w-0 flex-1"><div className="font-display text-xl">Content health</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{rows.length} questions checked · {problem.size} need attention · {approved.length} approved and ready to publish.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!!noExp.length && <button disabled={bulkGen.isPending} onClick={() => bulkGen.mutate(noExp.slice(0, 25).map((m) => m.id))} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-bulk-explain"><Sparkles size={12} /> {bulkGen.isPending ? 'Drafting…' : `Draft ${Math.min(25, noExp.length)} explanations`}</button>}
            {!!approved.length && <button onClick={() => setTab('workflow')} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-extrabold hover:bg-muted"><Rocket size={12} /> Publish {approved.length} approved</button>}
            {!!dupes.length && <button onClick={() => setTab('duplicates')} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-extrabold hover:bg-muted"><Copy size={12} /> Review {dupes.length} duplicates</button>}
          </div></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={AlertTriangle} label="Invalid" value={invalid.length} tone="bg-destructive/10 text-destructive" active={issue === 'invalid'} onClick={() => setIssue('invalid')} />
        <Stat icon={FileWarning} label="No explanation" value={noExp.length} tone="bg-accent/20 text-accent-text" active={issue === 'noExplanation'} onClick={() => setIssue('noExplanation')} />
        <Stat icon={BookMarked} label="No reference" value={noRef.length} tone="bg-info/15 text-info" active={issue === 'noReference'} onClick={() => setIssue('noReference')} />
        <Stat icon={Flag} label="Reported" value={openFlags.length} tone="bg-violet/15 text-violet" active={issue === 'reported'} onClick={() => setIssue('reported')} />
      </div>
      {issue === 'invalid' && !!invalid.length && <button disabled={busyKind !== null} onClick={runAiFixInvalid} className="inline-flex items-center gap-1.5 self-start rounded-xl bg-gradient-to-r from-primary to-violet px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0" data-testid="button-ai-fix-invalid">{busyKind === 'invalid' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Fix {invalid.length} invalid with AI</button>}
      {!list.length ? <EmptyState icon={ShieldCheck} title="All clear" body="Nothing in this category needs attention." /> : <div className="grid gap-2">{list.slice(0, 60).map((r, i) => <div key={`${issue}-${r.id}-${i}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3.5 animate-in fade-in slide-in-from-bottom-1 duration-300" data-testid={`issue-row-${r.id}`}>
        <div className="min-w-0 flex-1"><div className="line-clamp-2 text-xs font-semibold leading-5">{r.text}</div><div className="mt-1 text-[10px] font-bold text-muted-foreground">#{r.id} · {r.note}</div></div>{r.action}</div>)}{list.length > 60 && <p className="text-center text-[11px] text-muted-foreground">Showing 60 of {list.length}.</p>}</div>}
    </div>}

    {tab === 'duplicates' && <div className="grid gap-3">
      {!!dupes.length && <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5"><div className="text-xs text-muted-foreground">AI rewrites the second question in each pair so it tests the same fact but no longer reads as a copy.</div><button disabled={busyKind !== null} onClick={runAiFixDuplicates} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-violet px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0" data-testid="button-ai-fix-duplicates">{busyKind === 'duplicates' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Fix {dupes.length} with AI</button></div>}
      {!dupes.length ? <EmptyState icon={Copy} title="No likely duplicates" body="Questions with very similar wording would appear here for side-by-side review." /> : dupes.map((p) => <div key={`${p.a.id}-${p.b.id}`} className="rounded-2xl border border-border bg-card p-3.5 animate-in fade-in duration-300" data-testid={`dupe-${p.a.id}-${p.b.id}`}>
        <div className="grid gap-2 md:grid-cols-2">{[p.a, p.b].map((m) => <div key={m.id} className="rounded-xl bg-muted/50 p-2.5 text-xs leading-5"><div className="text-[10px] font-bold text-muted-foreground">#{m.id}</div><div className="line-clamp-2 font-semibold">{m.question}</div></div>)}</div>
        <div className="mt-2.5 flex items-center gap-2"><Badge tone={p.score > 0.9 ? 'red' : 'amber'}>{Math.round(p.score * 100)}% similar</Badge><button onClick={() => setCmp(p)} className="ml-auto rounded-xl bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground" data-testid="button-compare">Compare</button><button onClick={() => { const next = new Set(hidden).add(`${p.a.id}-${p.b.id}`); setHidden(next); try { localStorage.setItem(DISMISS, JSON.stringify([...next])); } catch { /* ignore */ } }} className="rounded-xl border border-border px-3 py-1.5 text-[11px] font-extrabold hover:bg-muted">Not a duplicate</button></div>
      </div>)}
      <p className="text-center text-[10px] text-muted-foreground">"Not a duplicate" is remembered in this browser only.</p>
    </div>}

    {tab === 'workflow' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{STAGES.map((st) => { const items = byStage(st.id); return <div key={st.id} className="rounded-3xl border border-border bg-card p-3.5" data-testid={`stage-${st.id}`}>
      <div className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', st.tone, 'ring-1 ring-black/10')} /><div className="text-sm font-extrabold">{st.label}</div><span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{items.length}</span></div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{st.hint}</div>
      {st.id === 'approved' && !!items.length && <button disabled={publish.isPending} onClick={async () => { for (const m of items.slice(0, 100)) await publish.mutateAsync(m.id).catch(() => undefined); toast({ title: 'Published approved questions' }); }} className="mt-2 w-full rounded-xl bg-primary py-2 text-[11px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-publish-approved"><Rocket size={11} className="mr-1 inline" />Publish {Math.min(items.length, 100)}</button>}
      <div className="mt-2.5 grid gap-2">{items.slice(0, 12).map((m) => <div key={m.id} className="rounded-xl bg-muted/50 p-2.5"><div className="line-clamp-2 text-[11px] font-semibold leading-4">{m.question}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {st.id === 'draft' && (hasExplanation(m) ? <button onClick={() => setStatus.mutate({ id: m.id, s: 'REVIEWED' })} className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-extrabold text-primary-foreground">Send to review</button> : <button onClick={() => gen.mutate(m.id)} className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-extrabold">Draft explanation</button>)}
          {st.id === 'review' && (invalidReasons(m).length ? <span className="text-[10px] font-bold text-destructive">{invalidReasons(m)[0]}</span> : <button onClick={() => setStatus.mutate({ id: m.id, s: 'APPROVED' })} className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-extrabold text-primary-foreground">Approve</button>)}
          {st.id === 'approved' && <button onClick={() => publish.mutate(m.id)} className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-extrabold text-primary-foreground">Publish</button>}
        </div></div>)}{items.length > 12 && <div className="text-center text-[10px] text-muted-foreground">+{items.length - 12} more</div>}{!items.length && <div className="py-4 text-center text-[11px] text-muted-foreground">Empty</div>}</div>
    </div>; })}</div>}

    {cmp && <Compare pair={cmp} onClose={() => setCmp(null)} onDelete={(id) => setDel(id)} />}
    {del !== null && <ConfirmDialog title="Delete this question?" body="It's archived out of the bank and disappears for students. Keep the other copy." confirmLabel="Delete" pendingLabel="Deleting…" pending={remove.isPending} onConfirm={() => remove.mutate(del)} onCancel={() => setDel(null)} />}
  </div>;
}

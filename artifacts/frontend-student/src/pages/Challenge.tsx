// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Swords, Search, Share2, CheckCircle2, XCircle, Clock3, Trophy, ArrowLeft, X, GraduationCap, SlidersHorizontal } from 'lucide-react';
import { authApi, blocksApi, type Block, challengesApi, ApiRequestError, type ChallengeOpponent, type ChallengeSummary } from '@/lib/api';
import { getGetCurrentUserQueryKey, useListModules, useListSubjects, useListTopics } from '@workspace/api-client-react';
import { EmptyState, SectionHeader, SkeletonPage, Badge, cn, initials, BrandSpinner } from '@/lib/shared';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChallengeAchievements } from '@/components/ChallengeAchievements';
import { ChallengeShareDialog, shareableVerdict } from '@/components/ChallengeShareDialog';
import { computeChallengeAchievements } from '@/lib/challengeAchievements';

const QUESTION_COUNT_PRESETS = [5, 10, 15, 20];

// ---------------------------------------------------------------------------
// Find & challenge a friend
// ---------------------------------------------------------------------------

function FindFriend({ onChallenged }: { onChallenged: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ChallengeOpponent | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [blockId, setBlockId] = useState<number | undefined>();
  const [moduleId, setModuleId] = useState<number | undefined>();
  const [subjectId, setSubjectId] = useState<number | undefined>();
  const [topicId, setTopicId] = useState<number | undefined>();

  // Only same-year, same-program (MBBS/BDS) classmates can be challenged —
  // enforced server-side too, but we check here first so the search box
  // never even opens for a student whose profile isn't set up for it.
  const me = useQuery({ queryKey: getGetCurrentUserQueryKey(), queryFn: authApi.me });

  const blocksQ = useQuery({ queryKey: ['blocks'], queryFn: blocksApi.list });
  const modulesQ = useListModules();
  const subjectsQ = useListSubjects(moduleId ? { moduleId } : undefined, { query: { enabled: !!moduleId } });
  const topicsQ = useListTopics(subjectId ? { subjectId } : undefined, { query: { enabled: !!subjectId } });

  const modulesInBlock = (modulesQ.data || []).filter((m) => !blockId || m.blockId === blockId);

  const search = useQuery({
    queryKey: ['challenge-search', query],
    queryFn: () => challengesApi.findStudents(query),
    enabled: query.trim().length >= 2,
  });

  const create = useMutation({
    mutationFn: () => challengesApi.create({ opponentId: selected!.id, blockId, moduleId, subjectId, topicId, totalQuestions }),
    onSuccess: (res) => {
      toast({ title: 'Challenge sent!', description: `${res.opponent.name} has been notified.` });
      setSelected(null); setQuery('');
      onChallenged();
    },
    onError: (err: unknown) => toast({ title: 'Could not send challenge', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const missingProfile = !me.isLoading && (!me.data?.programKind || me.data?.yearNumber == null);

  if (me.isLoading) return <div className="rounded-3xl border border-border bg-card p-6"><BrandSpinner size={16} /></div>;

  if (missingProfile) {
    return <div className="rounded-3xl border border-border bg-card p-6">
      <p className="text-sm font-extrabold">Find a friend</p>
      <EmptyState icon={GraduationCap} title="Complete your profile first" body="Your program (MBBS/BDS) and academic year need to be set before you can find and challenge classmates." action={<Link href="/profile" className="text-xs font-bold text-primary underline" data-testid="link-complete-profile">Go to profile</Link>} />
    </div>;
  }

  return <div className="rounded-3xl border border-border bg-card p-6">
    <p className="text-sm font-extrabold">Find a friend</p>
    <p className="mt-1 text-[11px] text-muted-foreground">Search by name, email, phone, or roll number — only {me.data?.programKind}{me.data?.academicYear ? ` · ${me.data.academicYear}` : ''} classmates show up.</p>
    <div className="relative mt-4">
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Ayesha, roll number, or email" className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-friend-search" />
    </div>

    {query.trim().length >= 2 && <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
      {search.isLoading && <p className="py-3 text-center text-xs text-muted-foreground">Searching…</p>}
      {!search.isLoading && (search.data || []).length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No classmates found in your program &amp; year.</p>}
      {(search.data || []).map((s) => <button key={s.id} onClick={() => setSelected(s)} className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors', selected?.id === s.id ? 'border-primary bg-[#eef7f1]' : 'border-border hover:bg-muted')} data-testid={`button-select-friend-${s.id}`}>
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-[11px] font-extrabold text-[#287058]">{initials(s.name)}</div>
        <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{s.name}</div><div className="truncate text-[10px] text-muted-foreground">{s.email}{s.institution ? ` · ${s.institution}` : ''}</div></div>
        {selected?.id === s.id && <CheckCircle2 size={16} className="shrink-0 text-primary" />}
      </button>)}
    </div>}

    {selected && <div className="mt-4 space-y-3 rounded-2xl bg-muted p-4">
      <div className="flex items-center justify-between text-xs font-bold">Challenging <span className="text-primary">{selected.name}</span><button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground" data-testid="button-clear-friend"><X size={14} /></button></div>

      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><SlidersHorizontal size={12} /> Scope (optional — leave blank for the whole bank)</div>
        {/* Radix Select (same component the Flashcards filters use), not a
            native <select> — see PastPapers.tsx/Register.tsx for the same swap. */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={blockId != null ? String(blockId) : 'all'} onValueChange={(v) => { const val = v === 'all' ? undefined : Number(v); setBlockId(val); setModuleId(undefined); setSubjectId(undefined); setTopicId(undefined); }}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card px-2 text-xs font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid="select-challenge-block">
              <SelectValue placeholder="Any block" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any block</SelectItem>
              {(blocksQ.data || []).map((b: Block) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={moduleId != null ? String(moduleId) : 'all'} onValueChange={(v) => { const val = v === 'all' ? undefined : Number(v); setModuleId(val); setSubjectId(undefined); setTopicId(undefined); }}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card px-2 text-xs font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid="select-challenge-module">
              <SelectValue placeholder="Any module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any module</SelectItem>
              {modulesInBlock.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subjectId != null ? String(subjectId) : 'all'} onValueChange={(v) => { const val = v === 'all' ? undefined : Number(v); setSubjectId(val); setTopicId(undefined); }} disabled={!moduleId}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card px-2 text-xs font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0" data-testid="select-challenge-subject">
              <SelectValue placeholder="Any subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any subject</SelectItem>
              {(subjectsQ.data || []).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={topicId != null ? String(topicId) : 'all'} onValueChange={(v) => setTopicId(v === 'all' ? undefined : Number(v))} disabled={!subjectId}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card px-2 text-xs font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0" data-testid="select-challenge-topic">
              <SelectValue placeholder="Any topic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any topic</SelectItem>
              {(topicsQ.data || []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="block text-[11px] font-bold text-muted-foreground">Number of questions
        <div className="mt-1.5 grid grid-cols-4 gap-2">{QUESTION_COUNT_PRESETS.map((n) => <button key={n} type="button" onClick={() => setTotalQuestions(n)} className={cn('h-9 rounded-lg border text-xs font-bold transition-colors', totalQuestions === n ? 'border-primary bg-[#eef7f1] text-primary' : 'border-border bg-card hover:bg-muted')} data-testid={`button-question-count-${n}`}>{n}</button>)}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <input type="number" min={5} max={30} value={QUESTION_COUNT_PRESETS.includes(totalQuestions) ? '' : totalQuestions} placeholder="Custom (5–30)" onChange={(e) => { const n = Number(e.target.value); if (e.target.value === '') return; setTotalQuestions(Math.min(30, Math.max(5, Number.isFinite(n) ? n : 10))); }} className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-question-count-custom" />
        </div>
      </label>
      <button onClick={() => create.mutate()} disabled={create.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 disabled:opacity-50" data-testid="button-send-challenge">{create.isPending && <BrandSpinner size={13} />}{create.isPending ? 'Sending…' : <><Swords size={14} /> Send challenge</>}</button>
    </div>}
  </div>;
}

// ---------------------------------------------------------------------------
// A single challenge row (sent or received)
// ---------------------------------------------------------------------------

function statusBadge(c: ChallengeSummary) {
  if (c.status === 'DECLINED') return <Badge tone="red">Declined</Badge>;
  if (c.status === 'EXPIRED') return <Badge tone="neutral">Expired</Badge>;
  if (c.status === 'COMPLETED') {
    if (c.myScorePercent == null || c.opponentScorePercent == null) return <Badge tone="blue">Completed</Badge>;
    if (c.myScorePercent > c.opponentScorePercent) return <Badge tone="green">You won</Badge>;
    if (c.myScorePercent < c.opponentScorePercent) return <Badge tone="red">You lost</Badge>;
    return <Badge tone="amber">Tied</Badge>;
  }
  if (!c.iHavePlayed) return <Badge tone="blue">Play now</Badge>;
  return <Badge tone="amber">Waiting on opponent</Badge>;
}

function ChallengeRow({ c, onOpen, onDecline, onShare }: { c: ChallengeSummary; onOpen: () => void; onDecline: () => void; onShare: () => void }) {
  const canPlay = (c.status === 'PENDING') && !c.iHavePlayed;
  const canDecline = c.role === 'opponent' && c.status === 'PENDING' && !c.iHavePlayed;
  return <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-0" data-testid={`row-challenge-${c.id}`}>
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-[11px] font-extrabold text-[#287058]">{c.opponent ? initials(c.opponent.name) : '?'}</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{c.opponent?.name ?? 'Unknown student'}</div>
        <div className="text-[10px] text-muted-foreground">{c.totalQuestions} questions · {c.role === 'challenger' ? 'You challenged them' : 'They challenged you'}</div>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {c.status === 'COMPLETED' && c.myScorePercent != null && c.opponentScorePercent != null && <div className="text-right text-[11px] font-bold text-muted-foreground">{c.myScorePercent}% <span className="text-muted-foreground/60">vs</span> {c.opponentScorePercent}%</div>}
      {statusBadge(c)}
      {canPlay && <button onClick={onOpen} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground" data-testid={`button-play-${c.id}`}>Play</button>}
      {canDecline && <button onClick={onDecline} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid={`button-decline-${c.id}`}>Decline</button>}
      {shareableVerdict(c) && <button onClick={onShare} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-extrabold text-primary hover:bg-primary/15" data-testid={`button-share-${c.id}`}><Share2 size={12} /> Share</button>}
      {c.status === 'COMPLETED' && <button onClick={onOpen} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-muted" data-testid={`button-review-${c.id}`}>Review</button>}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Playing / reviewing a single challenge
// ---------------------------------------------------------------------------

function PlayChallenge({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['challenge', id], queryFn: () => challengesApi.get(id) });
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [startedAt] = useState(() => Date.now());

  const submit = useMutation({
    mutationFn: () => challengesApi.submit(id, {
      answers: (detail.data?.mcqs || []).map((m) => ({ mcqId: m.id, selectedAnswer: answers[m.id] ?? null })),
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['challenge', id] }); qc.invalidateQueries({ queryKey: ['challenges-mine'] }); },
    onError: (err: unknown) => toast({ title: 'Could not submit', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  if (detail.isLoading) return <SkeletonPage />;
  if (detail.isError || !detail.data) return <EmptyState icon={XCircle} title="Couldn't load this challenge" body="It may have been removed or you may not have access to it." action={<button onClick={onClose} className="text-xs font-bold text-primary underline">Back to challenges</button>} />;

  const c = detail.data;
  const alreadyPlayed = !!c.myAttempt;
  const allAnswered = c.mcqs.every((m) => answers[m.id] !== undefined);

  return <div>
    <button onClick={onClose} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="button-back-to-challenges"><ArrowLeft size={14} /> Back to challenges</button>
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-extrabold">Quiz match vs {c.opponent?.name ?? 'friend'}</p><p className="mt-1 text-[11px] text-muted-foreground">{c.mcqs.length} questions</p></div>
        {alreadyPlayed && c.myAttempt && <div className="rounded-xl bg-[#eef7f1] px-3 py-2 text-center"><div className="font-display text-lg text-primary">{c.myAttempt.scorePercent}%</div><div className="text-[9px] font-bold uppercase text-muted-foreground">Your score</div></div>}
      </div>

      <div className="mt-5 space-y-4">
        {c.mcqs.map((m, i) => {
          const mine = answers[m.id];
          const locked = alreadyPlayed;
          return <div key={m.id} className="rounded-2xl border border-border p-4">
            <p className="text-sm font-bold">{i + 1}. {m.question}</p>
            <div className="mt-3 space-y-2">
              {m.options.map((opt) => {
                const isMine = mine === opt;
                const isCorrect = locked && m.correctAnswer === opt;
                const isWrongPick = locked && isMine && m.correctAnswer !== opt;
                return <button key={opt} disabled={locked} onClick={() => setAnswers((a) => ({ ...a, [m.id]: opt }))} className={cn('flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-colors',
                  isCorrect ? 'border-primary bg-[#eef7f1] text-primary' : isWrongPick ? 'border-destructive/40 bg-destructive/10 text-destructive' : isMine ? 'border-primary bg-[#eef7f1]' : 'border-border hover:bg-muted',
                  locked && 'cursor-default')} data-testid={`option-${m.id}-${opt}`}>
                  {isCorrect && <CheckCircle2 size={14} />}{isWrongPick && <XCircle size={14} />}{opt}
                </button>;
              })}
            </div>
            {locked && m.explanation && <p className="mt-2.5 text-[11px] leading-5 text-muted-foreground">{m.explanation}</p>}
          </div>;
        })}
      </div>

      {!alreadyPlayed && <button onClick={() => submit.mutate()} disabled={!allAnswered || submit.isPending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm disabled:opacity-50" data-testid="button-submit-challenge">{submit.isPending && <BrandSpinner size={13} />}{submit.isPending ? 'Submitting…' : allAnswered ? 'Submit answers' : `Answer all ${c.mcqs.length} questions to submit`}</button>}

      {alreadyPlayed && c.status !== 'COMPLETED' && <div className="mt-5 flex items-center gap-2 rounded-xl bg-muted p-3.5 text-xs font-semibold text-muted-foreground"><Clock3 size={14} /> Waiting for {c.opponent?.name ?? 'your friend'} to play their round — you'll be notified when it's ready to compare.</div>}
      {alreadyPlayed && c.status === 'COMPLETED' && <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#fdeecb] px-4 py-3.5 text-xs font-extrabold text-[#5c3d0c]"><Trophy size={16} /> Match complete — check the challenges list for the final result.</div>}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function Challenge() {
  const [openId, setOpenId] = useState<number | null>(null);
  const [shareId, setShareId] = useState<number | null>(null);
  const mine = useQuery({ queryKey: ['challenges-mine'], queryFn: challengesApi.mine });
  const qc = useQueryClient();

  const decline = useMutation({
    mutationFn: (id: number) => challengesApi.decline(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges-mine'] }),
    onError: (err: unknown) => toast({ title: 'Could not decline', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  // Announce badges that unlock while this page is open (e.g. right after you
  // submit a match). The first load only records what's already earned, so
  // opening the page never replays old unlocks.
  const seenEarned = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!mine.data) return;
    const earned = computeChallengeAchievements(mine.data.sent, mine.data.received).filter((a) => a.earned);
    if (seenEarned.current) {
      for (const a of earned) if (!seenEarned.current.has(a.id)) toast({ title: 'Achievement unlocked!', description: a.label });
    }
    seenEarned.current = new Set(earned.map((a) => a.id));
  }, [mine.data]);

  if (openId != null) return <PlayChallenge id={openId} onClose={() => setOpenId(null)} />;

  const sent = mine.data?.sent ?? [];
  const received = mine.data?.received ?? [];

  return <div>
    <SectionHeader eyebrow="Compete" title="Challenge a friend" description="Set a quiz, send the code to a classmate and see who scores higher." />
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <FindFriend onChallenged={() => qc.invalidateQueries({ queryKey: ['challenges-mine'] })} />

      <div className="space-y-5">
        {mine.isLoading ? <SkeletonPage /> : <>
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Challenges for you ({received.length})</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {received.map((c) => <ChallengeRow key={c.id} c={c} onOpen={() => setOpenId(c.id)} onDecline={() => decline.mutate(c.id)} onShare={() => setShareId(c.id)} />)}
              {!received.length && <EmptyState icon={Swords} title="No challenges yet" body="When a friend challenges you, it'll show up here." />}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Sent by you ({sent.length})</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {sent.map((c) => <ChallengeRow key={c.id} c={c} onOpen={() => setOpenId(c.id)} onDecline={() => decline.mutate(c.id)} onShare={() => setShareId(c.id)} />)}
              {!sent.length && <EmptyState icon={Swords} title="No challenges sent" body="Search for a friend on the left and send your first quiz challenge." />}
            </div>
          </div>
        </>}
      </div>
    </div>
    <ChallengeShareDialog challenge={[...sent, ...received].find((c) => c.id === shareId) ?? null} onClose={() => setShareId(null)} />
    {!mine.isLoading && <div className="mt-6"><ChallengeAchievements sent={sent} received={received} /></div>}
  </div>;
}

export default Challenge;

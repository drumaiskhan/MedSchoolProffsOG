// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, type TouchEvent, useState, useEffect, useRef, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, useSearch, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen,
  LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus,
  ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2,
  TrendingUp, TrendingDown, Minus, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark,
  Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash,
  GraduationCap, Eye, EyeOff, Smartphone, UploadCloud, ImageOff,
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Link2 as LinkIcon, Lightbulb,
  LayoutGrid, Presentation, Wand2, Crown, Globe, Star, Activity, Shuffle, Play,
  Infinity as InfinityIcon
} from 'lucide-react';
import { applyThemeVars } from '@/lib/theme';
import {
  getListMembershipPlansQueryKey, getListPaymentsQueryKey, getListMcqsQueryKey, getListModulesQueryKey, getListStudentsQueryKey, getListNotificationsQueryKey, getGetCurrentUserQueryKey,
  useApprovePayment, useCreateMembershipPlan, useCreateMcq, useCreateModule, useGetAdminDashboard,
  useGetCurrentUser, useGetStudentDashboard, useListFlashcards, useListMembershipPlans,
  useListMcqs, useListModules, useListNotifications, useListPayments, useListResources,
  useListStudents, useListSubjects, useListTopics, useRejectPayment,
  useSubmitPayment, useUpdateMembershipPlan,
} from '@workspace/api-client-react';
import type {
  AdminDashboard, Flashcard, Mcq, MembershipPlan, Module, Notification, Payment, Resource,
  Student, Subject, Topic, User
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, type MyFeedbackEntry, analyticsApi, type ProgressTrend, mcqImportApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blocksApi, type Block, examsAdminApi, examsApi, explanationsApi, booksApi, type AdminBookStudent, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type AdminModule, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type PaymentDetails, type PaymentMethodConfig, aiVisualizerApi, type VisualizationSpec, LeaderboardRow } from '@/lib/api';
import { VisualizationRenderer, isStepBased } from '@/components/visualizer/VisualizationRenderer';
import { StepControls } from '@/components/visualizer/StepControls';
import { ExplanationPanel } from '@/components/visualizer/ExplanationPanel';

// Round 3, item 10 (performance) — this was `new QueryClient()` with no
// options, meaning every query defaulted to `staleTime: 0` and refetched
// on every component mount AND every window refocus. For a study app where
// most data (modules, subjects, MCQs, progress) doesn't change
// second-to-second, that's a real over-fetching cost on every navigation
// and every alt-tab back to the app — exactly the "waterfalls/refetch on
// every mount" pattern item 10 flagged as a likely culprit. A 30s
// staleTime means switching between pages you've already visited in the
// last 30s reuses cached data instead of re-hitting the API, and turning
// off refetch-on-window-focus stops a background-tab refocus from firing
// a full page's worth of requests. Individual queries that DO need to
// react fast (the live leaderboard's refetchInterval, mutations that
// invalidateQueries after a save) already set their own options, which
// override these defaults per-query — this only changes the fallback for
// queries that didn't specify anything.
import { buildStudySet, recordSession } from '@/lib/study';
import { Badge, EmptyState, PracticeResultCard, Progress, SectionHeader, SkeletonPage, cn, difficultyTone, useFocusMode } from '@/lib/shared';
import { queryClient, invalidatePracticeQueries } from '@/lib/query-client';

function Practice() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const topicId = Number(params.get('topic')) || undefined;
  const pastPaperId = Number(params.get('pastPaperId')) || undefined;
  const mcqId = Number(params.get('mcqId')) || undefined;
  // v60: ?set=weak|mistakes&count=N builds a mixed set (weak topics / this device's mistakes).
  const studySet = ['weak', 'mistakes', 'flagged'].includes(params.get('set') ?? '') ? (params.get('set') as string) : null;
  const studyCount = [10, 20, 50].includes(Number(params.get('count'))) ? Number(params.get('count')) : 20;
  const baseQ = useListMcqs(studySet ? { mcqId: -1 } : mcqId ? { mcqId } : pastPaperId ? { pastPaperId } : topicId ? { topicId } : undefined);
  const setQ = useQuery({ queryKey: ['study-set', studySet, studyCount], queryFn: () => buildStudySet(studySet!, studyCount), enabled: !!studySet, staleTime: Infinity, gcTime: 0 });
  const q = studySet ? setQ : baseQ;
  const [index, setIndex] = useState(0);
  // Every answer picked so far, keyed by mcq id — lets the student jump
  // freely between questions (via the number grid or Prev/Next) without
  // losing earlier answers, matching a real exam engine rather than a
  // strictly-linear drill.
  const [answers, setAnswers] = useState<Record<number, string | null>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<number>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [panel, setPanel] = useState<'hint' | 'explain' | 'references' | null>(null);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  // Timed/untimed setup gate — null means "not chosen yet, show the setup
  // screen". Timed mode counts DOWN from an exam-style time budget
  // (~90s/question, a standard board-exam pace) rather than counting up,
  // and auto-submits at zero.
  const [mode, setMode] = useState<'timed' | 'untimed' | null>(null);
  // Which card is highlighted on the "before you start" setup screen,
  // before Start is pressed — distinct from `mode`, which is null until
  // the session actually begins (and flips the whole screen over to the
  // live practice view). Timer is highlighted by default to match the
  // reference layout (Timer selected, with the minutes editor open).
  const [pendingMode, setPendingMode] = useState<'timed' | 'untimed'>('timed');
  // null = use the auto-estimated time budget (~1.5 min/question); once the
  // student edits it (stepper, preset chip, or typing directly), their
  // choice sticks even if they flip between Timer/Timeless and back.
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  // "Shuffle question order" toggle on the setup screen — off by default so
  // the set stays in its curated/syllabus order unless the student opts in.
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  // Difficulty filter on the setup screen — 'all' keeps the full set;
  // otherwise only questions matching that difficulty are offered.
  const [selectedDifficulty, setSelectedDifficulty] = useState<'all' | 'easy' | 'moderate' | 'hard'>('all');
  // Question-count cap on the setup screen. Stored as a mode rather than a
  // raw number so it stays meaningful if the difficulty filter shrinks the
  // available pool below 10/20 — 'all' always means "every question left
  // after the difficulty filter", and '10'/'20' are clamped at use-time.
  const [countMode, setCountMode] = useState<'10' | '20' | 'all'>('20');
  // The order actually being played this session, locked in once Start is
  // pressed (see the setup screen below) so the question navigator grid
  // stays stable across answers/prev/next even if shuffle is on. null before
  // a session starts, meaning "use the server order".
  const [orderedMcqs, setOrderedMcqs] = useState<Mcq[] | null>(null);
  const mcqs: Mcq[] = q.data ?? [];
  const activeMcqs = orderedMcqs ?? mcqs;
  const current = activeMcqs[index];
  // Focus mode: on for the duration of an active session (mode chosen,
  // not yet finished) — off during setup and on the results screen.
  useFocusMode(mode !== null && !finished);
  const sessionStartRef = useRef<number>(Date.now());
  // Bug fix: this had no onError at all — if the submit failed (expired
  // membership, network blip, server error), the student saw the results
  // screen render normally with zero indication their session was never
  // recorded, and then wondered why it never showed up on the dashboard or
  // leaderboard. Every other mutation in this file already surfaces
  // failures via toast (see reportFlag/saveSession below) — this matches
  // that convention.
  const submitAnswer = useMutation({
    mutationFn: analyticsApi.submitSession,
    onSuccess: invalidatePracticeQueries,
    onError: (err: unknown) => toast({ title: 'Session not saved', description: err instanceof ApiRequestError ? err.message : "Couldn't record this session — your answers below are still visible, but it won't count toward your stats or the leaderboard.", variant: 'destructive' }),
  });
  const saveNote = useMutation({ mutationFn: notebookApi.create });
  const reportFlag = useMutation({
    mutationFn: flaggedMcqsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flagged-mcqs'] }),
    onError: (err: unknown) => toast({ title: 'Could not flag this question', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const saveSession = useMutation({
    mutationFn: savedSessionsApi.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saved-sessions'] }); toast({ title: 'Session saved', description: 'Find it later on the Saved Sessions page.' }); },
    onError: (err: unknown) => toast({ title: 'Could not save this session', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  // current can be undefined while loading/empty — askAi's mutationFn is only
  // ever invoked from a click once `current` is guaranteed to exist below,
  // but the hook itself must still be declared unconditionally every render.
  const askAi = useMutation({ mutationFn: () => explanationsApi.askAi(current!.id) });
  // Admin control (Settings > Features > "Ask AI to explain") — off hides
  // the button below entirely. Same query key SideNav uses for
  // AI_VISUALIZER_ENABLED, so this just reuses that cached fetch instead of
  // triggering a second one.
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const aiExplainEnabled = siteContentQ.data?.AI_EXPLAIN_ENABLED !== 'false';
  // Trial-only students are capped at TRIAL_DAILY_MCQ_LIMIT MCQs/UTC-day
  // (admin setting, Settings → Access & trial). `limited` is false for a
  // paying student or an unlimited (0) cap, so nothing below renders for them.
  const trialUsageQ = useQuery({ queryKey: ['trial-mcq-usage'], queryFn: analyticsApi.trialMcqUsage, staleTime: 30_000 });
  const trialUsage = trialUsageQ.data;
  const trialLimited = trialUsage?.limited === true;
  const answeredCount = Object.values(answers).filter((v) => v != null).length;
  const percentAnswered = activeMcqs.length ? Math.round((answeredCount / activeMcqs.length) * 100) : 0;
  // Remaining allowance if the student finished right now — answers already
  // given in this still-open session haven't hit the server yet (submission
  // only happens at Finish/exit), so this is trialUsage.remaining (this
  // morning's count) minus what's been answered live, not just the raw
  // server figure.
  const trialRemainingNow = trialLimited ? Math.max(0, (trialUsage!.remaining ?? 0) - answeredCount) : null;

  const finishSession = () => {
    const sessionAnswers = activeMcqs.map((m) => ({ mcqId: m.id, selectedAnswer: answers[m.id] ?? null })).filter((a) => a.selectedAnswer != null);
    const durationSeconds = Math.max(0, Math.round((Date.now() - sessionStartRef.current) / 1000));
    try { recordSession(activeMcqs, answers, topicId); } catch { /* ledger is best-effort */ }
    if (sessionAnswers.length) submitAnswer.mutate({ topicId, answers: sessionAnswers, durationSeconds, mode: mode ?? undefined });
    setFinished(true);
  };

  // Force-submit the moment a trial-only student's daily MCQ cap is hit
  // mid-session, instead of letting them keep answering only to have the
  // whole batch rejected at Finish (see trialDailyMcqCapError on the
  // server) — this way whatever they've already answered still gets
  // recorded. `answeredCount > 0` guards against firing before they've
  // touched a question (e.g. a session opened after the cap was already
  // used up elsewhere today).
  useEffect(() => {
    if (!trialLimited || finished || !mode || answeredCount === 0) return;
    if (trialRemainingNow !== 0) return;
    toast({ title: 'Daily trial limit reached', description: `Trial accounts are limited to ${trialUsage?.limit} MCQs a day. This session was submitted with the ${answeredCount} you've answered — come back tomorrow, or ask about upgrading for unlimited access.` });
    finishSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialRemainingNow, trialLimited, finished, mode, answeredCount]);
  const restartSession = () => { setIndex(0); setAnswers({}); setFlaggedIds(new Set()); setSavedIds(new Set()); setPanel(null); setPaused(false); setFinished(false); setMode(null); setRemainingSeconds(0); setPendingMode('timed'); setCustomMinutes(null); setOrderedMcqs(null); setSelectedDifficulty('all'); setCountMode('20'); askAi.reset(); };

  useEffect(() => {
    if (mode !== 'timed' || finished || paused) return;
    const id = setInterval(() => setRemainingSeconds((s) => {
      if (s <= 1) { finishSession(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, finished, paused]);

  if (!q.isLoading && !mcqs.length) {
    return <div className="max-w-6xl"><SectionHeader eyebrow="Daily practice" title="Practice with purpose" action={<Link href={pastPaperId ? '/past-papers' : '/blocks'} className="text-xs font-bold text-primary" data-testid="link-practice-back-modules"><ArrowLeft size={13} className="mr-1 inline" /> {pastPaperId ? 'Past papers' : 'Blocks'}</Link>} /><EmptyState icon={Target} title={pastPaperId ? 'No questions in this paper yet' : topicId ? 'No questions here yet' : 'Pick a topic to practice'} body={pastPaperId ? "Your academic team hasn't uploaded questions for this past paper yet." : topicId ? "Your academic team hasn't published MCQs for this topic yet." : 'Head to Blocks → a module → a subject → a topic, then hit Start to begin a focused practice session.'} /></div>;
  }
  if (q.isLoading) return <SkeletonPage />;

  if (finished) {
    return <div className="max-w-6xl"><SectionHeader eyebrow="Daily practice" title="Session complete" /><PracticeResultCard mcqs={activeMcqs} answers={answers} onRestart={restartSession} backHref={pastPaperId ? '/past-papers' : '/blocks'} backLabel={pastPaperId ? 'Back to past papers' : 'Back to blocks'} /></div>;
  }

  if (!mode) {
    // Difficulty mix for this set, shown as quick chips on the hero AND
    // used to drive the "Select Difficulty Level" cards below — 'easy'/
    // 'moderate'/'hard' ordering when present, any other custom labels
    // tacked on after.
    const difficultyCounts = mcqs.reduce<Record<string, number>>((acc, m) => { const key = (m.difficulty || 'moderate').toLowerCase(); acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
    const difficultyOrder = ['easy', 'moderate', 'hard'];
    const difficultyEntries = Object.entries(difficultyCounts).sort(([a], [b]) => {
      const ia = difficultyOrder.indexOf(a), ib = difficultyOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    // Questions left after the difficulty filter — this is the pool the
    // question-count cap and the Test Summary below both work off of.
    const difficultyFilteredMcqs = selectedDifficulty === 'all' ? mcqs : mcqs.filter((m) => (m.difficulty || 'moderate').toLowerCase() === selectedDifficulty);
    const availableCount = difficultyFilteredMcqs.length;
    const rawEffectiveCount = countMode === 'all' ? availableCount : Math.min(Number(countMode), availableCount);
    // Trial-only students can't start a set bigger than what's left of their
    // daily MCQ cap (see lib/trial.ts on the server) — clamp the planned
    // test size down to that, same as the live session force-submits once
    // the cap is hit mid-way (see the useEffect above).
    const trialCap = trialLimited ? (trialUsage!.remaining ?? 0) : null;
    const effectiveCount = trialCap !== null ? Math.min(rawEffectiveCount, trialCap) : rawEffectiveCount;
    // 1 minute per question — standard board-exam pacing — based on the
    // actual planned test size, not the full unfiltered set.
    const autoMinutes = Math.max(1, effectiveCount);
    const effectiveMinutes = customMinutes ?? autoMinutes;
    const isAuto = customMinutes === null;
    const difficultyLabels: Record<typeof selectedDifficulty, string> = { all: 'All', easy: 'Easy', moderate: 'Medium', hard: 'Hard' };
    const topicLabel = mcqs[0]?.topic || mcqs[0]?.subject || mcqs[0]?.module || (pastPaperId ? 'Past paper' : 'Practice set');
    const finishClock = pendingMode === 'timed' ? new Date(Date.now() + effectiveMinutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    const startSession = () => {
      // Bug fix: this used to take the FIRST N questions of the pool, so
      // picking "10" always gave the same starting 10. When the chosen size
      // (count cap and/or trial cap — see effectiveCount) is smaller than the
      // pool, draw a fresh random sample each time instead. The sample keeps
      // its syllabus order unless "Shuffle question order" is on.
      const picked = randomSample(difficultyFilteredMcqs, effectiveCount);
      setOrderedMcqs(shuffleQuestions ? shuffleArray(picked) : picked);
      setMode(pendingMode);
      setRemainingSeconds(pendingMode === 'timed' ? effectiveMinutes * 60 : 0);
      sessionStartRef.current = Date.now();
    };
    return <div className="mx-auto max-w-xl">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-md)]">
        {/* Header card — light indigo-tinted band with topic identity + at-a-glance
            counts, replacing the old solid primary-color hero. */}
        <div className="bg-gradient-to-br from-indigo-50 via-indigo-50 to-blue-50 px-5 pb-5 pt-5 sm:px-7 sm:pt-7">
          <div className="flex items-start gap-3">
            <Link href={pastPaperId ? '/past-papers' : '/blocks'} className="mt-2.5 shrink-0 text-indigo-400 transition-colors hover:text-indigo-600" data-testid="link-practice-back-modules"><ArrowLeft size={18} /></Link>
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm"><Target size={20} /></div>
            <div className="min-w-0 pt-0.5">
              <h2 className="truncate text-base font-extrabold text-foreground sm:text-lg" data-testid="text-practice-topic-name">{topicLabel}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Select difficulty and question count</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-4 text-center">
            <div><div className="text-xl font-extrabold text-blue-600">{mcqs.length}</div><div className="text-[10px] text-muted-foreground">Total</div></div>
            <div><div className="text-xl font-extrabold text-green-600">{difficultyCounts.easy ?? 0}</div><div className="text-[10px] text-muted-foreground">Easy</div></div>
            <div><div className="text-xl font-extrabold text-amber-500">{difficultyCounts.moderate ?? 0}</div><div className="text-[10px] text-muted-foreground">Medium</div></div>
            <div><div className="text-xl font-extrabold text-red-500">{difficultyCounts.hard ?? 0}</div><div className="text-[10px] text-muted-foreground">Hard</div></div>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {trialLimited && <div
            className={cn(
              'relative mb-5 overflow-hidden rounded-2xl p-4 text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]',
              trialCap === 0
                ? 'bg-gradient-to-br from-[#e0654f] via-[#c0503f] to-[#8f3a2e]'
                : 'bg-gradient-to-br from-[#f5b25a] via-[#e5a952] to-[#c17f2a]'
            )}
            data-testid="banner-trial-mcq-limit"
          >
            {/* Subtle glossy highlight + soft glow blob — the "3D" part: a
                faint top sheen plus a blurred circle peeking from the
                corner, both purely decorative and clipped by overflow-hidden. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <div className="pointer-events-none absolute -right-6 -top-8 size-28 rounded-full bg-white/20 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_2px_6px_rgba(0,0,0,0.2)]">
                {trialCap === 0 ? <Clock3 size={16} /> : <Zap size={16} className="fill-white/90" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-white/90">Trial account</span>
                  {trialCap !== 0 && <span className="font-mono-app rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-extrabold shadow-inner">{trialUsage?.used}/{trialUsage?.limit} today</span>}
                </div>
                <p className="mt-1 text-xs font-semibold leading-5">
                  {trialCap === 0
                    ? <>You've used all {trialUsage?.limit} of today's trial MCQs. Come back tomorrow, or ask about upgrading for unlimited access.</>
                    : <>{trialCap} MCQ{trialCap === 1 ? '' : 's'} left today — this set will be capped at {trialCap}.</>}
                </p>
                {trialCap !== 0 && trialUsage?.limit ? <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-black/15 shadow-inner"><div className="h-full rounded-full bg-white/95 shadow-[0_0_6px_rgba(255,255,255,0.8)] transition-all" style={{ width: `${Math.min(100, Math.round(((trialUsage.used ?? 0) / trialUsage.limit) * 100))}%` }} /></div> : null}
              </div>
            </div>
          </div>}
          <h3 className="mb-5 text-sm font-extrabold text-foreground">Configure Your Practice Test</h3>

          {difficultyEntries.length > 0 && <div className="mb-5">
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">Select Difficulty Level</div>
            <div className="grid grid-cols-4 gap-2">
              {([
                { key: 'all' as const, count: mcqs.length },
                { key: 'easy' as const, count: difficultyCounts.easy ?? 0 },
                { key: 'moderate' as const, count: difficultyCounts.moderate ?? 0 },
                { key: 'hard' as const, count: difficultyCounts.hard ?? 0 },
              ]).map((opt) => <button key={opt.key} type="button" onClick={() => setSelectedDifficulty(opt.key)} disabled={opt.key !== 'all' && opt.count === 0} className={cn('card-lift rounded-xl border p-2.5 text-center transition-all disabled:opacity-30', selectedDifficulty === opt.key ? 'border-2 border-blue-500 bg-blue-50' : 'border-border bg-card hover:border-blue-300')} data-testid={`button-difficulty-${opt.key}`}>
                {opt.key === 'all'
                  ? <Target size={14} className="mx-auto text-red-500" />
                  : <span className={cn('mx-auto block size-2.5 rounded-full', opt.key === 'easy' ? 'bg-green-500' : opt.key === 'moderate' ? 'bg-amber-500' : 'bg-red-500')} />}
                <div className={cn('mt-1.5 text-[11px] font-extrabold', selectedDifficulty === opt.key && 'text-blue-600')}>{difficultyLabels[opt.key]}</div>
                <div className="text-[10px] text-muted-foreground">{opt.count} qs</div>
              </button>)}
            </div>
          </div>}

          <div className="mb-5">
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">Number of Questions</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ...(availableCount > 10 ? [{ mode: '10' as const, label: '10', sub: 'Questions' }] : []),
                ...(availableCount > 20 ? [{ mode: '20' as const, label: '20', sub: 'Questions' }] : []),
                { mode: 'all' as const, label: availableCount > 20 ? 'All' : String(availableCount), sub: `${availableCount} MCQ${availableCount === 1 ? '' : 's'}` },
              ]).map((opt) => <button key={opt.mode} type="button" onClick={() => setCountMode(opt.mode)} className={cn('card-lift rounded-xl border p-3 text-center transition-all', countMode === opt.mode ? 'border-2 border-blue-500 bg-blue-50' : 'border-border bg-card hover:border-blue-300')} data-testid={`button-count-${opt.mode}`}>
                <div className={cn('text-sm font-extrabold', countMode === opt.mode && 'text-blue-600')}>{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.sub}</div>
              </button>)}
            </div>
          </div>

          <div className="mb-5">
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">Timer Mode</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => setPendingMode('timed')} className={cn('card-lift relative rounded-2xl border p-4 text-left transition-all', pendingMode === 'timed' ? 'border-2 border-blue-500 bg-blue-50' : 'border-border bg-card hover:border-blue-300')} data-testid="button-mode-timed">
                <div className="flex items-center gap-2.5">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', pendingMode === 'timed' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground')}><Clock3 size={15} /></span>
                  <span className={cn('text-sm font-extrabold', pendingMode === 'timed' && 'text-blue-600')}>Timer</span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Practice with a countdown and auto-submit when time ends.</p>
              </button>
              <button onClick={() => setPendingMode('untimed')} className={cn('card-lift relative rounded-2xl border p-4 text-left transition-all', pendingMode === 'untimed' ? 'border-2 border-blue-500 bg-blue-50' : 'border-border bg-card hover:border-blue-300')} data-testid="button-mode-untimed">
                <div className="flex items-center gap-2.5">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', pendingMode === 'untimed' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground')}><InfinityIcon size={15} /></span>
                  <span className={cn('text-sm font-extrabold', pendingMode === 'untimed' && 'text-blue-600')}>Timeless</span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">No time limit. Study at your own pace.</p>
              </button>
            </div>

            {pendingMode === 'timed' && <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold text-muted-foreground">Set your own time</div>
                {finishClock && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground" data-testid="text-estimated-finish"><Clock3 size={11} /> Ends ~{finishClock}</span>}
              </div>
              <div className="mt-3 flex items-center justify-center gap-3">
                <button type="button" onClick={() => setCustomMinutes(Math.max(1, effectiveMinutes - 5))} className="grid size-10 shrink-0 place-items-center rounded-xl border border-border text-base font-bold transition-transform hover:bg-muted active:scale-95" data-testid="button-timer-minus" aria-label="Subtract 5 minutes">−</button>
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={effectiveMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(1, Math.min(480, Number(e.target.value) || 1)))}
                    className="h-11 w-24 rounded-xl border border-border bg-background px-2 text-center text-lg font-mono-app font-extrabold"
                    data-testid="input-timer-minutes"
                  />
                  <span className="mt-1 text-[10px] text-muted-foreground">minutes</span>
                </div>
                <button type="button" onClick={() => setCustomMinutes(Math.min(480, effectiveMinutes + 5))} className="grid size-10 shrink-0 place-items-center rounded-xl border border-border text-base font-bold transition-transform hover:bg-muted active:scale-95" data-testid="button-timer-plus" aria-label="Add 5 minutes">+</button>
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {[autoMinutes, 15, 30, 45, 60].filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx).map((v) => <button key={v} type="button" onClick={() => setCustomMinutes(v)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors', effectiveMinutes === v ? 'border-blue-500 bg-blue-500 text-white' : 'border-border text-muted-foreground hover:bg-muted')} data-testid={`button-timer-preset-${v}`}>{v === autoMinutes ? `${v} min (recommended)` : `${v} min`}</button>)}
              </div>
              <p className="mt-2.5 text-center text-[10px] text-muted-foreground">{isAuto ? '~1 min per question' : 'Custom pace'}, based on a {effectiveCount}-question set.</p>
            </div>}
          </div>

          <button type="button" onClick={() => setShuffleQuestions((s) => !s)} className="mb-5 flex w-full items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/60" data-testid="button-toggle-shuffle" aria-pressed={shuffleQuestions}>
            <span className="flex items-center gap-2 text-xs font-bold"><Shuffle size={14} className="text-muted-foreground" /> Shuffle question order</span>
            <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', shuffleQuestions ? 'bg-blue-500' : 'bg-border')}><span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', shuffleQuestions ? 'translate-x-4' : 'translate-x-0.5')} /></span>
          </button>

          <div className="mb-6 rounded-2xl bg-muted/40 p-4 text-left" data-testid="panel-test-summary">
            <div className="mb-2.5 text-[11px] font-bold text-muted-foreground">Test Summary</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-muted-foreground"><Target size={11} className="shrink-0 text-blue-500" /> Topic: <span className="truncate font-bold text-foreground">{topicLabel}</span></div>
              <div className="flex items-center gap-1.5 text-muted-foreground"><Activity size={11} className="shrink-0 text-blue-500" /> Difficulty: <span className="font-bold text-foreground">{difficultyLabels[selectedDifficulty]}</span></div>
              <div className="flex items-center gap-1.5 text-muted-foreground"><Hash size={11} className="shrink-0 text-blue-500" /> Questions: <span className="font-bold text-foreground">{effectiveCount}</span></div>
              <div className="flex items-center gap-1.5 text-muted-foreground"><Clock3 size={11} className="shrink-0 text-blue-500" /> Mode: <span className="font-bold text-foreground">{pendingMode === 'timed' ? 'Timer' : 'Timeless'}</span></div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={startSession}
              disabled={effectiveCount === 0}
              className="flex items-center justify-center gap-2 rounded-full bg-[#0f1e3d] px-8 py-3.5 text-xs font-extrabold text-white shadow-sm transition-transform active:scale-[0.99] disabled:opacity-40"
              data-testid="button-start-session"
            ><Play size={13} className="fill-white" /> Start Test {pendingMode === 'timed' ? `(${effectiveMinutes} min)` : ''}</button>
          </div>
          <button
            onClick={() => saveSession.mutate({ name: `Practice — ${new Date().toLocaleDateString()}`, config: { topicId, pastPaperId } })}
            disabled={saveSession.isPending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
            data-testid="button-save-session"
          ><Bookmark size={14} /> {saveSession.isPending ? 'Saving…' : 'Save this filter for later'}</button>
        </div>
      </div>
    </div>;
  }

  if (!current) return <SkeletonPage />;

  // Bug fix: once a question has been answered, lock it — don't let further
  // clicks overwrite `answers[current.id]`. Without this, going back (Prev /
  // Question Navigator) to a question you got wrong and tapping the now
  // green-outlined correct option silently replaced your original wrong
  // answer with the correct one, so both the inline feedback and the
  // results card (PracticeResultCard) would count it as correct even though
  // you answered wrong the first time. Matches real exam behavior: your
  // first pick for a question is final.
  const selectOption = (option: string) => {
    if (paused) return;
    if (answers[current.id] != null) return;
    setAnswers((prev) => ({ ...prev, [current.id]: option }));
  };
  const goTo = (i: number) => { setIndex(i); setPanel(null); askAi.reset(); };
  // Flag icon does double duty: it drives the session-local "flag for
  // review" highlight in the number grid (like a real exam engine), AND —
  // when turning a flag ON — persists a report via flaggedMcqsApi so it
  // actually shows up on the standalone Flagged MCQs page for the student
  // (and admins) to revisit later. Un-flagging only clears the in-session
  // highlight; it doesn't delete the persisted report (use the Flagged MCQs
  // page's Remove button for that).
  const toggleFlag = () => setFlaggedIds((prev) => {
    const next = new Set(prev);
    if (next.has(current.id)) { next.delete(current.id); }
    else { next.add(current.id); reportFlag.mutate({ mcqId: current.id, reason: 'Flagged during practice session' }); }
    return next;
  });
  const saveQuestion = () => { if (savedIds.has(current.id)) return; saveNote.mutate({ content: current.question, mcqId: current.id }); setSavedIds((prev) => new Set(prev).add(current.id)); };
  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const ss = String(remainingSeconds % 60).padStart(2, '0');
  const stateForIndex = (i: number): 'current' | 'answered' | 'flagged' | 'new' => {
    if (i === index) return 'current';
    const id = activeMcqs[i].id;
    if (flaggedIds.has(id)) return 'flagged';
    if (answers[id] != null) return 'answered';
    return 'new';
  };

  const controlPanel = <div className="space-y-3">
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between text-xs font-bold"><span className="flex items-center gap-1.5"><Clock3 size={13} /> {mode === 'timed' ? 'Timer' : 'Untimed'}</span>{mode === 'timed' && <span className={cn('font-mono-app rounded-full px-2.5 py-1 text-[11px]', remainingSeconds < 60 ? 'bg-[#fff1ed] text-[#a34c3e]' : 'bg-[#d7eee4] text-[#287058]')} data-testid="text-timer">{mm}:{ss}</span>}</div>
      <div className="mt-2.5 flex gap-1.5">
        <button onClick={() => setPaused((p) => !p)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#32647b] px-2 py-2 text-[11px] font-bold text-white" data-testid="button-pause-session">{paused ? <><Zap size={12} /> Resume</> : <><Clock3 size={12} /> Pause</>}</button>
        <button onClick={saveQuestion} disabled={savedIds.has(current.id)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold', savedIds.has(current.id) ? 'bg-[#e6dcf3] text-[#6a4c93]' : 'bg-gradient-to-r from-[#6a4c93] to-[#815276] text-white')} data-testid="button-save-question"><Bookmark size={12} /> {savedIds.has(current.id) ? 'Saved' : 'Save'}</button>
      </div>
      <button onClick={finishSession} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#c0503f]/30 px-2 py-2 text-[11px] font-bold text-[#c0503f] hover:bg-[#fff1ed]" data-testid="button-exit-session"><X size={12} /> Exit &amp; submit</button>
    </div>
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="mb-2.5 text-[11px] font-bold text-muted-foreground">Question Navigator</div>
      <div className="grid grid-cols-5 gap-1.5">{activeMcqs.map((m, i) => { const st = stateForIndex(i); return <button key={m.id} onClick={() => goTo(i)} className={cn('grid aspect-square place-items-center rounded-lg text-[11px] font-bold transition-colors', st === 'current' && 'border-2 border-primary bg-card text-primary', st === 'answered' && 'bg-[#32647b] text-white', st === 'flagged' && 'bg-[#e5a952] text-white', st === 'new' && 'bg-muted text-muted-foreground')} data-testid={`button-goto-question-${i}`}>{i + 1}</button>; })}</div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#32647b]" /> Answered</span><span className="flex items-center gap-1"><span className="size-2 rounded-full border-2 border-primary" /> Current</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-muted" /> Not Answered</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#e5a952]" /> Bookmarked</span></div>
    </div>
  </div>;

  if (paused) {
    return <div className="max-w-6xl"><SectionHeader eyebrow="Daily practice" title="Practice with purpose" description="Choose how you want to work through these questions." />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]"><div className="order-2 rounded-3xl border border-border bg-card p-9 text-center lg:order-1"><Clock3 size={28} className="mx-auto text-muted-foreground" /><h2 className="mt-4 font-display text-xl">Session paused</h2><p className="mt-2 text-xs text-muted-foreground">Your progress and timer are on hold. Hit Resume in the panel to keep going.</p></div><div className="order-1 lg:order-2">{controlPanel}</div></div>
    </div>;
  }

  // Breadcrumb (Module > Subject > Topic) + a "Leave" exit action, matching
  // the reference design's Practice MCQs header — Mcq already carries the
  // module/subject/topic names, so no extra fetch is needed.
  // Breadcrumb (Module > Subject > Topic) — Mcq already carries the
  // module/subject/topic names, so no extra fetch is needed. The focus-mode
  // header above already has its own "Exit" back-link (see Shell), so this
  // page doesn't need a second exit affordance duplicating it — "Exit &
  // submit" in the side panel is the one deliberate way to leave mid-set.
  const breadcrumbParts = [current.module, current.subject, current.topic].filter(Boolean);
  return <div className="max-w-6xl">
    {breadcrumbParts.length > 0 && <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground" data-testid="text-practice-breadcrumb">{breadcrumbParts.map((part, i) => <span key={i} className="flex items-center gap-1.5">{i > 0 && <ChevronRight size={11} />}<span>{part}</span></span>)}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="font-display text-2xl">Practice MCQs</h1><span className="font-mono-app text-[11px] text-muted-foreground">{index + 1} / {activeMcqs.length}</span></div>
    {/* Top progress bar — the single biggest whitespace cut vs. before: this
        replaces a whole separate "Timer" card that used to sit above the
        question, pushing everything down a full card's height before you
        even reached the question text. */}
    <div className="mt-2.5 mb-4 flex items-center gap-3"><div className="flex-1"><Progress value={percentAnswered} /></div><span className="shrink-0 text-[10px] font-bold text-muted-foreground">{percentAnswered}% answered</span>{trialLimited && <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white shadow-[0_2px_6px_-1px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.35)]', trialRemainingNow === 0 ? 'bg-gradient-to-br from-[#e0654f] to-[#a3402f]' : 'bg-gradient-to-br from-[#f5b25a] to-[#c17f2a]')} data-testid="badge-trial-mcqs-left"><Zap size={10} className="fill-white/90" /> {trialRemainingNow} left today</span>}</div>
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="order-1 overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-2xs)]">
        <div className="bg-gradient-to-br from-indigo-50 via-card to-card px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between"><Badge tone={difficultyTone(current.difficulty)}>{current.difficulty}</Badge><button onClick={toggleFlag} className={cn('rounded-lg p-1.5 transition-transform hover:scale-110', flaggedIds.has(current.id) ? 'text-[#e5a952]' : 'text-muted-foreground hover:text-foreground')} data-testid="button-flag-question"><Flag size={17} fill={flaggedIds.has(current.id) ? 'currentColor' : 'none'} /></button></div>
        <h2 className="mt-4 max-w-2xl pb-5 text-base font-extrabold leading-6 tracking-[-.025em] sm:text-lg sm:leading-7">{current.question}</h2>
        </div>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {/* Compact option rows (py-2.5 instead of p-4, tighter gap) so a
            5-option question plus the hint/explain/references row and the
            prev/next buttons fit one viewport on a normal laptop screen
            without scrolling — this was the whole stack's biggest single
            source of vertical height. */}
        <div className="mt-4 space-y-2">{current.options.map((option, i) => {
          const selected = answers[current.id];
          const isSelected = selected === option;
          const isCorrectOpt = current.correctAnswer != null && option === current.correctAnswer;
          // Immediate right/wrong feedback once the student has picked an
          // option for this question: their pick turns green if it's
          // correct or red if it's wrong, and — if they picked wrong — the
          // actual correct option is also outlined green so they can see
          // it right away instead of only finding out at the end.
          const optionClass = selected == null
            ? 'border-border hover:bg-muted'
            : isSelected && isCorrectOpt ? 'border-[#287058] bg-[#e6f3ed]'
            : isSelected && !isCorrectOpt ? 'border-destructive bg-[#fff1ed]'
            : isCorrectOpt ? 'border-[#287058] bg-[#f3fbf7]'
            : 'border-border opacity-70';
          return <button key={option} onClick={() => selectOption(option)} disabled={selected != null} className={cn('flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm shadow-[var(--shadow-2xs)] transition-all', optionClass, selected == null && 'hover:-translate-y-0.5 hover:shadow-[var(--shadow-xs)]', selected != null && 'cursor-default')} data-testid={`button-answer-${i}`}><span className={cn('grid size-6 shrink-0 place-items-center rounded-lg font-mono-app text-[11px] font-bold transition-colors', selected != null && isSelected && isCorrectOpt && 'bg-[#287058] text-white', selected != null && isSelected && !isCorrectOpt && 'bg-destructive text-white', selected != null && !isSelected && isCorrectOpt && 'bg-[#287058] text-white', (selected == null || (!isSelected && !isCorrectOpt)) && 'bg-muted')}>{String.fromCharCode(65 + i)}</span><span className="flex-1">{option}</span>{selected != null && isSelected && !isCorrectOpt && <X size={15} className="shrink-0 text-destructive" />}{selected != null && isCorrectOpt && <CheckCircle2 size={15} className="shrink-0 text-[#287058]" />}</button>;
        })}</div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setPanel(panel === 'hint' ? null : 'hint')} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold', panel === 'hint' ? 'bg-[#e5a952] text-white' : 'border border-[#e5a952]/40 bg-[#fdf6e8] text-[#8a5a12]')} data-testid="button-hint"><Lightbulb size={13} /> Hint</button>
          <button onClick={() => setPanel(panel === 'explain' ? null : 'explain')} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold', panel === 'explain' ? 'bg-[#32647b] text-white' : 'border border-[#32647b]/40 bg-[#dceaf1] text-[#32647b]')} data-testid="button-explain"><CircleHelp size={13} /> Explain</button>
          <button onClick={() => setPanel(panel === 'references' ? null : 'references')} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold', panel === 'references' ? 'bg-[#6a4c93] text-white' : 'border border-[#6a4c93]/40 bg-[#efe8f7] text-[#6a4c93]')} data-testid="button-references"><BookOpen size={13} /> References</button>
        </div>

        {panel === 'hint' && <div className="mt-3 rounded-xl bg-[#fdf6e8] p-3.5 text-xs leading-6 text-[#8a5a12]" data-testid="panel-hint"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"><Lightbulb size={10} /> Hint</div>{current.hint ? current.hint : 'Re-read the question stem carefully — focus on the specific mechanism or finding it\'s asking about, and rule out options that don\'t fit that exact scenario.'}</div>}
        {panel === 'references' && <div className="mt-3 rounded-xl bg-[#efe8f7] p-3.5 text-xs leading-6 text-[#6a4c93]" data-testid="panel-references"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"><BookOpen size={10} /> References</div>{current.reference || 'No reference has been attached to this question yet.'}</div>}
        {panel === 'explain' && <div className="mt-3 rounded-xl bg-[#dceaf1] p-3.5 text-xs leading-6 text-[#32647b]" data-testid="panel-explain">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"><CircleHelp size={10} /> Explanation</div>
          {current.optionExplanations?.some((e) => e?.trim()) ? <div className="space-y-2">{current.options.map((opt, oi) => { const optExplanation = current.optionExplanations?.[oi]; const isCorrectOpt = opt === current.correctAnswer; return <div key={opt} className={cn('rounded-lg p-2.5', isCorrectOpt ? 'bg-white/70' : 'bg-white/30')}><div className={cn('text-[11px] font-bold', isCorrectOpt ? 'text-[#287058]' : 'text-[#a34c3e]')}>{String.fromCharCode(65 + oi)}. {opt} {isCorrectOpt ? '(correct)' : ''}</div>{optExplanation && <div className="mt-1 text-[11px] leading-5">{optExplanation}</div>}</div>; })}</div> : (current.explanation || 'No written explanation is available for this question yet.')}
          {aiExplainEnabled && !askAi.data && <button onClick={() => askAi.mutate()} disabled={askAi.isPending} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#32647b]/30 bg-white/60 px-3 py-1.5 text-[11px] font-bold text-[#32647b] disabled:opacity-50" data-testid="button-ask-ai">{askAi.isPending ? 'Thinking…' : <><Sparkles size={11} /> Ask AI to explain differently</>}</button>}
          {askAi.data && <div className="mt-3 rounded-lg bg-white/60 p-3 text-xs leading-5"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"><Sparkles size={10} /> AI explanation</div>{askAi.data.explanation}</div>}
          {askAi.isError && <p className="mt-2 text-[11px] font-semibold text-destructive">{askAi.error instanceof ApiRequestError ? askAi.error.message : 'Could not reach AI right now.'}</p>}
        </div>}



        <div className="mt-5 flex items-center justify-between gap-3">
          <button disabled={index === 0} onClick={() => goTo(index - 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-bold disabled:opacity-40" data-testid="button-prev-question"><ArrowLeft size={14} /> Prev</button>
          {index + 1 >= activeMcqs.length ? <button onClick={finishSession} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="button-finish-session">Finish session <CheckCircle2 size={14} /></button> : <button onClick={() => goTo(index + 1)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="button-next-question">Next <ArrowRight size={14} /></button>}
        </div>
        </div>
      </div>
      <div className="order-2">{controlPanel}</div>
    </div>
  </div>;
}

// Picks `count` random items from `items` (a different subset every call) and
// returns them in their ORIGINAL relative order, so the curated/syllabus order
// survives unless the student also turns on "Shuffle question order". Returns
// a copy of everything when count >= items.length. Never mutates its input.
function randomSample<T>(items: T[], count: number): T[] {
  if (count >= items.length) return [...items];
  const idx = items.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.max(0, count)).sort((a, b) => a - b).map((i) => items[i]);
}

// Fisher–Yates shuffle for the setup screen's "Shuffle question order"
// toggle — returns a new array (never mutates the query-cache array from
// react-query) so switching the toggle off and starting again reliably
// falls back to the original server order.
function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Deterministic per-topic accent color, cycling through the app's existing
// --chart-1..5 CSS variables (same palette already used for analytics
// charts elsewhere) rather than inventing new colors. Same topic name
// always gets the same color, so a student builds a visual association
// with a subject over repeated study sessions instead of colors reshuffling
// on every render.

export default Practice;

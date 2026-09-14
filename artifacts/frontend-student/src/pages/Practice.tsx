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
  LayoutGrid, Presentation, Wand2, Crown, Globe, Star, Activity
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
import { Badge, EmptyState, PracticeResultCard, Progress, SectionHeader, SkeletonPage, cn, difficultyTone, useFocusMode } from '@/lib/shared';

function Practice() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const topicId = Number(params.get('topic')) || undefined;
  const pastPaperId = Number(params.get('pastPaperId')) || undefined;
  const mcqId = Number(params.get('mcqId')) || undefined;
  const q = useListMcqs(mcqId ? { mcqId } : pastPaperId ? { pastPaperId } : topicId ? { topicId } : undefined);
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
  const mcqs: Mcq[] = q.data ?? [];
  const current = mcqs[index];
  // Focus mode: on for the duration of an active session (mode chosen,
  // not yet finished) — off during setup and on the results screen.
  useFocusMode(mode !== null && !finished);
  const sessionStartRef = useRef<number>(Date.now());
  const submitAnswer = useMutation({ mutationFn: analyticsApi.submitSession });
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
  const answeredCount = Object.values(answers).filter((v) => v != null).length;
  const percentAnswered = mcqs.length ? Math.round((answeredCount / mcqs.length) * 100) : 0;

  const finishSession = () => {
    const sessionAnswers = mcqs.map((m) => ({ mcqId: m.id, selectedAnswer: answers[m.id] ?? null })).filter((a) => a.selectedAnswer != null);
    const durationSeconds = Math.max(0, Math.round((Date.now() - sessionStartRef.current) / 1000));
    if (sessionAnswers.length) submitAnswer.mutate({ topicId, answers: sessionAnswers, durationSeconds, mode: mode ?? undefined });
    setFinished(true);
  };
  const restartSession = () => { setIndex(0); setAnswers({}); setFlaggedIds(new Set()); setSavedIds(new Set()); setPanel(null); setPaused(false); setFinished(false); setMode(null); setRemainingSeconds(0); setPendingMode('timed'); setCustomMinutes(null); askAi.reset(); };

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
    return <div className="max-w-6xl"><SectionHeader eyebrow="Daily practice" title="Session complete" /><PracticeResultCard mcqs={mcqs} answers={answers} onRestart={restartSession} backHref={pastPaperId ? '/past-papers' : '/blocks'} backLabel={pastPaperId ? 'Back to past papers' : 'Back to blocks'} /></div>;
  }

  if (!mode) {
    const autoMinutes = Math.max(1, Math.round(mcqs.length * 1.5));
    const effectiveMinutes = customMinutes ?? autoMinutes;
    return <div className="mx-auto max-w-lg"><SectionHeader eyebrow="Daily practice" title="Before you start" />
      <div className="rounded-3xl border border-border bg-card p-6 text-center md:p-9">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#eef7f1] text-primary"><Clock3 size={22} /></div>
        <h2 className="mt-5 font-display text-xl">How do you want to practice?</h2>
        <p className="mt-2 text-xs text-muted-foreground">{mcqs.length} question{mcqs.length === 1 ? '' : 's'} in this set.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button onClick={() => setPendingMode('timed')} className={cn('card-lift rounded-2xl border-2 p-5 text-left', pendingMode === 'timed' ? 'border-primary bg-[#eef7f1]' : 'border-border bg-card')} data-testid="button-mode-timed"><Clock3 size={18} className={pendingMode === 'timed' ? 'text-primary' : 'text-muted-foreground'} /><div className={cn('mt-3 text-sm font-extrabold', pendingMode === 'timed' && 'text-[#164b4b]')}>Timer</div><p className="mt-1 text-[11px] text-muted-foreground">Practice with a countdown, auto-submits when time runs out.</p></button>
          <button onClick={() => setPendingMode('untimed')} className={cn('card-lift rounded-2xl border-2 p-5 text-left', pendingMode === 'untimed' ? 'border-primary bg-[#eef7f1]' : 'border-border bg-card')} data-testid="button-mode-untimed"><Target size={18} className={pendingMode === 'untimed' ? 'text-primary' : 'text-muted-foreground'} /><div className={cn('mt-3 text-sm font-extrabold', pendingMode === 'untimed' && 'text-[#164b4b]')}>Timeless</div><p className="mt-1 text-[11px] text-muted-foreground">No time limit — study at your own pace.</p></button>
        </div>
        {pendingMode === 'timed' && <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-left">
          <div className="text-[11px] font-bold text-muted-foreground">Set your own time</div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => setCustomMinutes(Math.max(1, effectiveMinutes - 5))} className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-sm font-bold hover:bg-muted" data-testid="button-timer-minus" aria-label="Subtract 5 minutes">−</button>
            <input
              type="number"
              min={1}
              max={480}
              value={effectiveMinutes}
              onChange={(e) => setCustomMinutes(Math.max(1, Math.min(480, Number(e.target.value) || 1)))}
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm font-mono-app font-bold"
              data-testid="input-timer-minutes"
            />
            <span className="text-xs text-muted-foreground">minutes</span>
            <button type="button" onClick={() => setCustomMinutes(Math.min(480, effectiveMinutes + 5))} className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-sm font-bold hover:bg-muted" data-testid="button-timer-plus" aria-label="Add 5 minutes">+</button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {[autoMinutes, 15, 30, 45, 60].filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx).map((v) => <button key={v} type="button" onClick={() => setCustomMinutes(v)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold', effectiveMinutes === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')} data-testid={`button-timer-preset-${v}`}>{v === autoMinutes ? `${v} min (recommended)` : `${v} min`}</button>)}
          </div>
        </div>}
        <button
          onClick={() => { setMode(pendingMode); setRemainingSeconds(pendingMode === 'timed' ? effectiveMinutes * 60 : 0); sessionStartRef.current = Date.now(); }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground"
          data-testid="button-start-session"
        >Start {pendingMode === 'timed' ? `(${effectiveMinutes} min)` : 'session'}</button>
        <button
          onClick={() => saveSession.mutate({ name: `Practice — ${new Date().toLocaleDateString()}`, config: { topicId, pastPaperId } })}
          disabled={saveSession.isPending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
          data-testid="button-save-session"
        ><Bookmark size={14} /> {saveSession.isPending ? 'Saving…' : 'Save this filter for later'}</button>
      </div>
    </div>;
  }

  if (!current) return <SkeletonPage />;

  const selectOption = (option: string) => { if (paused) return; setAnswers((prev) => ({ ...prev, [current.id]: option })); };
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
    const id = mcqs[i].id;
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
      <div className="grid grid-cols-5 gap-1.5">{mcqs.map((m, i) => { const st = stateForIndex(i); return <button key={m.id} onClick={() => goTo(i)} className={cn('grid aspect-square place-items-center rounded-lg text-[11px] font-bold transition-colors', st === 'current' && 'border-2 border-primary bg-card text-primary', st === 'answered' && 'bg-[#32647b] text-white', st === 'flagged' && 'bg-[#e5a952] text-white', st === 'new' && 'bg-muted text-muted-foreground')} data-testid={`button-goto-question-${i}`}>{i + 1}</button>; })}</div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#32647b]" /> Answered</span><span className="flex items-center gap-1"><span className="size-2 rounded-full border-2 border-primary" /> Current</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-muted" /> Not Answered</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#e5a952]" /> Bookmarked</span></div>
    </div>
  </div>;

  if (paused) {
    return <div className="max-w-6xl"><SectionHeader eyebrow="Daily practice" title="Practice with purpose" />
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
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="font-display text-2xl">Practice MCQs</h1><span className="font-mono-app text-[11px] text-muted-foreground">{index + 1} / {mcqs.length}</span></div>
    {/* Top progress bar — the single biggest whitespace cut vs. before: this
        replaces a whole separate "Timer" card that used to sit above the
        question, pushing everything down a full card's height before you
        even reached the question text. */}
    <div className="mt-2.5 mb-4"><Progress value={percentAnswered} /></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="order-1 rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between"><Badge tone={difficultyTone(current.difficulty)}>{current.difficulty}</Badge><button onClick={toggleFlag} className={cn('rounded-lg p-1.5', flaggedIds.has(current.id) ? 'text-[#e5a952]' : 'text-muted-foreground hover:text-foreground')} data-testid="button-flag-question"><Flag size={17} fill={flaggedIds.has(current.id) ? 'currentColor' : 'none'} /></button></div>
        <h2 className="mt-4 max-w-2xl text-base font-extrabold leading-6 tracking-[-.025em] sm:text-lg sm:leading-7">{current.question}</h2>
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
          return <button key={option} onClick={() => selectOption(option)} className={cn('flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors', optionClass)} data-testid={`button-answer-${i}`}><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted font-mono-app text-[11px]">{String.fromCharCode(65 + i)}</span><span className="flex-1">{option}</span>{selected != null && isSelected && !isCorrectOpt && <X size={15} className="shrink-0 text-destructive" />}{selected != null && isCorrectOpt && <CheckCircle2 size={15} className="shrink-0 text-[#287058]" />}</button>;
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
          {!askAi.data && <button onClick={() => askAi.mutate()} disabled={askAi.isPending} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#32647b]/30 bg-white/60 px-3 py-1.5 text-[11px] font-bold text-[#32647b] disabled:opacity-50" data-testid="button-ask-ai">{askAi.isPending ? 'Thinking…' : <><Sparkles size={11} /> Ask AI to explain differently</>}</button>}
          {askAi.data && <div className="mt-3 rounded-lg bg-white/60 p-3 text-xs leading-5"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"><Sparkles size={10} /> AI explanation</div>{askAi.data.explanation}</div>}
          {askAi.isError && <p className="mt-2 text-[11px] font-semibold text-destructive">{askAi.error instanceof ApiRequestError ? askAi.error.message : 'Could not reach AI right now.'}</p>}
        </div>}


        <div className="mt-5 flex items-center justify-between gap-3">
          <button disabled={index === 0} onClick={() => goTo(index - 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-bold disabled:opacity-40" data-testid="button-prev-question"><ArrowLeft size={14} /> Prev</button>
          {index + 1 >= mcqs.length ? <button onClick={finishSession} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-finish-session">Finish session <CheckCircle2 size={14} /></button> : <button onClick={() => goTo(index + 1)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-next-question">Next <ArrowRight size={14} /></button>}
        </div>
      </div>
      <div className="order-2">{controlPanel}</div>
    </div>
  </div>;
}

// Deterministic per-topic accent color, cycling through the app's existing
// --chart-1..5 CSS variables (same palette already used for analytics
// charts elsewhere) rather than inventing new colors. Same topic name
// always gets the same color, so a student builds a visual association
// with a subject over repeated study sessions instead of colors reshuffling
// on every render.

export default Practice;

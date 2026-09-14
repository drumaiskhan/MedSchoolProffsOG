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
import { Badge, SkeletonPage, cn, difficultyTone, useExamLock, useFocusMode, usePageTitle } from '@/lib/shared';

function TakeExam() {
  const params = useParams();
  const attemptId = Number(params.attemptId);
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<ExamStartResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | null>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  // On for the whole time this screen is mounted — TakeExam is only ever
  // reached mid-attempt, so unlike Practice() there's no separate
  // setup/results state to gate on; unmount (navigating to the result page
  // included) turns it back off via useFocusMode's cleanup. `strict` (true)
  // hides Shell's Exit button — a Pre-Proffs exam is meant to be strict:
  // no clicking away mid-attempt — and useExamLock backs that up by also
  // blocking the browser back button and warning on refresh/close.
  useFocusMode(true, true);
  useExamLock(true);
  const submit = useMutation({ mutationFn: () => examsApi.submit(attemptId), onSuccess: () => setLocation(`/exams/result/${attemptId}`) });
  const saveAnswer = useMutation({ mutationFn: ({ mcqId, selectedAnswer }: { mcqId: number; selectedAnswer: string | null }) => examsApi.answer(attemptId, mcqId, selectedAnswer) });

  // The attempt was already created server-side (via Exams page's start
  // mutation); this page just needs the question set. Re-calling start is
  // safe — the backend returns the same in-progress attempt's questions.

  const load = useQuery({ queryKey: ['exam-session', attemptId], queryFn: async () => { const exams = await examsApi.list(); const exam = exams.find((e) => e.inProgressAttemptId === attemptId); if (!exam) throw new Error('Attempt not found'); const started = await examsApi.start(exam.id); return { ...started, examTitle: exam.title } as ExamStartResponse & { examTitle: string }; } });
  // Replaces the header's default "Exams / Take / 2" (raw route path) with
  // the actual paper name once it's loaded.
  usePageTitle(load.data ? load.data.examTitle : 'Exam');

  useEffect(() => {
    if (load.data && !session) {
      setSession(load.data);
      setSecondsLeft(Math.max(0, load.data.durationMinutes * 60 - Math.floor((Date.now() - new Date(load.data.startedAt).getTime()) / 1000)));
    }
  }, [load.data, session]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setSecondsLeft((s) => {
      if (s === null) return s;
      if (s <= 1) { clearInterval(timer); submit.mutate(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (load.isLoading || !session) return <SkeletonPage />;
  const current = session.questions[index];
  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const seconds = secondsLeft !== null ? secondsLeft % 60 : 0;
  const answeredCount = Object.values(answers).filter((v) => v != null).length;

  const selectAnswer = (opt: string) => { setAnswers((prev) => ({ ...prev, [current.id]: opt })); saveAnswer.mutate({ mcqId: current.id, selectedAnswer: opt }); };

  return <div className="mx-auto max-w-4xl px-1 sm:px-0"><div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 sm:px-5"><div className="min-w-0"><div className="truncate text-xs font-extrabold" data-testid="text-exam-title">{(load.data as { examTitle?: string } | undefined)?.examTitle}</div><div className="text-[11px] text-muted-foreground">Question {index + 1} / {session.questions.length} · {answeredCount} answered</div></div><div className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold', secondsLeft !== null && secondsLeft < 60 ? 'bg-destructive/10 text-destructive' : 'bg-muted')}><Clock3 size={13} /> {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div></div>
    <div className="rounded-3xl border border-border bg-card p-6 md:p-9"><Badge tone={difficultyTone(current.difficulty)}>{current.difficulty}</Badge><h2 className="mt-6 text-xl font-extrabold leading-8">{current.question}</h2><div className="mt-7 space-y-3">{current.options.map((opt, i) => <button key={opt} onClick={() => selectAnswer(opt)} className={cn('flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm transition-colors', answers[current.id] === opt ? 'border-primary bg-[#e6f3ed]' : 'border-border hover:bg-muted')} data-testid={`button-exam-answer-${i}`}><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted font-mono-app text-[11px]">{String.fromCharCode(65 + i)}</span>{opt}</button>)}</div></div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><button disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold disabled:opacity-40" data-testid="button-exam-prev">Previous</button><button disabled={index === session.questions.length - 1} onClick={() => setIndex((i) => i + 1)} className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold disabled:opacity-40" data-testid="button-exam-next">Next</button></div><button onClick={() => setConfirming(true)} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-exam-finish">Submit exam</button></div>
    <div className="mt-4 flex flex-wrap gap-1.5">{session.questions.map((q, i) => <button key={q.id} onClick={() => setIndex(i)} className={cn('grid size-8 place-items-center rounded-lg text-[11px] font-bold', i === index ? 'bg-primary text-primary-foreground' : answers[q.id] != null ? 'bg-[#d7eee4] text-[#164b4b]' : 'bg-muted text-muted-foreground')} data-testid={`button-exam-nav-${i}`}>{i + 1}</button>)}</div>
    {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-2xl bg-card p-6"><h3 className="font-bold">Submit this exam?</h3><p className="mt-2 text-xs text-muted-foreground">You've answered {answeredCount} of {session.questions.length} questions. This can't be undone.</p><div className="mt-5 flex gap-2"><button onClick={() => setConfirming(false)} className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold" data-testid="button-cancel-submit">Keep going</button><button onClick={() => submit.mutate()} disabled={submit.isPending} className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-confirm-submit">{submit.isPending ? 'Submitting…' : 'Submit'}</button></div></div></div>}
  </div>;
}

export default TakeExam;

// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, type TouchEvent, useState, useEffect, useRef, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, useSearch, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, ChevronDown,
  CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen,
  LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus,
  ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2,
  TrendingUp, TrendingDown, Minus, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark,
  Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash,
  GraduationCap, Eye, EyeOff, Smartphone, UploadCloud, ImageOff,
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Link2 as LinkIcon, Lightbulb,
  LayoutGrid, Presentation, Wand2, Crown, Globe, Star, Activity, CircleSlash
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
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
import { SkeletonPage, usePageTitle, Badge, cn } from '@/lib/shared';

// Circular score ring — replaces the flat percentage number with an
// animated SVG gauge so the headline stat reads at a glance (green arc
// closer to full = closer to 100%, red when the attempt failed).
function ScoreRing({ percentage, passed }: { percentage: number; passed: boolean | null }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const tone = passed === false ? '#a34c3e' : '#1f9d6f';
  return <div className="relative mx-auto grid size-32 shrink-0 place-items-center sm:size-36">
    <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
      <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="9" className="stroke-muted" />
      <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        style={{ stroke: tone, transition: 'stroke-dasharray 1s cubic-bezier(.4,0,.2,1)' }} />
    </svg>
    <div className="text-center">
      <div className="font-display text-3xl leading-none sm:text-4xl">{clamped.toFixed(1)}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Percent</div>
    </div>
  </div>;
}

// Tiny correct/wrong/skipped donut — same three numbers as the stat row
// below, just given a shape so proportions are legible without doing math.
function OutcomeDonut({ correct, wrong, skipped }: { correct: number; wrong: number; skipped: number }) {
  const total = correct + wrong + skipped;
  if (!total) return null;
  const data = [
    { name: 'Correct', value: correct, color: '#1f9d6f' },
    { name: 'Wrong', value: wrong, color: '#c9503f' },
    { name: 'Skipped', value: skipped, color: '#c8ccd2' },
  ].filter((d) => d.value > 0);
  return <div className="size-16 shrink-0 sm:size-20"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius="62%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none">{data.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie></PieChart></ResponsiveContainer></div>;
}

type ReviewFilter = 'all' | 'wrong' | 'correct' | 'skipped';

// Achievements are computed client-side from data already on the page (this
// result + the student's own dashboard streak) — no new backend model, same
// "read only what already exists" approach as Student 360° on the admin
// side. Recomputed on every view, so it's really "what this attempt
// demonstrates" rather than a persisted unlock log.
type Achievement = { id: string; label: string; icon: typeof Trophy; tone: string };
function computeResultAchievements(r: ExamResult, streak: number): Achievement[] {
  const total = r.totalQuestions ?? 0;
  const pct = r.percentage ?? 0;
  const correct = r.correctCount ?? 0;
  const skipped = r.unansweredCount ?? 0;
  const list: Achievement[] = [];
  if (total > 0 && correct === total) list.push({ id: 'perfect', label: 'Perfect score', icon: Crown, tone: 'bg-[#fdeecb] text-[#8a5a12]' });
  else if (pct >= 90) list.push({ id: 'high', label: 'High scorer · 90%+', icon: Star, tone: 'bg-[#fdeecb] text-[#8a5a12]' });
  if (r.passed === true) list.push({ id: 'passed', label: 'Exam passed', icon: CheckCheck, tone: 'bg-[#d7eee4] text-[#164b4b]' });
  if (total > 1 && skipped === 0) list.push({ id: 'noskip', label: 'Answered every question', icon: Target, tone: 'bg-[#dceaf1] text-[#2c6a8f]' });
  if (streak >= 7) list.push({ id: 'week', label: `${streak}-day streak`, icon: Zap, tone: 'bg-[#f0e6fb] text-[#6a3fa0]' });
  else if (streak >= 3) list.push({ id: 'streak', label: `${streak}-day streak`, icon: Flame, tone: 'bg-[#ffe9df] text-[#b5502f]' });
  return list;
}

function ExamResult() {
  const params = useParams();
  const attemptId = Number(params.attemptId);
  const q = useQuery({ queryKey: ['exam-result', attemptId], queryFn: () => examsApi.result(attemptId), refetchInterval: (query) => query.state.data?.released ? false : 5000 });
  const dashboard = useGetStudentDashboard();
  const r = q.data;
  // The result payload doesn't carry the exam's title back (only score
  // data), so this can't show the paper name the way TakeExam does — but
  // it still replaces the raw "Exams / Result / 2" path-derived header
  // with a clean, numberless label.
  usePageTitle('Exam Result');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  if (q.isLoading) return <SkeletonPage />;

  if (!r?.released) return <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 text-center">
    <div className="mx-auto grid size-16 place-items-center rounded-full bg-muted"><Clock3 size={26} className="text-muted-foreground" /></div>
    <h2 className="mt-4 font-display text-lg">Results not released yet</h2>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Your admin will release results according to this exam's settings. This page checks automatically every few seconds — feel free to leave it open.</p>
    <Link href="/exams" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-primary" data-testid="link-back-to-exams"><ArrowLeft size={13} /> Back to exams</Link>
  </div>;

  const breakdown = r.breakdown ?? [];
  const passed = r.passed;
  const percentage = r.percentage ?? 0;
  const correctCount = r.correctCount ?? 0;
  const wrongCount = r.wrongCount ?? 0;
  const skippedCount = r.unansweredCount ?? 0;
  const totalQuestions = r.totalQuestions ?? breakdown.length;
  const achievements = computeResultAchievements(r, dashboard.data?.streak ?? 0);

  const status = (b: (typeof breakdown)[number]): ReviewFilter => (b.selectedAnswer == null ? 'skipped' : b.correct ? 'correct' : 'wrong');
  const counts = { all: breakdown.length, correct: correctCount, wrong: wrongCount, skipped: skippedCount };
  const filtered = breakdown
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => filter === 'all' || status(b) === filter)
    .filter(({ b }) => !search.trim() || b.question.toLowerCase().includes(search.trim().toLowerCase()));

  const filterTabs: Array<[ReviewFilter, string, string]> = [
    ['all', 'All', 'text-foreground'],
    ['wrong', 'Wrong', 'text-[#a34c3e]'],
    ['correct', 'Correct', 'text-[#287058]'],
    ['skipped', 'Skipped', 'text-muted-foreground'],
  ];

  return <div className="max-w-3xl">
    <Link href="/exams" className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-to-exams-top"><ArrowLeft size={13} /> Back to exams</Link>

    {/* Hero score card */}
    <div className={cn('overflow-hidden rounded-3xl border p-6 sm:p-8', passed === false ? 'border-[#f0d3cc] bg-gradient-to-br from-[#fff7f5] to-card' : 'border-[#cfe9dd] bg-gradient-to-br from-[#f2faf6] to-card')}>
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
        <ScoreRing percentage={percentage} passed={passed ?? null} />
        <div className="flex-1">
          <div className={cn('mx-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold sm:mx-0', passed === false ? 'bg-destructive/10 text-destructive' : 'bg-[#d7eee4] text-[#164b4b]')}>
            {passed === false ? <X size={13} /> : <Trophy size={13} />} {passed === false ? 'Not passed' : passed === null ? 'Ungraded' : 'Passed'}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{totalQuestions} question{totalQuestions === 1 ? '' : 's'} · {r.score != null ? `${r.score} marks scored` : `${correctCount}/${totalQuestions} correct`}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
            <div className="flex items-center gap-3">
              <OutcomeDonut correct={correctCount} wrong={wrongCount} skipped={skippedCount} />
              <div className="space-y-1 text-left text-[11px] font-semibold">
                <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#1f9d6f]" /> {correctCount} correct</div>
                <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#c9503f]" /> {wrongCount} wrong</div>
                <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#c8ccd2]" /> {skippedCount} skipped</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {!!achievements.length && <div className="mt-5 flex flex-wrap gap-2 border-t border-black/5 pt-4">
        {achievements.map((a) => <span key={a.id} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold', a.tone)} data-testid={`badge-achievement-${a.id}`}><a.icon size={13} />{a.label}</span>)}
      </div>}
    </div>

    {/* Question review */}
    {!!breakdown.length && <div className="mt-6">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {filterTabs.map(([id, label]) => <button key={id} onClick={() => setFilter(id)} data-testid={`button-filter-${id}`}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition-colors', filter === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
            {label} <span className={cn('rounded-full px-1.5 text-[10px]', filter === id ? 'bg-white/20' : 'bg-muted')}>{counts[id]}</span>
          </button>)}
        </div>
        <div className="relative w-full sm:w-56"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={13} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" className="h-9 w-full rounded-xl border border-border bg-card pl-8 pr-3 text-xs outline-none" data-testid="input-search-review" /></div>
      </div>

      {!filtered.length ? <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground"><CircleSlash size={20} className="mx-auto mb-2" />Nothing matches this filter.</div>
        : <div className="mt-4 space-y-2.5">{filtered.map(({ b, i }) => {
          const st = status(b);
          const open = openId === b.mcqId;
          const tone = st === 'correct' ? 'border-[#d7eee4]' : st === 'wrong' ? 'border-[#f0d3cc]' : 'border-border';
          const icon = st === 'correct' ? <CheckCircle2 size={15} className="text-[#287058]" /> : st === 'wrong' ? <X size={15} className="text-[#a34c3e]" /> : <CircleHelp size={15} className="text-muted-foreground" />;
          return <div key={b.mcqId} className={cn('overflow-hidden rounded-2xl border bg-card', tone)} data-testid={`card-result-question-${b.mcqId}`}>
            <button onClick={() => setOpenId(open ? null : b.mcqId)} className="flex w-full items-start gap-3 p-4 text-left">
              {icon}
              <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Question {i + 1}</div><p className="mt-0.5 text-sm font-bold leading-5">{b.question}</p></div>
              <ChevronDown size={15} className={cn('mt-0.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </button>
            {open && <div className="space-y-1.5 border-t border-border p-4 pt-3 text-xs">{b.options.map((opt, oi) => { const optExplanation = b.optionExplanations?.[oi]; const isCorrectOpt = opt === b.correctAnswer; return <div key={opt} className={cn('rounded-lg px-2.5 py-1.5', isCorrectOpt ? 'bg-[#e6f3ed]' : opt === b.selectedAnswer ? 'bg-[#fff1ed]' : 'bg-muted/40')}><div className={cn('flex items-center gap-1.5', isCorrectOpt && 'font-bold text-[#287058]')}>{isCorrectOpt && <Check size={12} />}{opt}{opt === b.selectedAnswer && !isCorrectOpt && <span className="ml-1 text-[10px] font-bold text-[#a34c3e]">Your answer</span>}</div>{optExplanation && <div className={cn('mt-1 text-[11px] leading-4', isCorrectOpt ? 'text-[#287058]' : 'text-muted-foreground')}>{optExplanation}</div>}</div>; })}{!b.optionExplanations && b.explanation && <p className="mt-1 flex items-start gap-1.5 text-muted-foreground"><Lightbulb size={12} className="mt-0.5 shrink-0" />{b.explanation}</p>}</div>}
          </div>;
        })}</div>}
    </div>}
  </div>;
}

// Keeps the browser-tab icon in sync with whatever favicon an admin has
// uploaded, without needing a server-rendered <head> per request. Runs once
// per app load and again whenever the cached site-content changes.

export default ExamResult;

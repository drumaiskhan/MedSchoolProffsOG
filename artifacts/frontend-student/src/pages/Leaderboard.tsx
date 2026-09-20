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
import { EmptyState, Podium, SectionHeader, SkeletonPage, cn, initials } from '@/lib/shared';

function Leaderboard() {
  const [range, setRange] = useState('30d');
  const board = useQuery({ queryKey: ['leaderboard', range], queryFn: () => analyticsApi.leaderboard(range), refetchInterval: 10_000, refetchIntervalInBackground: true });
  const rows = board.data || [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const you = rows.find((r) => r.isYou);
  const beatPercent = you && rows.length > 1 ? Math.round(((rows.length - you.rank) / (rows.length - 1)) * 100) : null;
  const rangeLabels: Record<string, string> = { '7d': 'Weekly', '30d': 'Monthly', '3m': 'Quarterly', '1y': 'Yearly' };

  // Bug fix: this page used to go straight from "board.data || []" to
  // rendering — a slow first load and an actual fetch failure both looked
  // identical to "nobody has practiced yet" (the EmptyState below), with no
  // way to tell the difference or retry. Every other data page in the app
  // (Dashboard, Books, etc.) shows a skeleton while loading and surfaces
  // errors explicitly; this brings Leaderboard in line with that, using the
  // same SectionHeader page-header convention every other page uses too
  // (this page previously built its own one-off header inside the card).
  if (board.isLoading) return <div><SectionHeader eyebrow="Community" title="Leaderboard" description="See how you rank against other students." /><SkeletonPage /></div>;

  return <div>
    <SectionHeader eyebrow="Community" title="Leaderboard" description="See how you rank against other students." action={<span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex size-1.5 rounded-full bg-primary" /></span>Live</span>} />

    {board.isError ? <EmptyState
      icon={AlertTriangle}
      title="Couldn't load the leaderboard"
      body={board.error instanceof ApiRequestError ? board.error.message : "Something went wrong reaching the server. Check your connection and try again."}
      action={<button onClick={() => board.refetch()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-retry-leaderboard"><RotateCcw size={13} /> Try again</button>}
    /> : <>
      <div className="overflow-hidden rounded-3xl border border-border bg-card p-6">
        <p className="text-[11px] font-semibold text-muted-foreground">See how you stack up against the community</p>
        <div className="mt-4 flex gap-1.5 rounded-2xl bg-muted p-1.5">{['7d', '30d', '3m', '1y'].map((r) => <button key={r} onClick={() => setRange(r)} className={cn('flex-1 rounded-xl px-2 py-2 text-[11px] font-bold transition-colors', range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')} data-testid={`button-range-${r}`}>{rangeLabels[r]}</button>)}</div>
        {you && beatPercent !== null && <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#fdeecb] px-4 py-3.5" data-testid="banner-your-rank">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-base font-extrabold text-[#8a5a12]">#{you.rank}</span>
          <p className="text-xs font-extrabold leading-5 text-[#5c3d0c]">You are doing better than {beatPercent}% of other players!</p>
        </div>}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-muted p-3.5 text-center"><Star size={16} className="mx-auto text-[#e8c34a]" fill="currentColor" /><div className="mt-1.5 text-lg font-extrabold">{you?.points ?? 0}</div><div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Points</div></div>
          <div className="rounded-2xl bg-muted p-3.5 text-center"><Globe size={16} className="mx-auto text-[#5a7fbd]" /><div className="mt-1.5 text-lg font-extrabold">{you ? `#${you.rank}` : '—'}</div><div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Your rank</div></div>
          <div className="rounded-2xl bg-muted p-3.5 text-center"><Zap size={16} className="mx-auto text-primary" /><div className="mt-1.5 text-lg font-extrabold">{you?.accuracy ?? 0}%</div><div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Accuracy</div></div>
        </div>
      </div>
      <div className="mt-5">{top3.length >= 1 && <Podium rows={top3} />}</div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{rest.map((row) => <div key={row.userId} className={cn('flex items-center justify-between border-b border-border px-4 py-3.5 last:border-0', row.isYou && 'bg-primary/5 ring-1 ring-inset ring-primary/30')} data-testid={`row-leaderboard-${row.userId}`}>
        <div className="flex items-center gap-3"><span className="w-6 text-center text-sm font-extrabold text-muted-foreground">{row.rank}</span><div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-[11px] font-extrabold text-[#287058]">{initials(row.name)}</div><div className="min-w-0"><div className="truncate text-sm font-bold">{row.name}{row.isYou && <span className="ml-1.5 text-[10px] font-bold text-primary">(you)</span>}</div>{row.institution && <div className="truncate text-[10px] text-muted-foreground">{row.institution}</div>}</div></div>
        <div className="text-right"><div className="text-sm font-extrabold text-[#8a5a12]">{row.points} pts</div><div className="text-[10px] text-muted-foreground">{row.accuracy}% acc · {row.questionsAnswered} questions · {row.sessions} sessions</div></div>
      </div>)}{!rows.length && <EmptyState icon={Trophy} title="No activity yet" body="Complete a practice session to appear on the leaderboard." />}</div>
    </>}
  </div>;
}

export default Leaderboard;

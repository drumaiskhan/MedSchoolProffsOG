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
import { EmptyState, SectionHeader, cn } from '@/lib/shared';
import { ReviewTabs } from '@/components/study/ReviewTabs';
import { queryClient } from '@/lib/query-client';

function FlaggedMcqs() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [term, setTerm] = useState('');
  const flags = useQuery({ queryKey: ['flagged-mcqs'], queryFn: flaggedMcqsApi.list });
  // Bug fix: "Remove" used to call the mutation and just hope — no toast on
  // success, and the old backend route silently returned {ok:true} even
  // when nothing was actually deleted (see student-tools.ts), so a failed
  // remove looked identical to a working one. The route now reports real
  // failures (404) and this surfaces both outcomes instead of only errors.
  const remove = useMutation({
    mutationFn: flaggedMcqsApi.remove,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flagged-mcqs'] }); toast({ title: 'Removed' }); },
    onError: (err: unknown) => toast({ title: 'Could not remove this', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  return <div>
    <SectionHeader eyebrow="Your tools" title="Flagged MCQs" description="Questions you bookmarked or flagged for review." />
    <ReviewTabs />
    {!!flags.data?.length && <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="flag-toolbar">
      <div className="flex overflow-hidden rounded-xl border border-border bg-card text-xs font-extrabold">{(['all', 'open', 'resolved'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-2 capitalize transition-colors', filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{f}{f !== 'all' && ` · ${flags.data!.filter((x) => x.status === f).length}`}</button>)}</div>
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search flagged questions…" className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-search-flags" />
      {flags.data.some((f) => f.status === 'open' && !f.mcqDeleted) && <button onClick={() => navigate('/practice?set=flagged&count=20')} className="rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground transition-transform active:scale-95" data-testid="button-practice-flagged">Practice flagged</button>}
    </div>}
    <div className="space-y-3">
      {(flags.data || []).filter((f) => (filter === 'all' || f.status === filter) && (!term.trim() || `${f.question ?? ''} ${f.path ?? ''} ${f.reason}`.toLowerCase().includes(term.trim().toLowerCase()))).map((flag: FlaggedMcq) => <div key={flag.id} className="rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md pf-edit" data-testid={`card-flag-${flag.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Block > Module > Subject > Topic breadcrumb — null when the
                MCQ (or its curriculum placement) is gone, e.g. an
                exam-only/past-paper-only question with no module tagging. */}
            {flag.path && <p className="mb-1 truncate text-[10px] font-extrabold uppercase tracking-wide text-primary" data-testid={`text-flag-path-${flag.id}`}>{flag.path}</p>}
            <p className="line-clamp-2 text-sm font-bold" data-testid={`text-flag-question-${flag.id}`}>{flag.question ?? `This question is no longer available (MCQ #${flag.mcqId}).`}</p>
            {flag.reason && <p className="mt-1 text-[11px] text-muted-foreground">{flag.reason}</p>}
            <span className={cn('mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold', flag.status === 'open' ? 'bg-[#fdeecb] text-[#8a5a12]' : 'bg-[#d7eee4] text-[#164b4b]')}>{flag.status}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => navigate(`/practice?mcqId=${flag.mcqId}`)} disabled={flag.mcqDeleted} title={flag.mcqDeleted ? 'This question no longer exists' : undefined} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-open-flag-${flag.id}`}>Open</button>
            <button onClick={() => remove.mutate(flag.id)} disabled={remove.isPending} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive disabled:opacity-50" data-testid={`button-unflag-${flag.id}`}>Remove</button>
          </div>
        </div>
      </div>)}
      {!flags.data?.length && <EmptyState icon={Flag} title="Nothing flagged" body="Flag a question from a practice session to come back to it later." />}
    </div>
  </div>;
}

// Podium/Leaderboard (round 3): reverted from the previous dark/gold "game
// card" palette back to the same light theme + design tokens the rest of
// the app uses (bg-card/border-border/text-foreground, primary accent) —
// per explicit request that this page stop looking different from the rest
// of the site. Medal tones (gold/silver/bronze) are kept as accent colors
// since they're meaningful, just re-picked to sit on a light background
// instead of a dark one.

export default FlaggedMcqs;

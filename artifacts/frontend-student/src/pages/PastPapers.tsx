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
import { EmptyState, PastPaperRowIcon, SectionHeader, SkeletonPage, StatTile, pastPaperEstimatedHours } from '@/lib/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function PastPapers() {
  const papers = useQuery({ queryKey: ['past-papers'], queryFn: () => pastPapersApi.list() });
  const list = papers.data || [];
  // Scoping to the student's own program/year now happens server-side (see
  // GET /past-papers), the same way exam eligibility does — so there's no
  // more manual "All levels" toggle needed here; students just see what
  // applies to them. Just two client-side filters on top of that:
  // Colleges/University (the paper's `examBoard` — that field is actually
  // functioning as the college/university code, e.g. "KMU", "WMC") and
  // Year (the paper's `year`, e.g. "2023" — whatever the admin typed in
  // when it was uploaded). The old "All Subjects"/"All Modules" filters
  // built off examBoard/level were dropped — a past paper doesn't really
  // have a subject or module, and that pairing was confusing.
  const [collegeFilter, setCollegeFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const colleges = Array.from(new Set(list.map((p) => p.examBoard).filter(Boolean))).sort();
  const years = Array.from(new Set(list.map((p) => p.year).filter(Boolean))).sort().reverse();
  const filtered = list.filter((p) => (!collegeFilter || p.examBoard === collegeFilter) && (!yearFilter || p.year === yearFilter));
  const totals = { papers: list.length, questions: list.reduce((s, p) => s + p.mcqCount, 0) };

  return <div><SectionHeader eyebrow="Exam practice" title="Past Papers" description="Previous exam papers and practice tests." />
    <div className="grid grid-cols-2 gap-4"><StatTile icon={FileStack} bg="bg-[#dceaf1]" fg="text-[#2c6a8f]" label="Available papers" value={totals.papers} /><StatTile icon={Target} bg="bg-[#d7eee4]" fg="text-[#1f7a5c]" label="Total questions" value={totals.questions} /></div>

  {/* Radix Select (same component the Flashcards filters use), not a
      native <select> — the native element's dropdown is rendered by the
      browser itself with no control over how it's positioned, which is
      what made it render squashed/overlapping the list below on some
      browsers. Radix renders its own floating panel (via a portal, fixed
      to the trigger), matching the Flashcards filter bar's behavior. */}
  <div className="mt-5 flex flex-wrap gap-2">
    <Select value={collegeFilter || 'all'} onValueChange={(v) => setCollegeFilter(v === 'all' ? '' : v)}>
      <SelectTrigger className="h-10 w-auto min-w-[9rem] rounded-xl border-border bg-card px-3 text-xs font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid="select-paper-filter-college">
        <SelectValue placeholder="Colleges/University" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Colleges/University</SelectItem>
        {colleges.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
    <Select value={yearFilter || 'all'} onValueChange={(v) => setYearFilter(v === 'all' ? '' : v)}>
      <SelectTrigger className="h-10 w-auto min-w-[7rem] rounded-xl border-border bg-card px-3 text-xs font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid="select-paper-filter-year">
        <SelectValue placeholder="Year" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Year</SelectItem>
        {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>

  {papers.isLoading ? <SkeletonPage /> : filtered.length ? <div className="mt-5 space-y-3">{filtered.map((paper) => {
    const hours = pastPaperEstimatedHours(paper.mcqCount);
    return <div key={paper.id} className="card-lift flex items-center gap-4 rounded-2xl border border-border bg-card p-4" data-testid={`card-paper-${paper.id}`}>
      <PastPaperRowIcon examBoard={paper.examBoard} />
      <div className="min-w-0 flex-1">
        {/* Always the paper's own title (the "Block A"/"Block B" name it
            was given in admin) — previously this fell back to showing the
            college code instead whenever one was set, so the same list
            showed a mix of college names and block names depending on the
            paper. The college + year now sit together on the small line
            above it instead, consistently, whether or not a college was set. */}
        <div className="text-[11px] font-bold text-muted-foreground">{[paper.examBoard, paper.year].filter(Boolean).join(' · ')}</div>
        <div className="truncate text-sm font-extrabold leading-5">{paper.title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{paper.mcqCount} Question{paper.mcqCount === 1 ? '' : 's'} · {hours} Hour{hours === 1 ? '' : 's'}</div>
      </div>
      <Link href={`/practice?pastPaperId=${paper.id}`} className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid={`button-start-paper-${paper.id}`}>View</Link>
    </div>;
  })}</div> : <EmptyState icon={FileStack} title="No past papers yet" body="Your admin can add past papers from Admin → Past papers, or none match these filters yet." />}
  </div>;
}

export default PastPapers;

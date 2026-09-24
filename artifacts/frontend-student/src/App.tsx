import { type ReactNode, type ComponentProps, type TouchEvent, useState, useEffect, useRef, createContext, useContext, lazy, Suspense } from 'react';
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
import './index.css';
import { Shell, SkeletonPage, BrandedLoadingScreen, FocusModeContext, PageTitleContext, useFaviconSync, useThemeSync } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

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

// NOTE (perf pass): App.tsx used to define every page component inline
// (2000+ lines, all shipped in one JS chunk on first load). Pages now
// live under src/pages/ and are code-split with React.lazy — only the
// current route's chunk is fetched. Shared chrome (Shell, SideNav,
// helper components/hooks) lives in src/lib/shared.tsx and stays in the
// main bundle since it's needed on every route anyway.


// Route-level code splitting: each page ships as its own chunk and is
// only fetched when its route is actually visited.
const Home = lazy(() => import('@/pages/Home'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));
// Public marketing pages — added for SEO (own crawlable URLs so search
// engines can pick them up as sitelinks; see index.html's
// SiteNavigationElement JSON-LD which points at these same routes).
const About = lazy(() => import('@/pages/About'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Contact = lazy(() => import('@/pages/Contact'));
const Faq = lazy(() => import('@/pages/Faq'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Blocks = lazy(() => import('@/pages/Blocks'));
const BlockDetail = lazy(() => import('@/pages/BlockDetail'));
const ModulesRedirect = lazy(() => import('@/pages/ModulesRedirect'));
const Subjects = lazy(() => import('@/pages/Subjects'));
const Practice = lazy(() => import('@/pages/Practice'));
const Exams = lazy(() => import('@/pages/Exams'));
const TakeExam = lazy(() => import('@/pages/TakeExam'));
const ExamResult = lazy(() => import('@/pages/ExamResult'));
const OspeOsce = lazy(() => import('@/pages/OspeOsce'));
const TakeOspeExam = lazy(() => import('@/pages/TakeOspeExam'));
const OspeExamResult = lazy(() => import('@/pages/OspeExamResult'));
const PastPapers = lazy(() => import('@/pages/PastPapers'));
const Flashcards = lazy(() => import('@/pages/Flashcards'));
const AiVisualizer = lazy(() => import('@/pages/AiVisualizer'));
const Books = lazy(() => import('@/pages/Books'));
const Notebook = lazy(() => import('@/pages/Notebook'));
const SavedSessions = lazy(() => import('@/pages/SavedSessions'));
const StudyHub = lazy(() => import('@/pages/StudyHub'));
const FlaggedMcqs = lazy(() => import('@/pages/FlaggedMcqs'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const Challenge = lazy(() => import('@/pages/Challenge'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Payments = lazy(() => import('@/pages/Payments'));
const MyProgress = lazy(() => import('@/pages/Progress'));
const BookReader = lazy(() => import('@/pages/BookReader'));
const Feedback = lazy(() => import('@/pages/Feedback'));
const Profile = lazy(() => import('@/pages/Profile'));

// v59 — warm the route chunk the moment a student hovers, focuses or touches a
// link, so the click lands on an already-downloaded page (no Suspense flash).
const ROUTE_PREFETCH: Array<[string, () => Promise<unknown>]> = [
  ['/dashboard', () => import('@/pages/Dashboard')],
  ['/blocks', () => import('@/pages/Blocks')],
  ['/modules', () => import('@/pages/ModulesRedirect')],
  ['/subjects', () => import('@/pages/Subjects')],
  ['/topics', () => import('@/pages/Subjects')],
  ['/practice', () => import('@/pages/Practice')],
  ['/exams', () => import('@/pages/Exams')],
  ['/ospe-osce', () => import('@/pages/OspeOsce')],
  ['/past-papers', () => import('@/pages/PastPapers')],
  ['/flashcards', () => import('@/pages/Flashcards')],
  ['/ai-visualizer', () => import('@/pages/AiVisualizer')],
  ['/books', () => import('@/pages/Books')],
  ['/notebook', () => import('@/pages/Notebook')],
  ['/saved-sessions', () => import('@/pages/SavedSessions')],
  ['/flagged-mcqs', () => import('@/pages/FlaggedMcqs')],
  ['/study', () => import('@/pages/StudyHub')],
  ['/progress', () => import('@/pages/Progress')],
  ['/leaderboard', () => import('@/pages/Leaderboard')],
  ['/challenge', () => import('@/pages/Challenge')],
  ['/notifications', () => import('@/pages/Notifications')],
  ['/payments', () => import('@/pages/Payments')],
  ['/feedback', () => import('@/pages/Feedback')],
  ['/profile', () => import('@/pages/Profile')],
];
function usePrefetchRoutes() {
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const seen = new Set<string>();
    const warm = (e: Event) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.origin !== window.location.origin) return;
      const path = a.pathname.startsWith(base) ? a.pathname.slice(base.length) : a.pathname;
      const hit = ROUTE_PREFETCH.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
      if (!hit || seen.has(hit[0])) return;
      seen.add(hit[0]);
      hit[1]().catch(() => seen.delete(hit[0]));
    };
    const opts = { passive: true, capture: true } as const;
    document.addEventListener('pointerover', warm, opts);
    document.addEventListener('focusin', warm, opts);
    document.addEventListener('touchstart', warm, opts);
    return () => {
      document.removeEventListener('pointerover', warm, opts);
      document.removeEventListener('focusin', warm, opts);
      document.removeEventListener('touchstart', warm, opts);
    };
  }, []);
}

function AppRoutes() {
 usePrefetchRoutes();
 useFaviconSync();
 useThemeSync();
 // Was <SkeletonPage /> here — that's meant to sit inside Shell's padded
 // content area (it has no header/sidebar of its own), so when it fired
 // for a route-level lazy import it rendered as a bare, unstyled block of
 // skeleton rectangles floating on a plain white page instead of a proper
 // loading state. BrandedLoadingScreen is self-contained (full-height,
 // its own background) and is already what every other loading gap in
 // this app uses, so route transitions now look the same as the initial
 // boot / session-restore loaders instead of flashing blank white.
 return <Suspense fallback={<BrandedLoadingScreen />}><Switch><Route path="/login" component={Login} /><Route path="/register" component={Register} /><Route path="/forgot-password" component={ForgotPassword} /><Route path="/reset-password" component={ResetPassword} /><Route path="/verify-email" component={VerifyEmail} /><Route path="/" component={Home} /><Route path="/about" component={About} /><Route path="/pricing" component={Pricing} /><Route path="/contact" component={Contact} /><Route path="/faq" component={Faq} /><Route path="/dashboard"><Shell><Dashboard /></Shell></Route><Route path="/blocks"><Shell><Blocks /></Shell></Route><Route path="/blocks/:id"><Shell><BlockDetail /></Shell></Route><Route path="/modules"><Shell><ModulesRedirect /></Shell></Route><Route path="/modules/:id"><Shell><Subjects /></Shell></Route><Route path="/subjects"><Shell><Subjects /></Shell></Route><Route path="/subjects/:id"><Shell><Subjects topics /></Shell></Route><Route path="/topics"><Shell><Subjects topics /></Shell></Route><Route path="/practice"><Shell><Practice /></Shell></Route><Route path="/exams"><Shell><Exams /></Shell></Route><Route path="/exams/take/:attemptId"><Shell><TakeExam /></Shell></Route><Route path="/exams/result/:attemptId"><Shell><ExamResult /></Shell></Route><Route path="/ospe-osce"><Shell><OspeOsce /></Shell></Route><Route path="/ospe-osce/take/:attemptId"><Shell><TakeOspeExam /></Shell></Route><Route path="/ospe-osce/result/:attemptId"><Shell><OspeExamResult /></Shell></Route><Route path="/past-papers"><Shell><PastPapers /></Shell></Route><Route path="/flashcards"><Shell><Flashcards /></Shell></Route><Route path="/ai-visualizer"><Shell><AiVisualizer /></Shell></Route><Route path="/books"><Shell><Books /></Shell></Route><Route path="/books/:id/read"><Shell><BookReader /></Shell></Route><Route path="/notebook"><Shell><Notebook /></Shell></Route><Route path="/saved-sessions"><Shell><SavedSessions /></Shell></Route><Route path="/study"><Shell><StudyHub /></Shell></Route><Route path="/flagged-mcqs"><Shell><FlaggedMcqs /></Shell></Route><Route path="/progress"><Shell><MyProgress /></Shell></Route><Route path="/leaderboard"><Shell><Leaderboard /></Shell></Route><Route path="/challenge"><Shell><Challenge /></Shell></Route><Route path="/notifications"><Shell><Notifications /></Shell></Route><Route path="/payments"><Shell><Payments /></Shell></Route><Route path="/feedback"><Shell><Feedback /></Shell></Route><Route path="/profile"><Shell><Profile /></Shell></Route><Route component={NotFound} /></Switch></Suspense>; }
function App() {
  const [focusMode, setFocusMode] = useState(false);
  const [strictFocusMode, setStrictFocusMode] = useState(false);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  return <QueryClientProvider client={queryClient}><TooltipProvider><FocusModeContext.Provider value={{ focusMode, setFocusMode, strictFocusMode, setStrictFocusMode }}><PageTitleContext.Provider value={{ pageTitle, setPageTitle }}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppRoutes /></ErrorBoundary></WouterRouter><Toaster /></PageTitleContext.Provider></FocusModeContext.Provider></TooltipProvider></QueryClientProvider>;
}
export default App;

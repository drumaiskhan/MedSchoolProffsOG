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
  GraduationCap, CalendarDays, Eye, EyeOff, Smartphone, UploadCloud, ImageOff,
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Link2 as LinkIcon, Lightbulb,
  LayoutGrid, Presentation, Wand2, Loader2, Crown, Globe, Star, Activity
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
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

const cn = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');
const initials = (name = 'MedschoolProffs') => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
const money = (amount: number, currency = 'PKR') => new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
// Turns a just-finished session's score plus the student's recent-vs-prior
// trend into one short, human verdict for the result card and the
// dashboard progress profile. Session score takes priority when it's a
// clear outlier (a great or rough single session is worth saying so even
// if the broader trend is flat); otherwise it falls back to the trend.
function progressVerdict(sessionScore: number | null, trend?: ProgressTrend | null): { label: string; message: string; tone: 'up' | 'down' | 'flat' | 'new' } {
  const recentAvg = trend?.recentAverage ?? null;
  if (sessionScore != null && recentAvg != null) {
    const diff = sessionScore - recentAvg;
    if (diff >= 15) return { label: 'Great session', tone: 'up', message: `${Math.round(diff)} points above your recent average — that's real progress.` };
    if (diff <= -15) return { label: 'Rough one', tone: 'down', message: `A bit below your recent average — worth another pass on this topic.` };
  }
  if (!trend || trend.trend === 'new') return { label: 'Getting started', tone: 'new', message: 'Keep practicing daily — a trend will show up after a few more sessions.' };
  if (trend.trend === 'up') return { label: 'Improving', tone: 'up', message: `Up ${Math.abs(trend.trendDelta)} points versus the week before. Keep this pace.` };
  if (trend.trend === 'down') return { label: 'Needs more practice', tone: 'down', message: `Down ${Math.abs(trend.trendDelta)} points versus the week before — a bit more daily practice should turn this around.` };
  return { label: 'Steady', tone: 'flat', message: "Holding steady versus last week. Consistent is good — push for a new high next session." };
}
function ProgressBadge({ tone, label }: { tone: 'up' | 'down' | 'flat' | 'new'; label: string }) {
  const styles = tone === 'up' ? 'bg-[#d7eee4] text-[#164b4b]' : tone === 'down' ? 'bg-[#fff1ed] text-[#8a3a26]' : tone === 'new' ? 'bg-[#dceaf1] text-[#32647b]' : 'bg-muted text-muted-foreground';
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Minus;
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold', styles)}><Icon size={12} /> {label}</span>;
}
// Shown once a practice or past-paper session is finished (the set runs
// out) instead of silently looping back to question one — gives the
// student a clear stopping point plus the improving/steady/needs-practice
// read on where they stand.
function PracticeResultCard({ correct, total, backHref, backLabel, onRestart }: { correct: number; total: number; backHref: string; backLabel: string; onRestart: () => void }) {
  const scorePercent = total ? Math.round((correct / total) * 100) : 0;
  const trend = useQuery({ queryKey: ['progress-trend'], queryFn: analyticsApi.progress });
  const verdict = progressVerdict(scorePercent, trend.data);
  return <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center" data-testid="card-practice-result">
    <div className={cn('mx-auto grid size-16 place-items-center rounded-full', verdict.tone === 'down' ? 'bg-destructive/10 text-destructive' : 'bg-[#d7eee4] text-[#164b4b]')}>{verdict.tone === 'down' ? <RotateCcw size={26} /> : <CheckCircle2 size={28} />}</div>
    <div className="mt-5 font-display text-5xl">{scorePercent}%</div>
    <div className="mt-1 text-xs text-muted-foreground">{correct} correct of {total} questions</div>
    <div className="mt-4 flex justify-center">{!trend.isLoading && <ProgressBadge tone={verdict.tone} label={verdict.label} />}</div>
    {!trend.isLoading && <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-muted-foreground" data-testid="text-result-verdict">{verdict.message}</p>}
    <div className="mt-7 flex flex-wrap justify-center gap-2"><button onClick={onRestart} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-practice-again"><RotateCcw size={13} className="mr-1.5 inline" /> Practice again</button><Link href={backHref} className="rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-bold" data-testid="link-result-back">{backLabel}</Link></div>
  </div>;
}

// Small reusable confirm-before-delete dialog, used by every admin list's
// delete action (task: real confirm modal, not window.confirm).
function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onCancel, pending }: { title: string; body: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; pending?: boolean }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={onCancel}><div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl"><h3 className="font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p><div className="mt-5 flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold" data-testid="button-confirm-cancel">Cancel</button><button onClick={onConfirm} disabled={pending} className="flex-1 rounded-xl bg-destructive py-2.5 text-xs font-extrabold text-destructive-foreground disabled:opacity-50" data-testid="button-confirm-delete">{pending ? 'Deleting…' : confirmLabel}</button></div></div></div>;
}

function Logo({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="flex items-center gap-2" data-testid="link-logo">
    <Activity size={20} strokeWidth={2.4} className={dark ? 'text-sidebar-primary' : 'text-primary'} aria-hidden="true" />
    <span className={cn('text-[15px] font-extrabold tracking-[-.03em]', dark ? 'text-sidebar-foreground' : 'text-primary')}>MedschoolProffs</span>
  </Link>;
}

type NavItem = [string, string, typeof LayoutDashboard];
const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Study desk', items: [
    ['/', 'Overview', LayoutDashboard], ['/blocks', 'Blocks', BookOpen], ['/exams', 'Pre-Proffs Exams', ClipboardCheck], ['/past-papers', 'Past papers', FileStack], ['/flashcards', 'Flashcards', Zap], ['/ai-visualizer', 'AI Visualizer', Wand2], ['/books', 'Books', Library], ['/resources', 'Resources', FolderOpen],
  ] },
  { label: 'Your tools', items: [
    ['/notebook', 'My notebook', NotebookPen], ['/saved-sessions', 'Saved sessions', Bookmark], ['/flagged-mcqs', 'Flagged MCQs', Flag], ['/leaderboard', 'Leaderboard', Trophy],
  ] },
  { label: 'Your account', items: [
    ['/payments', 'Membership', CreditCard], ['/notifications', 'Notifications', Bell], ['/feedback', 'Send feedback', MessageSquare], ['/profile', 'Profile & access', ShieldCheck],
  ] },
];

function SideNav({ user, onClose }: { user: User; onClose: () => void }) {
  const [location] = useLocation();
  // AI_VISUALIZER_ENABLED off removes the nav link entirely — see the
  // matching enforcement on the route itself (AiVisualizer component below)
  // and on the backend (POST /ai/visualizer refuses directly too).
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const aiVisualizerEnabled = siteContentQ.data?.AI_VISUALIZER_ENABLED !== 'false';
  const groups = aiVisualizerEnabled ? navGroups : navGroups.map((g) => ({ ...g, items: g.items.filter(([href]) => href !== '/ai-visualizer') }));
  const notifQ = useListNotifications();
  const unreadCount = (notifQ.data ?? []).filter((n) => !n.read).length;
  const logout = useMutation({ mutationFn: authApi.logout, onSuccess: () => { queryClient.clear(); window.location.href = '/login'; } });
  return <aside className="fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col overflow-y-auto bg-sidebar px-3 py-5 text-sidebar-foreground shadow-xl md:sticky md:top-0 md:h-[100dvh] md:shadow-none">
    <div className="mb-8 flex items-center justify-between px-2"><Logo dark /><button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" onClick={onClose} data-testid="button-close-menu"><X size={18} /></button></div>
    <nav className="space-y-5">
       {groups.map((group) => <div key={group.label}><div className="mb-1.5 px-3.5 font-mono-app text-[9px] font-bold uppercase tracking-[.14em] text-sidebar-foreground/40">{group.label}</div><div className="space-y-1">{group.items.map(([href, label, Icon]) => <Link key={href} href={href} onClick={onClose} className={cn('group flex items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] font-semibold transition-colors', location === href ? 'nav-active bg-white text-sidebar shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} strokeWidth={location === href ? 2.2 : 1.8} /><span>{label}</span>{label === 'Notifications' && unreadCount > 0 && <span className="ml-auto grid size-5 place-items-center rounded-full bg-[#e5a952] text-[10px] font-bold text-[#183844]">{unreadCount > 9 ? '9+' : unreadCount}</span>}</Link>)}</div></div>)}
    </nav>
    <div className="mt-auto pt-5">
      <div className="mb-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-4"><div className="mb-2 flex items-center gap-2 text-sidebar-foreground/75"><Sparkles size={14} className="text-[#e5a952]" /><span className="text-xs font-bold">Small steps, daily.</span></div><p className="text-[11px] leading-5 text-sidebar-foreground/50">Keep your streak alive with a 10-minute review.</p><Link href="/modules" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-sidebar-primary" data-testid="link-sidebar-practice">Start a review <ArrowRight size={12} /></Link></div>
      <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-primary text-xs font-extrabold text-sidebar-primary-foreground">{initials(user.name)}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-sidebar-foreground">{user.name}</div><div className="truncate text-[10px] text-sidebar-foreground/45">{user.institution || 'Medical student'}</div></div><button onClick={() => logout.mutate()} disabled={logout.isPending} className="text-sidebar-foreground/50 hover:text-sidebar-foreground disabled:opacity-50" data-testid="button-signout" title="Sign out"><LogOut size={15} /></button></div>
    </div>
  </aside>;
}

function QuickJump({ open, value, onChange, onClose }: { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void }) {
  if (!open) return null;
  const options = navGroups.flatMap((group) => group.items.map(([href, label, Icon]) => ({ href, label, Icon }))).filter((item) => item.label.toLowerCase().includes(value.toLowerCase()));
  return <div className="absolute right-5 top-[58px] z-30 w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl md:right-10" data-testid="panel-quick-jump">
    <div className="border-b border-border/70 p-2"><div className="flex items-center gap-2 rounded-lg bg-muted/70 px-2.5"><Search size={14} className="text-muted-foreground" /><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="Jump to a study area" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" data-testid="input-quick-jump" /><button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-card" data-testid="button-close-quick-jump"><X size={14} /></button></div></div>
    <div className="max-h-72 overflow-y-auto p-1.5">{options.length ? options.map(({ href, label, Icon }) => <Link key={href} href={href} onClick={onClose} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted" data-testid={`link-quick-jump-${label.toLowerCase().replaceAll(' ', '-')}`}><span className="grid size-7 place-items-center rounded-md bg-secondary text-primary"><Icon size={14} /></span>{label}<ChevronRight size={13} className="ml-auto text-muted-foreground" /></Link>) : <div className="px-3 py-5 text-center text-xs text-muted-foreground">No study areas match that search.</div>}</div>
  </div>;
}

// "Focus mode" — hides the sidebar/collapses it to a slim exit bar during an
// active MCQ practice session or exam attempt, both full-screen /
// distraction-free by intent. Lifted above Shell (rather than local Shell
// state) so Practice()/TakeExam() can set it from inside their own route.
const FocusModeContext = createContext<{ focusMode: boolean; setFocusMode: (v: boolean) => void }>({ focusMode: false, setFocusMode: () => {} });
// Lets a page (e.g. TakeExam) override the header's auto-generated,
// URL-derived title — needed because that auto title is just the route
// path with slashes ("Exams / Take / 2"), which surfaces raw numeric
// attempt IDs to students on exam-taking/result pages. A page sets a
// friendly title (the exam/paper name) once it knows it; null falls back
// to the normal path-derived title everywhere else.
const PageTitleContext = createContext<{ pageTitle: string | null; setPageTitle: (v: string | null) => void }>({ pageTitle: null, setPageTitle: () => {} });
function usePageTitle(title: string | null | undefined) {
  const { setPageTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setPageTitle(title ?? null);
    return () => setPageTitle(null);
  }, [title, setPageTitle]);
}
function useFocusMode(active: boolean) {
  const { setFocusMode } = useContext(FocusModeContext);
  useEffect(() => {
    setFocusMode(active);
    return () => setFocusMode(false);
  }, [active, setFocusMode]);
}

// Every route below is wrapped in <Shell>, so this is the one place that has
// to enforce "must be signed in" and "must be admin for /admin/*" before
// rendering real content — a signed-out or under-privileged user should never
// see so much as a flash of the dashboard/admin UI underneath.
function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const [quickJumpValue, setQuickJumpValue] = useState('');
  // retry: false — a failed/unusable current-user response should send the
  // user to /login promptly, not spend several silent retries first.
  const userQuery = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const user = userQuery.data;
  const { focusMode } = useContext(FocusModeContext);

  useEffect(() => {
    // The topbar search button has always shown a "⌘K" hint — this is the
    // listener that actually makes it work, plus the Dashboard's "Search"
    // quick-link tile (which lives outside this component tree, so it
    // reaches this via a custom event rather than a prop).
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setQuickJumpValue(''); setQuickJumpOpen(true); }
    }
    function handleOpenSearchEvent() { setQuickJumpValue(''); setQuickJumpOpen(true); }
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearchEvent);
    return () => { window.removeEventListener('keydown', handleKeydown); window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearchEvent); };
  }, []);

  useEffect(() => {
    if (userQuery.isLoading) return;
    if (!user) {
      // A hard navigation (not wouter's client-side setLocation) so any
      // stale/broken React Query cache from the failed session is fully
      // discarded rather than carried into the next render — a soft route
      // change alone was letting a bad cached response resurface the same
      // crash after refresh instead of landing cleanly on the login page.
      queryClient.clear();
      window.location.href = '/login';
      return;
    }
  }, [user, userQuery.isLoading, setLocation]);

  if (userQuery.isLoading || !user) return <div className="grid min-h-[100dvh] place-items-center bg-background"><SkeletonPage /></div>;
  // Admin accounts are allowed to browse the student portal too (e.g. to see
  // what students see) — the reverse is not true, see the equivalent check
  // in frontend-admin/src/App.tsx's Shell, which still blocks students.

  const { pageTitle } = useContext(PageTitleContext);
  const title = pageTitle ?? (location === '/' ? `Good morning, ${user.name?.split(' ')[0] || 'there'}` : location.slice(1).split('/').map((part) => part.replaceAll('-', ' ')).join(' / '));
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // IMPORTANT: focus mode and the normal layout used to be two separate
  // `if (focusMode) return <...>` branches with entirely different JSX
  // shapes. Since {children} sat at a different depth/position in each
  // branch, React couldn't match the old subtree to the new one when
  // focusMode flipped — it unmounted and remounted {children} from
  // scratch, wiping its state. That's exactly what broke Practice(): the
  // Timed/Untimed buttons call setMode(...), which flips focusMode from
  // false to true via useFocusMode's effect, which swapped Shell's branch
  // and remounted Practice — resetting `mode` straight back to null, so
  // the student appeared to be bounced back to the "How do you want to
  // practice?" screen no matter which option they picked. Same risk
  // existed on mobile: opening/closing the menu changed whether SideNav
  // was mounted at all, shifting {children}'s sibling index and remounting
  // it too. Fixed by keeping one single tree shape at all times — SideNav
  // and the overlay are always mounted (hidden via CSS instead of
  // conditionally rendered), and {children} always sits inside the same
  // `<main><header/><div>{children}</div></main>` position; only the
  // header's *content* differs between focus and normal mode.
  return <div className="flex min-h-[100dvh] bg-background">
    <div className={cn(!focusMode && menuOpen ? 'block' : 'hidden', 'fixed inset-0 z-30 bg-[#071e2b]/45 md:hidden')} onClick={() => setMenuOpen(false)} />
    <div className={cn(focusMode ? 'hidden' : (menuOpen || !isMobile) ? 'block' : 'hidden')}><SideNav user={user} onClose={() => setMenuOpen(false)} /></div>
    <main className="min-w-0 flex-1">
      {focusMode
        ? <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-md md:px-8"><button onClick={() => setLocation('/')} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted" data-testid="button-exit-focus-mode"><ArrowLeft size={15} /> Exit</button><span className="text-xs font-bold capitalize text-foreground">{title}</span></header>
        : <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-border/70 bg-background/92 px-4 backdrop-blur-md md:px-8"><div className="flex min-w-0 items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setMenuOpen(true)} data-testid="button-open-menu"><Menu size={20} /></button><div className="min-w-0"><div className="font-mono-app text-[9px] uppercase tracking-[.16em] text-muted-foreground">{today}</div><h1 className="mt-1 truncate text-[16px] font-bold capitalize tracking-[-.02em] text-foreground">{title}</h1></div></div><div className="relative flex items-center gap-2"><button onClick={() => { setQuickJumpOpen((current) => !current); setQuickJumpValue(''); }} className="hidden h-9 w-[220px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-[11px] text-muted-foreground shadow-sm hover:border-primary/50 sm:flex md:w-[340px]" data-testid="button-open-quick-jump"><Search size={14} /><span className="truncate">Search modules, topics, MCQs...</span><span className="ml-auto rounded border border-border px-1 text-[9px]">⌘K</span></button><Link href="/notifications" className="relative grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted" data-testid="link-notifications"><Bell size={16} /></Link><Link href="/profile" className="ml-1 grid size-8 place-items-center rounded-full bg-[#cdebf0] text-[10px] font-extrabold text-[#0d5267]" data-testid="link-header-profile">{initials(user.name)}</Link><QuickJump open={quickJumpOpen} value={quickJumpValue} onChange={setQuickJumpValue} onClose={() => setQuickJumpOpen(false)} /></div></header>}
      <div className={cn('page-enter', focusMode ? 'px-5 py-6 md:px-10 md:py-8' : 'px-4 py-6 md:px-8 md:py-8')}>{children}</div>
    </main>
  </div>;
}

function SkeletonPage() { return <div className="space-y-5"><div className="skeleton h-8 w-56 rounded-lg" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /></div><div className="skeleton h-72 rounded-2xl" /></div>; }
function EmptyState({ icon: Icon = FolderOpen, title, body, action }: { icon?: typeof FolderOpen; title: string; body: string; action?: ReactNode }) { return <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"><div><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-primary"><Icon size={22} /></div><h3 className="font-bold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div></div>; }
function ErrorState({ retry }: { retry?: () => void }) { return <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-6 text-sm text-[#9e4c39]"><div className="flex items-center gap-2 font-bold"><CircleHelp size={17} /> We couldn't load this view.</div><p className="mt-2 text-[#a96a5b]">Check your connection, then try again.</p>{retry && <button onClick={retry} className="mt-4 rounded-lg bg-[#a9533f] px-3 py-2 text-xs font-bold text-white" data-testid="button-retry">Try again</button>}</div>; }
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize', tone === 'green' && 'bg-[#d7eee4] text-[#287058]', tone === 'amber' && 'bg-[#fff0cb] text-[#8d6420]', tone === 'red' && 'bg-[#f9ddd6] text-[#a34c3e]', tone === 'blue' && 'bg-[#dceaf1] text-[#32647b]', tone === 'neutral' && 'bg-muted text-muted-foreground')}>{children}</span>; }

// easy -> green, moderate -> blue, hard -> red — was a hardcoded blue
// regardless of value.
function difficultyTone(difficulty?: string | null): 'green' | 'blue' | 'red' {
  if (difficulty === 'easy') return 'green';
  if (difficulty === 'hard') return 'red';
  return 'blue';
}
function Progress({ value, color = 'bg-primary' }: { value: number; color?: string }) { return <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }
function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) { return <div className="mb-5 flex items-end justify-between gap-4"><div>{eyebrow && <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">{eyebrow}</div>}<h2 className="mt-1 text-[22px] font-extrabold tracking-[-.04em]">{title}</h2></div>{action}</div>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-card/70 p-3 text-center"><div className="font-display text-2xl">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div></div>; }

// The student-facing half of the same progress-trend data the practice
// result card uses — so a student can check "am I improving?" any time,
// not just right after finishing a session.
function StatTile({ icon: Icon, bg, fg, label, value }: { icon: typeof Clock3; bg: string; fg: string; label: string; value: ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5" data-testid={`stat-tile-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="flex items-center gap-3"><span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', bg, fg)}><Icon size={18} /></span><div className="text-xs font-semibold text-muted-foreground">{label}</div></div>
    <div className="mt-3 font-display text-3xl">{value}</div>
  </div>;
}

function ProgressProfileCard() {
  const trend = useQuery({ queryKey: ['progress-trend'], queryFn: analyticsApi.progress });
  const t = trend.data;
  if (trend.isLoading) return <div className="skeleton h-40 rounded-2xl" />;
  const verdict = progressVerdict(null, t);
  const history = t?.history ?? [];
  const maxScore = Math.max(100, ...history.map((h) => h.scorePercent));
  return <div className="rounded-2xl border border-border bg-card p-6" data-testid="card-progress-profile">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-display text-3xl">{t?.recentAverage != null ? `${t.recentAverage}%` : '—'}</span><ProgressBadge tone={verdict.tone} label={verdict.label} /></div><p className="mt-1 text-xs text-muted-foreground">Average score, last 7 days{t?.priorAverage != null ? ` (was ${t.priorAverage}% the week before)` : ''}</p></div><div className="flex gap-5 text-center text-xs"><div><div className="font-display text-xl">{t?.currentStreak ?? 0}</div><div className="text-muted-foreground">day streak</div></div><div><div className="font-display text-xl">{t?.recentSessions ?? 0}</div><div className="text-muted-foreground">sessions/wk</div></div></div></div>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">{verdict.message}</p>
    {history.length >= 2 ? <div className="mt-5" data-testid="chart-progress-history">
      <div className="flex h-16 items-end gap-1.5">{history.map((h, i) => <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-primary to-accent" style={{ height: `${Math.max(6, (h.scorePercent / maxScore) * 100)}%` }} title={`${h.scorePercent}%`} />)}</div>
      <div className="mt-1.5 flex gap-1.5">{history.map((h, i) => <div key={i} className="flex-1 text-center text-[9px] font-semibold text-muted-foreground">{new Date(h.date).toLocaleDateString(undefined, { weekday: 'narrow' })}</div>)}</div>
    </div> : <p className="mt-5 text-[11px] text-muted-foreground">Complete a few more sessions to see your trend line here.</p>}
  </div>;
}

const QUICK_LINK_TILES: Array<{ href: string; label: string; sub: string; icon: typeof LayoutGrid; bg: string; fg: string }> = [
  { href: '/blocks', label: 'Modules', sub: 'Explore all modules', icon: LayoutGrid, bg: 'bg-[#dceaf1]', fg: 'text-[#2c6a8f]' },
  { href: '/practice', label: 'Practice MCQs', sub: 'Test your knowledge', icon: Target, bg: 'bg-[#d7eee4]', fg: 'text-[#1f7a5c]' },
  { href: '/flashcards', label: 'Flashcards', sub: 'Revise smarter', icon: Sparkles, bg: 'bg-[#e6dcf5]', fg: 'text-[#6b3fa0]' },
  { href: '/past-papers', label: 'Past Papers', sub: 'Previous exam papers', icon: FileStack, bg: 'bg-[#fbdada]', fg: 'text-[#b8493f]' },
  { href: '/flagged-mcqs', label: 'Bookmarks', sub: 'Saved content', icon: Bookmark, bg: 'bg-[#fff0cb]', fg: 'text-[#94651c]' },
  { href: '#progress-profile', label: 'My Progress', sub: 'Track your growth', icon: TrendingUp, bg: 'bg-[#dde4f7]', fg: 'text-[#3b4f8f]' },
  // Special-cased in the render below (href === OPEN_SEARCH_HREF) to open
  // the QuickJump overlay via a custom event instead of navigating — the
  // Shell that owns QuickJump's open/close state lives outside Dashboard's
  // component tree, so a plain <Link> can't reach it directly.
  { href: '#open-search', label: 'Search', sub: 'Find anything', icon: Search, bg: 'bg-[#dbeafe]', fg: 'text-[#1d4ed8]' },
];
const OPEN_SEARCH_HREF = '#open-search';
const OPEN_SEARCH_EVENT = 'medschoolproffs:open-search';

// Cycling palette for module tiles (Continue Learning / Recommended) so the
// dashboard reads as multi-subject and colorful rather than one repeated
// tone, matching the reference design's per-subject icon colors.
const MODULE_TILE_COLORS = [
  { bg: 'bg-[#fbdada]', fg: 'text-[#b8493f]' }, { bg: 'bg-[#dceaf1]', fg: 'text-[#2c6a8f]' },
  { bg: 'bg-[#fff0cb]', fg: 'text-[#94651c]' }, { bg: 'bg-[#e6dcf5]', fg: 'text-[#6b3fa0]' },
  { bg: 'bg-[#d7eee4]', fg: 'text-[#1f7a5c]' }, { bg: 'bg-[#dde4f7]', fg: 'text-[#3b4f8f]' },
];

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Dashboard() {
  const q = useGetStudentDashboard();
  const d = q.data;
  const modules = d?.modules ?? [];
  const notifications = d?.notifications ?? [];
  const [range, setRange] = useState('7d');
  const analytics = useQuery({ queryKey: ['analytics', range], queryFn: () => analyticsApi.get(range) });
  // Same ['site-content'] query AppRoutes' useThemeSync/useFaviconSync
  // already fetch — react-query dedupes by key, so this doesn't add a
  // second request. The hero photo is optional (Admin -> Site content ->
  // Design & branding); falls back to the decorative pattern when unset.
  const siteContent = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  const heroImageUrl = siteContent.data?.dashboardHeroImageUrl || null;
  const daysRemaining = d?.membershipExpiry ? Math.max(0, Math.ceil((new Date(d.membershipExpiry).getTime() - Date.now()) / 86400000)) : null;

  const inProgress = modules.find((m) => m.progress > 0 && m.progress < 100) ?? modules[0] ?? null;
  const recommended = modules.filter((m) => !inProgress || m.id !== inProgress.id).slice(0, 3);
  const modulesCompleted = modules.filter((m) => m.progress >= 100).length;
  const overallProgress = d?.progress ?? 0;
  const ringDeg = Math.round(Math.min(100, Math.max(0, overallProgress)) * 3.6);

  return <>{q.isLoading ? <SkeletonPage /> : <div className="space-y-9">
    <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="relative overflow-hidden rounded-3xl bg-primary p-7 text-primary-foreground md:p-9" style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {heroImageUrl ? <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/92 to-primary/40" /> : <><div className="absolute -right-10 -top-16 size-64 rounded-full border-[28px] border-white/15" /><div className="absolute -bottom-24 right-20 size-56 rounded-full border-[18px] border-[#e5a952]/25" /></>}
        <div className="relative"><Badge tone="green">Your study desk</Badge><h2 className="mt-5 max-w-md font-display text-3xl leading-[1.15] tracking-[-.03em] md:text-4xl">{greetingForHour(new Date().getHours())}, {d?.user?.name?.split(' ')[0] || 'there'} <span aria-hidden="true">👋</span></h2><p className="mt-4 max-w-sm text-sm leading-6 text-primary-foreground/75">Continue your preparation and stay on track.</p><p className="mt-3 max-w-sm text-xs italic leading-5 text-primary-foreground/55">"Small steps every day lead to big results."</p>{daysRemaining !== null && <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-bold"><ShieldCheck size={13} /> Active subscription · {daysRemaining} days remaining</div>}</div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-7 shadow-sm"><div className="flex items-center justify-between"><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Your progress</div><Link href="/leaderboard" className="text-[11px] font-bold text-primary" data-testid="link-progress-view-all">View all</Link></div>
        <div className="mt-5 flex items-center gap-6">
          <div className="relative grid size-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--accent)) ${ringDeg}deg, hsl(var(--muted)) 0deg)` }}>
            <div className="grid size-[72px] place-items-center rounded-full bg-card"><span className="font-display text-xl">{overallProgress}%</span></div>
          </div>
          <div className="flex-1 space-y-2.5 text-xs">
            <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><Target size={13} className="text-primary" /> Questions attempted</span><span className="font-bold">{analytics.data?.questionsAnswered ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><CheckCircle2 size={13} className="text-primary" /> Accuracy</span><span className="font-bold">{analytics.data?.averageScore ?? 0}%</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><BookOpen size={13} className="text-primary" /> Modules completed</span><span className="font-bold">{modulesCompleted}</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><Flame size={13} className="text-[#e5a952]" /> Current streak</span><span className="font-bold">{analytics.data?.currentStreak ?? 0} days</span></div>
          </div>
        </div>
      </div>
    </section>

    <section><SectionHeader eyebrow="Jump back in" title="Quick links" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{QUICK_LINK_TILES.map((tile) => {
        const content = <><span className={cn('grid size-11 place-items-center rounded-xl', tile.bg, tile.fg)}><tile.icon size={19} /></span><span className="text-xs font-bold leading-tight">{tile.label}</span><span className="text-[10px] leading-tight text-muted-foreground">{tile.sub}</span></>;
        const testId = `link-quick-${tile.label.toLowerCase().replaceAll(' ', '-')}`;
        return tile.href === OPEN_SEARCH_HREF
          ? <button key={tile.label} type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))} className="card-lift flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center" data-testid={testId}>{content}</button>
          : <Link key={tile.label} href={tile.href} className="card-lift flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center" data-testid={testId}>{content}</Link>;
      })}</div>
    </section>

    <section className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <SectionHeader eyebrow="Pick up where you left off" title="Continue learning" action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-all-modules">View all <ArrowRight size={13} className="ml-1 inline" /></Link>} />
        {inProgress ? <Link href={`/modules/${inProgress.id}`} className="card-lift flex items-center gap-4 rounded-2xl border border-border bg-card p-5" data-testid={`card-continue-${inProgress.id}`}>
          <span className={cn('grid size-14 shrink-0 place-items-center rounded-xl', MODULE_TILE_COLORS[0].bg, MODULE_TILE_COLORS[0].fg)}><BookOpen size={24} /></span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{inProgress.name}</div><div className="mt-1 text-xs text-muted-foreground">{inProgress.subjectCount} subjects · {inProgress.mcqCount} questions</div><div className="mt-3 flex items-center gap-3"><Progress value={inProgress.progress} /><span className="font-mono-app text-[10px] text-muted-foreground">{inProgress.progress}%</span></div></div>
          <span className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">Continue</span>
        </Link> : <EmptyState icon={BookOpen} title="No modules yet" body="Your academic team hasn't published any modules yet." />}

        <div className="mt-8"><SectionHeader eyebrow="Fresh territory" title="Recommended for you" />
          <div className="space-y-2.5">{recommended.map((m, i) => {
            const c = MODULE_TILE_COLORS[(i + 1) % MODULE_TILE_COLORS.length];
            return <Link href={`/modules/${m.id}`} key={m.id} className="card-lift flex items-center gap-3 rounded-xl border border-border bg-card p-3.5" data-testid={`card-recommended-${m.id}`}>
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', c.bg, c.fg)}><BookOpen size={16} /></span>
              <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{m.name}</div><div className="text-[10px] text-muted-foreground">{m.mcqCount} MCQs</div></div>
              <ChevronRight size={15} className="text-muted-foreground" />
            </Link>;
          })}{!recommended.length && <p className="text-xs text-muted-foreground">Nothing new to recommend right now — you're through everything published.</p>}</div>
        </div>
      </div>

      <div><SectionHeader eyebrow="In the loop" title="Recent activity" action={<Link href="/notifications" className="text-xs font-bold text-primary" data-testid="link-all-notifications">See all</Link>} /><div className="rounded-2xl border border-border bg-card p-5">{notifications.slice(0, 5).map((n, i) => <div key={n.id} className={cn('flex gap-3 py-3', i > 0 && 'border-t border-border')}><div className={cn('mt-1 size-2 shrink-0 rounded-full', n.read ? 'bg-muted' : 'bg-[#dc815e]')} /><div><div className="text-xs font-bold">{n.title}</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{n.body}</p></div></div>)}{!notifications.length && <p className="py-3 text-xs text-muted-foreground">No notifications yet.</p>}</div></div>
    </section>

    <section><SectionHeader eyebrow="Track your pace" title="Analytics dashboard" action={<div className="flex gap-1.5">{['7d', '30d', '3m', '1y'].map((r) => <button key={r} onClick={() => setRange(r)} className={cn('rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors', range === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')} data-testid={`button-analytics-range-${r}`}>{r.toUpperCase()}</button>)}</div>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile icon={Clock3} bg="bg-[#dceaf1]" fg="text-[#2c6a8f]" label="Total sessions" value={analytics.data?.totalSessions ?? 0} />
        <StatTile icon={Target} bg="bg-[#d7eee4]" fg="text-[#1f7a5c]" label="Average score" value={`${analytics.data?.averageScore ?? 0}%`} />
        <StatTile icon={CheckCircle2} bg="bg-[#e6dcf5]" fg="text-[#6b3fa0]" label="Questions answered" value={analytics.data?.questionsAnswered ?? 0} />
        <StatTile icon={Flame} bg="bg-[#fff0cb]" fg="text-[#94651c]" label="Time spent" value={`${analytics.data?.timeSpentMinutes ?? 0}m`} />
      </div>
    </section>
    <section id="progress-profile"><SectionHeader eyebrow="Where you stand" title="Progress profile" /><ProgressProfileCard /></section>
    <section className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs font-semibold text-muted-foreground">Membership</div><div className="mt-3 flex items-center gap-2"><span className="font-display text-2xl">{d?.membershipStatus || 'Active'}</span><Badge tone="green">verified</Badge></div><p className="mt-2 text-[11px] text-muted-foreground">{daysRemaining !== null ? `${daysRemaining} days remaining` : 'No active membership'}</p></div><div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs font-semibold text-muted-foreground">This week</div><div className="mt-3 flex items-center gap-2"><span className="font-display text-2xl">{analytics.data?.totalSessions ?? 0} sessions</span></div><Link href="/modules" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary" data-testid="link-focus-practice">Open practice <ChevronRight size={13} /></Link></div></section>
  </div>}</>;
}

// Round 3, item 7: modules can now optionally have a thumbnail — when one
// is set, the card gets the same "full-bleed cover image behind the whole
// card, name overlaid at the bottom with a gradient scrim" hero treatment
// as the Blocks landing page cards (see Blocks()/BlockHeroCard below),
// instead of the small icon-tile + label row. Falls back to the original
// icon+label layout when no thumbnail has been set, so existing modules
// look exactly as before until an admin adds one.
function ModuleCard({ m, i }: { m: Module; i: number }) {
  const iconUrl = (m as Module & { iconUrl?: string | null }).iconUrl;
  if (iconUrl) {
    return <Link href={`/modules/${m.id}`} key={m.id} className="card-lift group relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-card p-6 text-white" data-testid={`card-module-${m.id}`}>
      <img src={iconUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="relative">
        <h3 className="text-lg font-extrabold tracking-[-.03em] drop-shadow-sm">{m.name}</h3>
        <div className="mt-2 flex items-center justify-between text-[11px] text-white/85"><span>{m.subjectCount} subject{m.subjectCount === 1 ? '' : 's'} · {m.mcqCount} question{m.mcqCount === 1 ? '' : 's'}</span><span className="font-mono-app text-white">{m.progress}%</span></div>
        <div className="mt-2"><Progress value={m.progress} color={i % 2 ? 'bg-[#e5a952]' : 'bg-primary'} /></div>
      </div>
    </Link>;
  }
  const c = MODULE_TILE_COLORS[i % MODULE_TILE_COLORS.length];
  return <Link href={`/modules/${m.id}`} key={m.id} className="card-lift group rounded-2xl border border-border bg-card p-6" data-testid={`card-module-${m.id}`}><div className="flex items-start justify-between"><div className={cn('grid size-11 place-items-center rounded-xl', c.bg, c.fg)}><BookOpen size={20} /></div><ChevronRight size={18} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div><h3 className="mt-6 text-lg font-extrabold tracking-[-.03em]">{m.name}</h3><p className="mt-1 text-xs text-muted-foreground">{m.subtitle}</p><div className="mt-7 flex items-center justify-between text-[11px] text-muted-foreground"><span>{m.subjectCount} subject{m.subjectCount === 1 ? '' : 's'} · {m.mcqCount} question{m.mcqCount === 1 ? '' : 's'}</span><span className="font-mono-app text-foreground">{m.progress}%</span></div><div className="mt-2"><Progress value={m.progress} color={i % 2 ? 'bg-[#e5a952]' : 'bg-primary'} /></div><div className="mt-5 flex items-center gap-1 text-xs font-bold text-primary opacity-80 group-hover:opacity-100">Open module <ArrowRight size={14} /></div></Link>;
}

// Round 3, item 6: Blocks becomes the primary top-level nav item (sidebar
// entry + landing page), instead of being just a grouping/section-header
// inside the old flat Modules page. `/modules` is kept working as a
// redirect to `/blocks` (below) so any old link/bookmark to it still
// lands somewhere correct instead of 404ing or dead-ending. Subjects()'s
// drill-down (`/modules/:id`, "Subjects", topics) is intentionally
// untouched — only what feeds into it (this page) changed.
function useModulesGrouping() {
  const q = useListModules(); const modules = q.data ?? []; const [search, setSearch] = useState('');
  const blocksQ = useQuery({ queryKey: ['blocks'], queryFn: blocksApi.list });
  const blocks = (blocksQ.data ?? []).filter((b) => b.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const filtered = modules.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const modulesByBlock = new Map<number, Module[]>();
  const unassigned: Module[] = [];
  for (const m of filtered) {
    const blockId = (m as Module & { blockId?: number | null }).blockId;
    if (blockId != null) {
      if (!modulesByBlock.has(blockId)) modulesByBlock.set(blockId, []);
      modulesByBlock.get(blockId)!.push(m);
    } else unassigned.push(m);
  }
  return { isLoading: q.isLoading || blocksQ.isLoading, modules, blocks, filtered, modulesByBlock, unassigned, search, setSearch };
}

// The full-bleed hero tile used on the Blocks landing page — same visual
// treatment item 7 asks for on module thumbnail cards: cover image behind
// the whole card, name overlaid bottom-left over a gradient scrim, rather
// than the old small icon-tile + label row.
function BlockHeroCard({ href, name, iconUrl, moduleCount, muted }: { href: string; name: string; iconUrl?: string | null; moduleCount: number; muted?: boolean }) {
  return <Link href={href} className="card-lift group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-3xl border border-border bg-card p-6 text-white" data-testid={`card-block-${href.split('/').pop()}`}>
    {iconUrl ? <img src={iconUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <div className={cn('absolute inset-0', muted ? 'bg-muted-foreground/30' : 'bg-gradient-to-br from-[#287058] to-[#164b4b]')} />}
    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
    <div className="relative">
      <h3 className="font-display text-2xl tracking-[-.02em] drop-shadow-sm">{name}</h3>
      <div className="mt-2 flex items-center justify-between text-xs text-white/85"><span>{moduleCount} module{moduleCount === 1 ? '' : 's'}</span><ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></div>
    </div>
  </Link>;
}

function Blocks() {
  const { isLoading, blocks, filtered, modulesByBlock, unassigned, search, setSearch } = useModulesGrouping();
  const hasBlocks = blocks.length > 0;
  // No blocks configured at all yet — fall back to the plain modules grid
  // exactly as before, so a deployment that hasn't set up Blocks isn't
  // left with an empty landing page.
  if (!isLoading && !hasBlocks) return <div><SectionHeader eyebrow="Curriculum map" title="Learning modules" action={<div className="relative"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a module" className="h-9 w-40 rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-search-modules" /></div>} />
    <div className="grid gap-4 md:grid-cols-2">{filtered.map((m, i) => <ModuleCard key={m.id} m={m} i={i} />)}</div>
    {!filtered.length && <EmptyState icon={BookOpen} title="No modules yet" body="Your academic team hasn't published any modules yet." />}
  </div>;
  return <>{isLoading ? <SkeletonPage /> : <div>
    <SectionHeader eyebrow="Curriculum map" title="Blocks" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {blocks.map((b) => <BlockHeroCard key={b.id} href={`/blocks/${b.id}`} name={b.name} iconUrl={b.iconUrl} moduleCount={(modulesByBlock.get(b.id) ?? []).length} />)}
      {unassigned.length > 0 && <BlockHeroCard href="/blocks/other" name="Other modules" moduleCount={unassigned.length} muted />}
    </div>
    {!blocks.length && !unassigned.length && <EmptyState icon={Library} title="No blocks yet" body="Your academic team hasn't published any blocks yet." />}
  </div>}</>;
}

function BlockDetail() {
  const params = useParams<{ id: string }>();
  const { isLoading, blocks, modulesByBlock, unassigned } = useModulesGrouping();
  const isOther = params.id === 'other';
  const block = !isOther ? blocks.find((b) => b.id === Number(params.id)) : undefined;
  const list = isOther ? unassigned : (block ? modulesByBlock.get(block.id) ?? [] : []);
  // Friendly header breadcrumb ("Blocks / Foundation I") instead of the raw
  // numeric route id ("Blocks / 4") that the default path-derived title falls
  // back to — see usePageTitle / PageTitleContext above.
  usePageTitle(isOther ? 'Blocks / Other modules' : (block ? `Blocks / ${block.name}` : (isLoading ? undefined : 'Blocks')));
  return <>{isLoading ? <SkeletonPage /> : <div>
    <SectionHeader eyebrow="Curriculum map" title={isOther ? 'Other modules' : (block?.name ?? 'Block')} action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-back-blocks"><ArrowLeft size={13} className="mr-1 inline" /> Blocks</Link>} />
    <div className="grid gap-4 md:grid-cols-2">{list.map((m, i) => <ModuleCard key={m.id} m={m} i={i} />)}</div>
    {!list.length && <EmptyState icon={BookOpen} title="No modules yet" body="Your academic team hasn't published any modules in this block yet." />}
  </div>}</>;
}

// Kept working as a redirect (item 6: "keep /modules working as a redirect
// or alias so nothing else that links to it breaks") rather than removed —
// old bookmarks/links to /modules land on the new Blocks landing page
// instead of a stale or missing page.
function ModulesRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate('/blocks', { replace: true }); }, [navigate]);
  return <SkeletonPage />;
}

// The old flat "all modules grouped by block on one page" view is now
// superseded by Blocks()/BlockDetail() (item 6) — kept only as dead code
// would be pointless, so it's removed outright rather than left unused;
// ModulesRedirect() above is what /modules now renders.

function Subjects({ topics = false }: { topics?: boolean }) {
  const params = useParams<{ id?: string }>();
  // On /subjects/:id the :id in the URL is a subject id (topics view); on
  // /modules/:id it's a module id (subjects view). Same component, two roles.
  const routeId = Number(params.id) || undefined;
  const moduleId = !topics ? routeId : undefined;
  const subjectId = topics ? routeId : undefined;
  const subjectQ = useListSubjects(moduleId ? { moduleId } : undefined);
  const topicQ = useListTopics(subjectId ? { subjectId } : undefined);
  const subjects: Subject[] = subjectQ.data ?? [];
  const topicsList: Topic[] = topicQ.data ?? [];
  // Friendly header breadcrumbs ("Modules / Foundation I", "Subjects / Anatomy")
  // instead of the raw numeric route id ("Modules / 13", "Subjects / 7") that
  // the default path-derived title falls back to. The module/subject name
  // isn't in the topics/subjects response we already have for this route, so
  // fetch the unfiltered list (shares its cache with other pages) and look
  // the name up by id — see usePageTitle / PageTitleContext above.
  const modulesQ = useListModules(undefined, { query: { enabled: !topics && moduleId != null } });
  const moduleName = !topics ? modulesQ.data?.find((m) => m.id === moduleId)?.name : undefined;
  const allSubjectsQ = useListSubjects(undefined, { query: { enabled: topics && subjectId != null } });
  const subjectName = topics ? allSubjectsQ.data?.find((s) => s.id === subjectId)?.name : undefined;
  usePageTitle(topics
    ? (subjectId != null ? `Subjects / ${subjectName ?? '…'}` : undefined)
    : (moduleId != null ? `Modules / ${moduleName ?? '…'}` : undefined));
  if (topics) return <div><SectionHeader eyebrow="Choose a topic" title="Topics" action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-back-modules"><ArrowLeft size={13} className="mr-1 inline" /> Blocks</Link>} /><div className="space-y-3">{topicsList.map((t) => <Link href={`/practice?topic=${t.id}`} key={t.id} className="card-lift flex items-center gap-4 rounded-2xl border border-border bg-card p-4" data-testid={`row-topic-${t.id}`}><div className={cn('grid size-10 place-items-center rounded-xl', t.completed ? 'bg-[#d7eee4] text-[#287058]' : 'bg-muted text-muted-foreground')}>{t.completed ? <Check size={17} /> : <Target size={17} />}</div><div className="flex-1"><div className="text-sm font-bold">{t.name}</div><div className="mt-1 text-xs text-muted-foreground">{t.questionCount} practice questions</div></div><span className="text-xs font-bold text-primary">{t.completed ? 'Review' : 'Start'} <ArrowRight size={13} className="ml-1 inline" /></span></Link>)}{!topicsList.length && <EmptyState icon={Target} title="No topics yet" body="Your academic team hasn't published topics for this subject yet." />}</div></div>;
  return <div><SectionHeader eyebrow="Curriculum map" title="Subjects" action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-subjects-back"><ArrowLeft size={13} className="mr-1 inline" /> Blocks</Link>} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{subjects.map((s, i) => <Link href={`/subjects/${s.id}`} key={s.id} className="card-lift rounded-2xl border border-border bg-card p-5" data-testid={`card-subject-${s.id}`}><div className="flex items-center justify-between">{s.iconUrl ? <img src={s.iconUrl} alt="" className="size-9 rounded-xl object-cover" /> : <span className="font-mono-app text-[10px] text-muted-foreground">0{i + 1}</span>}<ChevronRight size={16} className="text-muted-foreground" /></div><h3 className="mt-8 font-display text-2xl">{s.name}</h3><p className="mt-1 text-xs text-muted-foreground">{s.topicCount} topics to explore</p></Link>)}{!subjects.length && <EmptyState icon={BookOpen} title="No subjects yet" body="Your academic team hasn't published subjects for this module yet." />}</div></div>;
}

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
    const correct = mcqs.filter((m) => answers[m.id] != null && answers[m.id] === m.correctAnswer).length;
    return <div className="max-w-6xl"><SectionHeader eyebrow="Daily practice" title="Session complete" /><PracticeResultCard correct={correct} total={answeredCount} onRestart={restartSession} backHref={pastPaperId ? '/past-papers' : '/blocks'} backLabel={pastPaperId ? 'Back to past papers' : 'Back to blocks'} /></div>;
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
  const breadcrumbParts = [current.module, current.subject, current.topic].filter(Boolean);
  return <div className="max-w-6xl">
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
      {breadcrumbParts.length > 0 && <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground" data-testid="text-practice-breadcrumb">{breadcrumbParts.map((part, i) => <span key={i} className="flex items-center gap-1.5">{i > 0 && <ChevronRight size={11} />}<span>{part}</span></span>)}</div>}
      <button onClick={finishSession} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-leave-practice"><X size={13} /> Leave</button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="font-display text-2xl">Practice MCQs</h1><span className="font-mono-app text-[11px] text-muted-foreground">{index + 1} / {mcqs.length}</span></div>
    {/* Top progress bar — the single biggest whitespace cut vs. before: this
        replaces a whole separate "Timer" card that used to sit above the
        question, pushing everything down a full card's height before you
        even reached the question text. */}
    <div className="mt-3 mb-5"><Progress value={percentAnswered} /></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="order-1 rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between"><Badge tone={difficultyTone(current.difficulty)}>{current.difficulty}</Badge><button onClick={toggleFlag} className={cn('rounded-lg p-1.5', flaggedIds.has(current.id) ? 'text-[#e5a952]' : 'text-muted-foreground hover:text-foreground')} data-testid="button-flag-question"><Flag size={17} fill={flaggedIds.has(current.id) ? 'currentColor' : 'none'} /></button></div>
        <h2 className="mt-4 max-w-2xl text-base font-extrabold leading-6 tracking-[-.025em] sm:text-lg sm:leading-7">{current.question}</h2>
        {/* Compact option rows (py-2.5 instead of p-4, tighter gap) so a
            5-option question plus the hint/explain/references row and the
            prev/next buttons fit one viewport on a normal laptop screen
            without scrolling — this was the whole stack's biggest single
            source of vertical height. */}
        <div className="mt-4 space-y-2">{current.options.map((option, i) => <button key={option} onClick={() => selectOption(option)} className={cn('flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors', answers[current.id] === option ? 'border-primary bg-[#e6f3ed]' : 'border-border hover:bg-muted')} data-testid={`button-answer-${i}`}><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted font-mono-app text-[11px]">{String.fromCharCode(65 + i)}</span><span className="flex-1">{option}</span></button>)}</div>

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
function topicColorVar(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `--chart-${(hash % 5) + 1}`;
}
function topicAccentStyles(key: string) {
  const v = topicColorVar(key || 'default');
  return {
    badge: { background: `hsl(var(${v}) / 0.16)`, color: `hsl(var(${v}))` },
    border: { borderColor: `hsl(var(${v}) / 0.4)` },
    wash: { background: `hsl(var(${v}) / 0.07)` },
    solidBg: { background: `hsl(var(${v}))` },
    ring: { boxShadow: `0 0 0 3px hsl(var(${v}) / 0.18)` },
  };
}
function TopicBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize" style={topicAccentStyles(label).badge}>{label}</span>;
}

function Flashcards() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlTopicId = Number(new URLSearchParams(search).get('topic')) || undefined;
  const modulesQ = useListModules();
  const modules = modulesQ.data ?? [];
  const [moduleId, setModuleId] = useState('');
  const subjectsQ = useListSubjects(moduleId ? { moduleId: Number(moduleId) } : undefined);
  // Unfiltered — used only to compute the "Subjects"/"Topics" stat cards
  // across everything the student can see, independent of the cascading
  // module/subject/topic filter below.
  const allSubjectsQ = useListSubjects();
  const allTopicsQ = useListTopics();
  const [subjectId, setSubjectId] = useState('');
  const topicsQ = useListTopics(subjectId ? { subjectId: Number(subjectId) } : undefined);
  const [topicId, setTopicId] = useState(urlTopicId ? String(urlTopicId) : '');
  const activeTopicId = Number(topicId) || undefined;
  const [queryText, setQueryText] = useState('');
  const [view, setView] = useState<'grid' | 'study'>('grid');
  const [flippedIds, setFlippedIds] = useState<Set<number>>(new Set());
  // Streak badge (top-right) — same data source as the dashboard's streak card.
  const streakQ = useQuery({ queryKey: ['analytics', '7d'], queryFn: () => analyticsApi.get('7d') });

  // Program/year scoping already happens server-side via getVisibleModuleIds
  // (same as past papers/exams) — these selects just let the student narrow
  // *within* what they can already see, so they get flashcards relevant to
  // what they're actually studying instead of a random mixed deck.
  const q = useListFlashcards(activeTopicId ? { topicId: activeTopicId } : undefined);
  // Unfiltered — drives the "Total Available" stat regardless of the
  // module/subject/topic filter currently applied to the deck/grid below.
  const allCardsQ = useListFlashcards();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<number, boolean>>({});
  const cards: Flashcard[] = q.data ?? [];
  const visibleCards = queryText.trim() ? cards.filter((c) => c.front.toLowerCase().includes(queryText.trim().toLowerCase()) || c.back.toLowerCase().includes(queryText.trim().toLowerCase())) : cards;
  const card = cards[index % Math.max(cards.length, 1)];
  const knownCount = Object.values(known).filter(Boolean).length;
  const askAi = useMutation({ mutationFn: () => explanationsApi.askAiFlashcard(card!.id) });

  const advance = (isKnown: boolean) => { setKnown((prev) => ({ ...prev, [card.id]: isKnown })); setIndex((i) => i + 1); setFlipped(false); askAi.reset(); };
  const resetDeck = () => { setIndex(0); setKnown({}); setFlipped(false); askAi.reset(); };
  const toggleGridFlip = (id: number) => setFlippedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const stats: Array<[string, number]> = [
    ['Total Available', allCardsQ.data?.length ?? 0],
    ['Topics', allTopicsQ.data?.length ?? 0],
    ['Subjects', allSubjectsQ.data?.length ?? 0],
    ['Modules', modules.length],
  ];

  const header = <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#164b4b] text-white"><Zap size={20} /></div><div><h2 className="text-[22px] font-extrabold tracking-[-.03em]">Study Flashcards</h2><p className="mt-0.5 text-xs text-muted-foreground">Master your knowledge with interactive flashcards</p></div></div>
    {(streakQ.data?.currentStreak ?? 0) > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff0cb] px-3 py-1.5 text-[11px] font-bold text-[#8d6420]" data-testid="text-flashcard-streak"><Flame size={13} /> {streakQ.data?.currentStreak} day streak</span>}
  </div>;

  const toolbar = <div className="mb-5 flex flex-wrap items-center gap-2">
    <div className="flex overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={() => setView('grid')} className={cn('grid size-9 place-items-center', view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} title="Grid view" data-testid="button-flashcard-view-grid"><LayoutGrid size={15} /></button>
      <button onClick={() => setView('study')} className={cn('grid size-9 place-items-center border-l border-border', view === 'study' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} title="Study mode" data-testid="button-flashcard-view-study"><Presentation size={15} /></button>
    </div>
    <button onClick={() => { resetDeck(); setFlippedIds(new Set()); }} className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted" title="Restart" data-testid="button-flashcard-refresh"><RotateCcw size={15} /></button>
  </div>;

  const statCards = <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center"><div className="font-display text-2xl">{value}</div><div className="mt-1 text-[11px] font-semibold text-muted-foreground">{label}</div></div>)}</div>;

  const filterBar = <div className="mb-5 space-y-2 rounded-2xl border border-border bg-card p-4">
    <select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); navigate('/flashcards'); resetDeck(); }} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-flashcard-module"><option value="">All Modules</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
    <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); resetDeck(); }} disabled={!moduleId} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-flashcard-subject"><option value="">All Subjects</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <select value={topicId} onChange={(e) => { setTopicId(e.target.value); resetDeck(); }} disabled={!subjectId} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-flashcard-topic"><option value="">All Topics</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Search flashcards..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs" data-testid="input-flashcard-search" /></div>
  </div>;

  if (!q.isLoading && !cards.length) {
    return <div className="mx-auto max-w-3xl">{header}{toolbar}{statCards}{filterBar}<EmptyState icon={Zap} title={activeTopicId ? 'No flashcards here yet' : 'No flashcards yet'} body={activeTopicId ? "Your academic team hasn't published flashcards for this topic yet." : "Your academic team hasn't published any flashcards yet."} /></div>;
  }
  if (q.isLoading || !card) return <div className="mx-auto max-w-3xl">{header}{toolbar}{statCards}{filterBar}<SkeletonPage /></div>;

  if (view === 'grid') {
    return <div className="mx-auto max-w-3xl">{header}{toolbar}{statCards}{filterBar}
      {!visibleCards.length ? <EmptyState icon={Search} title="No matches" body="No flashcards match your search — try a different term." /> : <div className="space-y-5">{visibleCards.map((c, i) => {
        const isFlipped = flippedIds.has(c.id);
        const accent = topicAccentStyles(c.topic || c.module);
        return <div key={c.id} className="[perspective:1600px]" data-testid={`card-flashcard-grid-${c.id}`}>
          <button
            onClick={() => toggleGridFlip(c.id)}
            className="group relative block min-h-[220px] w-full [transform-style:preserve-3d] rounded-2xl text-left transition-transform duration-500 ease-out active:scale-[.99]"
            style={{ transform: isFlipped ? 'rotateY(180deg)' : 'none' }}
            data-testid={`button-flip-flashcard-${c.id}`}
          >
            {/* Front — the question */}
            <div className="card-lift absolute inset-0 flex flex-col overflow-hidden rounded-2xl border bg-card p-6 [backface-visibility:hidden]" style={{ ...accent.border, ...accent.wash }}>
              <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 size-24 rotate-12 rounded-2xl border-[8px] border-current opacity-[0.06]" />
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold">Question {i + 1}</span><TopicBadge label={c.topic} /></div>
              <div className="flex flex-1 items-center justify-center"><p className="text-center text-base font-bold leading-7">{c.front}</p></div>
              <div className="flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{c.module}</Badge></div>
              <div className="mt-3 text-center text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground">Click to reveal the answer</div>
            </div>
            {/* Back — the answer, distinct tint so flip state is unmistakable */}
            <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border p-6 shadow-sm [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)', ...accent.border, background: 'hsl(var(--card))' }}>
              <div aria-hidden className="pointer-events-none absolute -bottom-8 -left-6 size-20 rounded-full border-[8px] border-current opacity-[0.06]" />
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={accent.badge}>Answer {i + 1}</span><TopicBadge label={c.topic} /></div>
              <div className="flex flex-1 items-center justify-center"><p className="text-center text-base font-bold leading-7">{c.back}</p></div>
              <div className="flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{c.module}</Badge></div>
              <div className="mt-3 text-center text-[11px] font-semibold text-muted-foreground">Click to flip back</div>
            </div>
          </button>
        </div>;
      })}</div>}
    </div>;
  }

  const cardAccent = topicAccentStyles(card.topic || card.module);
  const stillLearningCount = Object.values(known).filter((v) => v === false).length;
  const reviewedCount = Object.keys(known).length;
  const cardNumber = (index % cards.length) + 1;

  const goPrev = () => { setIndex((i) => Math.max(0, i - 1)); setFlipped(false); askAi.reset(); };
  const goNext = () => { setIndex((i) => (i + 1) % cards.length); setFlipped(false); askAi.reset(); };

  // Minimal inline swipe hook — horizontal drag past a 50px threshold
  // triggers Next (swipe left) / Previous (swipe right). No library needed
  // for one gesture; small enough to keep next to the component that uses it.
  const touchStartX = { current: 0 };
  const onTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) goNext(); else goPrev();
  };

  // Slim top strip (back arrow + page name + "x / y" progress) matching
  // the reference design's study-mode header, layered above the existing
  // richer header/toolbar/stat-card block rather than replacing it.
  const studyTopStrip = <div className="mb-4 flex items-center gap-3">
    <Link href="/" className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted" data-testid="link-flashcards-back" aria-label="Back"><ArrowLeft size={15} /></Link>
    <span className="text-sm font-extrabold">Flashcards</span>
    <div className="ml-auto flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:w-40"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(cardNumber / cards.length) * 100}%` }} /></div><span className="font-mono-app text-[11px] text-muted-foreground">{cardNumber} / {cards.length}</span></div>
  </div>;

  return <div className="mx-auto max-w-3xl">{studyTopStrip}{header}{toolbar}{statCards}{filterBar}
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono-app text-[11px] text-muted-foreground">Card {cardNumber} of {cards.length}</span>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        {knownCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#d7eee4] px-2.5 py-1 text-[#287058]"><ThumbsUp size={11} /> {knownCount} known</span>}
        {stillLearningCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0cb] px-2.5 py-1 text-[#8d6420]"><ThumbsDown size={11} /> {stillLearningCount} learning</span>}
      </div>
    </div>
    <div className="mb-4"><Progress value={(reviewedCount / cards.length) * 100} color="bg-primary" /></div>
    <div className="mb-4 flex justify-center gap-1.5">{cards.map((c, i) => <div key={c.id} className={cn('h-1.5 w-6 rounded-full transition-colors', i === index % cards.length ? 'bg-primary' : known[c.id] === true ? 'bg-[#8bcbb8]' : known[c.id] === false ? 'bg-[#e5a952]' : 'bg-muted')} />)}</div>
    <div className="flex items-center gap-2 sm:gap-4">
      <button onClick={goPrev} disabled={index === 0} className="hidden size-11 shrink-0 rounded-full border border-border bg-card text-muted-foreground disabled:opacity-30 disabled:pointer-events-none hover:bg-muted sm:grid sm:place-items-center" data-testid="button-flashcard-prev" aria-label="Previous card"><ArrowLeft size={16} /></button>
      <div className="flex-1 [perspective:1600px]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}><button onClick={() => setFlipped(!flipped)} className="relative min-h-[350px] w-full [transform-style:preserve-3d] transition-transform duration-500 ease-out hover:-translate-y-0.5 active:scale-[.99] md:min-h-[420px]" style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }} data-testid="button-flashcard">
        {/* Front — same badge row / footer language as the grid card's front face, just at single-card scale, plus 3 low-opacity decorative shapes behind the content so grid and study read as one design language. */}
        <div className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border p-9 text-left text-[#eaf2e9] shadow-lg [backface-visibility:hidden] md:p-14" style={{ background: `linear-gradient(155deg, hsl(var(${topicColorVar(card.topic || card.module)}) / 0.92), hsl(208 40% 14%))` }}>
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 size-48 rotate-12 rounded-[2rem] border-[14px] border-white/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-8 size-40 rounded-full border-[10px] border-white/10" />
          <div className="relative flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold">Question {cardNumber}</span><TopicBadge label={card.topic} /></div>
          <div className="relative flex flex-1 items-center justify-center text-center"><h2 className="mx-auto max-w-xl font-display text-3xl leading-tight md:text-5xl">{card.front}</h2></div>
          <div className="relative flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{card.module}</Badge></div>
          <div className="relative mt-3 flex justify-center text-xs text-[#eaf2e9]/70">Click to reveal the answer <ArrowRight size={14} className="ml-2" /></div>
        </div>
        {/* Back — same tinted-card language as the grid card's back face */}
        <div className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border p-9 text-left shadow-lg [backface-visibility:hidden] md:p-14" style={{ transform: 'rotateY(180deg)', background: `hsl(var(${topicColorVar(card.topic || card.module)}) / 0.1)`, ...cardAccent.border }}>
          <div aria-hidden className="pointer-events-none absolute -right-8 -bottom-12 size-40 rotate-12 rounded-[2rem]" style={{ ...cardAccent.wash }} />
          <div className="relative flex flex-wrap items-center gap-2"><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={cardAccent.badge}>Answer {cardNumber}</span><TopicBadge label={card.topic} /></div>
          <div className="relative flex flex-1 items-center justify-center text-center"><h2 className="mx-auto max-w-xl font-display text-2xl leading-tight text-[#164b4b] md:text-4xl">{card.back}</h2></div>
          <div className="relative flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{card.module}</Badge></div>
          <div className="relative mt-3 text-center text-xs" style={{ color: `hsl(var(${topicColorVar(card.topic || card.module)}))` }}>Click to flip back</div>
        </div>
      </button></div>
      <button onClick={goNext} className="hidden size-11 shrink-0 rounded-full border border-border bg-card text-muted-foreground hover:bg-muted sm:grid sm:place-items-center" data-testid="button-flashcard-next" aria-label="Next card"><ArrowRight size={16} /></button>
    </div>
    {/* Mobile equivalents of the Prev/Next buttons above, hidden on sm+ where the flanking arrows already do the job */}
    <div className="mt-3 flex justify-center gap-3 sm:hidden">
      <button onClick={goPrev} disabled={index === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground disabled:opacity-30" data-testid="button-flashcard-prev-mobile"><ArrowLeft size={13} /> Previous</button>
      <button onClick={goNext} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground" data-testid="button-flashcard-next-mobile">Next <ArrowRight size={13} /></button>
    </div>
    {flipped && <div className="mt-4 flex justify-center">{!askAi.data ? <button onClick={() => askAi.mutate()} disabled={askAi.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-[#eef7f1] px-3 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50" data-testid="button-ask-ai-flashcard">{askAi.isPending ? 'Thinking…' : <><Sparkles size={11} /> Ask AI to explain differently</>}</button> : <div className="max-w-xl rounded-xl bg-[#eef7f1] p-3 text-xs leading-5"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary"><Sparkles size={10} /> AI explanation</div>{askAi.data.explanation}</div>}{askAi.isError && <p className="mt-2 text-[11px] font-semibold text-destructive">{askAi.error instanceof ApiRequestError ? askAi.error.message : 'Could not reach AI right now.'}</p>}</div>}
    <div className="mt-6 flex justify-center gap-3">{flipped ? <><button onClick={() => advance(false)} className="inline-flex items-center gap-2 rounded-xl border border-[#e5a952] bg-[#fff0cb] px-5 py-3 text-xs font-bold text-[#8a5a12] transition-transform hover:-translate-y-0.5" data-testid="button-still-learning"><ThumbsDown size={14} /> Still learning</button><button onClick={() => advance(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="button-know-it"><ThumbsUp size={14} /> I know this</button></> : <button onClick={() => setFlipped(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-bold text-primary-foreground hover:opacity-90" data-testid="button-reveal-card">Show Answer <ChevronRight size={14} /></button>}</div>
    <div className="mt-2 flex justify-center text-[11px] text-muted-foreground">Tap the card to flip</div>
    <div className="mt-3 flex justify-center"><button onClick={resetDeck} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground" data-testid="button-restart-deck"><RotateCcw size={12} /> Restart deck</button></div>
  </div>;
}

const AI_VISUALIZER_EXAMPLES = [
  'Create an interactive step-by-step visualization of skeletal muscle contraction, from action potential through calcium release, cross-bridge cycling, and relaxation.',
  'Show me how preload affects stroke volume via the Frank-Starling mechanism.',
  'Explain cardiac output with an interactive HR and SV control.',
  'Compare Type 1 and Type 2 diabetes mellitus.',
];

function AiVisualizer() {
  const [prompt, setPrompt] = useState('');
  const [spec, setSpec] = useState<VisualizationSpec | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Same AI_VISUALIZER_ENABLED check SideNav uses — this covers someone
  // navigating here directly by URL while the sidebar link is hidden, or a
  // tab that was already open on this page when an admin turned it off.
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const aiVisualizerEnabled = siteContentQ.data?.AI_VISUALIZER_ENABLED !== 'false';

  const generate = useMutation({
    mutationFn: (p: string) => aiVisualizerApi.generate(p),
    onSuccess: (data) => { setSpec(data.visualization); setStepIndex(0); },
  });

  const stepBased = spec ? isStepBased(spec) : false;
  const stepCount = spec && isStepBased(spec) ? spec.steps.length : 0;
  const loop = spec && isStepBased(spec) ? (spec.type === 'cycle' || !!spec.loop) : false;

  const submit = () => { if (prompt.trim().length >= 3) generate.mutate(prompt.trim()); };
  const startOver = () => { setSpec(null); generate.reset(); };

  if (!siteContentQ.isLoading && !aiVisualizerEnabled) return <EmptyState icon={Wand2} title="AI Visualizer is turned off" body="This feature isn't available right now — check back later." />;

  return <div className="mx-auto max-w-3xl">
    <div className="mb-5 flex items-start gap-3">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#164b4b] text-white"><Wand2 size={20} /></div>
      <div><h2 className="text-[22px] font-extrabold tracking-[-.03em]">AI Visualizer</h2><p className="mt-0.5 text-xs text-muted-foreground">Describe a process, cycle, equation, or comparison and see it come to life</p></div>
    </div>

    {!spec && (
      <div className="rounded-2xl border border-border bg-card p-5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Create an interactive step-by-step visualization of skeletal muscle contraction…"
          className="min-h-32 w-full resize-none rounded-xl border border-border bg-background p-3 text-xs leading-6 outline-none focus:ring-2 focus:ring-primary/20"
          data-testid="textarea-visualizer-prompt"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {AI_VISUALIZER_EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex)} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-visualizer-example-${i}`}>{ex.length > 60 ? `${ex.slice(0, 57)}…` : ex}</button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={generate.isPending || prompt.trim().length < 3}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          data-testid="button-generate-visualization"
        >
          {generate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {generate.isPending ? 'Generating…' : 'Generate Visualization'}
        </button>

        {generate.isPending && <div className="mt-5"><SkeletonPage /></div>}
        {generate.isError && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive" data-testid="text-visualizer-error">
            {generate.error instanceof ApiRequestError ? generate.error.message : "Couldn't generate a visualization right now."}
            <button onClick={submit} className="ml-3 font-bold underline" data-testid="button-visualizer-regenerate-error">Regenerate</button>
          </div>
        )}
      </div>
    )}

    {spec && (
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-extrabold" data-testid="text-visualizer-title">{spec.title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{spec.description}</p></div>
        </div>

        <VisualizationRenderer spec={spec} stepIndex={stepIndex} />
        {stepBased && <StepControls stepCount={stepCount} stepIndex={stepIndex} onStepChange={setStepIndex} loop={loop} />}
        <ExplanationPanel spec={spec} stepIndex={stepIndex} />

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button onClick={() => generate.mutate(prompt)} disabled={generate.isPending} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid="button-visualizer-regenerate">{generate.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Regenerate</button>
          <button onClick={startOver} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover:bg-muted" data-testid="button-visualizer-new">New visualization</button>
        </div>
      </div>
    )}
  </div>;
}

function Resources() {
  const q = useListResources();
  type ResourceWithFile = Resource & { storagePath?: string | null };
  const rs: ResourceWithFile[] = q.data ?? [];
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const kinds = [...new Set(rs.map((r) => r.kind))];
  const filtered = rs.filter((r) => `${r.title} ${r.module}`.toLowerCase().includes(search.toLowerCase()) && (!kind || r.kind === kind));

  return <div><SectionHeader eyebrow="Library" title="Resources" action={<div className="relative"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search resources" className="h-9 w-44 rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-search-resources" /></div>} />
    {kinds.length > 1 && <div className="mb-4 flex flex-wrap gap-2"><button onClick={() => setKind('')} className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', !kind ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')} data-testid="button-kind-all">All types</button>{kinds.map((k) => <button key={k} onClick={() => setKind(k)} className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')} data-testid={`button-kind-${k.toLowerCase().replaceAll(' ', '-')}`}>{k}</button>)}</div>}
    <div className="grid gap-3">{filtered.map((r) => <a key={r.id} href={resolveUploadUrl(r.storagePath) || undefined} target={r.storagePath ? '_blank' : undefined} rel="noreferrer" className="card-lift flex items-center gap-4 rounded-2xl border border-border bg-card p-4 md:p-5" data-testid={`row-resource-${r.id}`}><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#fff0cb] text-[#94651c]"><FileText size={19} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{r.title}</h3>{r.protected && <LockKeyhole size={13} className="text-muted-foreground" />}</div><p className="mt-1 text-xs text-muted-foreground">{r.description}</p><div className="mt-2 font-mono-app text-[10px] text-muted-foreground">{r.kind} · {r.size} · Updated {r.updatedAt}</div></div><span className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary hover:bg-muted" data-testid={`button-open-resource-${r.id}`}>{r.protected ? 'Open' : 'View'}</span></a>)}{!filtered.length && <EmptyState icon={FolderOpen} title="No resources found" body="Try a different search term or clear the filter." />}</div>
  </div>;
}

function Books() {
  const q = useQuery({ queryKey: ['books'], queryFn: booksApi.list });
  const books: AdminBookStudent[] = q.data ?? [];
  const [search, setSearch] = useState('');
  const filtered = books.filter((b) => `${b.title} ${b.author ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return <div><SectionHeader eyebrow="Library" title="Books" action={<div className="relative"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books" className="h-9 w-44 rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-search-books" /></div>} />
    {filtered.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((b) => { const url = resolveUploadUrl(b.storagePath); const Card = url ? 'a' : 'div'; return <Card key={b.id} {...(url ? { href: url, target: '_blank', rel: 'noreferrer' } : {})} className={cn('card-lift rounded-2xl border border-border bg-card p-4', !url && 'opacity-60')} data-testid={`row-book-${b.id}`}>
      {b.coverImagePath ? <img src={resolveUploadUrl(b.coverImagePath) ?? undefined} alt="" className="mb-3 h-36 w-full rounded-lg object-cover" /> : <div className="mb-3 grid h-36 w-full place-items-center rounded-lg bg-[#eef7f1]"><BookOpen size={26} className="text-primary" /></div>}
      <h3 className="text-sm font-bold leading-5">{b.title}</h3>{b.author && <p className="mt-1 text-xs text-muted-foreground">{b.author}</p>}
      {!url && <p className="mt-1.5 text-[10px] font-bold text-destructive">Unavailable right now — ask your admin to re-upload this book.</p>}
    </Card>; })}</div> : <EmptyState icon={BookOpen} title="No books yet" body="Your admin hasn't added any books to the library yet." />}
  </div>;
}

function Notifications() {
  const q = useListNotifications();
  const ns: Notification[] = q.data ?? [];
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) });
  const unread = ns.filter((n) => !n.read);
  const markAll = () => unread.forEach((n) => markRead.mutate(n.id));

  return <div className="max-w-3xl"><SectionHeader eyebrow="Stay oriented" title="Notifications" action={unread.length > 0 && <button onClick={markAll} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary" data-testid="button-mark-all-read"><CheckCheck size={14} /> Mark all as read</button>} /><div className="overflow-hidden rounded-2xl border border-border bg-card">{ns.map((n) => <div key={n.id} className={cn('flex gap-4 border-b border-border p-5 transition-colors last:border-0', !n.read && 'bg-[#f3f8f3]')} data-testid={`row-notification-${n.id}`}><div className={cn('grid size-10 shrink-0 place-items-center rounded-xl', n.type === 'payment' ? 'bg-[#fff0cb] text-[#94651c]' : n.type === 'milestone' ? 'bg-[#d7eee4] text-[#287058]' : 'bg-[#dceaf1] text-[#32647b]')}><Bell size={17} /></div><div className="flex-1"><div className="flex items-center gap-2 text-sm font-bold">{n.title}{!n.read && <span className="size-1.5 rounded-full bg-[#dc815e]" />}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{n.body}</p><div className="mt-2 font-mono-app text-[10px] text-muted-foreground">{n.createdAt}</div></div>{!n.read && <button onClick={() => markRead.mutate(n.id)} className="self-start rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-mark-read-${n.id}`}>Mark read</button>}</div>)}{!ns.length && <EmptyState icon={Bell} title="All caught up" body="Nothing new right now." />}</div></div>;
}

// Renders every configured way to pay: the enabled methods with their own
// numbers/instructions, every bank account (falling back to the legacy
// single-account fields for older deployments that haven't set up the
// array yet), and the QR code if one's been uploaded. Shared by the
// membership page and the sign-up flow so both stay in sync automatically.
function PaymentDestinationCard({ pd }: { pd?: PaymentDetails }) {
  const accounts = pd?.bankAccounts?.length ? pd.bankAccounts : (pd?.PAYMENT_ACCOUNT_HOLDER || pd?.PAYMENT_BANK_NAME || pd?.PAYMENT_ACCOUNT_NUMBER)
    ? [{ id: 'legacy', label: 'Bank account', accountHolder: pd.PAYMENT_ACCOUNT_HOLDER, bankName: pd.PAYMENT_BANK_NAME, accountNumber: pd.PAYMENT_ACCOUNT_NUMBER, ifsc: pd.PAYMENT_IFSC_OR_ROUTING, branch: '', isPrimary: true }]
    : [];
  const methods = (pd?.methods || []).filter((m) => m.enabled);
  // Selectable destinations: the primary/each bank account, plus each
  // enabled non-bank method (wallets, cash). "Bank Transfer" as a method
  // entry is skipped here since the actual bank accounts already cover it.
  type Destination = { key: string; label: string; icon: 'bank' | 'wallet' | 'cash'; account?: (typeof accounts)[number]; method?: PaymentMethodConfig };
  const destinations: Destination[] = [
    ...accounts.map((a) => ({ key: `bank_${a.id}`, label: a.label || a.bankName || 'Bank account', icon: 'bank' as const, account: a })),
     ...methods.filter((m) => m.type !== 'bank').map((m) => ({ key: `method_${m.key}`, label: m.label, icon: m.type === 'wallet' ? ('wallet' as const) : ('cash' as const), method: m })),
  ];
  const primaryIndex = Math.max(0, destinations.findIndex((d) => d.account?.isPrimary));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => { if (!selectedKey && destinations.length) setSelectedKey(destinations[primaryIndex]?.key ?? destinations[0].key); }, [destinations.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pd) return null;
  const hasAnything = destinations.length || pd.PAYMENT_UPI_ID || pd.PAYMENT_RAAST_ID || pd.PAYMENT_WALLET_NUMBER;
  if (!hasAnything) return null;
  const selected = destinations.find((d) => d.key === selectedKey) ?? destinations[0];

  return <div className="rounded-2xl border border-border bg-muted p-4"><div className="mb-3 flex items-center gap-1.5 text-xs font-extrabold"><Landmark size={14} /> Where to send payment</div>
    {pd.PAYMENT_INSTRUCTIONS && <p className="mb-3 text-[11px] leading-5 text-muted-foreground">{pd.PAYMENT_INSTRUCTIONS}</p>}
    {destinations.length > 1 && <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payment method">{destinations.map((d) => <button key={d.key} type="button" onClick={() => setSelectedKey(d.key)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold', selectedKey === d.key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground')} data-testid={`button-select-payment-method-${d.key}`}>{d.icon === 'bank' ? <Landmark size={12} /> : d.icon === 'wallet' ? <Smartphone size={12} /> : <CreditCard size={12} />}{d.label}</button>)}</div>}
    {selected?.account && <div className="rounded-xl bg-card p-3">
      {selected.account.isPrimary && destinations.length > 1 && <div className="mb-1.5"><span className="rounded-full bg-[#d7eee4] px-1.5 py-0.5 text-[9px] font-bold text-[#164b4b]">Primary</span></div>}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {selected.account.accountHolder && <CopyRow label="Account holder" value={selected.account.accountHolder} />}
        {selected.account.bankName && <CopyRow label="Bank" value={selected.account.bankName} />}
        {selected.account.accountNumber && <CopyRow label="Account number" value={selected.account.accountNumber} />}
        {selected.account.ifsc && <CopyRow label="IFSC / routing" value={selected.account.ifsc} />}
      </div>
    </div>}
    {selected?.method && <div className="rounded-xl bg-card p-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {selected.method.accountNumber && <CopyRow label={`${selected.method.label} number`} value={selected.method.accountNumber} />}
        {selected.method.accountName && <CopyRow label="Account name" value={selected.method.accountName} />}
      </div>
      {selected.method.instructions && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{selected.method.instructions}</p>}
    </div>}
    {!destinations.length && (pd.PAYMENT_UPI_ID || pd.PAYMENT_RAAST_ID || pd.PAYMENT_WALLET_NUMBER) && <div className="grid gap-1.5 sm:grid-cols-2">
      {pd.PAYMENT_UPI_ID && <CopyRow label="UPI ID" value={pd.PAYMENT_UPI_ID} />}
      {pd.PAYMENT_RAAST_ID && <CopyRow label="Raast ID" value={pd.PAYMENT_RAAST_ID} />}
      {pd.PAYMENT_WALLET_NUMBER && <CopyRow label={pd.PAYMENT_WALLET_PROVIDER || 'Wallet'} value={pd.PAYMENT_WALLET_NUMBER} />}
    </div>}
    {pd.PAYMENT_QR_CODE_URL && <div className="mt-3 flex justify-center border-t border-border pt-3"><img src={pd.PAYMENT_QR_CODE_URL} alt="Payment QR code" className="max-h-32 rounded-lg border border-border object-contain" /></div>}
  </div>;
}

function SubscriptionStatusCard({ plans, payments }: { plans: MembershipPlan[]; payments: { planName: string; status: string; submittedAt: string }[] }) {
  const dashboard = useGetStudentDashboard();
  const d = dashboard.data;
  const isActive = d?.membershipStatus === 'ACTIVE';
  const daysRemaining = d?.membershipExpiry ? Math.max(0, Math.ceil((new Date(d.membershipExpiry).getTime() - Date.now()) / 86400000)) : null;
  const latestPending = payments.find((p) => p.status === 'pending');
  const currentPlanName = payments.find((p) => p.status === 'approved')?.planName;
  const expiringSoon = isActive && daysRemaining !== null && daysRemaining <= 7;

  return <div className={cn('rounded-2xl border p-6', isActive ? (expiringSoon ? 'border-[#e5a952] bg-[#fdf6e8]' : 'border-primary/30 bg-[#eef7f1]') : 'border-border bg-card')} data-testid="card-subscription-status">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className={cn('grid size-11 place-items-center rounded-xl', isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><ShieldCheck size={19} /></div><div><div className="flex items-center gap-2 text-sm font-extrabold">{isActive ? 'Active subscription' : latestPending ? 'Payment under review' : 'No active subscription'}<Badge tone={isActive ? (expiringSoon ? 'amber' : 'green') : latestPending ? 'amber' : 'neutral'}>{isActive ? (expiringSoon ? 'expiring soon' : 'live') : latestPending ? 'pending review' : 'inactive'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{currentPlanName ? `${currentPlanName} plan` : 'No plan on record'}{isActive && d?.membershipExpiry ? ` · renews ${new Date(d.membershipExpiry).toLocaleDateString()}` : ''}</p></div></div>
      <div className="text-right"><div className="font-display text-3xl">{isActive && daysRemaining !== null ? daysRemaining : '—'}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{isActive ? 'days remaining' : latestPending ? 'awaiting approval' : 'get started below'}</div></div>
    </div>
  </div>;
}

function Payments() {
  const plansQ = useListMembershipPlans();
  const payQ = useListPayments();
  const paymentDetails = useQuery({ queryKey: ['payment-details'], queryFn: publicApi.paymentDetails });
  const dashboard = useGetStudentDashboard();
  const plans = plansQ.data ?? [];
  const payments = payQ.data ?? [];
  const isActive = dashboard.data?.membershipStatus === 'ACTIVE';
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  useEffect(() => { if (selectedPlan === null && plans.length) setSelectedPlan(plans[1]?.id ?? plans[0].id); }, [plans, selectedPlan]);
  const [method, setMethod] = useState('');
  const [proof, setProof] = useState<{ storagePath: string; fileName: string; previewUrl: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const submit = useSubmitPayment();
  const pd = paymentDetails.data;

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file, 'payment-proof');
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setProof({ storagePath: res.storagePath, fileName: file.name, previewUrl });
    } finally {
      setUploading(false);
    }
  };

  return <div className="max-w-5xl"><SectionHeader eyebrow="Membership" title="Access that fits your semester" />
  <div className="mb-6"><SubscriptionStatusCard plans={plans} payments={payments} /></div>
  {!showForm ? <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center"><p className="text-xs text-muted-foreground">{isActive ? "Your access is active. Renewing early? You can submit a new payment any time." : 'Choose a plan and submit your payment to activate access.'}</p><button onClick={() => setShowForm(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-show-payment-form">{isActive ? 'Renew / change plan' : 'Choose a plan & pay'}</button></div> : <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]"><div>
    <div className="mb-3 text-xs font-bold text-muted-foreground">Choose your access</div>
    <div className="space-y-3">{plans.map((p) => <button onClick={() => setSelectedPlan(p.id)} key={p.id} className={cn('w-full rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5', selectedPlan === p.id ? 'border-primary bg-[#eef7f1] shadow-sm' : 'border-border bg-card hover:border-primary/40')} data-testid={`button-plan-${p.id}`}><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><span className="text-sm font-extrabold">{p.name}</span>{p.discountLabel && <span className="rounded-full bg-[#fff0cb] px-2 py-0.5 text-[10px] font-bold text-[#94651c]">{p.discountLabel}</span>}</div><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{p.description}</p></div><div className="text-right">{p.originalPrice != null && p.originalPrice > p.price && <div className="text-xs text-muted-foreground line-through">{money(p.originalPrice, p.currency)}</div>}<div className="font-display text-2xl">{money(p.price, p.currency)}</div><div className="text-[10px] text-muted-foreground">/{p.durationUnit}</div></div></div><div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-primary">{selectedPlan === p.id ? <CheckCircle2 size={14} /> : <div className="size-3.5 rounded-full border border-border" />} {selectedPlan === p.id ? 'Selected' : 'Select this plan'}</div></button>)}{!plans.length && <EmptyState icon={CreditCard} title="No plans available yet" body="Your academic team hasn't published any membership plans yet." />}</div>
    {pd && <div className="mt-5"><PaymentDestinationCard pd={pd} /></div>}
  </div>
  <form onSubmit={(e) => { e.preventDefault(); if (!method || selectedPlan === null) return; const f = new FormData(e.currentTarget); submit.mutate({ data: { planId: selectedPlan, method, reference: String(f.get('reference')), paymentDate: String(f.get('paymentDate')), proofPath: proof?.storagePath ?? null } }, { onSuccess: () => setSubmitted(true) }); }} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
    <div className="flex items-center gap-2 text-sm font-bold"><CreditCard size={17} className="text-primary" /> Submit payment proof</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Your access activates after a quick review by your institution team.</p>
    <div className="mt-6"><div className="mb-2 text-xs font-bold">Payment method</div><div className="flex flex-wrap gap-2">{PAYMENT_METHODS.map(({ value, label, icon: Icon }) => <button type="button" key={value} onClick={() => setMethod(value)} className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors', method === value ? 'border-primary bg-[#eef7f1] text-primary' : 'border-border bg-background hover:bg-muted')} data-testid={`button-method-${value.toLowerCase().replaceAll(' ', '-')}`}><Icon size={14} /> {label}</button>)}</div></div>
    <label className="mt-4 block text-xs font-bold">Transaction reference<input required name="reference" placeholder="e.g. NBX-20481" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-payment-reference" /></label>
    <label className="mt-4 block text-xs font-bold">Payment date<input required type="date" name="paymentDate" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-payment-date" /></label>
    <div className="mt-4"><div className="mb-2 text-xs font-bold">Payment proof</div><label onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }} className={cn('flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center transition-colors', dragOver ? 'border-primary bg-[#eef7f1]' : proof ? 'border-primary/40 bg-[#eef7f1]/40' : 'border-border bg-background hover:bg-muted')} data-testid="dropzone-payment-proof"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" data-testid="input-payment-proof" />{uploading ? <p className="text-xs font-semibold text-muted-foreground">Uploading…</p> : proof ? <>{proof.previewUrl ? <img src={proof.previewUrl} alt="Payment proof preview" className="max-h-20 rounded-lg border border-border object-contain" /> : <FileText size={18} className="text-primary" />}<p className="text-xs font-bold text-primary">{proof.fileName}</p></> : <><UploadCloud size={18} className="text-muted-foreground" /><p className="text-[11px] font-semibold">Drag a file, or click to browse</p></>}</label></div>
    {submitted && <div className="mt-4 rounded-xl bg-[#e6f3ed] p-3 text-xs font-bold text-[#287058]"><CheckCircle2 size={15} className="mr-1 inline" /> Submitted for review</div>}
    <div className="mt-6 flex gap-2"><button disabled={submit.isPending || !method || uploading || selectedPlan === null} className="flex-1 rounded-xl bg-primary py-3 text-xs font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0" data-testid="button-submit-payment">{submit.isPending ? 'Submitting…' : 'Submit for review'}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-border px-4 text-xs font-bold" data-testid="button-hide-payment-form">Close</button></div>
  </form></div>}
  <div className="mt-9"><SectionHeader eyebrow="Your history" title="Payment submissions" />{payments.length ? <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-muted text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id} className="border-t border-border" data-testid={`row-payment-${p.id}`}><td className="px-5 py-4 font-bold">{p.planName}</td><td className="px-5 py-4 font-mono-app text-[11px]">{p.reference}</td><td className="px-5 py-4 text-muted-foreground">{p.submittedAt.slice(0, 10)}</td><td className="px-5 py-4"><Badge tone={p.status === 'approved' ? 'green' : p.status === 'rejected' ? 'red' : 'amber'}>{p.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No submissions yet" body="Your payment history will appear here." />}</div></div>;
}

function TeamPhoto({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  const url = member.photoPath ? resolveUploadUrl(member.photoPath) : null;
  if (!url || broken) return <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-sm font-extrabold text-[#164b4b]">{initials(member.name)}</div>;
  return <img src={url} alt={member.name} className="size-14 shrink-0 rounded-full border border-border object-cover" onError={() => setBroken(true)} />;
}

function Profile() {
  const q = useGetCurrentUser();
  if (q.isLoading) return <SkeletonPage />;
  if (!q.data) return <ErrorState retry={() => q.refetch()} />;
  const u = q.data;
  const [editing, setEditing] = useState(false);
  const update = useMutation({ mutationFn: authApi.updateMe, onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); setEditing(false); } });
  const dashboard = useGetStudentDashboard();
  const daysRemaining = dashboard.data?.membershipExpiry ? Math.max(0, Math.ceil((new Date(dashboard.data.membershipExpiry).getTime() - Date.now()) / 86400000)) : null;

  return <div className="max-w-4xl"><SectionHeader eyebrow="Your account" title="Profile & access" /><div className="grid gap-5 md:grid-cols-[220px_1fr]"><div className="rounded-2xl border border-border bg-card p-6"><div className="grid size-16 place-items-center rounded-2xl bg-[#d7eee4] text-xl font-extrabold text-[#164b4b]">{initials(u.name)}</div><h2 className="mt-5 font-display text-2xl text-foreground">{u.name}</h2><div className="mt-1 text-xs text-muted-foreground">{u.program || 'Medical student'}</div><Badge tone={dashboard.data?.membershipStatus === 'ACTIVE' ? 'green' : 'amber'}>{dashboard.data?.membershipStatus === 'ACTIVE' ? 'Active member' : 'Pending activation'}</Badge></div>
    <div className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><h3 className="font-bold">Personal details</h3><button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:opacity-80" data-testid="button-edit-profile"><Pencil size={13} /> {editing ? 'Cancel' : 'Edit'}</button></div>
      {editing ? <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); update.mutate({ name: String(f.get('name')), phone: String(f.get('phone') || '') }); }} className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold sm:col-span-2">Full name<div className="mt-2"><IconField icon={UserIcon} required name="name" defaultValue={u.name} data-testid="input-edit-name" /></div></label><label className="text-xs font-bold">Phone<div className="mt-2"><IconField icon={Phone} name="phone" defaultValue={(u as { phone?: string }).phone ?? ''} data-testid="input-edit-phone" /></div></label><div className="flex items-end sm:col-span-2"><button disabled={update.isPending} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-profile">{update.isPending ? 'Saving…' : 'Save changes'}</button></div></form>
      : <div className="mt-6 grid gap-5 sm:grid-cols-2">{[['Full name', u.name], ['Email address', u.email], ['Institution', u.institution || 'Not added'], ['Programme', u.program || 'Not added']].map(([label, value]) => <div key={label}><div className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-2 text-sm font-semibold">{value}</div></div>)}</div>}
    </div></div>
  <div className="mt-5 rounded-2xl border border-border bg-card p-6"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#d7eee4] text-primary"><ShieldCheck size={19} /></div><div><h3 className="text-sm font-bold">Membership access</h3><p className="mt-1 text-xs text-muted-foreground">{daysRemaining !== null ? `Active · ${daysRemaining} days remaining` : 'No active membership yet'}</p></div><Link href="/payments" className="ml-auto rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted" data-testid="link-manage-membership">Manage</Link></div></div>
  <TeamSection />
  <Footer variant="full" />
  </div>;
}

function TeamSection() {
  const q = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const team = q.data?.team || [];
  if (!team.length) return null;
  const card = (m: TeamMember) => <div key={m.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-team-${m.id}`}><div className="flex items-center gap-3"><TeamPhoto member={m} /><div><div className="text-sm font-bold">{m.name}</div><div className="text-xs text-primary">{m.role}</div></div></div>{m.achievementBadge && <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#fdeecb] px-2.5 py-1 text-[10px] font-bold text-[#8a5a12]"><Trophy size={11} /> {m.achievementBadge}</span>}{m.bio && <p className="mt-3 text-xs leading-5 text-muted-foreground">{m.bio}</p>}{(m.linkedinUrl || m.instagramUrl || m.email) && <div className="mt-3 flex gap-2">{m.linkedinUrl && <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">in</a>}{m.instagramUrl && <a href={m.instagramUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">ig</a>}{m.email && <a href={`mailto:${m.email}`} className="grid size-7 place-items-center rounded-full bg-muted hover:bg-primary/10 hover:text-primary"><Mail size={12} /></a>}</div>}</div>;
  return <div className="mt-9"><SectionHeader eyebrow="Behind the platform" title="Our Academic Team" />
    {TEAM_CATEGORIES.map((cat) => { const inCat = team.filter((m) => (m.category ?? 'reviewer') === cat); if (!inCat.length) return null; return <div key={cat} className="mb-6 last:mb-0"><div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{TEAM_CATEGORY_LABELS[cat]}</div><div className="grid gap-4 sm:grid-cols-2">{inCat.map(card)}</div></div>; })}
  </div>;
}

function SocialIcons({ content, dark = false }: { content?: SiteContent; dark?: boolean }) {
  const links: Array<[string, string | undefined]> = [['Facebook', content?.SOCIAL_FACEBOOK], ['YouTube', content?.SOCIAL_YOUTUBE], ['LinkedIn', content?.SOCIAL_LINKEDIN], ['Instagram', content?.SOCIAL_INSTAGRAM]];
  const present = links.filter(([, url]) => url);
  if (!present.length) return null;
  return <div className="flex gap-2.5">{present.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer" className={cn('grid size-8 place-items-center rounded-full text-xs font-bold transition-colors', dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary')} data-testid={`link-social-${label.toLowerCase()}`}>{label[0]}</a>)}</div>;
}

function Footer({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const q = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const c = q.data;
  const year = new Date().getFullYear();
  const platformName = c?.PLATFORM_NAME || 'MedschoolProffs';

  if (variant === 'compact') return <div className="flex items-center justify-between gap-3 font-mono-app text-[10px] text-muted-foreground"><span>© {year} {platformName} · {c?.COPYRIGHT_NOTICE || 'All rights reserved.'}</span><SocialIcons content={c} /></div>;

  return <div className="mt-12 overflow-hidden rounded-3xl border border-border bg-card">
    <div className="border-b border-border p-8 text-center"><h3 className="font-display text-2xl text-foreground">Connect With Us</h3><p className="mt-2 text-sm text-muted-foreground">Join our community and stay updated with the latest resources</p><div className="mt-5 flex justify-center"><SocialIcons content={c} /></div></div>
    <div className="grid gap-8 p-8 sm:grid-cols-2">
      <div><h4 className="text-sm font-extrabold text-foreground">{platformName}</h4><p className="mt-2 text-xs leading-6 text-muted-foreground">{c?.PLATFORM_DESCRIPTION || 'Empowering medical students with comprehensive study resources and innovative learning tools to ace their professional exams.'}</p></div>
      <div><h4 className="text-sm font-extrabold text-foreground">Contact Info</h4><div className="mt-3 space-y-2 text-xs text-muted-foreground">{c?.CONTACT_EMAIL && <div className="flex items-center gap-2"><Mail size={13} className="text-primary" /> {c.CONTACT_EMAIL}</div>}{c?.CONTACT_LOCATION && <div className="flex items-center gap-2"><Landmark size={13} className="text-primary" /> {c.CONTACT_LOCATION}</div>}{c?.SUPPORT_HOURS && <div className="flex items-center gap-2"><Clock3 size={13} className="text-primary" /> {c.SUPPORT_HOURS}</div>}</div></div>
      {!!c?.features?.length && <div><h4 className="text-sm font-extrabold text-foreground">Features</h4><div className="mt-3 space-y-2 text-xs text-muted-foreground">{c.features.map((f) => <div key={f} className="flex items-center gap-2"><Check size={13} className="text-primary" /> {f}</div>)}</div></div>}
      {!!c?.quickLinks?.length && <div><h4 className="text-sm font-extrabold text-foreground">Quick Links</h4><div className="mt-3 space-y-2 text-xs text-muted-foreground">{c.quickLinks.map((l) => <Link key={l.label} href={l.url} className="block hover:text-primary">{l.label}</Link>)}</div></div>}
    </div>
    <div className="border-t border-border bg-muted/40 px-8 py-4 text-center font-mono-app text-[10px] text-muted-foreground">© {year} {platformName}. {c?.COPYRIGHT_NOTICE || 'All rights reserved.'}</div>
  </div>;
}

function AuthLayout({ children, register = false }: { children: ReactNode; register?: boolean }) { return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]"><div className="flex flex-col p-6 md:p-10"><Logo /><div className="mx-auto flex w-full max-w-sm flex-1 items-center py-10">{children}</div><Footer /></div><div className="relative hidden overflow-hidden bg-sidebar p-14 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-20 top-20 size-96 rounded-full border-[44px] border-sidebar-accent/50" /><div className="absolute bottom-10 left-10 size-48 rounded-full border-[20px] border-sidebar-primary/25" /><div className="relative"><div className="font-mono-app text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/70">Practice &amp; learn — no exam pressure</div><h2 className="mt-8 max-w-lg font-display text-6xl leading-[.93] tracking-[-.04em]">Every MCQ<br /><em className="text-sidebar-primary not-italic">you'll need.</em></h2></div><div className="relative max-w-sm"><div className="mb-4 h-px bg-sidebar-border" /><p className="text-sm leading-6 text-sidebar-foreground/80">One MCQ bank across every college, subject, and topic for MBBS &amp; BDS students — built for steady daily practice, not timed exams.</p><div className="mt-5 flex items-center gap-2 text-xs font-bold"><span className="grid size-7 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><Check size={14} /></span> Instant explanations on every question</div></div></div></div>; }
function Login() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendDone, setResendDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => { queryClient.invalidateQueries(); setLocation('/'); },
    onError: (err: unknown, vars) => {
      setResendDone(false);
      if (err instanceof ApiRequestError) {
        setError(err.message);
        const code = (err.data as { code?: string } | null)?.code;
        setUnverifiedEmail(code === 'EMAIL_NOT_VERIFIED' ? vars.email : null);
      } else {
        setError('Something went wrong. Please try again.');
        setUnverifiedEmail(null);
      }
    },
  });
  const resend = useMutation({
    mutationFn: (email: string) => authApi.resendVerification(email),
    onSuccess: () => setResendDone(true),
  });
  return <AuthLayout><div className="w-full"><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Welcome back</div><h1 className="mt-3 font-display text-4xl tracking-[-.04em]">Sign in to your desk.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Your next clear step is waiting.</p><form onSubmit={(e) => { e.preventDefault(); setError(null); setUnverifiedEmail(null); const f = new FormData(e.currentTarget); login.mutate({ email: String(f.get('email')), password: String(f.get('password')) }); }} className="mt-8 space-y-4">
    <label className="block text-xs font-bold">Email<div className="relative mt-2"><Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="email" type="email" autoComplete="email" placeholder="you@college.edu" className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-login-email" /></div></label>
    <label className="block text-xs font-bold">Password<div className="relative mt-2"><LockKeyhole size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="At least 8 characters" className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-11 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-login-password" /><button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground" data-testid="button-toggle-login-password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
    <div className="flex justify-end"><Link href="/forgot-password" className="text-xs font-bold text-primary hover:underline" data-testid="button-forgot-password">Forgot password?</Link></div>
    {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-login-error">{error}{unverifiedEmail && <div className="mt-2">{resendDone ? <span className="font-bold text-primary">Verification email sent — check your inbox.</span> : <button type="button" onClick={() => resend.mutate(unverifiedEmail)} disabled={resend.isPending} className="font-bold text-primary underline disabled:opacity-50" data-testid="button-resend-verification">{resend.isPending ? 'Sending…' : 'Resend verification email'}</button>}</div>}</div>}
    <button disabled={login.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm" data-testid="button-login-submit">{login.isPending && <Loader2 size={14} className="animate-spin" />}{login.isPending ? 'Signing in…' : 'Sign in'}</button>
  </form><p className="mt-7 text-center text-xs text-muted-foreground">New to the desk? <Link href="/register" className="font-bold text-primary hover:underline" data-testid="link-register">Create a student account</Link></p></div></AuthLayout>;
}
function Stepper({ step }: { step: 1 | 2 }) {
  const steps = [{ n: 1, label: 'Your details' }, { n: 2, label: 'Membership & payment' }];
  return <div className="mb-8 flex items-center gap-3">{steps.map((s, i) => <div key={s.n} className="flex items-center gap-3">
    <div className="flex items-center gap-2.5"><div className={cn('grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold transition-colors', step > s.n ? 'bg-primary text-primary-foreground' : step === s.n ? 'bg-primary text-primary-foreground ring-4 ring-primary/15' : 'bg-muted text-muted-foreground')} data-testid={`step-indicator-${s.n}`}>{step > s.n ? <Check size={14} /> : s.n}</div><span className={cn('hidden text-xs font-bold sm:inline', step >= s.n ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span></div>
    {i < steps.length - 1 && <div className={cn('h-0.5 w-8 rounded-full transition-colors sm:w-16', step > s.n ? 'bg-primary' : 'bg-muted')} />}
  </div>)}</div>;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2"><div className="min-w-0"><div className="text-[10px] text-muted-foreground">{label}</div><div className="truncate font-mono-app text-xs font-bold">{value}</div></div><button type="button" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-copy-${label.toLowerCase().replaceAll(' ', '-')}`}>{copied ? <CheckCheck size={14} className="text-primary" /> : <Copy size={14} />}</button></div>;
}

function IconField({ icon: Icon, ...props }: { icon: typeof UserIcon } & ComponentProps<'input'>) {
  return <div className="relative"><Icon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input {...props} className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20" /></div>;
}

function PasswordStrength({ value }: { value: string }) {
  const score = [value.length >= 8, /[A-Z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  if (!value) return null;
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score];
  const color = ['bg-destructive', 'bg-destructive', 'bg-[#e5a952]', 'bg-[#8bcbb8]', 'bg-primary'][score];
  return <div className="mt-2"><div className="flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < score ? color : 'bg-muted')} />)}</div><div className="mt-1 text-[10px] font-semibold text-muted-foreground">{label}</div></div>;
}

const PAYMENT_METHODS: Array<{ value: string; label: string; icon: typeof Landmark }> = [
  { value: 'Bank transfer', label: 'Bank transfer', icon: Landmark },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'Raast', label: 'Raast', icon: Zap },
  { value: 'Mobile wallet', label: 'Mobile wallet', icon: Smartphone },
  { value: 'Card', label: 'Card', icon: CreditCard },
];

function Register() {
  const [institutionId, setInstitutionId] = useState('');
  const [programKind, setProgramKind] = useState<'MBBS' | 'BDS' | ''>('');
  const [yearNumber, setYearNumber] = useState('');
  const [planId, setPlanId] = useState<number | null>(null);
  const [proof, setProof] = useState<{ storagePath: string; fileName: string; previewUrl: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const institutions = useQuery({ queryKey: ['institutions', 'active'], queryFn: () => academicApi.institutions(true) });
  const plans = useListMembershipPlans();
  const paymentDetails = useQuery({ queryKey: ['payment-details'], queryFn: publicApi.paymentDetails });

  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => setDone(true),
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.'),
  });

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const res = await uploadFile(file, 'payment-proof-signup');
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setProof({ storagePath: res.storagePath, fileName: file.name, previewUrl });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not upload that file. Try a smaller image or PDF.');
    } finally {
      setUploading(false);
    }
  };

  if (done) return <AuthLayout register><div className="w-full text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-[#d7eee4] text-[#164b4b]"><CheckCircle2 size={26} /></div><h1 className="font-display text-3xl tracking-[-.04em]">Almost there</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Confirm your email using the link we sent you. Once our team verifies your payment, your account is activated automatically and you can sign in — no exams, just steady practice.</p><Link href="/login" className="mt-7 inline-block rounded-xl bg-primary px-6 py-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="link-login-after-register">Go to sign in</Link></div></AuthLayout>;

  const selectedPlan = (plans.data || []).find((p) => p.id === planId) || null;
  const bestValueId = (plans.data || []).length > 1 ? [...(plans.data || [])].sort((a, b) => (a.price / a.duration) - (b.price / b.duration))[0].id : null;
  const pd = paymentDetails.data;

  return <AuthLayout register><div className="w-full"><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Create your account</div><h1 className="mt-3 font-display text-4xl tracking-[-.04em]">Join MedschoolProffs.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The complete MCQ bank for MBBS &amp; BDS students — built for daily practice and learning, not exam pressure.</p>

    <form onSubmit={(e) => {
      e.preventDefault(); setError(null);
      if (!institutionId) { setError('Please select your college.'); return; }
      if (!programKind) { setError('Please select MBBS or BDS.'); return; }
      if (!yearNumber) { setError('Please select your academic year.'); return; }
      if (!planId) { setError('Please choose a membership plan.'); return; }
      const f = new FormData(e.currentTarget);
      register.mutate({
        name: String(f.get('name')), email: String(f.get('email')), password: String(f.get('password')),
        phone: String(f.get('phone')), institutionId: Number(institutionId), programKind, yearNumber: Number(yearNumber), planId, proofPath: proof?.storagePath,
      });
    }} className="mt-7 space-y-3.5">
      <label className="block text-xs font-bold">Full name<div className="mt-2"><IconField icon={UserIcon} required name="name" placeholder="Your name" data-testid="input-register-name" /></div></label>
      <label className="block text-xs font-bold">College<div className="relative mt-2"><GraduationCap size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><select required value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} className="h-11 w-full appearance-none rounded-xl border border-border bg-card pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="select-register-institution"><option value="">{institutions.isLoading ? 'Loading…' : 'Select your college'}</option>{(institutions.data || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select><ChevronRight size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-muted-foreground" /></div>{!institutions.isLoading && !institutions.data?.length && <p className="mt-1.5 text-[11px] text-muted-foreground">No colleges are set up yet — ask an admin to add one first.</p>}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold">Program<div className="mt-2 grid grid-cols-2 gap-2">{(['MBBS', 'BDS'] as const).map((p) => <button type="button" key={p} onClick={() => { setProgramKind(p); setYearNumber(''); }} className={cn('h-11 rounded-xl border text-sm font-bold transition-colors', programKind === p ? 'border-primary bg-[#eef7f1] text-primary' : 'border-border bg-card hover:bg-muted')} data-testid={`button-program-${p.toLowerCase()}`}>{p}</button>)}</div></label>
        <label className="block text-xs font-bold">Academic year<div className="relative mt-2"><CalendarDays size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><select required value={yearNumber} onChange={(e) => setYearNumber(e.target.value)} disabled={!programKind} className="h-11 w-full appearance-none rounded-xl border border-border bg-card pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50" data-testid="select-register-year"><option value="">{!programKind ? 'Select program first' : 'Select year'}</option>{programKind && Array.from({ length: programKind === 'MBBS' ? 5 : 4 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y}{y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year{y === (programKind === 'MBBS' ? 5 : 4) ? ' (Final)' : ''}</option>)}</select><ChevronRight size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-muted-foreground" /></div></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold">Email<div className="mt-2"><IconField icon={Mail} required type="email" name="email" placeholder="you@college.edu" data-testid="input-register-email" /></div></label><label className="block text-xs font-bold">WhatsApp number<div className="mt-2"><IconField icon={Phone} required name="phone" placeholder="03xx-xxxxxxx" data-testid="input-register-phone" /></div></label></div>
      <label className="block text-xs font-bold">Password<div className="relative mt-2"><LockKeyhole size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required minLength={8} type={showPassword ? 'text' : 'password'} name="password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-register-password" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" data-testid="button-toggle-password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><PasswordStrength value={passwordValue} /></label>

      <div><div className="mb-2 text-xs font-bold">Selected plan</div><div className="grid gap-3 sm:grid-cols-2">{(plans.data || []).map((plan) => <button type="button" key={plan.id} onClick={() => setPlanId(plan.id)} className={cn('group relative overflow-hidden rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5', planId === plan.id ? 'border-primary bg-[#eef7f1] shadow-sm' : 'border-border bg-card hover:border-primary/40')} data-testid={`button-select-plan-${plan.id}`}>
        {plan.id === bestValueId && <span className="absolute right-3 top-3 rounded-full bg-[#e5a952] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#183844]">Best value</span>}
        {plan.discountLabel && plan.id !== bestValueId && <span className="absolute right-3 top-3 rounded-full bg-[#fff0cb] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#94651c]">{plan.discountLabel}</span>}
        <div className="flex items-center gap-2"><div className={cn('grid size-8 place-items-center rounded-lg', planId === plan.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><CreditCard size={15} /></div>{planId === plan.id && <CheckCircle2 size={16} className="text-primary" />}</div>
        <div className="mt-3 text-sm font-extrabold">{plan.name}</div><div className="mt-1 flex items-center gap-2">{plan.originalPrice != null && plan.originalPrice > plan.price && <span className="text-xs text-muted-foreground line-through">{money(plan.originalPrice, plan.currency)}</span>}<span className="font-display text-2xl">{money(plan.price, plan.currency)}</span></div><div className="mt-1 text-[11px] text-muted-foreground">{plan.duration} {plan.durationUnit} access</div>
      </button>)}{!plans.data?.length && <p className="text-xs text-muted-foreground sm:col-span-2">{plans.isLoading ? 'Loading plans…' : 'No membership plans are available yet — ask an admin to add one.'}</p>}</div></div>
      {programKind && yearNumber && <p className="text-[11px] text-muted-foreground">You'll see content for <span className="font-bold text-primary">{programKind} · {yearNumber}{yearNumber === '1' ? 'st' : yearNumber === '2' ? 'nd' : yearNumber === '3' ? 'rd' : 'th'} Year</span> — set by your college admin.</p>}

      {pd && <PaymentDestinationCard pd={pd} />}

      <div><div className="mb-2 text-xs font-bold">Upload payment proof</div><label onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }} className={cn('flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors', dragOver ? 'border-primary bg-[#eef7f1]' : proof ? 'border-primary/40 bg-[#eef7f1]/40' : 'border-border bg-card hover:bg-muted')} data-testid="dropzone-payment-proof">
        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" data-testid="input-payment-proof" />
        {uploading ? <p className="text-xs font-semibold text-muted-foreground">Uploading…</p> : proof ? <>{proof.previewUrl ? <img src={proof.previewUrl} alt="Payment proof preview" className="max-h-28 rounded-lg border border-border object-contain" /> : <FileText size={22} className="text-primary" />}<p className="text-xs font-bold text-primary">{proof.fileName}</p><span className="text-[10px] text-muted-foreground">Click to replace</span></> : <><UploadCloud size={22} className="text-muted-foreground" /><p className="text-xs font-semibold">Drag your payment screenshot here, or click to browse</p><span className="text-[10px] text-muted-foreground">PNG, JPEG, WEBP, or PDF</span></>}
      </label></div>

      {selectedPlan && <div className="flex items-center gap-2 rounded-xl bg-[#eef7f1] p-3 text-xs font-semibold text-primary"><CheckCircle2 size={14} /> Paying {money(selectedPlan.price, selectedPlan.currency)} for {selectedPlan.name} — your order goes to the admin for approval</div>}
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-register-error">{error}</div>}
      <button disabled={register.isPending || uploading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm" data-testid="button-register-submit">{register.isPending && <Loader2 size={14} className="animate-spin" />}{register.isPending ? 'Creating your account…' : 'Create account & submit payment'}</button>
    </form>
    <p className="mt-6 text-center text-xs text-muted-foreground">Already have an account? <Link href="/login" className="font-bold text-primary hover:underline" data-testid="link-login">Sign in</Link></p>
  </div></AuthLayout>;
}

function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const submit = useMutation({ mutationFn: authApi.forgotPassword, onSuccess: () => setSent(true) });
  return <AuthLayout><div className="w-full"><h1 className="font-display text-4xl tracking-[-.04em]">Reset your password.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Enter your email and we'll send a reset link if an account exists.</p>{sent ? <div className="mt-6 rounded-xl border border-primary/30 bg-[#eef7f1] p-4 text-xs font-semibold text-primary" data-testid="text-forgot-sent">If that email is registered, a reset link is on its way.</div> : <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit.mutate(String(f.get('email'))); }} className="mt-7 space-y-3"><label className="block text-xs font-bold">Email<input required type="email" name="email" className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm" data-testid="input-forgot-email" /></label><button disabled={submit.isPending} className="mt-2 w-full rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-forgot-submit">{submit.isPending ? 'Sending…' : 'Send reset link'}</button></form>}<p className="mt-6 text-center text-xs text-muted-foreground"><Link href="/login" className="font-bold text-primary">Back to sign in</Link></p></div></AuthLayout>;
}

function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [done, setDone] = useState(false);
  const submit = useMutation({ mutationFn: (password: string) => authApi.resetPassword(token, password), onSuccess: () => setDone(true) });
  return <AuthLayout><div className="w-full"><h1 className="font-display text-4xl tracking-[-.04em]">Choose a new password.</h1>{done ? <div className="mt-6"><p className="text-sm text-muted-foreground">Your password has been updated.</p><button onClick={() => setLocation('/login')} className="mt-4 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground" data-testid="button-reset-done">Go to sign in</button></div> : <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit.mutate(String(f.get('password'))); }} className="mt-7 space-y-3"><label className="block text-xs font-bold">New password<input required minLength={8} type="password" name="password" className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm" data-testid="input-reset-password" /></label>{submit.isError && <ErrorState />}<button disabled={submit.isPending || !token} className="mt-2 w-full rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-reset-submit">{submit.isPending ? 'Updating…' : 'Update password'}</button></form>}</div></AuthLayout>;
}

function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const verify = useQuery({ queryKey: ['verify-email', token], queryFn: () => authApi.verifyEmail(token), enabled: !!token, retry: false });
  return <AuthLayout><div className="w-full text-center">{!token ? <p className="text-sm text-muted-foreground">Missing verification token.</p> : verify.isLoading ? <p className="text-sm text-muted-foreground">Verifying your email…</p> : verify.isError ? <p className="text-sm text-destructive">This link is invalid or has expired.</p> : <div><div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-[#d7eee4] text-[#164b4b]"><CheckCircle2 size={26} /></div><h1 className="font-display text-3xl tracking-[-.04em]">Email verified</h1><p className="mt-3 text-sm text-muted-foreground">You can now sign in.</p></div>}<Link href="/login" className="mt-7 inline-block rounded-xl bg-primary px-6 py-3 text-xs font-extrabold text-primary-foreground" data-testid="link-verify-login">Go to sign in</Link></div></AuthLayout>;
}

// Row icon color cycles through the same --chart-1..5 palette used
// elsewhere (topicAccentStyles) so each subject/exam-board reads as a
// distinct color at a glance, matching the reference design's colored
// paper icons — deterministic per examBoard so the same subject always
// gets the same color rather than reshuffling on refetch.
function PastPaperRowIcon({ examBoard }: { examBoard: string }) {
  const styles = topicAccentStyles(examBoard || 'paper');
  return <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={styles.badge}><FileStack size={18} /></span>;
}

// Past papers don't store an estimated duration server-side (only
// mcqCount) — this mirrors the ~1 min/question pacing convention implied
// by the reference design (120 Q -> 2h, 150 Q -> 2.5h, 100 Q -> 1.5h),
// rounded to the nearest half hour purely for display.
function pastPaperEstimatedHours(mcqCount: number): number {
  return Math.round((mcqCount / 60) * 2) / 2;
}

function PastPapers() {
  const papers = useQuery({ queryKey: ['past-papers'], queryFn: () => pastPapersApi.list() });
  const list = papers.data || [];
  // Scoping to the student's own program/year now happens server-side (see
  // GET /past-papers), the same way exam eligibility does — so there's no
  // more manual "All levels" toggle needed here; students just see what
  // applies to them. The Year/Subject/Module filters below are a
  // client-side narrowing on top of that, matching the reference design —
  // "Module" is mapped to the paper's `level` field since PastPaper has no
  // separate module association.
  const [yearFilter, setYearFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const years = Array.from(new Set(list.map((p) => p.year).filter(Boolean))).sort().reverse();
  const subjects = Array.from(new Set(list.map((p) => p.examBoard).filter(Boolean))).sort();
  const modules = Array.from(new Set(list.map((p) => p.level).filter(Boolean))).sort();
  const filtered = list.filter((p) => (!yearFilter || p.year === yearFilter) && (!subjectFilter || p.examBoard === subjectFilter) && (!moduleFilter || p.level === moduleFilter));
  const totals = { papers: list.length, questions: list.reduce((s, p) => s + p.mcqCount, 0) };

  return <div><div className="rounded-2xl border border-border bg-[#eef2fb] p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileStack size={20} /></div><div><h1 className="font-display text-2xl tracking-[-.03em]">Past Papers</h1><p className="mt-1 text-sm text-muted-foreground">Previous exam papers and practice tests.</p></div></div>
    <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-2"><Stat label="Available Papers" value={totals.papers} /><Stat label="Total Questions" value={totals.questions} /></div>
  </div>

  <div className="mt-5 flex flex-wrap gap-2">
    <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs font-semibold" data-testid="select-paper-filter-year"><option value="">All Years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
    <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs font-semibold" data-testid="select-paper-filter-subject"><option value="">All Subjects</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</select>
    <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs font-semibold" data-testid="select-paper-filter-module"><option value="">All Modules</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select>
  </div>

  {papers.isLoading ? <SkeletonPage /> : filtered.length ? <div className="mt-5 space-y-3">{filtered.map((paper) => {
    const hours = pastPaperEstimatedHours(paper.mcqCount);
    return <div key={paper.id} className="card-lift flex items-center gap-4 rounded-2xl border border-border bg-card p-4" data-testid={`card-paper-${paper.id}`}>
      <PastPaperRowIcon examBoard={paper.examBoard} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold text-muted-foreground">{paper.year}</div>
        <div className="truncate text-sm font-extrabold leading-5">{paper.examBoard || paper.title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{paper.mcqCount} Question{paper.mcqCount === 1 ? '' : 's'} · {hours} Hour{hours === 1 ? '' : 's'}</div>
      </div>
      <Link href={`/practice?pastPaperId=${paper.id}`} className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid={`button-start-paper-${paper.id}`}>View</Link>
    </div>;
  })}</div> : <EmptyState icon={FileStack} title="No past papers yet" body="Your admin can add past papers from Admin → Past papers, or none match these filters yet." />}
  </div>;
}

function NotebookCard({ note, onLinkedClick }: { note: NotebookEntry; onLinkedClick: (mcqId: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const update = useMutation({
    mutationFn: () => notebookApi.update(note.id, { title: title.trim(), content: content.trim() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notebook'] }); setEditing(false); toast({ title: 'Note updated' }); },
    onError: (err: unknown) => toast({ title: 'Could not save note', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const remove = useMutation({ mutationFn: () => notebookApi.remove(note.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notebook'] }) });

  if (editing) {
    return <div className="rounded-2xl border border-primary/30 bg-[#eef7f1] p-4" data-testid={`card-note-edit-${note.id}`}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm" data-testid={`input-edit-note-title-${note.id}`} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-card p-3 text-sm" data-testid={`input-edit-note-content-${note.id}`} />
      <div className="mt-2 flex gap-2"><button disabled={update.isPending || !content.trim()} onClick={() => update.mutate()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-note-${note.id}`}>{update.isPending ? 'Saving…' : 'Save'}</button><button onClick={() => { setTitle(note.title); setContent(note.content); setEditing(false); }} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid={`button-cancel-note-${note.id}`}>Cancel</button></div>
    </div>;
  }

  return <div className="card-lift rounded-2xl border border-border bg-card p-4" data-testid={`card-note-${note.id}`}>
    {note.title && <div className="text-sm font-extrabold">{note.title}</div>}
    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
    {note.mcqId != null && <button onClick={() => onLinkedClick(note.mcqId!)} className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#eef2fb] px-2.5 py-1 text-[10px] font-bold text-[#32647b]" data-testid={`button-linked-mcq-${note.id}`}><LinkIcon size={10} /> Linked to a question</button>}
    <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
      <span>{new Date(note.updatedAt).toLocaleString()}</span>
      <div className="flex items-center gap-3"><button onClick={() => setEditing(true)} className="font-bold text-primary" data-testid={`button-edit-note-${note.id}`}>Edit</button><button onClick={() => remove.mutate()} className="font-bold text-destructive" data-testid={`button-delete-note-${note.id}`}>Delete</button></div>
    </div>
  </div>;
}

function Notebook() {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const entries = useQuery({ queryKey: ['notebook'], queryFn: notebookApi.list });
  const create = useMutation({ mutationFn: notebookApi.create, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notebook'] }); setContent(''); setTitle(''); } });
  const [, navigate] = useLocation();

  const filtered = (entries.data || []).filter((n) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (n.title || '').toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  }).sort((a, b) => sortOrder === 'newest' ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt));

  return <div><SectionHeader eyebrow="Your tools" title="My Notebook" action={<span className="text-[10px] text-muted-foreground">Private to you</span>} />
    <form onSubmit={(e) => { e.preventDefault(); if (content.trim()) create.mutate({ title: title.trim() || undefined, content: content.trim() }); }} className="rounded-2xl border border-border bg-card p-4"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" data-testid="input-note-title" /><textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write a note…" className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" data-testid="input-note-content" /><button disabled={create.isPending} className="mt-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-add-note">{create.isPending ? 'Saving…' : 'Add note'}</button></form>

    {!!entries.data?.length && <div className="mt-4 flex flex-wrap items-center gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes…" className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-search-notes" /><div className="flex overflow-hidden rounded-xl border border-border text-[11px] font-bold"><button onClick={() => setSortOrder('newest')} className={cn('px-3 py-2', sortOrder === 'newest' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-sort-newest">Newest</button><button onClick={() => setSortOrder('oldest')} className={cn('px-3 py-2', sortOrder === 'oldest' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-sort-oldest">Oldest</button></div></div>}

    <div className="mt-4 space-y-3">
      {entries.isLoading ? <SkeletonPage /> : filtered.length ? filtered.map((note: NotebookEntry) => <NotebookCard key={note.id} note={note} onLinkedClick={(mcqId) => navigate(`/practice?mcqId=${mcqId}`)} />) : entries.data?.length ? <EmptyState icon={NotebookPen} title="No notes match your search" body="Try a different search term." /> : <EmptyState icon={NotebookPen} title="No notes yet" body="Jot down anything you want to remember while you practice." />}
    </div>
  </div>;
}

function SavedSessions() {
  const sessions = useQuery({ queryKey: ['saved-sessions'], queryFn: savedSessionsApi.list });
  const remove = useMutation({ mutationFn: savedSessionsApi.remove, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-sessions'] }), onError: (err: unknown) => toast({ title: 'Could not delete session', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const resumeHref = (session: SavedSession) => {
    const config = (session.config ?? {}) as { topicId?: number; pastPaperId?: number };
    const qs = new URLSearchParams();
    if (config.topicId) qs.set('topic', String(config.topicId));
    if (config.pastPaperId) qs.set('pastPaperId', String(config.pastPaperId));
    const q = qs.toString();
    return q ? `/practice?${q}` : '/practice';
  };
  return <div><SectionHeader eyebrow="Your tools" title="Saved Sessions" /><div className="space-y-3">{(sessions.data || []).map((session: SavedSession) => <div key={session.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4" data-testid={`card-session-${session.id}`}><div><div className="text-sm font-extrabold">{session.name}</div><div className="text-[11px] text-muted-foreground">Saved {new Date(session.createdAt).toLocaleDateString()}</div></div><div className="flex gap-2"><Link href={resumeHref(session)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold" data-testid={`button-resume-session-${session.id}`}>Resume</Link><button onClick={() => remove.mutate(session.id)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive" data-testid={`button-delete-session-${session.id}`}>Delete</button></div></div>)}{!sessions.data?.length && <EmptyState icon={Bookmark} title="No saved sessions" body="Save a practice filter set from the Practice page to quickly resume it later." />}</div></div>;
}

function FlaggedMcqs() {
  const flags = useQuery({ queryKey: ['flagged-mcqs'], queryFn: flaggedMcqsApi.list });
  const remove = useMutation({ mutationFn: flaggedMcqsApi.remove, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flagged-mcqs'] }), onError: (err: unknown) => toast({ title: 'Could not remove flag', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  return <div><SectionHeader eyebrow="Your tools" title="Flagged MCQs" action={<span className="text-[10px] text-muted-foreground">Questions you marked for review</span>} /><div className="space-y-3">{(flags.data || []).map((flag: FlaggedMcq) => <div key={flag.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4" data-testid={`card-flag-${flag.id}`}><div><div className="text-sm font-bold">MCQ #{flag.mcqId}</div>{flag.reason && <div className="text-[11px] text-muted-foreground">{flag.reason}</div>}<span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold', flag.status === 'open' ? 'bg-[#fdeecb] text-[#8a5a12]' : 'bg-[#d7eee4] text-[#164b4b]')}>{flag.status}</span></div><button onClick={() => remove.mutate(flag.id)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive" data-testid={`button-unflag-${flag.id}`}>Remove</button></div>)}{!flags.data?.length && <EmptyState icon={Flag} title="Nothing flagged" body="Flag a question from a practice session to come back to it later." />}</div></div>;
}

// Podium/Leaderboard (round 3): reverted from the previous dark/gold "game
// card" palette back to the same light theme + design tokens the rest of
// the app uses (bg-card/border-border/text-foreground, primary accent) —
// per explicit request that this page stop looking different from the rest
// of the site. Medal tones (gold/silver/bronze) are kept as accent colors
// since they're meaningful, just re-picked to sit on a light background
// instead of a dark one.
function Podium({ rows }: { rows: LeaderboardRow[] }) {
  const [first, second, third] = rows;
  const Slot = ({ row, place }: { row: LeaderboardRow; place: 1 | 2 | 3 }) => {
    const config = {
      1: { height: 'h-32', ring: 'ring-4 ring-[#e8c34a]', bar: 'bg-gradient-to-b from-[#fdeecb] to-[#f7dfa0]', badge: 'bg-[#e8c34a] text-[#4a3a0a]', avatarBg: 'bg-[#fdeecb]', avatarText: 'text-[#8a5a12]', crown: true, size: 'size-20 text-lg' },
      2: { height: 'h-24', ring: 'ring-4 ring-[#c3cbd6]', bar: 'bg-gradient-to-b from-[#eef1f5] to-[#dfe4ea]', badge: 'bg-[#c3cbd6] text-[#33404f]', avatarBg: 'bg-[#eef1f5]', avatarText: 'text-[#495568]', crown: false, size: 'size-16 text-sm' },
      3: { height: 'h-20', ring: 'ring-4 ring-[#d99a5c]', bar: 'bg-gradient-to-b from-[#fbe4d0] to-[#f6d0ac]', badge: 'bg-[#d99a5c] text-[#4a2a0f]', avatarBg: 'bg-[#fbe4d0]', avatarText: 'text-[#8a4b1c]', crown: false, size: 'size-16 text-sm' },
    }[place];
    const order = place === 1 ? 'order-2' : place === 2 ? 'order-1' : 'order-3';
    return <div className={cn('flex flex-1 flex-col items-center', order)} data-testid={`podium-place-${place}`}>
      {config.crown && <Crown size={22} className="mb-1 text-[#e8c34a]" fill="currentColor" />}
      <div className={cn('relative grid place-items-center rounded-full font-extrabold', config.size, config.ring, config.avatarBg, config.avatarText)}>{initials(row.name)}</div>
      <div className="mt-2.5 max-w-[92px] truncate text-center text-xs font-extrabold text-foreground">{row.name}{row.isYou && <span className="block text-[9px] font-bold text-primary">(you)</span>}</div>
      <div className="mt-0.5 font-mono-app text-[11px] font-bold text-[#8a5a12]">{row.points} pts</div>
      <div className={cn('mt-3 flex w-full flex-col items-center justify-start rounded-t-2xl border-t border-border pt-2.5', config.height, config.bar)}><span className={cn('grid size-7 place-items-center rounded-full text-xs font-extrabold', config.badge)}>{place}</span></div>
    </div>;
  };
  return <div className="mb-5 flex items-end justify-center gap-3 rounded-3xl border border-border bg-card p-6 pt-9 sm:gap-5">
    {second && <Slot row={second} place={2} />}
    {first && <Slot row={first} place={1} />}
    {third && <Slot row={third} place={3} />}
  </div>;
}

function Leaderboard() {
  const [range, setRange] = useState('30d');
  const board = useQuery({ queryKey: ['leaderboard', range], queryFn: () => analyticsApi.leaderboard(range), refetchInterval: 10_000, refetchIntervalInBackground: true });
  const rows = board.data || [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const you = rows.find((r) => r.isYou);
  const beatPercent = you && rows.length > 1 ? Math.round(((rows.length - you.rank) / (rows.length - 1)) * 100) : null;
  const rangeLabels: Record<string, string> = { '7d': 'Weekly', '30d': 'Monthly', '3m': 'Quarterly', '1y': 'Yearly' };
  return <div>
    <div className="overflow-hidden rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[#fdeecb] text-[#8a5a12]"><Trophy size={18} /></span><div><h2 className="text-lg font-extrabold">Leaderboard</h2><p className="text-[11px] font-semibold text-muted-foreground">See how you stack up against the community</p></div></div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex size-1.5 rounded-full bg-primary" /></span>Live</span>
      </div>
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
      <div className="flex items-center gap-3"><span className="w-6 text-center text-sm font-extrabold text-muted-foreground">{row.rank}</span><div className="grid size-9 place-items-center rounded-full bg-[#d7eee4] text-[11px] font-extrabold text-[#287058]">{initials(row.name)}</div><div className="text-sm font-bold">{row.name}{row.isYou && <span className="ml-1.5 text-[10px] font-bold text-primary">(you)</span>}</div></div>
      <div className="text-right"><div className="text-sm font-extrabold text-[#8a5a12]">{row.points} pts</div><div className="text-[10px] text-muted-foreground">{row.accuracy}% acc · {row.questionsAnswered} questions · {row.sessions} sessions</div></div>
    </div>)}{!rows.length && <EmptyState icon={Trophy} title="No activity yet" body="Complete a practice session to appear on the leaderboard." />}</div>
  </div>;
}

function MyFeedbackThread({ item }: { item: MyFeedbackEntry }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const reply = useMutation({
    mutationFn: () => feedbackApi.reply(item.id, message.trim()),
    onSuccess: () => { setMessage(''); queryClient.invalidateQueries({ queryKey: ['my-feedback'] }); },
    onError: (err: unknown) => toast({ title: 'Could not send reply', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const statusTone = item.status === 'open' ? 'bg-[#4e3c12] text-[#e6cda8]' : item.status === 'replied' ? 'bg-[#1c3745] text-[#afd0df]' : 'bg-[#1c4533] text-[#a8e6e6]';
  return <div className="rounded-2xl border border-border bg-card p-5" data-testid={`card-my-feedback-${item.id}`}>
    <div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">{item.category}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', statusTone)}>{item.status === 'replied' ? 'Team replied' : item.status}</span></div><p className="mt-2 text-sm leading-6">{item.message}</p><div className="mt-2 text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div></div>{item.replies.length > 0 && <button onClick={() => setOpen((v) => !v)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-toggle-my-thread-${item.id}`}>{open ? 'Hide' : `${item.replies.length} repl${item.replies.length === 1 ? 'y' : 'ies'}`}</button>}</div>
    {open && <div className="mt-4 space-y-2 border-t border-border pt-4">{item.replies.map((r) => <div key={r.id} className={cn('max-w-[85%] rounded-xl p-3 text-xs', r.authorRole === 'admin' ? 'bg-[#1c452a]' : 'ml-auto bg-muted')}><div className="mb-1 text-[10px] font-bold text-muted-foreground">{r.authorRole === 'admin' ? 'Academic team' : 'You'} · {new Date(r.createdAt).toLocaleString()}</div>{r.message}</div>)}</div>}
    {item.status !== 'open' && <div className="mt-3 flex gap-2"><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Reply to the team…" className="min-h-12 flex-1 rounded-xl border border-border bg-background p-2 text-xs" data-testid={`input-my-feedback-reply-${item.id}`} /><button onClick={() => message.trim() && reply.mutate()} disabled={reply.isPending || !message.trim()} className="self-end rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-send-my-feedback-reply-${item.id}`}>{reply.isPending ? '…' : 'Reply'}</button></div>}
  </div>;
}

function Feedback() {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const mine = useQuery({ queryKey: ['my-feedback'], queryFn: feedbackApi.mine });
  const submit = useMutation({ mutationFn: feedbackApi.create, onSuccess: () => { setMessage(''); queryClient.invalidateQueries({ queryKey: ['my-feedback'] }); } });
  const site = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  const whatsapp = site.data?.SUPPORT_WHATSAPP?.trim();
  return <div className="max-w-xl"><SectionHeader eyebrow="Community" title="Feedback" />
    {whatsapp && <a href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="mb-5 flex items-center gap-3 rounded-2xl border border-[#1c4539]/50 bg-[#1c452a] p-4 transition hover:border-primary/50" data-testid="link-whatsapp-contact">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white"><MessageSquare size={20} /></div>
      <div className="flex-1"><div className="text-sm font-bold">Chat with us on WhatsApp</div><div className="mt-0.5 text-xs text-muted-foreground">Faster than a ticket for quick questions — opens a chat with the academic team.</div></div>
      <ArrowRight size={16} className="text-primary" />
    </a>}
    <div className="rounded-2xl border border-border bg-card p-6"><form onSubmit={(e) => { e.preventDefault(); if (message.trim()) submit.mutate({ category, message: message.trim() }); }} className="space-y-3"><label className="block text-xs font-bold">Category<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-feedback-category"><option value="general">General</option><option value="bug">Bug report</option><option value="content">Content issue</option><option value="feature">Feature request</option></select></label><label className="block text-xs font-bold">Message<textarea required value={message} onChange={(e) => setMessage(e.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" data-testid="input-feedback-message" /></label><button disabled={submit.isPending} className="rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-submit-feedback">{submit.isPending ? 'Sending…' : 'Send feedback'}</button></form></div>
    {!!mine.data?.length && <div className="mt-6"><h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Your feedback history</h3><div className="space-y-3">{mine.data.map((item) => <MyFeedbackThread key={item.id} item={item} />)}</div></div>}
  </div>;
}

function ExamCard({ exam, onStart }: { exam: StudentExam; onStart: () => void }) {
  const scopeLabel = `${exam.programTargetKind || 'All Programs'} · ${exam.yearTargetNumber ? `${exam.yearTargetNumber}${['th', 'st', 'nd', 'rd'][exam.yearTargetNumber % 10 > 3 ? 0 : exam.yearTargetNumber % 10]} Year` : 'All Years'}`;
  return <div className="rounded-2xl border border-border bg-card p-5" data-testid={`card-exam-${exam.id}`}>
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-extrabold">{exam.title}</h3><p className="mt-1 text-xs text-muted-foreground">{exam.description}</p></div><Badge tone={exam.windowStatus === 'open' ? 'green' : exam.windowStatus === 'upcoming' ? 'blue' : 'neutral'}>{exam.windowStatus}</Badge></div>
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 size={12} /> {exam.durationMinutes} min</span><span>{scopeLabel}</span><span>{exam.attemptsUsed}/{exam.maxAttempts} attempts used</span>{exam.negativeMarkingEnabled && <span className="inline-flex items-center gap-1 text-[#e0b5ae]"><AlertTriangle size={12} /> -{exam.negativeMarkPerWrong} per wrong</span>}</div>
    <div className="mt-4">{exam.inProgressAttemptId ? <Link href={`/exams/take/${exam.inProgressAttemptId}`} className="inline-flex items-center gap-1.5 rounded-xl bg-[#4e3612] px-4 py-2 text-xs font-bold text-[#acd3e2]" data-testid={`button-resume-exam-${exam.id}`}>Resume exam <ArrowRight size={13} /></Link> : exam.canStart ? <button onClick={onStart} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid={`button-start-exam-${exam.id}`}><ClipboardCheck size={14} /> Start exam</button> : <span className="text-[11px] font-semibold text-muted-foreground">{exam.windowStatus === 'upcoming' ? `Opens ${new Date(exam.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : exam.windowStatus === 'closed' ? 'Window closed' : 'No attempts remaining'}</span>}</div>
  </div>;
}

function Exams() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['exams'], queryFn: examsApi.list });
  const start = useMutation({
    mutationFn: examsApi.start,
    onSuccess: (res) => setLocation(`/exams/take/${res.attemptId}`),
    onError: (err: unknown) => {
      // Previously this failed completely silently — clicking "Start
      // exam" would just do nothing if the server rejected it (no
      // questions attached, window closed between page-load and click,
      // attempts exhausted, etc.). Now the real reason actually reaches
      // the student instead of looking like a dead button.
      toast({ title: 'Could not start this exam', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.', variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
  const exams = q.data || [];
  return <div><SectionHeader eyebrow="Assessment" title="Pre-Proffs Exams" action={<span className="text-[10px] text-muted-foreground">Timed · results follow your admin's release settings</span>} />
    <div className="grid gap-3 sm:grid-cols-2">{exams.map((exam) => <ExamCard key={exam.id} exam={exam} onStart={() => start.mutate(exam.id)} />)}{!exams.length && <EmptyState icon={ClipboardCheck} title="No exams scheduled" body="Your admin hasn't published an exam for your program and year yet." />}</div>
  </div>;
}

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
  // included) turns it back off via useFocusMode's cleanup.
  useFocusMode(true);
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

function ExamResult() {
  const params = useParams();
  const attemptId = Number(params.attemptId);
  const q = useQuery({ queryKey: ['exam-result', attemptId], queryFn: () => examsApi.result(attemptId), refetchInterval: (query) => query.state.data?.released ? false : 5000 });
  const r = q.data;
  // The result payload doesn't carry the exam's title back (only score
  // data), so this can't show the paper name the way TakeExam does — but
  // it still replaces the raw "Exams / Result / 2" path-derived header
  // with a clean, numberless label.
  usePageTitle('Exam Result');
  if (q.isLoading) return <SkeletonPage />;
  if (!r?.released) return <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center"><Clock3 size={28} className="mx-auto text-muted-foreground" /><h2 className="mt-4 font-bold">Results not released yet</h2><p className="mt-2 text-xs text-muted-foreground">Your admin will release results according to this exam's settings. Check back soon.</p><Link href="/exams" className="mt-5 inline-block text-xs font-bold text-primary" data-testid="link-back-to-exams">Back to exams</Link></div>;
  return <div className="max-w-3xl"><div className="rounded-3xl border border-border bg-card p-8 text-center"><div className={cn('mx-auto grid size-16 place-items-center rounded-full', r.passed === false ? 'bg-destructive/10 text-destructive' : 'bg-[#d7eee4] text-[#164b4b]')}>{r.passed === false ? <X size={28} /> : <CheckCircle2 size={28} />}</div>{r.percentage != null && <div className="mt-5 font-display text-5xl">{r.percentage.toFixed(1)}%</div>}{r.passed !== null && <Badge tone={r.passed ? 'green' : 'red'}>{r.passed ? 'Passed' : 'Not passed'}</Badge>}<div className="mt-5 grid grid-cols-3 gap-3 text-xs"><div><div className="font-display text-xl">{r.correctCount}</div><div className="text-muted-foreground">Correct</div></div><div><div className="font-display text-xl">{r.wrongCount}</div><div className="text-muted-foreground">Wrong</div></div><div><div className="font-display text-xl">{r.unansweredCount}</div><div className="text-muted-foreground">Skipped</div></div></div></div>
    {!!r.breakdown?.length && <div className="mt-6 space-y-3">{r.breakdown.map((b, i) => <div key={b.mcqId} className={cn('rounded-2xl border p-5', b.correct ? 'border-[#d7eee4]' : 'border-[#f0d3cc]')}><div className="text-xs font-bold text-muted-foreground">Q{i + 1}</div><p className="mt-1 text-sm font-bold">{b.question}</p><div className="mt-2 space-y-1.5 text-xs">{b.options.map((opt, oi) => { const optExplanation = b.optionExplanations?.[oi]; const isCorrectOpt = opt === b.correctAnswer; return <div key={opt} className={cn('rounded-lg px-2.5 py-1.5', isCorrectOpt ? 'bg-[#e6f3ed]' : opt === b.selectedAnswer ? 'bg-[#fff1ed]' : 'bg-muted/40')}><div className={cn(isCorrectOpt && 'font-bold text-[#287058]')}>{opt}{opt === b.selectedAnswer && !isCorrectOpt && <span className="ml-2 text-[10px] font-bold text-[#a34c3e]">Your answer</span>}</div>{optExplanation && <div className={cn('mt-1 text-[11px] leading-4', isCorrectOpt ? 'text-[#287058]' : 'text-muted-foreground')}>{optExplanation}</div>}</div>; })}</div>{!b.optionExplanations && b.explanation && <p className="mt-2 text-xs text-muted-foreground">{b.explanation}</p>}</div>)}</div>}
  </div>;
}

// Keeps the browser-tab icon in sync with whatever favicon an admin has
// uploaded, without needing a server-rendered <head> per request. Runs once
// per app load and again whenever the cached site-content changes.
function useFaviconSync() {
  const { data } = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  useEffect(() => {
    if (!data?.faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = resolveUploadUrl(data.faviconUrl) ?? data.faviconUrl;
  }, [data?.faviconUrl]);
}

// Applies the admin's saved Design & Branding colors (see lib/theme.ts) as
// CSS variables on <html>. Shares the same ['site-content'] query as
// useFaviconSync (react-query dedupes by key, so this doesn't add a second
// request) and, crucially, runs from AppRoutes rather than inside Shell —
// so /login, /register, and every other signed-out page are themed too.
function useThemeSync() {
  const { data } = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  useEffect(() => { applyThemeVars(data ?? null); }, [data]);
}

function AppRoutes() {
 useFaviconSync();
 useThemeSync();
 return <Switch><Route path="/login" component={Login} /><Route path="/register" component={Register} /><Route path="/forgot-password" component={ForgotPassword} /><Route path="/reset-password" component={ResetPassword} /><Route path="/verify-email" component={VerifyEmail} /><Route path="/"><Shell><Dashboard /></Shell></Route><Route path="/blocks"><Shell><Blocks /></Shell></Route><Route path="/blocks/:id"><Shell><BlockDetail /></Shell></Route><Route path="/modules"><Shell><ModulesRedirect /></Shell></Route><Route path="/modules/:id"><Shell><Subjects /></Shell></Route><Route path="/subjects"><Shell><Subjects /></Shell></Route><Route path="/subjects/:id"><Shell><Subjects topics /></Shell></Route><Route path="/topics"><Shell><Subjects topics /></Shell></Route><Route path="/practice"><Shell><Practice /></Shell></Route><Route path="/exams"><Shell><Exams /></Shell></Route><Route path="/exams/take/:attemptId"><Shell><TakeExam /></Shell></Route><Route path="/exams/result/:attemptId"><Shell><ExamResult /></Shell></Route><Route path="/past-papers"><Shell><PastPapers /></Shell></Route><Route path="/flashcards"><Shell><Flashcards /></Shell></Route><Route path="/ai-visualizer"><Shell><AiVisualizer /></Shell></Route><Route path="/books"><Shell><Books /></Shell></Route><Route path="/resources"><Shell><Resources /></Shell></Route><Route path="/notebook"><Shell><Notebook /></Shell></Route><Route path="/saved-sessions"><Shell><SavedSessions /></Shell></Route><Route path="/flagged-mcqs"><Shell><FlaggedMcqs /></Shell></Route><Route path="/leaderboard"><Shell><Leaderboard /></Shell></Route><Route path="/notifications"><Shell><Notifications /></Shell></Route><Route path="/payments"><Shell><Payments /></Shell></Route><Route path="/feedback"><Shell><Feedback /></Shell></Route><Route path="/profile"><Shell><Profile /></Shell></Route><Route component={NotFound} /></Switch>; }
function App() {
  const [focusMode, setFocusMode] = useState(false);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  return <QueryClientProvider client={queryClient}><TooltipProvider><FocusModeContext.Provider value={{ focusMode, setFocusMode }}><PageTitleContext.Provider value={{ pageTitle, setPageTitle }}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppRoutes /></ErrorBoundary></WouterRouter><Toaster /></PageTitleContext.Provider></FocusModeContext.Provider></TooltipProvider></QueryClientProvider>;
}
export default App;
// Auto-extracted shared helpers/components/hooks used across page modules.
// Split out of the original monolithic App.tsx so route-level pages can be
// lazy-loaded independently without dragging this along more than once.
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
  LayoutGrid, Presentation, Wand2, Crown, Globe, Star, Megaphone
} from 'lucide-react';
import { applyThemeVars } from '@/lib/theme';
import { queryClient } from '@/lib/query-client';
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

export const cn = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

export const initials = (name = 'MedschoolProffs') => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

export const money = (amount: number, currency = 'PKR') => new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
// Turns a just-finished session's score plus the student's recent-vs-prior
// trend into one short, human verdict for the result card and the
// dashboard progress profile. Session score takes priority when it's a
// clear outlier (a great or rough single session is worth saying so even
// if the broader trend is flat); otherwise it falls back to the trend.

export function progressVerdict(sessionScore: number | null, trend?: ProgressTrend | null): { label: string; message: string; tone: 'up' | 'down' | 'flat' | 'new' } {
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

export function ProgressBadge({ tone, label }: { tone: 'up' | 'down' | 'flat' | 'new'; label: string }) {
  const styles = tone === 'up' ? 'bg-[#d7eee4] text-[#164b4b]' : tone === 'down' ? 'bg-[#fff1ed] text-[#8a3a26]' : tone === 'new' ? 'bg-[#dceaf1] text-[#32647b]' : 'bg-muted text-muted-foreground';
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Minus;
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold', styles)}><Icon size={12} /> {label}</span>;
}
// Shown once a practice or past-paper session is finished (the set runs
// out) instead of silently looping back to question one — gives the
// student a clear stopping point plus the improving/steady/needs-practice
// read on where they stand, a full attempted/skipped/correct/wrong
// breakdown, every question with its outcome, and a dedicated "review
// wrong answers" section at the end so mistakes are easy to find again.

export function PracticeResultCard({ mcqs, answers, backHref, backLabel, onRestart }: { mcqs: Mcq[]; answers: Record<number, string | null>; backHref: string; backLabel: string; onRestart: () => void }) {
  const total = mcqs.length;
  const attempted = mcqs.filter((m) => answers[m.id] != null).length;
  const correct = mcqs.filter((m) => answers[m.id] != null && answers[m.id] === m.correctAnswer).length;
  const wrong = mcqs.filter((m) => answers[m.id] != null && answers[m.id] !== m.correctAnswer).length;
  const skipped = total - attempted;
  const scorePercent = attempted ? Math.round((correct / attempted) * 100) : 0;
  const trend = useQuery({ queryKey: ['progress-trend'], queryFn: analyticsApi.progress });
  const verdict = progressVerdict(scorePercent, trend.data);
  const statusFor = (m: Mcq): 'correct' | 'wrong' | 'skipped' => {
    const a = answers[m.id];
    if (a == null) return 'skipped';
    return a === m.correctAnswer ? 'correct' : 'wrong';
  };
  const wrongMcqs = mcqs.filter((m) => statusFor(m) === 'wrong');
  const statusStyles: Record<'correct' | 'wrong' | 'skipped', string> = {
    correct: 'border-[#d7eee4] bg-[#f3fbf7]',
    wrong: 'border-[#f0d3cc] bg-[#fff6f3]',
    skipped: 'border-border bg-muted/30',
  };
  const statusBadge: Record<'correct' | 'wrong' | 'skipped', { tone: 'green' | 'red' | 'neutral'; label: string }> = {
    correct: { tone: 'green', label: 'Correct' },
    wrong: { tone: 'red', label: 'Wrong' },
    skipped: { tone: 'neutral', label: 'Skipped' },
  };
  return <div data-testid="card-practice-result">
    <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center">
      <div className={cn('mx-auto grid size-16 place-items-center rounded-full', verdict.tone === 'down' ? 'bg-destructive/10 text-destructive' : 'bg-[#d7eee4] text-[#164b4b]')}>{verdict.tone === 'down' ? <RotateCcw size={26} /> : <CheckCircle2 size={28} />}</div>
      <div className="mt-5 font-display text-5xl">{scorePercent}%</div>
      <div className="mt-1 text-xs text-muted-foreground">{correct} correct of {attempted} attempted</div>
      <div className="mt-4 flex justify-center">{!trend.isLoading && <ProgressBadge tone={verdict.tone} label={verdict.label} />}</div>
      {!trend.isLoading && <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-muted-foreground" data-testid="text-result-verdict">{verdict.message}</p>}
      {/* Attempted / Skipped / Correct / Wrong breakdown — the counts a
          student needs at a glance, distinct from the score % above (which
          is correct-of-attempted, not correct-of-total). */}
      <div className="mt-6 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 py-3"><div className="font-display text-lg" data-testid="text-result-attempted">{attempted}</div><div className="text-[10px] font-bold text-muted-foreground">Attempted</div></div>
        <div className="rounded-xl bg-[#f3fbf7] py-3"><div className="font-display text-lg text-[#164b4b]" data-testid="text-result-correct">{correct}</div><div className="text-[10px] font-bold text-muted-foreground">Correct</div></div>
        <div className="rounded-xl bg-[#fff6f3] py-3"><div className="font-display text-lg text-[#a34c3e]" data-testid="text-result-wrong">{wrong}</div><div className="text-[10px] font-bold text-muted-foreground">Wrong</div></div>
        <div className="rounded-xl bg-muted/40 py-3"><div className="font-display text-lg" data-testid="text-result-skipped">{skipped}</div><div className="text-[10px] font-bold text-muted-foreground">Skipped</div></div>
      </div>
      <div className="mt-7 flex flex-wrap justify-center gap-2"><button onClick={onRestart} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-practice-again"><RotateCcw size={13} className="mr-1.5 inline" /> Practice again</button><Link href={backHref} className="rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-bold" data-testid="link-result-back">{backLabel}</Link></div>
    </div>

    {/* Every question with its outcome, in original order. */}
    {total > 0 && <div className="mx-auto mt-8 max-w-3xl">
      <h3 className="text-sm font-extrabold">All questions</h3>
      <div className="mt-3 space-y-2.5">{mcqs.map((m, i) => { const status = statusFor(m); const badge = statusBadge[status]; return <div key={m.id} className={cn('rounded-2xl border p-4', statusStyles[status])} data-testid={`row-result-question-${i}`}>
        <div className="flex items-start justify-between gap-3"><div className="text-xs font-bold text-muted-foreground">Q{i + 1}</div><Badge tone={badge.tone}>{badge.label}</Badge></div>
        <p className="mt-1 text-sm font-bold leading-5">{m.question}</p>
        {status !== 'skipped' && <div className="mt-2 text-xs">
          <span className={cn('font-bold', status === 'correct' ? 'text-[#287058]' : 'text-[#a34c3e]')}>Your answer: {answers[m.id]}</span>
          {status === 'wrong' && m.correctAnswer && <span className="ml-3 font-bold text-[#287058]">Correct answer: {m.correctAnswer}</span>}
        </div>}
        {status === 'skipped' && m.correctAnswer && <div className="mt-2 text-xs font-bold text-muted-foreground">Correct answer: {m.correctAnswer}</div>}
      </div>; })}</div>
    </div>}

    {/* Wrong questions again, on their own, at the very end — a quick
        review list without needing to scroll back through everything. */}
    {!!wrongMcqs.length && <div className="mx-auto mt-8 max-w-3xl">
      <h3 className="text-sm font-extrabold text-[#a34c3e]">Review wrong answers ({wrongMcqs.length})</h3>
      <div className="mt-3 space-y-2.5">{wrongMcqs.map((m, i) => <div key={m.id} className="rounded-2xl border border-[#f0d3cc] bg-[#fff6f3] p-4" data-testid={`row-review-wrong-${i}`}>
        <p className="text-sm font-bold leading-5">{m.question}</p>
        <div className="mt-2 text-xs"><span className="font-bold text-[#a34c3e]">Your answer: {answers[m.id]}</span>{m.correctAnswer && <span className="ml-3 font-bold text-[#287058]">Correct answer: {m.correctAnswer}</span>}</div>
        {m.explanation && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{m.explanation}</p>}
      </div>)}</div>
    </div>}
  </div>;
}

// Small reusable confirm-before-delete dialog, used by every admin list's
// delete action (task: real confirm modal, not window.confirm).

export function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onCancel, pending }: { title: string; body: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; pending?: boolean }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={onCancel}><div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl"><h3 className="font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p><div className="mt-5 flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold" data-testid="button-confirm-cancel">Cancel</button><button onClick={onConfirm} disabled={pending} className="flex-1 rounded-xl bg-destructive py-2.5 text-xs font-extrabold text-destructive-foreground disabled:opacity-50" data-testid="button-confirm-delete">{pending ? 'Deleting…' : confirmLabel}</button></div></div></div>;
}

// The wordmark used to only shimmer on :hover (group-hover:[background-
// position:0%]) — which never fires on a touch device, so on phones/
// tablets it just sat frozen on whichever frame backgroundPosition:100%
// happened to land on (mostly plain foreground colour, no visible teal).
// It now animates continuously via the same kind of CSS keyframe the
// AnimatedBrandMark icon next to it already uses, so the colour sweep is
// always visible — hover still speeds it up as a nice-to-have, it's no
// longer required to see it move at all. Explicit teal (#2dd9c4, matching
// AnimatedBrandMark/BootScreen) is blended into the gradient so the text
// keeps a visible brand colour instead of relying solely on CSS vars that
// can render as a flat neutral at rest.
export function Logo({ dark = false, href = '/' }: { dark?: boolean; href?: string }) {
  return <Link href={href} className="group flex items-center gap-2" data-testid="link-logo">
    <style>{`@keyframes brand-text-shimmer { 0% { background-position: 200% 0; } 50% { background-position: 0% 0; } 100% { background-position: -200% 0; } }`}</style>
    <AnimatedBrandMark size={22} className={dark ? 'text-sidebar-primary' : 'text-primary'} />
    <span
      className={cn(
        'bg-clip-text text-[15px] font-extrabold tracking-[-.03em] text-transparent transition-[animation-duration] duration-300 ease-out group-hover:![animation-duration:1.1s]',
        dark
          ? 'bg-[linear-gradient(100deg,hsl(var(--sidebar-foreground))_20%,#2dd9c4_50%,hsl(var(--sidebar-foreground))_80%)]'
          : 'bg-[linear-gradient(100deg,hsl(var(--primary))_20%,#2dd9c4_50%,hsl(var(--primary))_80%)]',
      )}
      style={{ backgroundSize: '250% 100%', animation: 'brand-text-shimmer 3.4s ease-in-out infinite' }}
    >MedschoolProffs</span>
  </Link>;
}

type NavItem = [string, string, typeof LayoutDashboard];

export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Study desk', items: [
    ['/dashboard', 'Overview', LayoutDashboard], ['/blocks', 'Blocks', BookOpen], ['/exams', 'Pre-Proffs Exams', ClipboardCheck], ['/past-papers', 'Past papers', FileStack], ['/flashcards', 'Flashcards', Zap], ['/ai-visualizer', 'AI Visualizer', Wand2], ['/books', 'Books', Library], ['/resources', 'Resources', FolderOpen],
  ] },
  { label: 'Your tools', items: [
    ['/notebook', 'My notebook', NotebookPen], ['/saved-sessions', 'Saved sessions', Bookmark], ['/flagged-mcqs', 'Flagged MCQs', Flag], ['/leaderboard', 'Leaderboard', Trophy],
  ] },
  { label: 'Your account', items: [
    ['/payments', 'Membership', CreditCard], ['/notifications', 'Notifications', Bell], ['/feedback', 'Send feedback', MessageSquare], ['/profile', 'Profile & access', ShieldCheck],
  ] },
];

export function SideNav({ user, onClose }: { user: User; onClose: () => void }) {
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
    <div className="mb-8 flex items-center justify-between px-2"><Logo dark href="/dashboard" /><button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" onClick={onClose} data-testid="button-close-menu"><X size={18} /></button></div>
    <nav className="space-y-5">
       {groups.map((group) => <div key={group.label}><div className="mb-1.5 px-3.5 font-mono-app text-[9px] font-bold uppercase tracking-[.14em] text-sidebar-foreground/40">{group.label}</div><div className="space-y-1">{group.items.map(([href, label, Icon]) => <Link key={href} href={href} onClick={onClose} className={cn('group flex items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] font-semibold transition-colors', location === href ? 'nav-active bg-white text-sidebar shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} strokeWidth={location === href ? 2.2 : 1.8} /><span>{label}</span>{label === 'Notifications' && unreadCount > 0 && <span className="ml-auto grid size-5 place-items-center rounded-full bg-[#e5a952] text-[10px] font-bold text-[#183844]">{unreadCount > 9 ? '9+' : unreadCount}</span>}</Link>)}</div></div>)}
    </nav>
    <div className="mt-auto pt-5">
      <div className="mb-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-4"><div className="mb-2 flex items-center gap-2 text-sidebar-foreground/75"><Sparkles size={14} className="text-[#e5a952]" /><span className="text-xs font-bold">Small steps, daily.</span></div><p className="text-[11px] leading-5 text-sidebar-foreground/50">Keep your streak alive with a 10-minute review.</p><Link href="/modules" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-sidebar-primary" data-testid="link-sidebar-practice">Start a review <ArrowRight size={12} /></Link></div>
      <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-primary text-xs font-extrabold text-sidebar-primary-foreground">{initials(user.name)}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-sidebar-foreground">{user.name}</div><div className="truncate text-[10px] text-sidebar-foreground/45">{user.institution || 'Medical student'}</div></div><button onClick={() => logout.mutate()} disabled={logout.isPending} className="text-sidebar-foreground/50 hover:text-sidebar-foreground disabled:opacity-50" data-testid="button-signout" title="Sign out"><LogOut size={15} /></button></div>
    </div>
  </aside>;
}

export function QuickJump({ open, value, onChange, onClose }: { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void }) {
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
// `strictFocusMode` is a stricter variant used only by the Pre-Proffs exam
// screen: when on, Shell doesn't render the "Exit" button at all (there is
// no click-to-leave affordance in the UI), on top of the normal focus-mode
// sidebar hiding. TakeExam pairs this with its own beforeunload/popstate
// guards below so a student genuinely can't back out of an in-progress
// exam via the header button, a refresh, or the browser's back button —
// only submitting (or running out of time, which auto-submits) leaves.

export const FocusModeContext = createContext<{ focusMode: boolean; setFocusMode: (v: boolean) => void; strictFocusMode: boolean; setStrictFocusMode: (v: boolean) => void }>({ focusMode: false, setFocusMode: () => {}, strictFocusMode: false, setStrictFocusMode: () => {} });
// Lets a page (e.g. TakeExam) override the header's auto-generated,
// URL-derived title — needed because that auto title is just the route
// path with slashes ("Exams / Take / 2"), which surfaces raw numeric
// attempt IDs to students on exam-taking/result pages. A page sets a
// friendly title (the exam/paper name) once it knows it; null falls back
// to the normal path-derived title everywhere else.

export const PageTitleContext = createContext<{ pageTitle: string | null; setPageTitle: (v: string | null) => void }>({ pageTitle: null, setPageTitle: () => {} });

export function usePageTitle(title: string | null | undefined) {
  const { setPageTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setPageTitle(title ?? null);
    return () => setPageTitle(null);
  }, [title, setPageTitle]);
}

export function useFocusMode(active: boolean, strict = false) {
  const { setFocusMode, setStrictFocusMode } = useContext(FocusModeContext);
  useEffect(() => {
    setFocusMode(active);
    setStrictFocusMode(active && strict);
    return () => { setFocusMode(false); setStrictFocusMode(false); };
  }, [active, strict, setFocusMode, setStrictFocusMode]);
}

// Traps the student on the current screen while `active` — used by the
// Pre-Proffs exam so a student can't back out mid-attempt. Blocks the
// browser back/forward button (by immediately re-pushing the current URL
// whenever a `popstate` fires) and warns on refresh/tab-close via the
// standard `beforeunload` confirmation. Neither of these stops a
// programmatic navigation from inside the app (e.g. `setLocation` on
// submit), only user-driven ways of leaving the page.

export function useExamLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    window.history.pushState(null, '', window.location.href);
    const blockBack = () => window.history.pushState(null, '', window.location.href);
    const warnUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('popstate', blockBack);
    window.addEventListener('beforeunload', warnUnload);
    return () => { window.removeEventListener('popstate', blockBack); window.removeEventListener('beforeunload', warnUnload); };
  }, [active]);
}

// Every route below is wrapped in <Shell>, so this is the one place that has
// to enforce "must be signed in" and "must be admin for /admin/*" before
// rendering real content — a signed-out or under-privileged user should never
// see so much as a flash of the dashboard/admin UI underneath.

export function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const [quickJumpValue, setQuickJumpValue] = useState('');
  // Dismiss state for the announcement banner below — cleared on full page
  // reload (e.g. next login) rather than persisted, so a still-current
  // announcement resurfaces for a returning session instead of staying
  // hidden forever from one click weeks ago. Keyed to the announcement's
  // own text (see dismissedAnnouncement below) so publishing a *new*
  // announcement always shows, even if the student dismissed an older one
  // earlier in this same session.
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState<string | null>(null);
  // retry: false — a failed/unusable current-user response should send the
  // user to /login promptly, not spend several silent retries first.
  const userQuery = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const user = userQuery.data;
  const { focusMode, strictFocusMode } = useContext(FocusModeContext);
  // Bug fix (React error #310, "Rendered more hooks than during the
  // previous render"): this used to sit after the `if (userQuery.isLoading)
  // return ...` / `if (!user) return ...` branches below. On the very
  // first render (userQuery still loading) that early return skipped this
  // hook entirely; once the query resolved and re-rendered with a user,
  // the branch was skipped and the hook fired — a different hook count
  // between renders, which is exactly what triggers #310. Since Shell
  // wraps every routed page, this crashed on the first load of *any*
  // page (dashboard, flashcards, profile, etc.), not just one route. All
  // hooks now run unconditionally before any early return.
  const { pageTitle } = useContext(PageTitleContext);
  // Same #310 fix — this was declared below the early returns too (right
  // before its "General trial mode" comment, which now sits just above
  // where it's actually used further down).
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });

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

  if (userQuery.isLoading) return <BrandedLoadingScreen />;
  // Same fix as the admin app's Shell (see its matching comment): this
  // branch is the brief gap between the query resolving "no user" and the
  // effect above redirecting to /login — not real content-loading, so it
  // gets the branded loader instead of a near-blank skeleton-on-white page.
  if (!user) return <BrandedLoadingScreen />;
  // Admin accounts are allowed to browse the student portal too (e.g. to see
  // what students see) — the reverse is not true, see the equivalent check
  // in frontend-admin/src/App.tsx's Shell, which still blocks students.

  // General trial mode — same site-content query SideNav already runs
  // (shared queryKey, so this doesn't add an extra request), read here
  // too for a top banner reminding the student (and admin, if browsing
  // as one) that every membership-gated page is unlocked for everyone
  // right now. Hidden in focus mode so it doesn't crowd the
  // distraction-free exam/practice header.
  const globalTrialMode = siteContentQ.data?.GLOBAL_TRIAL_MODE === 'true';
  // Bug fix: admin's "Announcement banner" setting had a live text field
  // and a "blank to hide" contract, but nothing on the student side ever
  // read ANNOUNCEMENT_BANNER or rendered it — so it silently did nothing
  // no matter what an admin typed in. Wired up the same way
  // globalTrialMode's banner already works: read from the same
  // site-content query (no extra request), trimmed so pure whitespace
  // counts as "blank", hidden in focus mode, and dismissible per-session.
  const announcementText = siteContentQ.data?.ANNOUNCEMENT_BANNER?.trim() || null;
  const showAnnouncement = Boolean(announcementText) && announcementText !== dismissedAnnouncement;
  // Was hardcoded to "Good morning" regardless of the time of day — the
  // Dashboard's own welcome card already computed the correct greeting via
  // greetingForHour(), so this header text disagreed with it (e.g. showing
  // "Good morning" in the header while the card underneath said "Good
  // evening"). Reuse the same helper so both read the same live clock.
  const title = pageTitle ?? (location === '/dashboard' ? `${greetingForHour(new Date().getHours())}, ${user.name?.split(' ')[0] || 'there'}` : location.slice(1).split('/').map((part) => part.replaceAll('-', ' ')).join(' / '));
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
      {!focusMode && (showAnnouncement || globalTrialMode) && <div className="sticky top-0 z-20">
        {showAnnouncement && <div className="flex items-center justify-center gap-2 bg-primary px-4 py-1.5 text-center text-[11px] font-bold text-primary-foreground" data-testid="banner-announcement"><Megaphone size={12} className="shrink-0" /><span className="truncate">{announcementText}</span><button onClick={() => setDismissedAnnouncement(announcementText)} className="ml-1 shrink-0 rounded p-0.5 hover:bg-white/15" aria-label="Dismiss announcement" data-testid="button-dismiss-announcement"><X size={12} /></button></div>}
        {globalTrialMode && <div className="flex items-center justify-center gap-2 bg-[#e5a952] px-4 py-1.5 text-center text-[11px] font-bold text-[#183844]" data-testid="banner-global-trial-mode"><Sparkles size={12} /> Trial mode is on — every feature is free to use right now.</div>}
      </div>}
      {focusMode
        ? <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-md md:px-8">{strictFocusMode ? <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-muted-foreground" data-testid="text-exam-locked"><LockKeyhole size={13} /> Exam in progress</span> : <button onClick={() => setLocation('/dashboard')} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted" data-testid="button-exit-focus-mode"><ArrowLeft size={15} /> Exit</button>}<span className="text-xs font-bold capitalize text-foreground">{title}</span></header>
        : <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-border/70 bg-background/92 px-4 backdrop-blur-md md:px-8"><div className="flex min-w-0 items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setMenuOpen(true)} data-testid="button-open-menu"><Menu size={20} /></button><div className="min-w-0"><div className="font-mono-app text-[9px] uppercase tracking-[.16em] text-muted-foreground">{today}</div><h1 className="mt-1 truncate text-[16px] font-bold capitalize tracking-[-.02em] text-foreground">{title}</h1></div></div><div className="relative flex items-center gap-2"><button onClick={() => { setQuickJumpOpen((current) => !current); setQuickJumpValue(''); }} className="hidden h-9 w-[220px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-[11px] text-muted-foreground shadow-sm hover:border-primary/50 sm:flex md:w-[340px]" data-testid="button-open-quick-jump"><Search size={14} /><span className="truncate">Search modules, topics, MCQs...</span><span className="ml-auto rounded border border-border px-1 text-[9px]">⌘K</span></button><Link href="/notifications" className="relative grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted" data-testid="link-notifications"><Bell size={16} /></Link><Link href="/profile" className="ml-1 grid size-8 place-items-center rounded-full bg-[#cdebf0] text-[10px] font-extrabold text-[#0d5267]" data-testid="link-header-profile">{initials(user.name)}</Link><QuickJump open={quickJumpOpen} value={quickJumpValue} onChange={setQuickJumpValue} onClose={() => setQuickJumpOpen(false)} /></div></header>}
      <div className={cn('page-enter', focusMode ? 'px-5 py-6 md:px-10 md:py-8' : 'px-4 py-6 md:px-8 md:py-8')}>{children}</div>
    </main>
  </div>;
}

// Branded full-screen loader — same wave-draw look as the static one in
// index.html (which covers the gap before JS loads at all), used here for
// the session-restore loading state once React has taken over. Self-
// contained <style> tag rather than a Tailwind config change, matching how
// index.html does it, so the two stay visually identical without needing
// to share a build step.

export function BrandedLoadingScreen() {
  return <div className="grid min-h-[100dvh] place-items-center" style={{ background: '#0e2a38' }}>
    <style>{`
      @keyframes boot-wave-draw { 0% { stroke-dashoffset: 190; opacity: .55; } 55% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: -190; opacity: .55; } }
      @keyframes boot-fade { 0%, 100% { opacity: .6; } 50% { opacity: 1; } }
    `}</style>
    <div className="flex flex-col items-center gap-3.5">
      <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden="true"><path d="M2 20 H14 L19 6 L27 34 L33 12 L38 20 H62" fill="none" stroke="#2dd9c4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 190, strokeDashoffset: 190, animation: 'boot-wave-draw 1.7s ease-in-out infinite' }} /></svg>
      <div className="font-display text-xl font-bold tracking-[-.01em]" style={{ color: '#eaf6f4', animation: 'boot-fade 1.7s ease-in-out infinite' }}>MedschoolProffs</div>
    </div>
  </div>;
}

// Small reusable brand mark used anywhere the app needs an inline
// "loading" indicator — replaces plain spinners / bare "Loading…" text so
// every loading state (not just the full-screen boot one) carries the
// MedschoolProffs wave mark instead of defaulting to blank white.

export function BrandSpinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <svg width={size} height={size * 0.625} viewBox="0 0 64 40" aria-hidden="true" role="status" aria-label="Loading" className={cn('brand-spinner shrink-0', className)}>
    <path d="M2 20 H14 L19 6 L27 34 L33 12 L38 20 H62" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function InlineLoading({ label = 'Loading…', size = 13 }: { label?: string; size?: number }) {
  return <div className="flex items-center gap-2 py-2 text-[11px] font-semibold text-primary"><BrandSpinner size={size} />{label}</div>;
}

// Animated version of the brand mark (same path + pulse keyframe as
// BrandedLoadingScreen's boot animation) sized for inline use next to a
// wordmark — e.g. the marketing site's nav logo — rather than as a
// full-screen loading state.
export function AnimatedBrandMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return <svg width={size} height={size * 0.625} viewBox="0 0 64 40" aria-hidden="true" className={cn('shrink-0', className)}>
    <style>{`@keyframes brand-mark-pulse { 0% { stroke-dashoffset: 190; opacity: .55; } 55% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: -190; opacity: .55; } }`}</style>
    <path d="M2 20 H14 L19 6 L27 34 L33 12 L38 20 H62" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 190, strokeDashoffset: 190, animation: 'brand-mark-pulse 1.7s ease-in-out infinite' }} />
  </svg>;
}

export function SkeletonPage() { return <div className="space-y-5"><div className="flex items-center gap-2 text-primary"><BrandSpinner size={22} /><span className="text-[11px] font-bold uppercase tracking-[.1em]">Loading</span></div><div className="skeleton h-8 w-56 rounded-lg" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /></div><div className="skeleton h-72 rounded-2xl" /></div>; }

export function EmptyState({ icon: Icon = FolderOpen, title, body, action }: { icon?: typeof FolderOpen; title: string; body: string; action?: ReactNode }) { return <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"><div><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-primary"><Icon size={22} /></div><h3 className="font-bold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div></div>; }

export function ErrorState({ retry }: { retry?: () => void }) { return <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-6 text-sm text-[#9e4c39]"><div className="flex items-center gap-2 font-bold"><CircleHelp size={17} /> We couldn't load this view.</div><p className="mt-2 text-[#a96a5b]">Check your connection, then try again.</p>{retry && <button onClick={retry} className="mt-4 rounded-lg bg-[#a9533f] px-3 py-2 text-xs font-bold text-white" data-testid="button-retry">Try again</button>}</div>; }

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize', tone === 'green' && 'bg-[#d7eee4] text-[#287058]', tone === 'amber' && 'bg-[#fff0cb] text-[#8d6420]', tone === 'red' && 'bg-[#f9ddd6] text-[#a34c3e]', tone === 'blue' && 'bg-[#dceaf1] text-[#32647b]', tone === 'neutral' && 'bg-muted text-muted-foreground')}>{children}</span>; }

// easy -> green, moderate -> blue, hard -> red — was a hardcoded blue
// regardless of value.

export function difficultyTone(difficulty?: string | null): 'green' | 'blue' | 'red' {
  if (difficulty === 'easy') return 'green';
  if (difficulty === 'hard') return 'red';
  return 'blue';
}

export function Progress({ value, color = 'bg-primary' }: { value: number; color?: string }) { return <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) { return <div className="mb-5 flex items-end justify-between gap-4"><div>{eyebrow && <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">{eyebrow}</div>}<h2 className="mt-1 text-[22px] font-extrabold tracking-[-.04em]">{title}</h2></div>{action}</div>; }

export function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-card/70 p-3 text-center"><div className="font-display text-2xl">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div></div>; }

// The student-facing half of the same progress-trend data the practice
// result card uses — so a student can check "am I improving?" any time,
// not just right after finishing a session.

export function StatTile({ icon: Icon, bg, fg, label, value }: { icon: typeof Clock3; bg: string; fg: string; label: string; value: ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5" data-testid={`stat-tile-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="flex items-center gap-3"><span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', bg, fg)}><Icon size={18} /></span><div className="text-xs font-semibold text-muted-foreground">{label}</div></div>
    <div className="mt-3 font-display text-3xl">{value}</div>
  </div>;
}

export function ProgressProfileCard() {
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

export const QUICK_LINK_TILES: Array<{ href: string; label: string; sub: string; icon: typeof LayoutGrid; bg: string; fg: string }> = [
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

export const OPEN_SEARCH_HREF = '#open-search';

export const OPEN_SEARCH_EVENT = 'medschoolproffs:open-search';
// The "My Progress" tile points at an in-page section (#progress-profile),
// not a route — wouter's <Link> does client-side route navigation, so
// handing it a "#..." href just pushes that literal string as a path (no
// route matches it) instead of scrolling anywhere. That's the bug: the tile
// looked like a normal link but silently did nothing. Special-cased below
// the same way OPEN_SEARCH_HREF already is, so it smooth-scrolls to the
// section (with a brief highlight so it's obvious something happened)
// instead of attempting a "navigation".

export const PROGRESS_ANCHOR_HREF = '#progress-profile';

// Cycling palette for module tiles (Continue Learning / Recommended) so the
// dashboard reads as multi-subject and colorful rather than one repeated
// tone, matching the reference design's per-subject icon colors.

export const MODULE_TILE_COLORS = [
  { bg: 'bg-[#fbdada]', fg: 'text-[#b8493f]' }, { bg: 'bg-[#dceaf1]', fg: 'text-[#2c6a8f]' },
  { bg: 'bg-[#fff0cb]', fg: 'text-[#94651c]' }, { bg: 'bg-[#e6dcf5]', fg: 'text-[#6b3fa0]' },
  { bg: 'bg-[#d7eee4]', fg: 'text-[#1f7a5c]' }, { bg: 'bg-[#dde4f7]', fg: 'text-[#3b4f8f]' },
];

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function ModuleCard({ m, i }: { m: Module; i: number }) {
  const iconUrl = (m as Module & { iconUrl?: string | null }).iconUrl;
  if (iconUrl) {
    return <Link href={`/modules/${m.id}`} key={m.id} className="card-lift group relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-card p-6 text-white" data-testid={`card-module-${m.id}`}>
      <img src={iconUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
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

export function useModulesGrouping() {
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

export function BlockHeroCard({ href, name, iconUrl, moduleCount, muted }: { href: string; name: string; iconUrl?: string | null; moduleCount: number; muted?: boolean }) {
  return <Link href={href} className="card-lift group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-3xl border border-border bg-card p-6 text-white" data-testid={`card-block-${href.split('/').pop()}`}>
    {iconUrl ? <img src={iconUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <div className={cn('absolute inset-0', muted ? 'bg-muted-foreground/30' : 'bg-gradient-to-br from-[#287058] to-[#164b4b]')} />}
    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
    <div className="relative">
      <h3 className="font-display text-2xl tracking-[-.02em] drop-shadow-sm">{name}</h3>
      <div className="mt-2 flex items-center justify-between text-xs text-white/85"><span>{moduleCount} module{moduleCount === 1 ? '' : 's'}</span><ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></div>
    </div>
  </Link>;
}

export function topicColorVar(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `--chart-${(hash % 5) + 1}`;
}

export function topicAccentStyles(key: string) {
  const v = topicColorVar(key || 'default');
  return {
    badge: { background: `hsl(var(${v}) / 0.16)`, color: `hsl(var(${v}))` },
    border: { borderColor: `hsl(var(${v}) / 0.4)` },
    wash: { background: `hsl(var(${v}) / 0.07)` },
    solidBg: { background: `hsl(var(${v}))` },
    ring: { boxShadow: `0 0 0 3px hsl(var(${v}) / 0.18)` },
  };
}

export function TopicBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize" style={topicAccentStyles(label).badge}>{label}</span>;
}

export const AI_VISUALIZER_EXAMPLES = [
  'Create an interactive step-by-step visualization of skeletal muscle contraction, from action potential through calcium release, cross-bridge cycling, and relaxation.',
  'Show me how preload affects stroke volume via the Frank-Starling mechanism.',
  'Explain cardiac output with an interactive HR and SV control.',
  'Compare Type 1 and Type 2 diabetes mellitus.',
];

export function PaymentDestinationCard({ pd }: { pd?: PaymentDetails }) {
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
    {pd.PAYMENT_QR_CODE_URL && <div className="mt-3 flex justify-center border-t border-border pt-3"><img src={pd.PAYMENT_QR_CODE_URL} alt="Payment QR code" loading="lazy" decoding="async" className="max-h-32 rounded-lg border border-border object-contain" /></div>}
  </div>;
}

export function SubscriptionStatusCard({ plans, payments }: { plans: MembershipPlan[]; payments: { planName: string; status: string; submittedAt: string }[] }) {
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

export function TeamPhoto({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  const url = member.photoPath ? resolveUploadUrl(member.photoPath) : null;
  if (!url || broken) return <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-sm font-extrabold text-[#164b4b]">{initials(member.name)}</div>;
  return <img src={url} alt={member.name} loading="lazy" decoding="async" className="size-14 shrink-0 rounded-full border border-border object-cover" onError={() => setBroken(true)} />;
}

export function TeamSection() {
  const q = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const team = q.data?.team || [];
  if (!team.length) return null;
  const card = (m: TeamMember) => <div key={m.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-team-${m.id}`}><div className="flex items-center gap-3"><TeamPhoto member={m} /><div><div className="text-sm font-bold">{m.name}</div><div className="text-xs text-primary">{m.role}</div></div></div>{m.achievementBadge && <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#fdeecb] px-2.5 py-1 text-[10px] font-bold text-[#8a5a12]"><Trophy size={11} /> {m.achievementBadge}</span>}{m.bio && <p className="mt-3 text-xs leading-5 text-muted-foreground">{m.bio}</p>}{(m.linkedinUrl || m.instagramUrl || m.email) && <div className="mt-3 flex gap-2">{m.linkedinUrl && <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">in</a>}{m.instagramUrl && <a href={m.instagramUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">ig</a>}{m.email && <a href={`mailto:${m.email}`} className="grid size-7 place-items-center rounded-full bg-muted hover:bg-primary/10 hover:text-primary"><Mail size={12} /></a>}</div>}</div>;
  return <div className="mt-9"><SectionHeader eyebrow="Behind the platform" title="Our Academic Team" />
    {TEAM_CATEGORIES.map((cat) => { const inCat = team.filter((m) => (m.category ?? 'reviewer') === cat); if (!inCat.length) return null; return <div key={cat} className="mb-6 last:mb-0"><div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{TEAM_CATEGORY_LABELS[cat]}</div><div className="grid gap-4 sm:grid-cols-2">{inCat.map(card)}</div></div>; })}
  </div>;
}

export function SocialIcons({ content, dark = false }: { content?: SiteContent; dark?: boolean }) {
  const links: Array<[string, string | undefined]> = [['Facebook', content?.SOCIAL_FACEBOOK], ['YouTube', content?.SOCIAL_YOUTUBE], ['LinkedIn', content?.SOCIAL_LINKEDIN], ['Instagram', content?.SOCIAL_INSTAGRAM]];
  const present = links.filter(([, url]) => url);
  if (!present.length) return null;
  return <div className="flex gap-2.5">{present.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer" className={cn('grid size-8 place-items-center rounded-full text-xs font-bold transition-colors', dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary')} data-testid={`link-social-${label.toLowerCase()}`}>{label[0]}</a>)}</div>;
}

export function Footer({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
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

export function AuthLayout({ children, register = false }: { children: ReactNode; register?: boolean }) { return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]"><div className="flex flex-col p-6 md:p-10"><Logo /><div className="mx-auto flex w-full max-w-sm flex-1 items-center py-10">{children}</div><Footer /></div><div className="relative hidden overflow-hidden bg-sidebar p-14 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-20 top-20 size-96 rounded-full border-[44px] border-sidebar-accent/50" /><div className="absolute bottom-10 left-10 size-48 rounded-full border-[20px] border-sidebar-primary/25" /><div className="relative"><div className="font-mono-app text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/70">Practice &amp; learn — no exam pressure</div><h2 className="mt-8 max-w-lg font-display text-6xl leading-[.93] tracking-[-.04em]">Every MCQ<br /><em className="text-sidebar-primary not-italic">you'll need.</em></h2></div><div className="relative max-w-sm"><div className="mb-4 h-px bg-sidebar-border" /><p className="text-sm leading-6 text-sidebar-foreground/80">One MCQ bank across every college, subject, and topic for MBBS &amp; BDS students — built for steady daily practice, not timed exams.</p><div className="mt-5 flex items-center gap-2 text-xs font-bold"><span className="grid size-7 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><Check size={14} /></span> Instant explanations on every question</div></div></div></div>; }

export function Stepper({ step }: { step: 1 | 2 }) {
  const steps = [{ n: 1, label: 'Your details' }, { n: 2, label: 'Membership & payment' }];
  return <div className="mb-8 flex items-center gap-3">{steps.map((s, i) => <div key={s.n} className="flex items-center gap-3">
    <div className="flex items-center gap-2.5"><div className={cn('grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold transition-colors', step > s.n ? 'bg-primary text-primary-foreground' : step === s.n ? 'bg-primary text-primary-foreground ring-4 ring-primary/15' : 'bg-muted text-muted-foreground')} data-testid={`step-indicator-${s.n}`}>{step > s.n ? <Check size={14} /> : s.n}</div><span className={cn('hidden text-xs font-bold sm:inline', step >= s.n ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span></div>
    {i < steps.length - 1 && <div className={cn('h-0.5 w-8 rounded-full transition-colors sm:w-16', step > s.n ? 'bg-primary' : 'bg-muted')} />}
  </div>)}</div>;
}

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2"><div className="min-w-0"><div className="text-[10px] text-muted-foreground">{label}</div><div className="truncate font-mono-app text-xs font-bold">{value}</div></div><button type="button" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-copy-${label.toLowerCase().replaceAll(' ', '-')}`}>{copied ? <CheckCheck size={14} className="text-primary" /> : <Copy size={14} />}</button></div>;
}

export function IconField({ icon: Icon, ...props }: { icon: typeof UserIcon } & ComponentProps<'input'>) {
  return <div className="relative"><Icon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input {...props} className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20" /></div>;
}

export function PasswordStrength({ value }: { value: string }) {
  const score = [value.length >= 8, /[A-Z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  if (!value) return null;
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score];
  const color = ['bg-destructive', 'bg-destructive', 'bg-[#e5a952]', 'bg-[#8bcbb8]', 'bg-primary'][score];
  return <div className="mt-2"><div className="flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < score ? color : 'bg-muted')} />)}</div><div className="mt-1 text-[10px] font-semibold text-muted-foreground">{label}</div></div>;
}

export const PAYMENT_METHODS: Array<{ value: string; label: string; icon: typeof Landmark }> = [
  { value: 'Bank transfer', label: 'Bank transfer', icon: Landmark },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'Raast', label: 'Raast', icon: Zap },
  { value: 'Mobile wallet', label: 'Mobile wallet', icon: Smartphone },
  { value: 'Card', label: 'Card', icon: CreditCard },
];

export function PastPaperRowIcon({ examBoard }: { examBoard: string }) {
  const styles = topicAccentStyles(examBoard || 'paper');
  return <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={styles.badge}><FileStack size={18} /></span>;
}

// Past papers don't store an estimated duration server-side (only
// mcqCount) — this mirrors the ~1 min/question pacing convention implied
// by the reference design (120 Q -> 2h, 150 Q -> 2.5h, 100 Q -> 1.5h),
// rounded to the nearest half hour purely for display.

export function pastPaperEstimatedHours(mcqCount: number): number {
  return Math.round((mcqCount / 60) * 2) / 2;
}

export function NotebookCard({ note, onLinkedClick }: { note: NotebookEntry; onLinkedClick: (mcqId: number) => void }) {
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

export function Podium({ rows }: { rows: LeaderboardRow[] }) {
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

export function MyFeedbackThread({ item }: { item: MyFeedbackEntry }) {
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

export function ExamCard({ exam, onStart }: { exam: StudentExam; onStart: () => void }) {
  const scopeLabel = `${exam.programTargetKind || 'All Programs'} · ${exam.yearTargetNumber ? `${exam.yearTargetNumber}${['th', 'st', 'nd', 'rd'][exam.yearTargetNumber % 10 > 3 ? 0 : exam.yearTargetNumber % 10]} Year` : 'All Years'}`;
  return <div className="rounded-2xl border border-border bg-card p-5" data-testid={`card-exam-${exam.id}`}>
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-extrabold">{exam.title}</h3><p className="mt-1 text-xs text-muted-foreground">{exam.description}</p></div><Badge tone={exam.windowStatus === 'open' ? 'green' : exam.windowStatus === 'upcoming' ? 'blue' : 'neutral'}>{exam.windowStatus}</Badge></div>
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 size={12} /> {exam.durationMinutes} min</span><span>{scopeLabel}</span><span>{exam.attemptsUsed}/{exam.maxAttempts} attempts used</span>{exam.negativeMarkingEnabled && <span className="inline-flex items-center gap-1 text-[#e0b5ae]"><AlertTriangle size={12} /> -{exam.negativeMarkPerWrong} per wrong</span>}</div>
    <div className="mt-4">{exam.inProgressAttemptId ? <Link href={`/exams/take/${exam.inProgressAttemptId}`} className="inline-flex items-center gap-1.5 rounded-xl bg-[#4e3612] px-4 py-2 text-xs font-bold text-[#acd3e2]" data-testid={`button-resume-exam-${exam.id}`}>Resume exam <ArrowRight size={13} /></Link> : exam.canStart ? <button onClick={onStart} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid={`button-start-exam-${exam.id}`}><ClipboardCheck size={14} /> Start exam</button> : <span className="text-[11px] font-semibold text-muted-foreground">{exam.windowStatus === 'upcoming' ? `Opens ${new Date(exam.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : exam.windowStatus === 'closed' ? 'Window closed' : 'No attempts remaining'}</span>}</div>
  </div>;
}

export function useFaviconSync() {
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

export function useThemeSync() {
  const { data } = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  useEffect(() => { applyThemeVars(data ?? null); }, [data]);
}

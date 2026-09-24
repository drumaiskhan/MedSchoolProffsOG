// Auto-extracted shared helpers/components/hooks used across page modules.
// Split out of the original monolithic App.tsx so route-level pages can be
// lazy-loaded independently without dragging this along more than once.
import { type ReactNode, type ComponentProps, type TouchEvent, useState, useEffect, useRef, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, useSearch, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen,
  LayoutDashboard, CalendarCheck, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus,
  ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2,
  TrendingUp, TrendingDown, Minus, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark,
  Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash,
  GraduationCap, Eye, EyeOff, Smartphone, UploadCloud, ImageOff,
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Link2 as LinkIcon, Lightbulb,
  LayoutGrid, Presentation, Wand2, Crown, Globe, Star, Megaphone, Swords
} from 'lucide-react';
import { applyThemeVars } from '@/lib/theme';
import { Aurora, AuthShowcase } from '@/lib/landing-visuals';
import { SubjectIcon, resolveSubjectIcon } from '@/lib/subject-icons';
import { queryClient } from '@/lib/query-client';
import { SidebarNav, SidebarProfile, type SidebarGroup } from '@/components/nav/SidebarNav';
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
import { CommandPalette, type PalettePage } from '@/components/search/CommandPalette';
import { BlockPoster, ModulePoster } from '@/components/blocks/BlockCards';
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

// Shared with Shell's banner (below) and Register.tsx's pre-signup banner
// so both read GLOBAL_TRIAL_MODE/PROGRAM/YEAR the same way. Empty
// program/year strings mean "no restriction on that axis" (see
// routes/settings.ts's comment on those two keys) — this only affects the
// wording, the actual access grant is enforced server-side either way.
function ordinalYear(year: number) { return `${year}${year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'}`; }
// e.g. "MBBS · 1st, 2nd & 3rd Year". Null when the trial isn't narrowed at all.
export function trialScopeLabel(program?: string, years?: number[]): string | null {
  const yearPart = years?.length ? `${years.map(ordinalYear).join(', ').replace(/, (\d+\w+)$/, ' & $1')} Year` : '';
  const parts = [program || '', yearPart].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

// Student-facing names for the trial's feature keys (the server's
// TRIAL_FEATURE_OPTIONS in api-server/src/lib/trial.ts). Unknown keys fall
// back to the key itself so a newly added feature still reads sensibly.
const TRIAL_FEATURE_LABEL: Record<string, string> = {
  mcqs: 'MCQ bank', past_papers: 'Past papers', exams: 'Pre-Proffs exams', flashcards: 'Flashcards', resources: 'Resources',
  ai_explain: 'Ask AI', ai_visualizer: 'AI Visualizer', challenges: 'Challenges', books: 'Books',
};
export function trialFeatureSummary(features: string[]): string {
  const names = features.map((k) => TRIAL_FEATURE_LABEL[k] ?? k);
  if (!names.length) return 'no features';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
export function trialEndsLabel(endsAt: string | null | undefined): string {
  return endsAt ? ` until ${new Date(endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : '';
}

// Sidebar routes that belong to one trial-gated feature. Books aren't listed:
// they're sold one by one, so the Books page shows lock state per book.
const NAV_FEATURE: Record<string, string> = {
  '/blocks': 'mcqs', '/exams': 'exams', '/past-papers': 'past_papers', '/flashcards': 'flashcards', '/ai-visualizer': 'ai_visualizer', '/challenge': 'challenges',
};
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

import { ResultInsights } from '@/components/study/ResultInsights';
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
    <ResultInsights mcqs={mcqs} answers={answers} />

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
        {/* Per-option breakdown when the question has one (same pattern as
            ExamResult.tsx's review) — this used to only show the single
            whole-question m.explanation and silently dropped
            m.optionExplanations even though it's on the same object. */}
        {m.optionExplanations?.some((e) => e?.trim())
          ? <div className="mt-2 space-y-1.5">{m.options.map((opt, oi) => { const optExplanation = m.optionExplanations?.[oi]; const isCorrectOpt = opt === m.correctAnswer; return <div key={opt} className={cn('rounded-lg px-2.5 py-1.5 text-[11px]', isCorrectOpt ? 'bg-[#e6f3ed]' : opt === answers[m.id] ? 'bg-white/70' : 'bg-muted/30')}><div className={cn('font-bold', isCorrectOpt ? 'text-[#287058]' : 'text-muted-foreground')}>{String.fromCharCode(65 + oi)}. {opt}{isCorrectOpt ? ' (correct)' : ''}</div>{optExplanation && <div className="mt-0.5 leading-5 text-muted-foreground">{optExplanation}</div>}</div>; })}</div>
          : m.explanation && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{m.explanation}</p>}
      </div>)}</div>
    </div>}
  </div>;
}

// Small reusable confirm-before-delete dialog, used by every admin list's
// delete action (task: real confirm modal, not window.confirm).

export function ConfirmDialog({ title, body, confirmLabel = 'Delete', pendingLabel, onConfirm, onCancel, pending }: { title: string; body: string; confirmLabel?: string; pendingLabel?: string; onConfirm: () => void; onCancel: () => void; pending?: boolean }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={onCancel}><div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"><h3 className="font-extrabold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p><div className="mt-5 flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold transition-transform active:scale-95" data-testid="button-confirm-cancel">Cancel</button><button onClick={onConfirm} disabled={pending} className="flex-1 rounded-xl bg-destructive py-2.5 text-xs font-extrabold text-destructive-foreground transition-transform active:scale-95 disabled:opacity-50" data-testid="button-confirm-delete">{pending ? (pendingLabel ?? 'Deleting…') : confirmLabel}</button></div></div></div>;
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
    ['/dashboard', 'Overview', LayoutDashboard], ['/blocks', 'Blocks', BookOpen], ['/flashcards', 'Flashcards', Zap], ['/past-papers', 'Past papers', FileStack], ['/exams', 'Pre-Proffs Exams', ClipboardCheck], ['/ospe-osce', 'OSPE/OSCE', Stethoscope], ['/books', 'Books', Library], ['/progress', 'My progress', TrendingUp], ['/study', 'Study plan', CalendarCheck], ['/ai-visualizer', 'AI Visualizer', Wand2],
  ] },
  { label: 'Your tools', items: [
    ['/notebook', 'My notebook', NotebookPen], ['/saved-sessions', 'Saved sessions', Bookmark], ['/flagged-mcqs', 'Flagged MCQs', Flag], ['/leaderboard', 'Leaderboard', Trophy], ['/challenge', 'Challenge a friend', Swords],
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
  // While a feature-limited trial is live, a student without a paid
  // membership sees which sections the trial doesn't include (lock icon,
  // linking to Membership) instead of tapping in and hitting a 403. Purely
  // presentational — the API enforces the same rule (requireMembershipFor).
  const dashboardQ = useGetStudentDashboard();
  const trial = siteContentQ.data?.trial;
  const paidMember = dashboardQ.data?.membershipStatus === 'ACTIVE';
  const isLockedByTrial = (href: string) => {
    const feature = NAV_FEATURE[href];
    return !!(trial?.active && feature && user.role !== 'admin' && !paidMember && dashboardQ.data && !trial.features.includes(feature));
  };
  const notifQ = useListNotifications();
  const unreadCount = (notifQ.data ?? []).filter((n) => !n.read).length;
  const logout = useMutation({ mutationFn: authApi.logout, onSuccess: () => { queryClient.clear(); window.location.href = '/login'; } });
  const navView: SidebarGroup[] = groups.map((group) => ({
    label: group.label,
    items: group.items.map(([href, label, Icon]) => ({
      href, label, icon: Icon,
      hue: NAV_HUE[href] ?? NAV_HUE_FALLBACK,
      locked: isLockedByTrial(href),
      active: location === href || (href !== '/dashboard' && location.startsWith(`${href}/`)),
      slug: label.toLowerCase().replaceAll(' ', '-'),
      badge: label === 'Notifications' ? unreadCount : 0,
    })),
  }));
  // v43: presentation lives in components/nav/SidebarNav.tsx (sliding puck,
  // pointer spotlight, tilting profile card). Data / trial-lock rules stay here.
  return <aside className="student-sidebar fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col overflow-y-auto bg-sidebar px-3.5 py-5 text-sidebar-foreground shadow-xl md:sticky md:top-0 md:h-[100dvh] md:shadow-none">
    <div className="sb-ambient" aria-hidden="true"><i className="sb-orb sb-orb--a" /><i className="sb-orb sb-orb--b" /></div>
    <div className="relative z-[1] mb-6 flex items-center justify-between px-2"><Logo dark href="/dashboard" /><button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" onClick={onClose} aria-label="Close menu" data-testid="button-close-menu"><X size={18} /></button></div>
    <SidebarNav groups={navView} onNavigate={onClose} />
    <div className="relative z-[1] mt-auto pt-6">
      <SidebarProfile initials={initials(user.name)} name={user.name} subtitle={user.institution || 'Medical student'} onSignOut={() => logout.mutate()} signingOut={logout.isPending} />
    </div>
  </aside>;
}

// Trial-lock check shared by the phone tab bar (SideNav keeps its own copy of
// the same rule): while a feature-limited trial is live, a student without a
// paid membership sees locked sections marked and sent to Membership.
export function useNavLocks(user: Pick<User, 'role'> | null | undefined) {
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const dashboardQ = useGetStudentDashboard();
  const trial = siteContentQ.data?.trial;
  const paidMember = dashboardQ.data?.membershipStatus === 'ACTIVE';
  return (href: string) => {
    const feature = NAV_FEATURE[href];
    return !!(trial?.active && feature && user && user.role !== 'admin' && !paidMember && dashboardQ.data && !trial.features.includes(feature));
  };
}

// Phone-only bottom tab bar: the four most-used study areas + "More" (opens
// the full sidebar menu). Hidden on md+ (sidebar is always visible there) and
// in focus mode (practice / exams / reader) — Shell decides that.
const TAB_ITEMS: Array<{ href: string; label: string; icon: typeof LayoutDashboard; also?: string[] }> = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/blocks', label: 'Blocks', icon: BookOpen, also: ['/modules', '/subjects', '/practice'] },
  { href: '/exams', label: 'Exams', icon: ClipboardCheck },
  { href: '/flashcards', label: 'Cards', icon: Zap },
];

export function MobileTabBar({ user, onMore }: { user: User; onMore: () => void }) {
  const [location] = useLocation();
  const isLocked = useNavLocks(user);
  const match = (href: string) => location === href || location.startsWith(`${href}/`);
  return <nav aria-label="Quick navigation" className="tabbar-safe fixed inset-x-0 bottom-0 z-20 w-full max-w-full px-3 md:hidden" data-testid="tabbar-mobile">
    <div className="tabbar-dock mx-auto flex w-full max-w-md items-stretch gap-1 rounded-2xl border border-border bg-card/95 p-1.5 backdrop-blur-md">
      {TAB_ITEMS.map(({ href, label, icon: Icon, also }) => {
        const active = match(href) || !!also?.some(match);
        const locked = isLocked(href);
        return <Link key={href} href={locked ? '/payments' : href} aria-current={active ? 'page' : undefined} className={cn('relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-bold transition-colors', active ? 'tab-key text-primary' : 'text-muted-foreground hover:bg-muted/70')} data-testid={`tab-${label.toLowerCase()}`}>
          <Icon size={19} strokeWidth={active ? 2.4 : 2} />{label}
          {locked && <LockKeyhole size={9} className="absolute right-3 top-1.5" />}
        </Link>;
      })}
      <button type="button" onClick={onMore} className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-bold text-muted-foreground hover:bg-muted/70" aria-label="More — open full menu" data-testid="tab-more"><Menu size={19} />More</button>
    </div>
  </nav>;
}

// Hues for the glossy page tiles in the search palette (one per nav destination).
const NAV_HUE: Record<string, number> = {
  '/dashboard': 214, '/progress': 228, '/blocks': 205, '/exams': 4, '/past-papers': 22, '/flashcards': 268, '/ai-visualizer': 290, '/books': 38,
  '/notebook': 172, '/saved-sessions': 190, '/flagged-mcqs': 350, '/leaderboard': 45, '/challenge': 12,
  '/payments': 152, '/notifications': 200, '/feedback': 160, '/profile': 240,
};
const NAV_HUE_FALLBACK = 214;

/** Header search. Thin wrapper: works out which pages this student can see/open, the palette does the rest. */
export function QuickJump({ open, value, onChange, onClose }: { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void }) {
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const userQ = useGetCurrentUser();
  const isLocked = useNavLocks(userQ.data as Pick<User, 'role'> | undefined);
  const aiVisualizerEnabled = siteContentQ.data?.AI_VISUALIZER_ENABLED !== 'false';
  const pages: PalettePage[] = navGroups.flatMap((group) => group.items)
    .filter(([href]) => aiVisualizerEnabled || href !== '/ai-visualizer')
    .map(([href, label, Icon]) => ({ href, label, icon: Icon, hue: NAV_HUE[href] ?? NAV_HUE_FALLBACK, locked: isLocked(href) }));
  return <CommandPalette open={open} value={value} onChange={onChange} onClose={onClose} pages={pages} />;
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

// SEO: the app is a client-rendered SPA, so index.html ships one shared
// <title>/description/canonical for every route — without this hook every
// marketing page (About, Pricing, Contact, FAQ, Home) would show identical
// <head> content to search engines and to link previews. Public marketing
// pages call this once on mount to patch those three tags to their own
// values, and it restores index.html's site-wide defaults on unmount so an
// in-app route never inherits a marketing page's title after navigating
// away. Internal app routes (behind login) don't need this — they aren't
// meant to be indexed.
export function useDocumentHead({ title, description, path }: { title?: string; description?: string; path?: string }) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;

    const descTag = document.querySelector('meta[name="description"]');
    const prevDescription = descTag?.getAttribute('content') ?? null;
    if (description && descTag) descTag.setAttribute('content', description);

    let canonicalTag = document.querySelector('link[rel="canonical"]');
    const prevCanonical = canonicalTag?.getAttribute('href') ?? null;
    const hadCanonical = !!canonicalTag;
    if (path) {
      if (!canonicalTag) {
        canonicalTag = document.createElement('link');
        canonicalTag.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalTag);
      }
      canonicalTag.setAttribute('href', `https://medschoolproffs.live${path}`);
    }

    return () => {
      document.title = prevTitle;
      if (descTag && prevDescription != null) descTag.setAttribute('content', prevDescription);
      if (canonicalTag) {
        if (prevCanonical != null) canonicalTag.setAttribute('href', prevCanonical);
        else if (!hadCanonical) canonicalTag.remove();
      }
    };
  }, [title, description, path]);
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

// ANNOUNCEMENT_BANNER is stored as a JSON array of strings so admins can
// queue up more than one (see AdminSettings.tsx). Falls back to treating
// the raw value as a single announcement when it isn't valid JSON, so a
// site with the old plain-text value already saved keeps showing it.
function parseAnnouncements(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch { /* not JSON — fall through to legacy plain-text handling below */ }
  return raw.trim() ? [raw.trim()] : [];
}

// One-line trial notice. On a phone a 3-line wrapped banner pushed the whole page
// down; now the text scrolls in a single line (two copies back to back, same
// technique as the announcement marquee) and md+ shows it static and centred.
// Motion is off for prefers-reduced-motion, where the text simply wraps.
function TrialBar({ text }: { text: string }) {
  const duration = Math.max(14, text.length * 0.16);
  return <div className="trial-bar" data-testid="banner-global-trial-mode" role="status">
    <Sparkles size={14} className="trial-bar__icon" aria-hidden="true" />
    <div className="trial-bar__viewport">
      <div className="trial-bar__track" style={{ animationDuration: `${duration}s` }}>
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </div>
    </div>
  </div>;
}

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
  // Same query SideNav already runs (shared key, no extra request) — drives the
  // unread dot on the header bell. Must stay up here with the other hooks.
  const headerNotifQ = useListNotifications();
  const headerUnread = (headerNotifQ.data ?? []).filter((n) => !n.read).length;

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
  const trial = siteContentQ.data?.trial;
  const globalTrialMode = !!trial?.active;
  const globalTrialScope = trialScopeLabel(trial?.program, trial?.years);
  // Bug fix: admin's "Announcement banner" setting had a live text field
  // and a "blank to hide" contract, but nothing on the student side ever
  // read ANNOUNCEMENT_BANNER or rendered it — so it silently did nothing
  // no matter what an admin typed in. Wired up the same way
  // globalTrialMode's banner already works: read from the same
  // site-content query (no extra request), hidden in focus mode, and
  // dismissible per-session.
  //
  // ANNOUNCEMENT_BANNER is a JSON array of strings (admin's Settings page
  // can queue up more than one), with a fallback for a site that still has
  // the old plain-text value saved so it keeps showing instead of
  // vanishing. Multiple announcements are joined into one continuous
  // scrolling line, separated by a dot.
  const announcements = parseAnnouncements(siteContentQ.data?.ANNOUNCEMENT_BANNER);
  const announcementText = announcements.length ? announcements.join('   •   ') : null;
  const showAnnouncement = Boolean(announcementText) && announcementText !== dismissedAnnouncement;
  // The banner text used to be truncated with an ellipsis, which on a
  // narrow phone screen often cut off most of a longer announcement
  // entirely. It now scrolls continuously instead (two copies of the text
  // back to back, animated left by exactly one copy's width so the loop is
  // seamless) — duration scales with length so a short announcement
  // doesn't fly past and a long one doesn't crawl.
  const marqueeDuration = announcementText ? Math.max(14, announcementText.length * 0.14) : 14;
  // The dashboard's own hero already greets the student by name; repeating the
  // greeting here got cut off to "Good Morning, U…" beside the search/bell/avatar
  // buttons on a phone. The header now just names the page.
  const title = pageTitle ?? (location === '/dashboard' ? 'Dashboard' : location.slice(1).split('/').map((part) => part.replaceAll('-', ' ')).join(' / '));
  // Full date on md+, compact on phones ("Mon, Sep 21") so it never wraps.
  const todayLong = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const todayShort = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

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
  return <div className="student-shell flex min-h-[100dvh] bg-background">
    <div className={cn(!focusMode && menuOpen ? 'block' : 'hidden', 'sb-scrim fixed inset-0 z-30 bg-[#071e2b]/45 md:hidden')} onClick={() => setMenuOpen(false)} />
    <div className={cn(focusMode ? 'hidden' : (menuOpen || !isMobile) ? 'block' : 'hidden')}><SideNav user={user} onClose={() => setMenuOpen(false)} /></div>
    <main className="min-w-0 max-w-full flex-1">
      {!focusMode && (showAnnouncement || globalTrialMode) && <div className="relative z-20">
        {showAnnouncement && <div className="flex items-center gap-2 overflow-hidden bg-primary px-4 py-1.5 text-[11px] font-bold text-primary-foreground" data-testid="banner-announcement">
          <Megaphone size={12} className="shrink-0" />
          <div className="min-w-0 flex-1 overflow-hidden">
            {/* Two identical copies back to back, each pushed apart by the
                same right margin, animated left by exactly one copy's width
                (marquee's `to` keyframe is translateX(-50%) of this whole
                track, i.e. one copy) — the loop point is invisible since
                copy two is already sitting where copy one started. */}
            <div className="marquee-track flex w-max whitespace-nowrap" style={{ animation: `marquee ${marqueeDuration}s linear infinite` }}>
              <span className="mr-16">{announcementText}</span>
              <span className="mr-16" aria-hidden="true">{announcementText}</span>
            </div>
          </div>
          <button onClick={() => setDismissedAnnouncement(announcementText)} className="ml-1 shrink-0 rounded p-0.5 hover:bg-white/15" aria-label="Dismiss announcement" data-testid="button-dismiss-announcement"><X size={12} /></button>
        </div>}
        {globalTrialMode && trial && <TrialBar text={`Free trial${globalTrialScope ? ` for ${globalTrialScope} students` : ''}: ${trialFeatureSummary(trial.features)} unlocked${trialEndsLabel(trial.endsAt)}.`} />}
      </div>}
      {focusMode
        ? <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-md md:px-8">{strictFocusMode ? <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-muted-foreground" data-testid="text-exam-locked"><LockKeyhole size={13} /> Exam in progress</span> : <button onClick={() => setLocation('/dashboard')} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted" data-testid="button-exit-focus-mode"><ArrowLeft size={15} /> Exit</button>}<span className="text-xs font-bold capitalize text-foreground">{title}</span></header>
        : <header className="student-header sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-md md:px-8"><div className="flex min-w-0 items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu" data-testid="button-open-menu"><Menu size={20} /></button><div className="min-w-0"><div className="font-mono-app whitespace-nowrap text-[9px] uppercase tracking-[.16em] text-muted-foreground"><span className="hidden md:inline">{todayLong}</span><span className="md:hidden">{todayShort}</span></div><h1 className="mt-1 truncate text-[17px] font-extrabold capitalize tracking-[-.02em] text-foreground">{title}</h1></div></div><div className="relative flex items-center gap-2"><button onClick={() => { setQuickJumpOpen((current) => !current); setQuickJumpValue(''); }} className="hidden h-9 w-[220px] items-center gap-2 rounded-xl border border-border bg-card px-3 text-left text-[11px] text-muted-foreground shadow-sm hover:border-primary/50 sm:flex md:w-[340px]" data-testid="button-open-quick-jump"><Search size={14} /><span className="truncate">Search modules, topics, exams…</span><span className="ml-auto rounded border border-border px-1 text-[9px]">⌘K</span></button><button onClick={() => { setQuickJumpOpen((current) => !current); setQuickJumpValue(''); }} className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted sm:hidden" aria-label="Search" data-testid="button-open-quick-jump-mobile"><Search size={16} /></button><Link href="/notifications" className="relative grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Notifications" data-testid="link-notifications"><Bell size={16} />{headerUnread > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[#e5a952] px-1 text-[9px] font-bold leading-4 text-[#183844] ring-2 ring-background" data-testid="badge-header-unread">{headerUnread > 9 ? '9+' : headerUnread}</span>}</Link><Link href="/profile" className="ml-1 grid size-9 place-items-center rounded-full bg-[#cdebf0] text-[11px] font-extrabold text-[#0d5267] ring-2 ring-transparent transition-shadow hover:ring-primary/30" aria-label="Profile" data-testid="link-header-profile">{initials(user.name)}</Link><QuickJump open={quickJumpOpen} value={quickJumpValue} onChange={setQuickJumpValue} onClose={() => setQuickJumpOpen(false)} /></div></header>}
      <div className={cn('page-enter student-content', focusMode ? 'px-5 py-6 md:px-10 md:py-8' : 'mx-auto w-full max-w-[1320px] px-4 py-6 pb-28 md:px-8 md:py-9')}>{children}</div>
      {!focusMode && <MobileTabBar user={user} onMore={() => setMenuOpen(true)} />}
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

export function EmptyState({ icon: Icon = FolderOpen, title, body, action }: { icon?: typeof FolderOpen; title: string; body: string; action?: ReactNode }) { return <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"><div><div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/15"><Icon size={24} /></div><h3 className="text-[15px] font-extrabold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div></div>; }

export function ErrorState({ retry }: { retry?: () => void }) { return <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-6 text-sm text-[#9e4c39]"><div className="flex items-center gap-2 font-bold"><CircleHelp size={17} /> We couldn't load this view.</div><p className="mt-2 text-[#a96a5b]">Check your connection, then try again.</p>{retry && <button onClick={retry} className="mt-4 rounded-lg bg-[#a9533f] px-3 py-2 text-xs font-bold text-white" data-testid="button-retry">Try again</button>}</div>; }

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ring-1 ring-inset', tone === 'green' && 'bg-[#d7eee4] text-[#287058] ring-[#287058]/15', tone === 'amber' && 'bg-[#fff0cb] text-[#8d6420] ring-[#8d6420]/15', tone === 'red' && 'bg-[#f9ddd6] text-[#a34c3e] ring-[#a34c3e]/15', tone === 'blue' && 'bg-[#dceaf1] text-[#32647b] ring-[#32647b]/15', tone === 'neutral' && 'bg-muted text-muted-foreground ring-border')}>{children}</span>; }

// easy -> green, moderate -> blue, hard -> red — was a hardcoded blue
// regardless of value.

export function difficultyTone(difficulty?: string | null): 'green' | 'blue' | 'red' {
  if (difficulty === 'easy') return 'green';
  if (difficulty === 'hard') return 'red';
  return 'blue';
}

export function Progress({ value, color = 'bg-primary' }: { value: number; color?: string }) { return <div className="d3-well h-2.5 overflow-hidden rounded-full"><div className={cn('bar-fill h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: ReactNode; action?: ReactNode }) { return <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2"><div className="flex items-stretch gap-3"><span className="w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-primary/30" /><div>{eyebrow && <div className="font-mono-app text-[10px] font-bold uppercase tracking-[.16em] text-primary">{eyebrow}</div>}<h2 className="mt-0.5 text-[22px] font-extrabold leading-tight tracking-[-.03em]">{title}</h2>{description && <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p>}</div></div>{action}</div>; }

export function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-border/60 bg-card/70 p-3 text-center"><div className="font-display text-2xl">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div></div>; }

// The student-facing half of the same progress-trend data the practice
// result card uses — so a student can check "am I improving?" any time,
// not just right after finishing a session.

export function StatTile({ icon: Icon, bg, fg, label, value }: { icon: typeof Clock3; bg: string; fg: string; label: string; value: ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-2xs)] transition-shadow hover:shadow-[var(--shadow-xs)]" data-testid={`stat-tile-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="flex items-center gap-3"><span className={cn('d3-tile grid size-10 shrink-0 place-items-center rounded-xl', bg, fg)}><Icon size={18} /></span><div className="text-xs font-semibold text-muted-foreground">{label}</div></div>
    <div className="mt-3 font-display text-3xl">{value}</div>
  </div>;
}


export const QUICK_LINK_TILES: Array<{ href: string; label: string; sub: string; icon: typeof LayoutGrid; bg: string; fg: string; /** HSL hue for the glossy 3D icon tile on the dashboard. */ hue: number }> = [
  { href: '/blocks', label: 'Modules', sub: 'Explore all modules', icon: LayoutGrid, bg: 'bg-[#dceaf1]', fg: 'text-[#2c6a8f]', hue: 205 },
  { href: '/practice', label: 'Practice MCQs', sub: 'Test your knowledge', icon: Target, bg: 'bg-[#d7eee4]', fg: 'text-[#1f7a5c]', hue: 158 },
  { href: '/flashcards', label: 'Flashcards', sub: 'Revise smarter', icon: Sparkles, bg: 'bg-[#e6dcf5]', fg: 'text-[#6b3fa0]', hue: 268 },
  { href: '/past-papers', label: 'Past Papers', sub: 'Previous exam papers', icon: FileStack, bg: 'bg-[#fbdada]', fg: 'text-[#b8493f]', hue: 4 },
  { href: '/flagged-mcqs', label: 'Bookmarks', sub: 'Saved content', icon: Bookmark, bg: 'bg-[#fff0cb]', fg: 'text-[#94651c]', hue: 38 },
  { href: '/progress', label: 'My Progress', sub: 'Track your growth', icon: TrendingUp, bg: 'bg-[#dde4f7]', fg: 'text-[#3b4f8f]', hue: 228 },
  // Special-cased in the render below (href === OPEN_SEARCH_HREF) to open
  // the QuickJump overlay via a custom event instead of navigating — the
  // Shell that owns QuickJump's open/close state lives outside Dashboard's
  // component tree, so a plain <Link> can't reach it directly.
  { href: '#open-search', label: 'Search', sub: 'Find anything', icon: Search, bg: 'bg-[#dbeafe]', fg: 'text-[#1d4ed8]', hue: 214 },
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

// Kept for the dashboard's inline Progress profile card anchor; the "My Progress"
// quick link itself now goes to the full /progress page.
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
  return <ModulePoster id={m.id} name={m.name} subtitle={m.subtitle} iconUrl={(m as Module & { iconUrl?: string | null }).iconUrl} subjectCount={m.subjectCount} mcqCount={m.mcqCount} progress={m.progress} index={i} />;
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
  return <BlockPoster href={href} name={name} iconUrl={iconUrl} moduleCount={moduleCount} muted={muted} />;
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

export function TeamPhoto({ member, size }: { member: TeamMember; size?: number }) {
  const [broken, setBroken] = useState(false);
  const url = member.photoPath ? resolveUploadUrl(member.photoPath) : null;
  // `size` (px) is optional so the existing 56px avatars are unchanged; the
  // landing page's team showcase passes a larger one.
  const dim = size ? { width: size, height: size } : undefined;
  if (!url || broken) return <div className={cn('grid shrink-0 place-items-center rounded-full bg-[#d7eee4] font-extrabold text-[#164b4b]', !size && 'size-14 text-sm')} style={size ? { ...dim, fontSize: Math.round(size * 0.34) } : undefined}>{initials(member.name)}</div>;
  return <img src={url} alt={member.name} loading="lazy" decoding="async" className={cn('shrink-0 rounded-full border border-border object-cover', !size && 'size-14')} style={dim} onError={() => setBroken(true)} />;
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

// Public testimonials strip, fed by admin-curated 5-star feedback (see
// GET /feedback/featured — unauthenticated, only rows an admin explicitly
// marked featured). Used on Home's landing page; returns null while
// loading/empty so it never leaves a half-built section on the page an
// anonymous visitor lands on first.
export function Testimonials() {
  const q = useQuery({ queryKey: ['feedback-featured'], queryFn: feedbackApi.featured, staleTime: 5 * 60 * 1000 });
  const items = q.data ?? [];
  if (!q.isLoading && items.length === 0) return null;
  return <section id="reviews" className="mx-auto max-w-6xl px-5 py-20 md:px-8">
    <div className="mx-auto max-w-2xl text-center">
      <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Reviews</div>
      <h2 className="mt-3 font-display text-4xl tracking-[-.03em]">What students are saying</h2>
    </div>
    {q.isLoading ? <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
    </div> : <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => <div key={t.id} className="card-lift rounded-2xl border border-border bg-card p-6" data-testid={`card-testimonial-${t.id}`}>
        <div className="flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={t.rating >= n ? 'fill-[#e8c34a] text-[#e8c34a]' : 'text-muted-foreground'} />)}</div>
        <p className="mt-3 text-sm leading-6 text-foreground">"{t.message}"</p>
        <div className="mt-4 text-xs font-extrabold text-muted-foreground">{t.name}</div>
      </div>)}
    </div>}
  </section>;
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

export function AuthLayout({ children, register = false }: { children: ReactNode; register?: boolean }) { return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]"><div className="flex flex-col p-6 md:p-10"><Logo /><div className="mx-auto flex w-full max-w-sm flex-1 items-center py-10">{children}</div><Footer /></div><div className="relative hidden overflow-hidden bg-sidebar p-14 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between"><Aurora /><div className="relative"><div className="font-mono-app text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/70">Practice &amp; learn — no exam pressure</div><h2 className="mt-8 max-w-lg font-display text-6xl leading-[.93] tracking-[-.04em]">Every MCQ<br /><em className="text-shimmer not-italic" style={{ backgroundImage: 'linear-gradient(100deg, hsl(var(--sidebar-primary)) 10%, #b9f5ea 40%, hsl(var(--sidebar-primary)) 70%)' }}>you'll need.</em></h2></div><div className="relative"><AuthShowcase /></div><div className="relative max-w-sm"><div className="mb-4 h-px bg-sidebar-border" /><p className="text-sm leading-6 text-sidebar-foreground/80">One MCQ bank across every college, subject, and topic for MBBS &amp; BDS students — built for steady daily practice, not timed exams.</p><div className="mt-5 flex items-center gap-2 text-xs font-bold"><span className="grid size-7 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><Check size={14} /></span> Instant explanations on every question</div></div></div></div>; }

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
      {row.institution && <div className="max-w-[92px] truncate text-center text-[9px] font-semibold text-muted-foreground">{row.institution}</div>}
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
    <div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">{item.category}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', statusTone)}>{item.status === 'replied' ? 'Team replied' : item.status}</span>{!!item.rating && <span className="flex items-center gap-0.5" data-testid={`text-my-feedback-rating-${item.id}`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={11} className={item.rating! >= n ? 'fill-[#e8c34a] text-[#e8c34a]' : 'text-muted-foreground'} />)}</span>}</div><p className="mt-2 text-sm leading-6">{item.message}</p><div className="mt-2 text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div></div>{item.replies.length > 0 && <button onClick={() => setOpen((v) => !v)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-toggle-my-thread-${item.id}`}>{open ? 'Hide' : `${item.replies.length} repl${item.replies.length === 1 ? 'y' : 'ies'}`}</button>}</div>
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

// Wires the admin's SEO Title/Description (Site Content → SEO, in the
// admin app) and Platform Name into the live document once site content
// loads: <title>, meta description, og:*/twitter:* tags, and the "name"
// field on the Organization/WebSite JSON-LD blocks index.html ships as
// static defaults. Called once from Home (the public landing page) — the
// same page Google actually indexes and where the sitename/breadcrumb
// behavior lives, so that's what this patches.
// One real limitation, same tradeoff useFaviconSync above already makes:
// this only updates the DOM after the JS bundle runs. Google's own
// crawler executes JS, so it sees the admin's values — but a scraper that
// doesn't run JS (some link-preview bots) still reads index.html's
// hardcoded defaults as shipped at build time. If those need to match
// too, index.html itself has to be edited directly.
export function useSeoSync() {
  const { data } = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  useEffect(() => {
    if (!data) return;
    const setMeta = (selector: string, content: string) => document.querySelector(selector)?.setAttribute('content', content);
    if (data.SEO_TITLE) {
      document.title = data.SEO_TITLE;
      setMeta('meta[property="og:title"]', data.SEO_TITLE);
      setMeta('meta[name="twitter:title"]', data.SEO_TITLE);
    }
    if (data.SEO_DESCRIPTION) {
      setMeta('meta[name="description"]', data.SEO_DESCRIPTION);
      setMeta('meta[property="og:description"]', data.SEO_DESCRIPTION);
      setMeta('meta[name="twitter:description"]', data.SEO_DESCRIPTION);
    }
    if (data.PLATFORM_NAME) {
      setMeta('meta[property="og:site_name"]', data.PLATFORM_NAME);
      document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
        try {
          const json = JSON.parse(el.textContent || '');
          if (json['@type'] === 'Organization' || json['@type'] === 'WebSite') { json.name = data.PLATFORM_NAME; el.textContent = JSON.stringify(json); }
        } catch { /* not one of ours, or malformed — leave it alone */ }
      });
    }
  }, [data]);
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

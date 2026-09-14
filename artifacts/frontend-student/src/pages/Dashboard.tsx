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
import { Badge, EmptyState, MODULE_TILE_COLORS, OPEN_SEARCH_EVENT, OPEN_SEARCH_HREF, PROGRESS_ANCHOR_HREF, Progress, QUICK_LINK_TILES, SectionHeader, SkeletonPage, cn, greetingForHour, ProgressProfileCard, StatTile } from '@/lib/shared';

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
        const content = <><span className={cn('grid size-11 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3', tile.bg, tile.fg)}><tile.icon size={19} /></span><span className="text-xs font-bold leading-tight">{tile.label}</span><span className="text-[10px] leading-tight text-muted-foreground">{tile.sub}</span></>;
        const testId = `link-quick-${tile.label.toLowerCase().replaceAll(' ', '-')}`;
        const tileClassName = 'card-lift group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center active:scale-95';
        if (tile.href === OPEN_SEARCH_HREF) {
          return <button key={tile.label} type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))} className={tileClassName} data-testid={testId}>{content}</button>;
        }
        if (tile.href === PROGRESS_ANCHOR_HREF) {
          return <button key={tile.label} type="button" onClick={() => {
            const section = document.getElementById('progress-profile');
            if (!section) return;
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Brief ring flash so landing on the section (which can be a
            // full screen below the fold) reads as "you arrived", not just
            // an instant unexplained jump — matches the smooth-scroll's own
            // duration so it fades right as the scroll settles.
            section.classList.add('ring-2', 'ring-primary/50');
            window.setTimeout(() => section.classList.remove('ring-2', 'ring-primary/50'), 900);
          }} className={tileClassName} data-testid={testId}>{content}</button>;
        }
        return <Link key={tile.label} href={tile.href} className={tileClassName} data-testid={testId}>{content}</Link>;
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
    <section id="progress-profile" className="scroll-mt-24 rounded-2xl transition-shadow duration-700"><SectionHeader eyebrow="Where you stand" title="Progress profile" /><ProgressProfileCard /></section>
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

export default Dashboard;

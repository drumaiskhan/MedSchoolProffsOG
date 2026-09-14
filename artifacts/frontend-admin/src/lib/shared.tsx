// Auto-extracted shared helpers/components/hooks used across admin page
// modules. Split out of the original monolithic App.tsx so route-level
// pages can be lazy-loaded independently without duplicating this.
import { type ReactNode, type ComponentProps, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useSearch, useParams, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, ChevronUp, ChevronDown,
  CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen,
  LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus,
  ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2,
  TrendingUp, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark,
  Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash,
  GraduationCap, CalendarDays, Eye, EyeOff, Smartphone, UploadCloud, ImageOff,
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Activity, Layers, BarChart3, GraduationCap, ToggleLeft,
  Download, Database, Loader2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { applyThemeVars, DEFAULT_THEME, readableForegroundHsl } from '@/lib/theme';
import { queryClient } from '@/lib/query-client';
import {
  getListMembershipPlansQueryKey, getListPaymentsQueryKey, getListMcqsQueryKey, getListModulesQueryKey, getListStudentsQueryKey, getListNotificationsQueryKey, getGetCurrentUserQueryKey, getListFlashcardsQueryKey,
  useApprovePayment, useCreateMembershipPlan, useCreateMcq, useCreateModule, useGetAdminDashboard, getGetAdminDashboardQueryKey,
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
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, analyticsApi, mcqImportApi, flashcardImportApi, mcqBackupApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, subjectAdminApi, topicAdminApi, flashcardsAdminApi, flashcardsAiApi, booksAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blockAdminApi, examsAdminApi, examsApi, explanationsApi, auditApi, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type FlashcardCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type TeamCategory, type AdminModule, type AdminBlock, type AdminSubject, type AdminTopic, type AdminFlashcard, type GeneratedFlashcard, type AdminMcqRow, type AdminBook, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type BankAccount, type PaymentMethodConfig, aiVisualizerAdminApi, type AiVisualizerLogEntry, type AuditLogEntry } from '@/lib/api';

// Round 3, item 10 (performance) — same over-fetching fix as the student
// app (see its App.tsx for the full rationale): `new QueryClient()` with no
// options refetched on every mount and every window refocus. Admin
// mutations already call invalidateQueries on the specific keys they
// change, so edits still show up immediately — this only avoids redundant
// background refetches of data nothing has touched.

export const cn = (...parts: Array<string | false | undefined | null>) => parts.filter(Boolean).join(' ');

export const initials = (name = 'MedschoolProffs') => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

export const money = (amount: number, currency = 'PKR') => new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
// Payment status codes stored in the DB are uppercase (PAYMENT_PENDING_REVIEW,
// APPROVED, REJECTED, VOIDED) — these map them to display labels and badge
// tones. Previously the UI compared these against lowercase literals like
// 'pending', which never matched, so the pending badge (and the filter tabs)
// silently fell through to the wrong tone/empty results.

export const PAYMENT_STATUS_LABEL: Record<string, string> = { PAYMENT_PENDING_REVIEW: 'pending', APPROVED: 'approved', REJECTED: 'rejected', VOIDED: 'voided' };

export const paymentStatusLabel = (status: string) => PAYMENT_STATUS_LABEL[status] || status.toLowerCase();

export const paymentStatusTone = (status: string): 'amber' | 'green' | 'red' | 'neutral' => (status === 'PAYMENT_PENDING_REVIEW' ? 'amber' : status === 'APPROVED' ? 'green' : status === 'VOIDED' ? 'neutral' : 'red');

// Small reusable confirm-before-delete dialog, used by every admin list's
// delete action (task: real confirm modal, not window.confirm).

export function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onCancel, pending }: { title: string; body: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; pending?: boolean }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 animate-in fade-in duration-200" onClick={onCancel}><div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"><h3 className="font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p><div className="mt-5 flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold transition-transform active:scale-95" data-testid="button-confirm-cancel">Cancel</button><button onClick={onConfirm} disabled={pending} className="flex-1 rounded-xl bg-destructive py-2.5 text-xs font-extrabold text-destructive-foreground transition-transform active:scale-95 disabled:opacity-50" data-testid="button-confirm-delete">{pending ? 'Deleting…' : confirmLabel}</button></div></div></div>;
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="flex items-center gap-2" data-testid="link-logo">
    <Activity size={20} strokeWidth={2.4} className={dark ? 'text-sidebar-primary' : 'text-primary'} aria-hidden="true" />
    <span className={cn('text-[15px] font-extrabold tracking-[-.03em]', dark ? 'text-sidebar-foreground' : 'text-primary')}>MedschoolProffs</span>
  </Link>;
}

type NavItem = [string, string, typeof LayoutDashboard];

export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Study desk', items: [
    ['/', 'Overview', LayoutDashboard], ['/modules', 'Modules', BookOpen], ['/practice', 'Practice', Target], ['/exams', 'Pre-Proffs Exams', ClipboardCheck], ['/past-papers', 'Past papers', FileStack], ['/flashcards', 'Flashcards', Zap], ['/resources', 'Resources', FolderOpen],
  ] },
  { label: 'Your tools', items: [
    ['/notebook', 'My notebook', NotebookPen], ['/saved-sessions', 'Saved sessions', Bookmark], ['/flagged-mcqs', 'Flagged MCQs', Flag], ['/leaderboard', 'Leaderboard', Trophy],
  ] },
  { label: 'Your account', items: [
    ['/payments', 'Membership', CreditCard], ['/notifications', 'Notifications', Bell], ['/feedback', 'Send feedback', MessageSquare], ['/profile', 'Profile & access', ShieldCheck],
  ] },
];

export const adminGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Overview', items: [
    ['/admin', 'Admin overview', LayoutDashboard], ['/admin/students', 'Students', Users],
  ] },
  { label: 'Payments', items: [
    ['/admin/plans', 'Subscription plans', CreditCard], ['/admin/payments', 'Payments & collection', ReceiptText],
  ] },
  { label: 'Curriculum', items: [
    ['/admin/academic-structure', 'Colleges & courses', FolderOpen], ['/admin/content', 'Academic content', Library], ['/admin/subjects', 'Subjects', BookOpen], ['/admin/topics', 'Topics', CircleHelp],
  ] },
  { label: 'Question banks', items: [
    ['/admin/mcqs', 'MCQ bank', CircleHelp], ['/admin/flashcards', 'Flashcards', Zap], ['/admin/books', 'Books library', BookOpen], ['/admin/past-papers', 'Past papers', FileStack], ['/admin/exams', 'Pre-Proffs Exams', ClipboardCheck],
  ] },
  { label: 'Site & team', items: [
    ['/admin/team', 'Academic team', Users], ['/admin/site-content', 'Site content', Landmark],
  ] },
  { label: 'Activity', items: [
    ['/admin/feedback', 'Feedback inbox', MessageSquare], ['/admin/ai-visualizer-logs', 'AI Visualizer activity', Wand2],
  ] },
  { label: 'Workspace', items: [
    ['/admin/settings', 'Platform settings', Settings],
  ] },
];

export function SideNav({ user, onClose }: { user: User; onClose: () => void }) {
  const [location] = useLocation();
  const groups = adminGroups;
  const notifQ = useListNotifications();
  const unreadCount = (notifQ.data ?? []).filter((n) => !n.read).length;
  const logout = useMutation({ mutationFn: authApi.logout, onSuccess: () => { queryClient.clear(); window.location.href = '/login'; } });
  return <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col overflow-y-auto bg-sidebar px-4 py-5 text-sidebar-foreground shadow-xl md:sticky md:top-0 md:h-[100dvh] md:shadow-none">
    <div className="mb-8 flex items-center justify-between px-2"><Logo dark /><button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" onClick={onClose} data-testid="button-close-menu"><X size={18} /></button></div>
    <nav className="space-y-5">
      {groups.map((group) => <div key={group.label}><div className="mb-1.5 px-3.5 font-mono-app text-[9px] font-bold uppercase tracking-[.14em] text-sidebar-foreground/40">{group.label}</div><div className="space-y-1">{group.items.map(([href, label, Icon]) => <Link key={href} href={href} onClick={onClose} className={cn('group flex items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] font-semibold transition-colors', location === href ? 'bg-white text-sidebar shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} strokeWidth={location === href ? 2.2 : 1.8} /><span>{label}</span>{label === 'Notifications' && unreadCount > 0 && <span className="ml-auto grid size-5 place-items-center rounded-full bg-[#e5a952] text-[10px] font-bold text-[#183844]">{unreadCount > 9 ? '9+' : unreadCount}</span>}</Link>)}</div></div>)}
    </nav>
    <div className="mt-auto pt-5">
      <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-primary text-xs font-extrabold text-sidebar-primary-foreground">{initials(user.name)}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-sidebar-foreground">{user.name}</div><div className="truncate text-[10px] text-sidebar-foreground/45">Academic team</div></div><button onClick={() => logout.mutate()} disabled={logout.isPending} className="text-sidebar-foreground/50 hover:text-sidebar-foreground disabled:opacity-50" data-testid="button-signout" title="Sign out"><LogOut size={15} /></button></div>
    </div>
  </aside>;
}

// Every route below is wrapped in <Shell>, so this is the one place that has
// to enforce "must be signed in" and "must be admin for /admin/*" before
// rendering real content — a signed-out or under-privileged user should never
// see so much as a flash of the dashboard/admin UI underneath.

export function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // retry: false — a failed/unusable current-user response should send the
  // user to /login promptly, not spend several silent retries first.
  const userQuery = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const user = userQuery.data;

  useEffect(() => {
    if (userQuery.isLoading) return;
    if (!user || user.role !== 'admin') {
      // A hard navigation (not wouter's client-side setLocation) so any
      // stale/broken React Query cache from the failed session is fully
      // discarded rather than carried into the next render — a soft route
      // change alone was letting a bad cached response resurface the same
      // crash after refresh instead of landing cleanly on the login page.
      // This deployment only serves admin routes — a non-admin account
      // (e.g. a student who signed in here by mistake) must never see admin
      // UI, so it's treated the same as "not signed in" and sent to /login.
      queryClient.clear();
      window.location.href = '/login';
      return;
    }
  }, [user, userQuery.isLoading, setLocation]);

  if (userQuery.isLoading) return <BrandedLoadingScreen />;
  // Was a bare skeleton on a plain white background here — this branch
  // renders on every signed-out page load for the instant before the
  // effect above fires its redirect to /login (see that effect's own
  // comment), so it's not really a "content still loading" state, it's a
  // brief full-page gap exactly like the route Suspense fallback used to
  // be. Same fix: the branded loader instead of a blank-looking page.
  if (!user || user.role !== 'admin') return <BrandedLoadingScreen />;

  const title = location.slice(1).split('/').map((part) => part.replaceAll('-', ' ')).join(' / ') || 'Overview';
  return <div className="admin-shell flex min-h-[100dvh] bg-background"><div className={cn(menuOpen ? 'block' : 'hidden', 'fixed inset-0 z-30 bg-[#102c37]/40 md:hidden')} onClick={() => setMenuOpen(false)} />{(menuOpen || !isMobile) && <SideNav user={user} onClose={() => setMenuOpen(false)} />}<main className="admin-main min-w-0 flex-1"><header className="admin-header sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-10"><div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setMenuOpen(true)} data-testid="button-open-menu"><Menu size={20} /></button><div><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">MedschoolProffs / Admin</div><h1 className="mt-1 text-[17px] font-bold capitalize tracking-[-.02em] text-foreground">{title}</h1></div></div><div className="flex items-center gap-2"><span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-muted-foreground sm:inline-flex"><span className="size-1.5 rounded-full bg-primary" />Workspace live</span><Link href="/notifications" className="relative grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted" data-testid="link-notifications"><Bell size={17} /></Link><Link href="/profile" className="ml-1 grid size-9 place-items-center rounded-full bg-[#d7eee4] text-xs font-extrabold text-[#164b4b]" data-testid="link-header-profile">{initials(user.name)}</Link></div></header><div className="admin-content page-enter px-5 py-7 md:px-10 md:py-9">{children}</div></main></div>;
}

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

export function SkeletonPage() { return <div className="space-y-5"><div className="flex items-center gap-2 text-primary"><BrandSpinner size={22} /><span className="text-[11px] font-bold uppercase tracking-[.1em]">Loading</span></div><div className="skeleton h-8 w-56 rounded-lg" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /></div><div className="skeleton h-72 rounded-2xl" /></div>; }

export function EmptyState({ icon: Icon = FolderOpen, title, body, action }: { icon?: typeof FolderOpen; title: string; body: string; action?: ReactNode }) { return <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"><div><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-primary"><Icon size={22} /></div><h3 className="font-bold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div></div>; }

export function ErrorState({ retry }: { retry?: () => void }) { return <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-6 text-sm text-[#9e4c39]"><div className="flex items-center gap-2 font-bold"><CircleHelp size={17} /> We couldn't load this view.</div><p className="mt-2 text-[#a96a5b]">Check your connection, then try again.</p>{retry && <button onClick={retry} className="mt-4 rounded-lg bg-[#a9533f] px-3 py-2 text-xs font-bold text-white" data-testid="button-retry">Try again</button>}</div>; }

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize', tone === 'green' && 'bg-[#d7eee4] text-[#287058]', tone === 'amber' && 'bg-[#fff0cb] text-[#8d6420]', tone === 'red' && 'bg-[#f9ddd6] text-[#a34c3e]', tone === 'blue' && 'bg-[#dceaf1] text-[#32647b]', tone === 'neutral' && 'bg-muted text-muted-foreground')}>{children}</span>; }

// Round 3, item 5 — compact three-way Easy/Medium/Hard segmented control
// (colored dot + label, one pill highlighted as selected), styled after the
// emedcrack.com reference the admin pointed to, replacing a plain <select>
// for difficulty wherever MCQs render as individual tiles/rows during bulk
// upload/review (the manual single-add form and the MCQ edit form keep
// their existing <select> — those are forms, not per-row tiles, so they
// were out of scope for this swap). Keeps the same 'easy'|'moderate'|'hard'
// values as everywhere else in the app.

export function DifficultyPicker({ value, onChange, testId }: { value: string; onChange: (v: 'easy' | 'moderate' | 'hard') => void; testId?: string }) {
  const options: Array<{ value: 'easy' | 'moderate' | 'hard'; label: string; dot: string; active: string }> = [
    { value: 'easy', label: 'Easy', dot: 'bg-[#3aa66b]', active: 'bg-[#d7eee4] text-[#164b4b] border-[#3aa66b]' },
    { value: 'moderate', label: 'Medium', dot: 'bg-[#e0a72f]', active: 'bg-[#fff0cb] text-[#8d6420] border-[#e0a72f]' },
    { value: 'hard', label: 'Hard', dot: 'bg-[#d1544a]', active: 'bg-[#f9ddd6] text-[#a34c3e] border-[#d1544a]' },
  ];
  return <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background p-1">
    {options.map((opt) => <button key={opt.value} type="button" onClick={() => onChange(opt.value)} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors', value === opt.value ? cn('border', opt.active) : 'text-muted-foreground hover:text-foreground')} data-testid={testId ? `${testId}-${opt.value}` : undefined}><span className={cn('size-1.5 rounded-full', opt.dot)} />{opt.label}</button>)}
  </div>;
}

export function Progress({ value, color = 'bg-primary' }: { value: number; color?: string }) { return <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) { return <div className="mb-5 flex items-end justify-between gap-4"><div>{eyebrow && <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">{eyebrow}</div>}<h2 className="mt-1 text-[22px] font-extrabold tracking-[-.04em]">{title}</h2></div>{action}</div>; }

export function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-card/70 p-3 text-center"><div className="font-display text-2xl">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div></div>; }

export function TeamSection() {
  const q = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const team = q.data?.team || [];
  if (!team.length) return null;
  const card = (m: TeamMember) => <div key={m.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-team-${m.id}`}><div className="flex items-center gap-3">{m.photoPath ? <img src={resolveUploadUrl(m.photoPath)!} alt={m.name} loading="lazy" decoding="async" className="size-14 rounded-full border border-border object-cover" /> : <div className="grid size-14 place-items-center rounded-full bg-[#d7eee4] text-sm font-extrabold text-[#164b4b]">{initials(m.name)}</div>}<div><div className="text-sm font-bold">{m.name}</div><div className="text-xs text-primary">{m.role}</div></div></div>{m.achievementBadge && <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#fdeecb] px-2.5 py-1 text-[10px] font-bold text-[#8a5a12]"><Trophy size={11} /> {m.achievementBadge}</span>}{m.bio && <p className="mt-3 text-xs leading-5 text-muted-foreground">{m.bio}</p>}{(m.linkedinUrl || m.instagramUrl || m.email) && <div className="mt-3 flex gap-2">{m.linkedinUrl && <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">in</a>}{m.instagramUrl && <a href={m.instagramUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">ig</a>}{m.email && <a href={`mailto:${m.email}`} className="grid size-7 place-items-center rounded-full bg-muted hover:bg-primary/10 hover:text-primary"><Mail size={12} /></a>}</div>}</div>;
  return <div className="mt-9"><SectionHeader eyebrow="Behind the platform" title="Our Academic Team" />
    {TEAM_CATEGORIES.map((cat) => { const inCat = team.filter((m) => (m.category ?? 'reviewer') === cat); if (!inCat.length) return null; return <div key={cat} className="mb-6 last:mb-0"><div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{TEAM_CATEGORY_LABELS[cat]}</div><div className="grid gap-4 sm:grid-cols-2">{inCat.map(card)}</div></div>; })}
  </div>;
}

// Audit log actions are consistent SCREAMING_SNAKE_CASE codes (MCQ_CREATED,
// BLOCK_ARCHIVED, ...) — humanized generically rather than via a hardcoded
// per-action lookup table, so it stays correct for every action the backend
// logs today or adds later without needing updates here.

export function humanizeAuditAction(action: string): string {
  const s = action.toLowerCase().replaceAll('_', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Buckets audit-log rows into the last 7 calendar days (today inclusive),
// summing each MCQ-import-shaped action's `metadata.count` (falling back to
// 1 per row if a row has no count) — powers the "MCQ imports" sparkline on
// the overview. MCQS_BULK_IMPORTED is the file-import commit; MCQ_BULK_CREATED
// covers the "add several manually / from AI drafts" flow, which is import-shaped
// in the same "many questions landed at once" sense.

export function buildMcqImportSeries(entries: AuditLogEntry[]): Array<{ date: string; label: string; count: number }> {
  const days: Array<{ date: string; label: string; count: number }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const y = dt.getFullYear(); const m = String(dt.getMonth() + 1).padStart(2, '0'); const dd = String(dt.getDate()).padStart(2, '0');
    days.push({ date: `${y}-${m}-${dd}`, label: dt.toLocaleDateString('en-US', { weekday: 'short' }), count: 0 });
  }
  const indexByDate = new Map(days.map((row, i) => [row.date, i]));
  for (const entry of entries) {
    if (entry.action !== 'MCQS_BULK_IMPORTED' && entry.action !== 'MCQ_BULK_CREATED') continue;
    const idx = indexByDate.get(entry.createdAt.slice(0, 10));
    if (idx === undefined) continue;
    let count = 1;
    if (entry.metadata) { try { const parsed = JSON.parse(entry.metadata); if (typeof parsed.count === 'number') count = parsed.count; } catch { /* ignore malformed metadata */ } }
    days[idx].count += count;
  }
  return days;
}

export function StudentDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const detail = useQuery({ queryKey: ['student-detail', id], queryFn: () => studentsAdminApi.detail(id) });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['student-detail', id] }); queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() }); };
  const updateStatus = useMutation({
    mutationFn: ({ status, emailVerified }: { status: string; emailVerified?: boolean }) => studentsAdminApi.updateStatus(id, status, emailVerified),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not update status', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — check your connection and try again.', variant: 'destructive' }),
  });
  const verifyEmail = useMutation({
    mutationFn: () => studentsAdminApi.verifyEmail(id),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not verify email', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — check your connection and try again.', variant: 'destructive' }),
  });
  const [trialDays, setTrialDays] = useState(7);
  const startTrial = useMutation({
    mutationFn: (durationDays: number) => studentsAdminApi.startTrial(id, durationDays),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not start trial', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — check your connection and try again.', variant: 'destructive' }),
  });
  const endTrial = useMutation({
    mutationFn: () => studentsAdminApi.endTrial(id),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not end trial', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — check your connection and try again.', variant: 'destructive' }),
  });
  const s: StudentDetail | undefined = detail.data;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}><div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-2xl">
    <div className="flex items-center justify-between"><h3 className="text-lg font-extrabold">Student profile</h3><button onClick={onClose} className="rounded-lg p-2 hover:bg-muted" data-testid="button-close-drawer"><X size={16} /></button></div>
    {!s ? <div className="mt-8"><InlineLoading /></div> : <div className="mt-6 space-y-6">
      <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-full bg-[#d7eee4] text-sm font-extrabold text-[#164b4b]">{initials(s.name)}</div><div><div className="font-bold">{s.name}</div><div className="text-xs text-muted-foreground">{s.email}</div></div></div>
      <div className="grid grid-cols-2 gap-3 text-xs"><div><div className="text-muted-foreground">Phone</div><div className="mt-0.5 font-bold">{s.phone || '—'}</div></div><div><div className="text-muted-foreground">Roll number</div><div className="mt-0.5 font-bold">{s.rollNumber || '—'}</div></div><div><div className="text-muted-foreground">Institution</div><div className="mt-0.5 font-bold">{s.institution || '—'}</div></div><div><div className="text-muted-foreground">Programme</div><div className="mt-0.5 font-bold">{s.program || '—'}</div></div><div><div className="text-muted-foreground">Year / batch</div><div className="mt-0.5 font-bold">{s.academicYear || '—'} · {s.batch || '—'}</div></div><div><div className="text-muted-foreground">Streak</div><div className="mt-0.5 font-bold">{s.currentStreak}d (best {s.longestStreak}d)</div></div><div><div className="text-muted-foreground">Joined</div><div className="mt-0.5 font-bold">{new Date(s.joinedAt).toLocaleDateString()}</div></div><div><div className="text-muted-foreground">Email verified</div>{s.emailVerified ? <div className="mt-0.5 font-bold text-primary">Yes</div> : <button onClick={() => verifyEmail.mutate()} disabled={verifyEmail.isPending} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-extrabold text-destructive underline disabled:opacity-50" data-testid="button-verify-email">{verifyEmail.isPending ? 'Verifying…' : 'No · verify now'}</button>}</div></div>
      {s.activeMembership && !s.activeMembership.isTrial && <div className="rounded-xl bg-[#eef7f1] p-3 text-xs font-semibold text-primary">Active membership until {new Date(s.activeMembership.expiresAt).toLocaleDateString()}</div>}
      {!s.emailVerified && s.status !== 'ACTIVE' && <div className="rounded-xl border border-[#e5a952]/40 bg-[#fdf6e8] p-3 text-[11px] leading-5 text-[#8a5a12]"><strong>Heads up:</strong> this student's email isn't verified yet, so they can't sign in at all even if you set their status below — the "No · verify now" link above (or "Activate now" here) clears that separately.</div>}
      <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Account status</span>{s.status !== 'ACTIVE' && <button onClick={() => updateStatus.mutate({ status: 'ACTIVE', emailVerified: true })} disabled={updateStatus.isPending} className="rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-activate-now">{updateStatus.isPending ? 'Activating…' : 'Activate now'}</button>}</div><p className="mb-2 text-[11px] text-muted-foreground">Status controls what the student can access. Moving to Verified, Payment review, or Active also clears the email-verification gate automatically.</p><div className="flex flex-wrap gap-2">{STUDENT_STATUSES.filter((status) => status !== 'DELETED').map((status) => <button key={status} onClick={() => updateStatus.mutate({ status })} disabled={updateStatus.isPending} className={cn('rounded-lg px-2.5 py-1.5 text-[10px] font-bold', s.status === status ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')} data-testid={`button-status-${status}`}>{status.replace(/_/g, ' ')}</button>)}</div></div>
      {/* Trial mode: grant temporary access for a chosen number of days
          without a payment, or end it early. Uses the same membership
          grant as "Activate now" above, just tagged isTrial so it shows
          up distinctly here and the admin can revoke it before it expires
          without having to remember to also downgrade the account status. */}
      <div><div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Trial access</div>
        {s.activeMembership?.isTrial
          ? <div className="flex items-center justify-between rounded-xl bg-[#dceaf1] p-3 text-xs font-semibold text-[#2c6a8f]"><span>Trial active until {new Date(s.activeMembership.expiresAt).toLocaleDateString()}</span><button onClick={() => endTrial.mutate()} disabled={endTrial.isPending} className="rounded-lg bg-white/70 px-2.5 py-1.5 text-[10px] font-extrabold text-[#2c6a8f] disabled:opacity-50" data-testid="button-end-trial">{endTrial.isPending ? 'Ending…' : 'End trial'}</button></div>
          : <div className="flex items-center gap-2"><input type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" data-testid="input-trial-days" /><span className="text-[11px] text-muted-foreground">days</span><button onClick={() => startTrial.mutate(trialDays)} disabled={startTrial.isPending} className="ml-auto rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-start-trial">{startTrial.isPending ? 'Starting…' : 'Start trial'}</button></div>}
      </div>
      <div><div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Payment history</div><div className="space-y-2">{s.payments.map((p) => <div key={p.id} className="rounded-lg border border-border p-3 text-xs"><div className="flex items-center justify-between"><span className="font-bold">{p.planName}</span><Badge tone={p.status === 'APPROVED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'}>{p.status}</Badge></div><div className="mt-1 text-muted-foreground">{money(p.amount, p.currency)} · {p.method} · {p.paymentDate}</div>{p.proofPath && <a href={resolveUploadUrl(p.proofPath)!} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-primary" data-testid={`link-drawer-proof-${p.id}`}><FileText size={11} /> View payment proof</a>}</div>)}{!s.payments.length && <p className="text-xs text-muted-foreground">No payments yet.</p>}</div></div>
    </div>}
  </div></div>;
}

export function PaymentProofsTab() {
  const q = useListPayments();
  const [filter, setFilter] = useState('all');
  const FILTERS: Array<{ key: string; label: string }> = [{ key: 'all', label: 'all' }, { key: 'PAYMENT_PENDING_REVIEW', label: 'pending' }, { key: 'APPROVED', label: 'approved' }, { key: 'REJECTED', label: 'rejected' }, { key: 'VOIDED', label: 'voided' }];
  const approve = useApprovePayment();
  const reject = useRejectPayment();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const removePaymentPermanent = useMutation({ mutationFn: paymentsAdminApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete payment', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const payments = (q.data ?? []).filter((p) => filter === 'all' || p.status === filter);
  const doApprove = (p: Payment) => approve.mutate({ id: p.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() }) });
  const doReject = (p: Payment) => { if (!reason.trim()) return; reject.mutate({ id: p.id, data: { reason: reason.trim() } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() }); setRejectingId(null); setReason(''); } }); };
  const isImage = (url: string) => /\.(png|jpe?g|webp)$/i.test(url);

  return <div><div className="mb-4 flex justify-end"><div className="flex rounded-xl border border-border bg-card p-1">{FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold capitalize', filter === f.key && 'bg-muted text-primary')} data-testid={`button-payment-filter-${f.label}`}>{f.label}</button>)}</div></div>{q.isLoading ? <SkeletonPage /> : <div className="space-y-3">{payments.map((p) => <div key={p.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-payment-review-${p.id}`}><div className="flex flex-col gap-4 md:flex-row md:items-start"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#fff0cb] text-[#94651c]"><ReceiptText size={19} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold">{p.studentName}</span><Badge tone={paymentStatusTone(p.status)}>{paymentStatusLabel(p.status)}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{p.institution} · {p.program} · {p.planName}</div><div className="mt-2 font-mono-app text-[10px] text-muted-foreground">{p.method} · {p.reference} · {p.paymentDate}</div></div><div className="flex items-center gap-4"><div className="text-right"><div className="font-display text-2xl">{money(p.amount, p.currency)}</div><div className="text-[10px] text-muted-foreground">Submitted {p.submittedAt.slice(0, 10)}</div></div><div className="flex gap-2">{p.status === 'PAYMENT_PENDING_REVIEW' && <><button onClick={() => setRejectingId(rejectingId === p.id ? null : p.id)} className="grid size-9 place-items-center rounded-xl border border-border text-[#a34c3e] hover:bg-[#fff1ed]" data-testid={`button-reject-payment-${p.id}`}><X size={16} /></button><button onClick={() => doApprove(p)} className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90" data-testid={`button-approve-payment-${p.id}`}><Check size={16} /></button></>}<button onClick={() => setDeletingId(p.id)} className="grid size-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-payment-${p.id}`}><Trash2 size={16} /></button></div></div></div>
    {p.proofPath && (() => { const url = resolveUploadUrl(p.proofPath)!; return <div className="mt-4 border-t border-border pt-4">{isImage(p.proofPath!) ? <a href={url} target="_blank" rel="noreferrer" data-testid={`link-proof-${p.id}`}><img src={url} alt="Payment proof" loading="lazy" decoding="async" className="max-h-64 rounded-xl border border-border object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const fallback = e.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.display = 'flex'; }} /></a> : <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold" data-testid={`link-proof-${p.id}`}><FileText size={14} /> View payment proof</a>}{isImage(p.proofPath!) && <div style={{ display: 'none' }} className="hidden max-h-64 items-center gap-2 rounded-xl border border-dashed border-border bg-muted px-3 py-4 text-xs font-semibold text-muted-foreground"><FileText size={14} /> Couldn't load the proof image — <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">open it directly</a> instead.</div>}</div>; })()}
    {rejectingId === p.id && <div className="mt-4 flex gap-2 border-t border-border pt-4"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (shown to student)" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-reject-reason-${p.id}`} /><button onClick={() => doReject(p)} disabled={!reason.trim()} className="rounded-lg bg-destructive px-4 text-xs font-bold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirm-reject-${p.id}`}>Confirm reject</button></div>}
  </div>)}{!payments.length && <EmptyState icon={ReceiptText} title="Queue is clear" body="No payment submissions match this filter." />}</div>}{deletingId !== null && <ConfirmDialog title="Permanently delete this payment?" body="This erases the submission for good. If it already activated a membership, that membership itself is not revoked automatically." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removePaymentPermanent.mutate(deletingId)} pending={removePaymentPermanent.isPending} />}</div>;
}

export const YEAR_OPTIONS = [1, 2, 3, 4, 5];

export function ModuleTargetingFields({ programTargetKind, yearTargetNumber, onChange }: { programTargetKind: string; yearTargetNumber: string; onChange: (patch: { programTargetKind?: string; yearTargetNumber?: string }) => void }) {
  return <div className="flex flex-wrap gap-3"><label className="text-xs font-bold">Program<select value={programTargetKind} onChange={(e) => onChange({ programTargetKind: e.target.value })} className="mt-1 h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-module-program-target"><option value="">All Programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select></label><label className="text-xs font-bold">Academic year<select value={yearTargetNumber} onChange={(e) => onChange({ yearTargetNumber: e.target.value })} className="mt-1 h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-module-year-target"><option value="">All Years</option>{YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}{y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year</option>)}</select></label></div>;
}

// A single module row — exactly the markup AdminContent always rendered,
// just extracted so it can be reused inside each block's group and inside
// the "Unassigned modules" group without redesigning it.

export function ModuleRow({ m, canMoveUp, canMoveDown, onReorder, update, curriculumId, setCurriculumId, editingId, setEditingId, editProgram, setEditProgram, editYear, setEditYear, setDeletingId }: {
  m: AdminModule; canMoveUp: boolean; canMoveDown: boolean; onReorder: (direction: 'up' | 'down') => void;
  update: ReturnType<typeof useMutation<AdminModule, unknown, { id: number; body: Parameters<typeof moduleAdminApi.update>[1] }>>;
  curriculumId: number | null; setCurriculumId: (id: number | null) => void;
  editingId: number | null; setEditingId: (id: number | null) => void;
  editProgram: string; setEditProgram: (v: string) => void; editYear: string; setEditYear: (v: string) => void;
  setDeletingId: (id: number) => void;
}) {
  return <div className="border-b border-border p-5 last:border-0" data-testid={`row-content-module-${m.id}`}>
    <div className="flex items-center gap-4">
      <div className="flex flex-col gap-0.5">
        <button onClick={() => onReorder('up')} disabled={!canMoveUp || update.isPending} className="rounded p-0.5 text-muted-foreground disabled:opacity-25 hover:bg-muted" data-testid={`button-module-move-up-${m.id}`}><ChevronUp size={13} /></button>
        <button onClick={() => onReorder('down')} disabled={!canMoveDown || update.isPending} className="rounded p-0.5 text-muted-foreground disabled:opacity-25 hover:bg-muted" data-testid={`button-module-move-down-${m.id}`}><ChevronDown size={13} /></button>
      </div>
      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#d7eee4] text-primary">{m.iconUrl ? <img src={m.iconUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <BookOpen size={18} />}</div>
      <div className="flex-1"><div className="text-sm font-bold">{m.name}</div><div className="mt-1 text-xs text-muted-foreground">{m.subjectCount} subjects · {m.topicCount} topics</div></div>
      <button onClick={() => update.mutate({ id: m.id, body: { active: !m.active } })} disabled={update.isPending} data-testid={`button-toggle-published-${m.id}`}><Badge tone={m.active ? 'green' : 'neutral'}>{m.active ? 'published' : 'draft'}</Badge></button>
      <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground" data-testid={`text-targeting-${m.id}`}>{m.targetingLabel || 'All Programs + All Years'}</span>
      <button onClick={() => setCurriculumId(curriculumId === m.id ? null : m.id)} className={cn('rounded-lg px-3 py-2 text-[11px] font-bold', curriculumId === m.id ? 'bg-[#eef7f1] text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-manage-curriculum-${m.id}`}>{curriculumId === m.id ? 'Hide subjects' : 'Subjects & topics'}</button>
      <button onClick={() => { if (editingId === m.id) { setEditingId(null); } else { setEditingId(m.id); setEditProgram(m.programTargetKind || ''); setEditYear(m.yearTargetNumber ? String(m.yearTargetNumber) : ''); } }} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" data-testid={`button-content-menu-${m.id}`}><Pencil size={15} /></button>
      <button onClick={() => setDeletingId(m.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-module-${m.id}`}><Trash2 size={15} /></button>
    </div>
    {editingId === m.id && <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4"><ModuleTargetingFields programTargetKind={editProgram} yearTargetNumber={editYear} onChange={(patch) => { if (patch.programTargetKind !== undefined) setEditProgram(patch.programTargetKind); if (patch.yearTargetNumber !== undefined) setEditYear(patch.yearTargetNumber); }} /><button onClick={() => update.mutate({ id: m.id, body: { programTargetKind: editProgram || null, yearTargetNumber: editYear ? Number(editYear) : null } }, { onSuccess: () => setEditingId(null) } as never)} className="h-10 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground" data-testid={`button-save-targeting-${m.id}`}>Update visibility</button></div>}
    {curriculumId === m.id && <div className="mt-4 border-t border-border pt-4"><SubjectsTopicsManager moduleId={m.id} breadcrumb={`${m.blockName || 'Other modules'} > ${m.name}`} /></div>}
  </div>;
}

// The "Add module" form, scoped to a specific block (or null for
// Unassigned) — pre-fills blockId so a module created from inside a block's
// section lands in that block.
//
// Round 3, item 7: dropped the "Subtitle" input (name + thumbnail only,
// same as the block form) and added the same optional-thumbnail upload
// blocks already had — modules previously had no thumbnail field at all.

export function AddModuleForm({ blockId, onCreate, onDone }: { blockId: number | null; onCreate: ReturnType<typeof useMutation<AdminModule, unknown, Parameters<typeof moduleAdminApi.create>[0]>>; onDone: () => void }) {
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  return <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onCreate.mutate({ name: String(f.get('name')), subtitle: '', active: true, blockId, iconPath: iconPath ?? undefined, programTargetKind: program || null, yearTargetNumber: year ? Number(year) : null }, { onSuccess: onDone }); }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
    <input required name="name" placeholder="Module name" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-module-name" />
    <AdminImageUpload currentUrl={iconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId="input-module-icon-upload" onUploaded={(storagePath, previewUrl) => { setIconPath(storagePath); setIconPreview(previewUrl); }} />
    <ModuleTargetingFields programTargetKind={program} yearTargetNumber={year} onChange={(patch) => { if (patch.programTargetKind !== undefined) setProgram(patch.programTargetKind); if (patch.yearTargetNumber !== undefined) setYear(patch.yearTargetNumber); }} />
    <p className="text-[11px] text-muted-foreground">This module will be visible to: <span className="font-bold text-primary">{(program || 'All Programs')} + {(year ? `${year}${year === '1' ? 'st' : year === '2' ? 'nd' : year === '3' ? 'rd' : 'th'} Year` : 'All Years')}</span></p>
    <button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="button-save-module">Save</button>
  </form>;
}

// The "Add block" / edit-block form, with an optional thumbnail upload
// (reuses AdminImageUpload the same way the payment QR code does).
//
// Round 3, item 7: dropped the "Subtitle" input — name + thumbnail only.
// Nothing downstream reads block.subtitle for display anymore either (the
// student Blocks/BlockDetail hero cards show only the name over the
// thumbnail); the field itself stays in the schema/API as an optional,
// no-longer-editable legacy value rather than being ripped out everywhere,
// so any block created before this change doesn't lose the text it has.

export function BlockForm({ initial, onSubmit, pending, onCancel }: { initial?: AdminBlock; onSubmit: (body: Parameters<typeof blockAdminApi.create>[0]) => void; pending: boolean; onCancel: () => void }) {
  const [program, setProgram] = useState(initial?.programTargetKind || '');
  const [year, setYear] = useState(initial?.yearTargetNumber ? String(initial.yearTargetNumber) : '');
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(initial?.iconUrl ?? null);
  return <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSubmit({ name: String(f.get('name')), subtitle: initial?.subtitle || '', active: true, iconPath: iconPath ?? undefined, programTargetKind: program || null, yearTargetNumber: year ? Number(year) : null }); }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
    <input required name="name" defaultValue={initial?.name} placeholder="Block name (e.g. Block A)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-block-name" />
    <AdminImageUpload currentUrl={iconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId="input-block-icon-upload" onUploaded={(storagePath, previewUrl) => { setIconPath(storagePath); setIconPreview(previewUrl); }} />
    <ModuleTargetingFields programTargetKind={program} yearTargetNumber={year} onChange={(patch) => { if (patch.programTargetKind !== undefined) setProgram(patch.programTargetKind); if (patch.yearTargetNumber !== undefined) setYear(patch.yearTargetNumber); }} />
    <div className="flex gap-2"><button disabled={pending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="button-save-block">Save</button><button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground">Cancel</button></div>
  </form>;
}

export function SubjectsTopicsManager({ moduleId, breadcrumb }: { moduleId: number; breadcrumb?: string }) {
  const subjectsQ = useQuery({ queryKey: ['admin-subjects', moduleId], queryFn: () => subjectAdminApi.list(moduleId) });
  const subjects = [...(subjectsQ.data ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const [expandedSubjectId, setExpandedSubjectId] = useState<number | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectIcon, setNewSubjectIcon] = useState<string | null>(null);
  const [newSubjectIconPreview, setNewSubjectIconPreview] = useState<string | null>(null);
  const [deletingSubjectId, setDeletingSubjectId] = useState<number | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editSubjectName, setEditSubjectName] = useState('');
  // undefined = thumbnail left as-is; null/string = explicitly changed.
  const [editSubjectIcon, setEditSubjectIcon] = useState<string | null | undefined>(undefined);
  const [editSubjectIconPreview, setEditSubjectIconPreview] = useState<string | null>(null);

  const invalidateSubjects = () => { queryClient.invalidateQueries({ queryKey: ['admin-subjects', moduleId] }); queryClient.invalidateQueries({ queryKey: ['admin-subjects-all'] }); };
  const createSubject = useMutation({ mutationFn: subjectAdminApi.create, onSuccess: () => { invalidateSubjects(); setNewSubjectName(''); setNewSubjectIcon(null); setNewSubjectIconPreview(null); }, onError: (err: unknown) => toast({ title: 'Could not create subject', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const updateSubject = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof subjectAdminApi.update>[1] }) => subjectAdminApi.update(id, body), onSuccess: () => { invalidateSubjects(); setEditingSubjectId(null); }, onError: (err: unknown) => toast({ title: 'Could not update subject', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removeSubject = useMutation({ mutationFn: subjectAdminApi.remove, onSuccess: () => { invalidateSubjects(); setDeletingSubjectId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete subject', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  // Renumber-the-whole-list reorder (same fix as AdminInstitutionsList) —
  // avoids the "swap two rows that share the same displayOrder does
  // nothing" trap that made the institution arrows silently do nothing.
  const reorderSubjects = useMutation({
    mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => subjectAdminApi.update(r.id, { displayOrder: r.displayOrder }))),
    onSuccess: invalidateSubjects,
    onError: (err: unknown) => toast({ title: 'Could not reorder subjects', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const moveSubject = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= subjects.length || reorderSubjects.isPending) return;
    const reordered = [...subjects];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderSubjects.mutate(reordered.map((s, i) => ({ id: s.id, displayOrder: i })));
  };
  const startEditSubject = (s: AdminSubject) => { setEditingSubjectId(s.id); setEditSubjectName(s.name); setEditSubjectIcon(undefined); setEditSubjectIconPreview(s.iconUrl ?? null); };

  return <div className="rounded-2xl bg-muted/40 p-4">
    {/* Makes the Block > Module > Subjects nesting explicit at the point
        subjects/topics are managed, instead of only being implied by which
        collapsible section this drawer happens to be open under. */}
    {breadcrumb && <div className="mb-2 text-[10px] font-semibold text-muted-foreground" data-testid="text-curriculum-breadcrumb">{breadcrumb} <ChevronRight size={10} className="mx-0.5 inline" /> Subjects</div>}
    <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Subjects</div>
    <div className="space-y-2">{subjects.map((s, i) => <div key={s.id} className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3">
        <div className="flex shrink-0 flex-col">
          <button type="button" disabled={i === 0 || reorderSubjects.isPending} onClick={() => moveSubject(i, -1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-up-subject-${s.id}`} aria-label="Move up"><ChevronUp size={12} /></button>
          <button type="button" disabled={i === subjects.length - 1 || reorderSubjects.isPending} onClick={() => moveSubject(i, 1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-down-subject-${s.id}`} aria-label="Move down"><ChevronDown size={12} /></button>
        </div>
        {s.iconUrl && <img src={resolveUploadUrl(s.iconUrl)} alt="" loading="lazy" decoding="async" className="size-8 shrink-0 rounded-lg object-cover" data-testid={`img-subject-thumbnail-${s.id}`} />}
        <button onClick={() => setExpandedSubjectId(expandedSubjectId === s.id ? null : s.id)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`row-subject-${s.id}`}><ChevronRight size={13} className={cn('transition-transform', expandedSubjectId === s.id && 'rotate-90')} /> {s.name} <span className="font-normal text-muted-foreground">· {s.topicCount} topics</span></button>
        <button onClick={() => startEditSubject(s)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-subject-${s.id}`}><Pencil size={13} /></button>
        <button onClick={() => setDeletingSubjectId(s.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-subject-${s.id}`}><Trash2 size={13} /></button>
      </div>
      {editingSubjectId === s.id && <form onSubmit={(e) => { e.preventDefault(); if (!editSubjectName.trim()) return; updateSubject.mutate({ id: s.id, body: { name: editSubjectName.trim(), ...(editSubjectIcon !== undefined ? { iconPath: editSubjectIcon } : {}) } }); }} className="space-y-2 border-t border-border p-3">
        <input autoFocus value={editSubjectName} onChange={(e) => setEditSubjectName(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-rename-subject-${s.id}`} />
        <AdminImageUpload currentUrl={editSubjectIconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId={`input-subject-icon-upload-${s.id}`} onUploaded={(storagePath, previewUrl) => { setEditSubjectIcon(storagePath); setEditSubjectIconPreview(previewUrl); }} />
        <div className="flex gap-2"><button type="submit" disabled={updateSubject.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-subject-${s.id}`}>Save</button><button type="button" onClick={() => setEditingSubjectId(null)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground" data-testid={`button-cancel-edit-subject-${s.id}`}>Cancel</button></div>
      </form>}
      {expandedSubjectId === s.id && <div className="border-t border-border p-3"><TopicsManager subjectId={s.id} /></div>}
    </div>)}{!subjects.length && <p className="text-xs text-muted-foreground">No subjects yet — add one below.</p>}</div>
    <form onSubmit={(e) => { e.preventDefault(); if (newSubjectName.trim()) createSubject.mutate({ moduleId, name: newSubjectName.trim(), active: true, iconPath: newSubjectIcon ?? undefined }); }} className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
      <input value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="Add subject, e.g. Anatomy" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-add-subject" />
      <AdminImageUpload currentUrl={newSubjectIconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId="input-new-subject-icon-upload" onUploaded={(storagePath, previewUrl) => { setNewSubjectIcon(storagePath); setNewSubjectIconPreview(previewUrl); }} />
      <button type="submit" disabled={createSubject.isPending || !newSubjectName.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-add-subject">Add subject</button>
    </form>
    {deletingSubjectId !== null && <ConfirmDialog title="Delete this subject?" body="Its topics go with it. MCQs already tagged to it are kept but will need a new home." onCancel={() => setDeletingSubjectId(null)} onConfirm={() => removeSubject.mutate(deletingSubjectId)} pending={removeSubject.isPending} />}
  </div>;
}

export function TopicsManager({ subjectId }: { subjectId: number }) {
  const topicsQ = useQuery({ queryKey: ['admin-topics', subjectId], queryFn: () => topicAdminApi.list(subjectId) });
  const topics = [...(topicsQ.data ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const [newTopicName, setNewTopicName] = useState('');
  const [deletingTopicId, setDeletingTopicId] = useState<number | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
  const [editTopicName, setEditTopicName] = useState('');
  const invalidateTopics = () => { queryClient.invalidateQueries({ queryKey: ['admin-topics', subjectId] }); queryClient.invalidateQueries({ queryKey: ['admin-topics-all'] }); };
  const createTopic = useMutation({ mutationFn: topicAdminApi.create, onSuccess: () => { invalidateTopics(); setNewTopicName(''); }, onError: (err: unknown) => toast({ title: 'Could not create topic', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const updateTopic = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof topicAdminApi.update>[1] }) => topicAdminApi.update(id, body), onSuccess: () => { invalidateTopics(); setEditingTopicId(null); }, onError: (err: unknown) => toast({ title: 'Could not rename topic', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removeTopic = useMutation({ mutationFn: topicAdminApi.remove, onSuccess: () => { invalidateTopics(); setDeletingTopicId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete topic', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const reorderTopics = useMutation({
    mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => topicAdminApi.update(r.id, { displayOrder: r.displayOrder }))),
    onSuccess: invalidateTopics,
    onError: (err: unknown) => toast({ title: 'Could not reorder topics', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const moveTopic = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= topics.length || reorderTopics.isPending) return;
    const reordered = [...topics];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderTopics.mutate(reordered.map((t, i) => ({ id: t.id, displayOrder: i })));
  };

  return <div>
    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Topics</div>
    <div className="space-y-1.5">{topics.map((t, i) => <div key={t.id} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs" data-testid={`row-topic-${t.id}`}>
      {editingTopicId === t.id
        ? <form onSubmit={(e) => { e.preventDefault(); if (editTopicName.trim()) updateTopic.mutate({ id: t.id, body: { name: editTopicName.trim() } }); }} className="flex items-center gap-1.5">
            <input autoFocus value={editTopicName} onChange={(e) => setEditTopicName(e.target.value)} className="h-7 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-rename-topic-${t.id}`} />
            <button type="submit" disabled={updateTopic.isPending} className="rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground" data-testid={`button-save-topic-${t.id}`}>Save</button>
            <button type="button" onClick={() => setEditingTopicId(null)} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold" data-testid={`button-cancel-edit-topic-${t.id}`}>Cancel</button>
          </form>
        : <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 items-center gap-1.5 min-w-0">
              <div className="flex shrink-0 flex-col">
                <button type="button" disabled={i === 0 || reorderTopics.isPending} onClick={() => moveTopic(i, -1)} className="grid size-3.5 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-up-topic-${t.id}`} aria-label="Move up"><ChevronUp size={11} /></button>
                <button type="button" disabled={i === topics.length - 1 || reorderTopics.isPending} onClick={() => moveTopic(i, 1)} className="grid size-3.5 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-down-topic-${t.id}`} aria-label="Move down"><ChevronDown size={11} /></button>
              </div>
              <span className="truncate">{t.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => { setEditingTopicId(t.id); setEditTopicName(t.name); }} className="text-muted-foreground hover:text-foreground" data-testid={`button-edit-topic-${t.id}`}><Pencil size={12} /></button>
              <button onClick={() => setDeletingTopicId(t.id)} className="text-muted-foreground hover:text-destructive" data-testid={`button-delete-topic-${t.id}`}><Trash2 size={12} /></button>
            </div>
          </div>}
    </div>)}{!topics.length && <p className="text-xs text-muted-foreground">No topics yet.</p>}</div>
    <form onSubmit={(e) => { e.preventDefault(); if (newTopicName.trim()) createTopic.mutate({ subjectId, name: newTopicName.trim(), active: true }); }} className="mt-2 flex gap-2"><input value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="Add topic..." className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid="input-add-topic" /><button disabled={createTopic.isPending} className="rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-add-topic"><Plus size={12} /></button></form>
    {deletingTopicId !== null && <ConfirmDialog title="Delete this topic?" body="MCQs already tagged to it are kept but will need a new home." onCancel={() => setDeletingTopicId(null)} onConfirm={() => removeTopic.mutate(deletingTopicId)} pending={removeTopic.isPending} />}
  </div>;
}

// Standalone "Subjects" settings page — same capability as
// SubjectsTopicsManager (rename, thumbnail, reorder, delete) but reached
// from its own nav entry instead of nested under a specific module in
// Academic content, and showing every subject across every module at
// once (grouped by module, filterable to one).

export function ExplanationCoverage({ onSelectStatus }: { onSelectStatus?: (status: ExplanationStatus) => void }) {
  const summaryQ = useQuery({ queryKey: ['explanation-summary'], queryFn: explanationsApi.summary });
  const bulkGenerate = useMutation({
    mutationFn: () => explanationsApi.bulkGenerate({ limit: 25 }),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ['explanation-summary'] }); queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); alert(`Generated ${res.generated} explanations${res.failed ? `, ${res.failed} failed` : ''}.`); },
  });
  const s = summaryQ.data;
  const pending = s?.PENDING ?? 0;
  return <div className="mb-6 rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Explanation coverage</h3><p className="mt-1 text-xs text-muted-foreground">Explanations imported or written by hand start as Approved. Missing ones start Pending — generate them with AI, then review. Click a number to jump to just those questions.</p></div>{pending > 0 && <button onClick={() => bulkGenerate.mutate()} disabled={bulkGenerate.isPending} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-bulk-generate-explanations"><Sparkles size={13} /> {bulkGenerate.isPending ? 'Generating…' : `Generate up to 25 (${pending} pending)`}</button>}</div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{(['PENDING', 'AI_GENERATED', 'REVIEWED', 'APPROVED'] as const).map((status) => <button key={status} type="button" onClick={() => onSelectStatus?.(status)} className="rounded-xl bg-muted p-3 text-center transition-colors hover:bg-primary/10" data-testid={`button-filter-explanation-${status}`}><div className="font-display text-xl">{s?.[status] ?? 0}</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{status.replace('_', ' ')}</div></button>)}</div>
  </div>;
}

export function McqExplanationRow({ mcq }: { mcq: { id: number; explanation?: string | null; explanationStatus?: ExplanationStatus } }) {
  const status = mcq.explanationStatus ?? (mcq.explanation ? 'APPROVED' : 'PENDING');
  const generate = useMutation({ mutationFn: () => explanationsApi.generate(mcq.id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['explanation-summary'] }); }, onError: (err: unknown) => toast({ title: 'Could not generate explanation', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — check your connection and try again.', variant: 'destructive' }) });
  const setStatus = useMutation({ mutationFn: (s: ExplanationStatus) => explanationsApi.setStatus(mcq.id, s), onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['explanation-summary'] }); }, onError: (err: unknown) => toast({ title: 'Could not update explanation status', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — check your connection and try again.', variant: 'destructive' }) });
  const reject = useMutation({ mutationFn: () => explanationsApi.reject(mcq.id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['explanation-summary'] }); }, onError: (err: unknown) => toast({ title: 'Could not reject explanation', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — check your connection and try again.', variant: 'destructive' }) });
  const toneByStatus: Record<ExplanationStatus, 'amber' | 'blue' | 'green'> = { PENDING: 'amber', AI_GENERATED: 'blue', REVIEWED: 'blue', APPROVED: 'green' };

  return <div className="mt-3 border-t border-border pt-3"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Explanation:</span><Badge tone={toneByStatus[status]}>{status.replace('_', ' ')}</Badge>
    {status === 'PENDING' && <button onClick={() => generate.mutate()} disabled={generate.isPending} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold disabled:opacity-50" data-testid={`button-generate-explanation-${mcq.id}`}><Sparkles size={11} /> {generate.isPending ? 'Generating…' : 'Generate with AI'}</button>}
    {status === 'AI_GENERATED' && <><button onClick={() => setStatus.mutate('APPROVED')} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-primary" data-testid={`button-approve-explanation-${mcq.id}`}>Approve</button><button onClick={() => reject.mutate()} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-destructive" data-testid={`button-reject-explanation-${mcq.id}`}>Reject</button></>}
    {status === 'REVIEWED' && <button onClick={() => setStatus.mutate('APPROVED')} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-primary" data-testid={`button-approve-explanation-${mcq.id}`}>Approve</button>}
  </div>{mcq.explanation && <p className="mt-2 text-xs leading-5 text-muted-foreground">{mcq.explanation}</p>}{generate.isError && <p className="mt-1 text-[11px] font-semibold text-destructive">{generate.error instanceof ApiRequestError ? generate.error.message : 'Generation failed.'}</p>}</div>;
}

// MCQ edit form — question text, options (up to 5), correct-answer select,
// explanation. Used both inline (tree view leaf) and could be reused
// elsewhere; kept self-contained with its own save mutation.

export function McqEditForm({ mcq, onDone }: { mcq: AdminMcqRow; onDone: () => void }) {
  const [question, setQuestion] = useState(mcq.question);
  const [options, setOptions] = useState<string[]>([...mcq.options, '', '', '', '', ''].slice(0, 5));
  const [correctAnswer, setCorrectAnswer] = useState(mcq.correctAnswer ?? '');
  const [explanation, setExplanation] = useState(mcq.explanation ?? '');
  const [status, setStatus] = useState(mcq.status);
  const [difficulty, setDifficulty] = useState(mcq.difficulty || 'moderate');
  const save = useMutation({
    mutationFn: () => mcqAdminApi.update(mcq.id, {
      question: question.trim(),
      options: options.map((o) => o.trim()).filter(Boolean),
      correctAnswer: correctAnswer.trim() || null,
      explanation: explanation.trim() || null,
      status,
      difficulty,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] }); queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); onDone(); toast({ title: 'Question updated' }); },
    onError: (err: unknown) => toast({ title: 'Could not save question', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const cleanedOptions = options.map((o) => o.trim()).filter(Boolean);
  return <div className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-[#eef7f1] p-4">
    <textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-14 w-full rounded-lg border border-border bg-card p-2 text-xs" data-testid={`input-edit-mcq-question-${mcq.id}`} />
    <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3, 4].map((oi) => <input key={oi} value={options[oi] || ''} onChange={(e) => { const next = [...options]; next[oi] = e.target.value; setOptions(next); }} placeholder={`Option ${String.fromCharCode(65 + oi)}${oi === 4 ? ' (optional)' : ''}`} className="h-9 rounded-lg border border-border bg-card px-2 text-xs" data-testid={`input-edit-mcq-option-${mcq.id}-${oi}`} />)}</div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold text-muted-foreground">Correct:</span>
      <select value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className="h-8 flex-1 rounded-lg border border-border bg-card px-2 text-xs" data-testid={`select-edit-mcq-answer-${mcq.id}`}><option value="">Not set</option>{cleanedOptions.map((opt, oi) => <option key={oi} value={opt}>{String.fromCharCode(65 + oi)}. {opt.slice(0, 40)}</option>)}</select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs" data-testid={`select-edit-mcq-status-${mcq.id}`}><option value="draft">Draft</option><option value="published">Published</option></select>
      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs capitalize" data-testid={`select-edit-mcq-difficulty-${mcq.id}`}>{['easy', 'moderate', 'hard'].map((x) => <option key={x} value={x}>{x}</option>)}</select>
    </div>
    <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explanation (optional)" className="min-h-12 w-full rounded-lg border border-border bg-card p-2 text-xs" data-testid={`input-edit-mcq-explanation-${mcq.id}`} />
    <div className="flex gap-2"><button onClick={() => save.mutate()} disabled={save.isPending || !question.trim() || cleanedOptions.length < 2} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-edit-mcq-${mcq.id}`}>{save.isPending ? 'Saving…' : 'Save changes'}</button><button onClick={onDone} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-cancel-edit-mcq-${mcq.id}`}>Cancel</button></div>
  </div>;
}

// One MCQ row at the leaf (topic) level of the tree — badge + edit/delete.
// selectedIds/onToggleSelect are optional — only the main MCQ bank tree
// (McqBankTree) wires these up for bulk selection; McqSourceGroup (used by
// ExamManagePanel/AdminPastPapers, which have their own dedicated delete
// flows) renders this row with no checkbox at all.

export function McqTreeRow({ mcq, selectedIds, onToggleSelect }: { mcq: AdminMcqRow; selectedIds?: Set<number>; onToggleSelect?: (id: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => mcqAdminApi.remove(mcq.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] }); queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); setDeleting(false); },
    onError: (err: unknown) => toast({ title: 'Could not delete question', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  return <div className="rounded-xl border border-border bg-card p-3" data-testid={`row-tree-mcq-${mcq.id}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-1 items-start gap-2">
        {onToggleSelect && <input type="checkbox" className="mt-1" checked={selectedIds?.has(mcq.id) ?? false} onChange={() => onToggleSelect(mcq.id)} data-testid={`checkbox-select-tree-mcq-${mcq.id}`} />}
        <div className="flex-1"><div className="flex items-center gap-2"><Badge tone={mcq.status === 'published' ? 'green' : 'amber'}>{mcq.status}</Badge><Badge tone={mcq.explanationStatus === 'APPROVED' ? 'green' : mcq.explanationStatus === 'PENDING' ? 'neutral' : 'blue'}>{mcq.explanationStatus.replace('_', ' ')}</Badge></div><p className="mt-2 text-xs font-bold leading-5">{mcq.question}</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-1"><button onClick={() => setEditing((v) => !v)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-mcq-${mcq.id}`}><Pencil size={14} /></button><button onClick={() => setDeleting(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-tree-mcq-${mcq.id}`}><Trash2 size={14} /></button></div>
    </div>
    {editing && <McqEditForm mcq={mcq} onDone={() => setEditing(false)} />}
    {deleting && <ConfirmDialog title="Delete this question?" body="It will be removed from the bank and from any draft exams using it." onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()} pending={remove.isPending} />}
  </div>;
}

// Topic level — fetched/expanded on demand; shows the MCQs tagged to it.
// Small "delete every question in this module/subject/topic" control, reused
// at all three tree levels — uses the server-side {all:true, filters} bulk
// delete path (unlike the flat list's explicit-id-list approach) since a
// whole module can hold far more questions than the client has loaded here.

export function BulkDeleteInScope({ label, count, filters }: { label: string; count: number; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
  const [confirming, setConfirming] = useState(false);
  const bulkDelete = useMutation({
    mutationFn: () => mcqAdminApi.bulkRemove({ all: true, filters }),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] }); setConfirming(false); toast({ title: `Deleted ${res.deleted} question${res.deleted === 1 ? '' : 's'}` }); },
    onError: (err: unknown) => toast({ title: 'Bulk delete failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  if (!count) return null;
  return <>
    <button type="button" onClick={(e) => { e.stopPropagation(); setConfirming(true); }} className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-all-in-${label.replace(/\s+/g, '-').toLowerCase()}`} aria-label={`Delete all questions in ${label}`}><Trash2 size={13} /></button>
    {confirming && <ConfirmDialog title={`Delete all ${count} question${count === 1 ? '' : 's'} in "${label}"?`} body="This permanently removes every question in this scope — there is no undo." confirmLabel={`Delete all ${count}`} onCancel={() => setConfirming(false)} onConfirm={() => bulkDelete.mutate()} pending={bulkDelete.isPending} />}
  </>;
}

// Difficulty + explanation-coverage breakdown for a set of rows — the
// "mcqs analysis" shown inline at every tree level (topic/subject/module),
// computed client-side from data already loaded for the tree, no extra
// requests needed.

export function analyzeMcqRows(rows: AdminMcqRow[]) {
  const easy = rows.filter((r) => r.difficulty === 'easy').length;
  const moderate = rows.filter((r) => r.difficulty === 'moderate').length;
  const hard = rows.filter((r) => r.difficulty === 'hard').length;
  const explained = rows.filter((r) => r.explanationStatus === 'APPROVED').length;
  return { total: rows.length, easy, moderate, hard, explained };
}

export function AnalysisPanel({ rows, label, filters }: { rows: AdminMcqRow[]; label: string; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
  const a = analyzeMcqRows(rows);
  // AI re-classification is separate from the client-side count above — it
  // actually calls the model per question (capped at 30/request server-side,
  // see /admin/mcqs/classify-difficulty), so it's a deliberate action with
  // its own pending/result state, not something that runs automatically
  // just from opening this panel.
  const classify = useMutation({
    mutationFn: () => mcqAdminApi.classifyDifficulty({ all: true, filters }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] });
      queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() });
      toast({ title: `AI classified ${res.classified} question${res.classified === 1 ? '' : 's'}`, description: res.remaining > 0 ? `${res.remaining} more left in "${label}" — click again to continue.` : undefined });
    },
    onError: (err: unknown) => toast({ title: 'Could not classify difficulty', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  if (!a.total) return <p className="text-[11px] text-muted-foreground">No questions here yet to analyze.</p>;
  return <div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-lg bg-[#eaf6ef] p-2 text-center"><div className="text-sm font-extrabold text-[#287058]">{a.easy}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Easy</div></div>
      <div className="rounded-lg bg-[#fdf6e8] p-2 text-center"><div className="text-sm font-extrabold text-[#8a5a12]">{a.moderate}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Moderate</div></div>
      <div className="rounded-lg bg-[#fff1ed] p-2 text-center"><div className="text-sm font-extrabold text-[#a34c3e]">{a.hard}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Hard</div></div>
      <div className="rounded-lg bg-muted p-2 text-center"><div className="text-sm font-extrabold">{a.explained}/{a.total}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Explained</div></div>
    </div>
    <button type="button" disabled={classify.isPending} onClick={(e) => { e.stopPropagation(); classify.mutate(); }} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-[#eef7f1] px-2.5 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50" data-testid="button-classify-difficulty" title="Re-runs AI difficulty classification on up to 30 questions in this scope per click">{classify.isPending ? 'Classifying…' : <><Wand2 size={12} /> AI: classify difficulty (up to 30)</>}</button>
  </div>;
}

export function AnalysisToggle({ rows, label, filters }: { rows: AdminMcqRow[]; label: string; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return <>
    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} className={cn('rounded-lg p-1', open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} data-testid="button-toggle-analysis" aria-label="Analyze this scope"><BarChart3 size={13} /></button>
    {open && <div className="w-full basis-full pt-2" onClick={(e) => e.stopPropagation()}><AnalysisPanel rows={rows} label={label} filters={filters} /></div>}
  </>;
}

// Self-contained "generate AI questions right here" panel for one topic —
// unlike the top-of-page generator (which needs module/subject/topic
// dropdowns filled in first), this already knows its scope from the tree,
// so it's a one-click generate-review-save loop without leaving the row.

export function TopicAiGenerate({ moduleId, subjectId, topicId, topicName }: { moduleId: number; subjectId: number; topicId: number; topicName: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'mixed' | 'easy' | 'moderate' | 'hard'>('mixed');
  const [drafts, setDrafts] = useState<GeneratedFlashcard[] extends never ? never : Array<{ question: string; options: string[]; correctAnswer: string; explanation: string; optionExplanations?: (string | null)[]; difficulty?: string }> | null>(null);
  const generate = useMutation({
    mutationFn: () => mcqAdminApi.generateAi(topicId, count, difficulty === 'mixed' ? undefined : difficulty),
    onSuccess: (res) => setDrafts(res.drafts),
    onError: (err: unknown) => toast({ title: 'Could not generate questions', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const save = useMutation({
    mutationFn: () => mcqAdminApi.bulkCreate((drafts ?? []).map((d) => ({ question: d.question, options: d.options, correctAnswer: d.correctAnswer, explanation: d.explanation, optionExplanations: d.optionExplanations ?? undefined, difficulty: d.difficulty ?? 'moderate', moduleId, subjectId, topicId }))),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] }); queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); toast({ title: `Added ${res.created} questions to ${topicName}` }); setDrafts(null); setOpen(false); },
    onError: (err: unknown) => toast({ title: 'Could not save questions', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  return <>
    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} className={cn('rounded-lg p-1', open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} data-testid={`button-toggle-ai-generate-topic-${topicId}`} aria-label="Generate AI questions for this topic"><Sparkles size={13} /></button>
    {open && <div className="w-full basis-full border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2"><select value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`select-ai-count-topic-${topicId}`}>{[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select><select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`select-ai-difficulty-topic-${topicId}`}><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select><button type="button" disabled={generate.isPending} onClick={() => generate.mutate()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-generate-topic-${topicId}`}>{generate.isPending ? 'Generating…' : <><Sparkles size={12} /> Generate</>}</button></div>
      {drafts && <div className="mt-3 space-y-2">
        {drafts.map((d, i) => <div key={i} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs"><span className="mr-1.5 rounded bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase">{d.difficulty ?? 'moderate'}</span>{d.question}</div>)}
        {!drafts.length && <p className="text-[11px] text-muted-foreground">AI returned nothing usable — try again.</p>}
        {!!drafts.length && <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-ai-drafts-topic-${topicId}`}>{save.isPending ? 'Saving…' : `Save all ${drafts.length} to ${topicName}`}</button>}
      </div>}
    </div>}
  </>;
}

export function McqTreeTopic({ moduleId, subjectId, topicId, name, mcqsByTopic, selectedIds, onToggleSelect }: { moduleId: number; subjectId: number; topicId: number; name: string; mcqsByTopic: Map<number, AdminMcqRow[]>; selectedIds: Set<number>; onToggleSelect: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const rows = mcqsByTopic.get(topicId) ?? [];
  return <div className="rounded-lg border border-border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-2"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-tree-topic-${topicId}`}><ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[10px] font-normal text-muted-foreground">{rows.length} question{rows.length === 1 ? '' : 's'}</span><AnalysisToggle rows={rows} label={name} filters={{ topicId }} /><TopicAiGenerate moduleId={moduleId} subjectId={subjectId} topicId={topicId} topicName={name} /><BulkDeleteInScope label={name} count={rows.length} filters={{ topicId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-3">{rows.length ? rows.map((m) => <McqTreeRow key={m.id} mcq={m} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />) : <p className="text-[11px] text-muted-foreground">No questions in this topic yet.</p>}</div>}
  </div>;
}

// Subject level — lazily loads its topics (same query key as TopicsManager, so cache is shared).

export function McqTreeSubject({ moduleId, subjectId, name, mcqsByTopic, selectedIds, onToggleSelect }: { moduleId: number; subjectId: number; name: string; mcqsByTopic: Map<number, AdminMcqRow[]>; selectedIds: Set<number>; onToggleSelect: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const topicsQ = useQuery({ queryKey: ['admin-topics', subjectId], queryFn: () => topicAdminApi.list(subjectId), enabled: open });
  const topics = topicsQ.data ?? [];
  const subjectRows = [...mcqsByTopic.entries()].filter(([tId]) => topics.some((t) => t.id === tId)).flatMap(([, rows]) => rows);
  return <div className="rounded-xl border border-border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-1 px-4 py-2.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-tree-subject-${subjectId}`}><ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />{name}</button>{open && <><AnalysisToggle rows={subjectRows} label={name} filters={{ subjectId }} /><BulkDeleteInScope label={name} count={subjectRows.length} filters={{ subjectId }} /></>}</div>
    {open && <div className="space-y-2 border-t border-border p-3">{topicsQ.isLoading ? <InlineLoading label="Loading topics…" /> : topics.length ? topics.map((t) => <McqTreeTopic key={t.id} moduleId={moduleId} subjectId={subjectId} topicId={t.id} name={t.name} mcqsByTopic={mcqsByTopic} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />) : <p className="text-[11px] text-muted-foreground">No topics in this subject yet.</p>}</div>}
  </div>;
}

// Module level (top of the tree) — lazily loads its subjects.

export function McqTreeModule({ moduleId, name, mcqCount, mcqsByTopic, selectedIds, onToggleSelect }: { moduleId: number; name: string; mcqCount: number; mcqsByTopic: Map<number, AdminMcqRow[]>; selectedIds: Set<number>; onToggleSelect: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const subjectsQ = useQuery({ queryKey: ['admin-subjects', moduleId], queryFn: () => subjectAdminApi.list(moduleId), enabled: open });
  const subjects = subjectsQ.data ?? [];
  const moduleRows = [...mcqsByTopic.values()].flat().filter((r) => r.moduleId === moduleId);
  const draftCount = moduleRows.filter((r) => r.status === 'draft').length;
  return <div className="rounded-2xl border border-border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-1 px-5 py-3.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-sm font-extrabold" data-testid={`button-tree-module-${moduleId}`}><ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[11px] text-muted-foreground">{mcqCount} question{mcqCount === 1 ? '' : 's'}</span>{draftCount > 0 && <PublishDraftsButton moduleId={moduleId} draftCount={draftCount} />}<AnalysisToggle rows={moduleRows} label={name} filters={{ moduleId }} /><BulkDeleteInScope label={name} count={mcqCount} filters={{ moduleId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-4">{subjectsQ.isLoading ? <InlineLoading label="Loading subjects…" /> : subjects.length ? subjects.map((s) => <McqTreeSubject key={s.id} moduleId={moduleId} subjectId={s.id} name={s.name} mcqsByTopic={mcqsByTopic} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />) : <p className="text-xs text-muted-foreground">No subjects in this module yet.</p>}</div>}
  </div>;
}

// The badge count next to a module (mcqCount, passed down from
// countByModule) only counts published questions — same rule GET /modules
// uses for students, see getModuleCounts in medschool.ts — so it can sit
// noticeably lower than the true number of questions filed under that
// module if a batch got imported without explicitly publishing (the
// "Respiration shows 406 in the tree above but only 380 on the student
// module card" bug). This button clears the backlog for one module in a
// single request instead of publishing drafts one at a time.

export function PublishDraftsButton({ moduleId, draftCount }: { moduleId: number; draftCount: number }) {
  const publish = useMutation({
    mutationFn: () => mcqAdminApi.publishDrafts(moduleId),
    onSuccess: (res) => {
      toast({ title: 'Drafts published', description: `${res.published} question${res.published === 1 ? '' : 's'} now visible to students.` });
      queryClient.invalidateQueries({ queryKey: ['admin-mcqs'] });
      queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
    onError: (err: unknown) => toast({ title: 'Could not publish drafts', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  return <button type="button" onClick={(e) => { e.stopPropagation(); publish.mutate(); }} disabled={publish.isPending} className="rounded-lg bg-[#fdf1de] px-2 py-1 text-[10px] font-bold text-[#8a5a12] hover:bg-[#fbe6c6] disabled:opacity-50" data-testid={`button-publish-drafts-${moduleId}`} title={`${draftCount} question${draftCount === 1 ? '' : 's'} still in draft — not shown to students`}>
    {publish.isPending ? 'Publishing…' : `Publish ${draftCount} draft${draftCount === 1 ? '' : 's'}`}
  </button>;
}

// Block level only shows the read-only breakdown (no AI-classify button
// here — that endpoint's scope filter takes one moduleId/subjectId/topicId,
// not a whole block's worth of modules at once; classify from the module
// row below instead).

export function BlockAnalysisToggle({ rows }: { rows: AdminMcqRow[] }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen((v) => !v)} className={cn('rounded-lg p-1', open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} data-testid="button-toggle-block-analysis" aria-label="Analyze this block"><BarChart3 size={13} /></button>
    {open && <div className="w-full basis-full pt-1"><AnalysisStats rows={rows} /></div>}
  </>;
}

export function AnalysisStats({ rows }: { rows: AdminMcqRow[] }) {
  const a = analyzeMcqRows(rows);
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <div className="rounded-lg bg-[#eaf6ef] p-2 text-center"><div className="text-sm font-extrabold text-[#287058]">{a.easy}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Easy</div></div>
    <div className="rounded-lg bg-[#fdf6e8] p-2 text-center"><div className="text-sm font-extrabold text-[#8a5a12]">{a.moderate}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Moderate</div></div>
    <div className="rounded-lg bg-[#fff1ed] p-2 text-center"><div className="text-sm font-extrabold text-[#a34c3e]">{a.hard}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Hard</div></div>
    <div className="rounded-lg bg-muted p-2 text-center"><div className="text-sm font-extrabold">{a.explained}/{a.total}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Explained</div></div>
  </div>;
}

// The main curriculum-tree MCQ bank (module > subject > topic). Exam- and
// past-paper-owned questions (mcqsTable.examId/pastPaperId set) are
// deliberately NOT shown here anymore — they're their own separate banks,
// managed entirely from the Pre-Proffs Exams and Past papers pages
// (ExamManagePanel's "This exam's questions" / AdminPastPapers' "View
// questions"). This only ever shows main-bank questions: curriculum-tagged,
// or truly unassigned (no module AND no exam AND no past paper).
// Groups blocks by (programTargetKind, yearTargetNumber) — MBBS/BDS > Year >
// Block, the extra top level McqBankTree/FlashcardBankTree nest their
// existing Block > Module > Subject > Topic tree under. Blocks with no
// targeting set (the common case until an admin tags them via BlockForm)
// fall into "Unspecified program" / "All years", not hidden or dropped.

export function groupByProgramYear<T extends { key: string | number; program: string | null; year: number | null }>(groups: T[]): Array<{ programLabel: string; yearLabel: string; groups: T[] }> {
  const buckets = new Map<string, { program: string; year: number | null; groups: T[] }>();
  for (const g of groups) {
    const program = g.program || '';
    const year = g.year ?? null;
    const key = `${program}|${year ?? ''}`;
    const existing = buckets.get(key);
    if (existing) existing.groups.push(g); else buckets.set(key, { program, year, groups: [g] });
  }
  const PROGRAM_ORDER = ['MBBS', 'BDS'];
  return [...buckets.values()]
    .sort((a, b) => {
      const ai = a.program ? PROGRAM_ORDER.indexOf(a.program) : 99; const bi = b.program ? PROGRAM_ORDER.indexOf(b.program) : 99;
      if (ai !== bi) return (ai === -1 ? 98 : ai) - (bi === -1 ? 98 : bi);
      if (a.program !== b.program) return a.program.localeCompare(b.program);
      return (a.year ?? 999) - (b.year ?? 999);
    })
    .map((b) => ({ programLabel: b.program || 'Unspecified program', yearLabel: b.year ? `Year ${b.year}` : 'All years', groups: b.groups }));
}

export function McqBankTree({ modules, blocks, search, statusFilter, selectedIds, onToggleSelect }: { modules: AdminModule[]; blocks: AdminBlock[]; search?: string; statusFilter?: ExplanationStatus | null; selectedIds: Set<number>; onToggleSelect: (id: number) => void }) {
  const treeQ = useQuery({ queryKey: ['admin-mcqs-tree'], queryFn: mcqAdminApi.list });
  const allRows = treeQ.data ?? [];
  // Search box + explanation-status filter (the latter driven by clicking a
  // tile in ExplanationCoverage) — this used to only apply to the flat list;
  // now the tree is the only view, so it filters the rows itself.
  const q = (search ?? '').trim().toLowerCase();
  const rows = allRows.filter((r) => (!q || r.question.toLowerCase().includes(q)) && (!statusFilter || r.explanationStatus === statusFilter));
  const mcqsByTopic = new Map<number, AdminMcqRow[]>();
  const trulyUnassigned: AdminMcqRow[] = [];
  for (const row of rows) {
    if (row.examId !== null || row.pastPaperId !== null) continue;
    if (row.topicId === null) { trulyUnassigned.push(row); continue; }
    const list = mcqsByTopic.get(row.topicId);
    if (list) list.push(row); else mcqsByTopic.set(row.topicId, [row]);
  }
  const countByModule = new Map<number, number>();
  for (const row of rows) if (row.moduleId !== null && row.examId === null && row.pastPaperId === null) countByModule.set(row.moduleId, (countByModule.get(row.moduleId) ?? 0) + 1);
  if (treeQ.isLoading) return <SkeletonPage />;
  if (!modules.length && !trulyUnassigned.length) return <EmptyState icon={CircleHelp} title="No modules yet" body="Create a module first under Academic content, then come back to browse its questions here." />;
  // Group modules under their Block so the bank tree reads Block > Module >
  // Subject > Topic, same grouping level the parser's Block filter below
  // narrows by.
  const modulesByBlock = new Map<number | 'other', AdminModule[]>();
  for (const m of modules) { const key = m.blockId ?? 'other'; const list = modulesByBlock.get(key); if (list) list.push(m); else modulesByBlock.set(key, [m]); }
  // Every block/module becomes one "leaf" with an effective program/year,
  // then groupByProgramYear buckets all of them together — this is what
  // makes "I tagged my modules as MBBS Year 1 but never touched the block"
  // still land under MBBS > Year 1 instead of Unspecified: a block with no
  // targeting of its own falls back to whatever its modules say, and a
  // module with no block at all is grouped by its own targeting directly
  // instead of being dumped in an undifferentiated "other" bucket.
  const blockLeaves = blocks.filter((b) => modulesByBlock.has(b.id)).map((b) => {
    const mods = modulesByBlock.get(b.id)!;
    const fallback = mods.find((m) => m.programTargetKind || m.yearTargetNumber);
    return { key: `block-${b.id}`, name: b.name, mods, program: b.programTargetKind || fallback?.programTargetKind || null, year: b.yearTargetNumber ?? fallback?.yearTargetNumber ?? null };
  });
  const standaloneLeaves = (modulesByBlock.get('other') ?? []).map((m) => ({ key: `module-${m.id}`, name: m.name, mods: [m], program: m.programTargetKind || null, year: m.yearTargetNumber ?? null }));
  const programYearGroups = groupByProgramYear([...blockLeaves, ...standaloneLeaves]);
  const showBlockLabel = blocks.length > 0 || standaloneLeaves.length > 0;
  return <div className="space-y-4">
    {programYearGroups.map(({ programLabel, yearLabel, groups }) => <McqTreeYearGroup key={`${programLabel}-${yearLabel}`} programLabel={programLabel} yearLabel={yearLabel} groups={groups} showBlockLabel={showBlockLabel} rows={rows} countByModule={countByModule} mcqsByTopic={mcqsByTopic} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />)}
    {!!trulyUnassigned.length && <div className="rounded-2xl border border-dashed border-border bg-card p-4"><p className="mb-3 text-xs font-bold text-muted-foreground">{trulyUnassigned.length} question{trulyUnassigned.length === 1 ? '' : 's'} with no module/subject/topic, exam, or past paper</p><div className="space-y-2">{trulyUnassigned.map((m) => <McqTreeRow key={m.id} mcq={m} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />)}</div></div>}
  </div>;
}

// Top level of the bank tree — one "MBBS/BDS · Year N" group. Collapsed by
// default: clicking it is what rolls out the Blocks (and their nested
// Modules/Subjects/Topics) underneath, instead of dumping every block and
// module open on screen at once.

export function McqTreeYearGroup({ programLabel, yearLabel, groups, showBlockLabel, rows, countByModule, mcqsByTopic, selectedIds, onToggleSelect }: {
  programLabel: string; yearLabel: string;
  groups: Array<{ key: string; name: string; mods: AdminModule[] }>;
  showBlockLabel: boolean; rows: AdminMcqRow[]; countByModule: Map<number, number>; mcqsByTopic: Map<number, AdminMcqRow[]>;
  selectedIds: Set<number>; onToggleSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const groupRows = rows.filter((r) => r.moduleId != null && groups.some((g) => g.mods.some((m) => m.id === r.moduleId)));
  return <div className="rounded-2xl border border-border bg-card">
    <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-3.5 text-left" data-testid={`button-tree-year-${programLabel}-${yearLabel}`}>
      <ChevronRight size={16} className={cn('shrink-0 text-primary transition-transform', open && 'rotate-90')} />
      <GraduationCap size={15} className="shrink-0 text-primary" />
      <h3 className="flex-1 text-sm font-extrabold" data-testid={`text-program-year-group-${programLabel}-${yearLabel}`}>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></h3>
      <span className="text-[11px] text-muted-foreground">{groupRows.length} question{groupRows.length === 1 ? '' : 's'}</span>
    </button>
    {open && <div className="space-y-5 border-t border-border p-4">
      {groups.map((g) => { const blockRows = rows.filter((r) => r.moduleId != null && g.mods.some((m) => m.id === r.moduleId)); return <div key={g.key} className="space-y-3">
        {showBlockLabel && <div className="flex flex-wrap items-center justify-between gap-1"><p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground" data-testid={`text-mcq-block-group-${g.key}`}>{g.name}</p>{!!blockRows.length && <BlockAnalysisToggle rows={blockRows} />}</div>}
        {g.mods.map((m) => <McqTreeModule key={m.id} moduleId={m.id} name={m.name} mcqCount={countByModule.get(m.id) ?? 0} mcqsByTopic={mcqsByTopic} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />)}
      </div>; })}
    </div>}
  </div>;
}

// Collapsible group of MCQs that belong to one exam or past paper (no
// module/subject/topic) — same row component as the module tree uses. Used
// by ExamManagePanel/AdminPastPapers, not the main bank tree above anymore.

export function McqSourceGroup({ label, icon: Icon, rows }: { label: string; icon: typeof FolderOpen; rows: AdminMcqRow[] }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-xl border border-border bg-background">
    <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold" data-testid={`button-mcq-source-group-${label}`}><span className="flex items-center gap-2"><ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} /><Icon size={13} className="text-primary" />{label}</span><span className="text-[10px] font-normal text-muted-foreground">{rows.length} question{rows.length === 1 ? '' : 's'}</span></button>
    {open && <div className="space-y-2 border-t border-border p-3">{rows.map((m) => <McqTreeRow key={m.id} mcq={m} />)}</div>}
  </div>;
}

export function AdminAccountSection() {
  const me = useGetCurrentUser();
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);
  const updateEmail = useMutation({
    mutationFn: () => authApi.updateMe({ email: newEmail, currentPassword: emailPassword }),
    onSuccess: () => { setEmailSaved(true); setEmailPassword(''); queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); },
    onError: (err: unknown) => setEmailError(err instanceof ApiRequestError ? err.message : 'Could not update email.'),
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => { setPasswordSaved(true); setCurrentPassword(''); setNewPassword(''); },
    onError: (err: unknown) => setPasswordError(err instanceof ApiRequestError ? err.message : 'Could not change password.'),
  });

  return <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Your account</h3><p className="mt-1 text-xs text-muted-foreground">Currently signed in as <span className="font-bold">{me.data?.email}</span>. Change your login email or password here any time — the account seeded on first deploy should have both changed promptly.</p>
    <div className="mt-5 grid gap-6 sm:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); setEmailError(null); setEmailSaved(false); updateEmail.mutate(); }} className="space-y-2"><div className="text-xs font-bold">Change email</div><input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="New email address" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-admin-new-email" /><input required type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="Current password to confirm" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-admin-email-confirm-password" />{emailError && <p className="text-[11px] font-semibold text-destructive">{emailError}</p>}{emailSaved && <p className="text-[11px] font-semibold text-primary">Email updated.</p>}<button disabled={updateEmail.isPending} className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold disabled:opacity-50" data-testid="button-update-admin-email">{updateEmail.isPending ? 'Saving…' : 'Update email'}</button></form>
      <form onSubmit={(e) => { e.preventDefault(); setPasswordError(null); setPasswordSaved(false); changePassword.mutate(); }} className="space-y-2"><div className="text-xs font-bold">Change password</div><input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-admin-current-password" /><input required minLength={8} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-admin-new-password" />{passwordError && <p className="text-[11px] font-semibold text-destructive">{passwordError}</p>}{passwordSaved && <p className="text-[11px] font-semibold text-primary">Password changed.</p>}<button disabled={changePassword.isPending} className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold disabled:opacity-50" data-testid="button-change-admin-password">{changePassword.isPending ? 'Saving…' : 'Change password'}</button></form>
    </div>
  </div>;
}

// Small click-to-upload image button, reused for the favicon and the payment
// QR code. Uploads immediately on file selection — the resulting storage
// path is handed back via onUploaded so the caller can stash it in its own
// form state and save it along with everything else on that page.

export function AdminImageUpload({ currentUrl, kind, accept, hint, testId, onUploaded }: { currentUrl: string; kind: 'favicon' | 'resource'; accept: string; hint: string; testId: string; onUploaded: (storagePath: string, previewUrl: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { storagePath, url } = await uploadFile(file, kind);
      setLocalPreview(url);
      onUploaded(storagePath, url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const preview = resolveUploadUrl(localPreview || currentUrl || null);
  const [broken, setBroken] = useState(false);

  return <div className="flex items-center gap-4">
    <label className={cn('grid size-16 shrink-0 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/50', uploading && 'opacity-60')}>
      {preview && !broken ? <img src={preview} alt="Upload preview" className="size-full rounded-2xl object-contain p-1.5" onLoad={() => setBroken(false)} onError={() => setBroken(true)} /> : <ImageOff size={18} />}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { setBroken(false); onFile(e.target.files?.[0]); }} data-testid={testId} />
    </label>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 text-xs font-bold"><UploadCloud size={13} /> {uploading ? 'Uploading…' : 'Click the tile to upload'}</div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>
      {error && <p className="mt-1 text-[11px] font-semibold text-destructive">{error}</p>}
      {!error && preview && broken && <p className="mt-1 text-[11px] font-semibold text-destructive">Uploaded, but the file isn't loading back — this usually means local storage isn't configured to persist. See the storage note below.</p>}
    </div>
  </div>;
}

export function FaviconUploader({ currentUrl, onUploaded }: { currentUrl: string; onUploaded: (storagePath: string, previewUrl: string | null) => void }) {
  return <AdminImageUpload currentUrl={currentUrl} kind="favicon" accept="image/png,image/x-icon,image/svg+xml,image/webp" hint="PNG, ICO, SVG, or WEBP · square, under 1MB. Shows in the browser tab for both the student and admin sites." testId="input-favicon-upload" onUploaded={onUploaded} />;
}

export function NotificationBroadcastPanel() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'warning'>('info');
  const [programTargetKind, setProgramTargetKind] = useState('');
  const [yearTargetNumber, setYearTargetNumber] = useState('');
  // A targeted broadcast (program and/or year set) writes one notification
  // row per matching STUDENT — the sending admin is never one of those
  // rows, so it never shows up in their own bell. That made a
  // successfully-sent targeted notification look identical to a silently
  // failed one: a toast flashes past, then there's no lasting evidence it
  // went anywhere. This panel now also lists every broadcast from the
  // audit log (already recorded server-side, with the recipient count) so
  // "did that actually send?" has a real, persistent answer.
  const auditQ = useQuery({ queryKey: ['admin-audit-logs', 'notifications'], queryFn: () => auditApi.list(200) });
  const recentBroadcasts = (auditQ.data || []).filter((a) => a.action === 'NOTIFICATION_BROADCAST').slice(0, 8);

  const send = useMutation({
    mutationFn: () => notificationsApi.broadcast({
      title: title.trim(),
      body: body.trim(),
      type,
      programTargetKind: programTargetKind || null,
      yearTargetNumber: yearTargetNumber ? Number(yearTargetNumber) : null,
    }),
    onSuccess: (res) => {
      setTitle(''); setBody('');
      toast({ title: 'Notification sent', description: res.targetedUsers === null ? 'Delivered to every student.' : res.targetedUsers === 0 ? 'Sent, but no student currently matches that program/year — nothing was delivered.' : `Delivered to ${res.targetedUsers} matching student${res.targetedUsers === 1 ? '' : 's'}.`, variant: res.targetedUsers === 0 ? 'destructive' : undefined });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs', 'notifications'] });
    },
    onError: (err: unknown) => toast({ title: 'Could not send notification', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const scopeLabel = `${programTargetKind || 'All programs'} · ${yearTargetNumber ? `${yearTargetNumber}${['th', 'st', 'nd', 'rd'][Number(yearTargetNumber) % 10 > 3 ? 0 : Number(yearTargetNumber) % 10]} Year` : 'All years'}`;

  return <div className="rounded-2xl border border-border bg-card p-6">
    <h3 className="font-bold">Send a notification</h3>
    <p className="mt-1 text-xs text-muted-foreground">Reaches students' notification bells right away. Narrow it to a program and/or year, or leave both as "All" to reach everyone.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-bold sm:col-span-2">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New past paper uploaded" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-notification-title" /></label>
      <label className="text-xs font-bold sm:col-span-2">Message<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should students know?" className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid="input-notification-body" /></label>
      <label className="text-xs font-bold">Type<select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs capitalize" data-testid="select-notification-type">{['info', 'success', 'warning'].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
      <div />
      <label className="text-xs font-bold">Programme<select value={programTargetKind} onChange={(e) => setProgramTargetKind(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-notification-program"><option value="">All programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select></label>
      <label className="text-xs font-bold">Year<select value={yearTargetNumber} onChange={(e) => setYearTargetNumber(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-notification-year"><option value="">All years</option>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}</select></label>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2.5 text-[11px] font-semibold text-muted-foreground"><span>Will reach: {scopeLabel}</span></div>
    <button onClick={() => send.mutate()} disabled={send.isPending || !title.trim() || !body.trim()} className="mt-4 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-send-notification">{send.isPending ? 'Sending…' : 'Send notification'}</button>

    <div className="mt-6 border-t border-border pt-5">
      <h4 className="text-xs font-bold text-muted-foreground">Recently sent</h4>
      {!recentBroadcasts.length && <p className="mt-2 text-[11px] text-muted-foreground">Nothing sent yet.</p>}
      <div className="mt-3 space-y-2">{recentBroadcasts.map((a) => {
        let meta: { title?: string; body?: string; scope?: string; targetedUsers?: number | null } = {};
        try { meta = a.metadata ? JSON.parse(a.metadata) : {}; } catch { /* older rows had no metadata — fall back to the bare log line below */ }
        const delivered = meta.targetedUsers === null || meta.targetedUsers === undefined ? null : meta.targetedUsers;
        return <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5" data-testid={`row-recent-broadcast-${a.id}`}>
          <div className="min-w-0"><div className="truncate text-xs font-bold">{meta.title || 'Notification'}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{meta.scope || '—'} · {a.createdAt}</div></div>
          <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', delivered === 0 ? 'bg-destructive/10 text-destructive' : 'bg-[#d7eee4] text-[#164b4b]')}>{delivered === null ? 'Everyone' : `${delivered} delivered`}</span>
        </div>;
      })}</div>
    </div>
  </div>;
}

// A real-world MBBS college and a BDS college are different institutions
// even when they share a university name, so "kind" lives on the
// institution row itself (see schema/medschool.ts) — this list is now
// split into an MBBS tab and a BDS tab instead of one flat list, and
// adding a college requires picking which one it is. Institutions saved
// before this existed have kind="" and surface under a third "Unset" tab
// (hidden once nothing is left in it) so nothing silently disappears.

export const INSTITUTION_KIND_TABS: Array<{ key: 'MBBS' | 'BDS'; label: string }> = [
  { key: 'MBBS', label: 'MBBS colleges' },
  { key: 'BDS', label: 'BDS colleges' },
];

export function AdminInstitutionsList({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const institutions = useQuery({ queryKey: ['admin-institutions'], queryFn: () => academicApi.institutions() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-institutions'] });
  const [kindTab, setKindTab] = useState<'MBBS' | 'BDS' | ''>('MBBS');
  const [name, setName] = useState('');
  const [addKind, setAddKind] = useState<'MBBS' | 'BDS'>('MBBS');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingPermanentId, setDeletingPermanentId] = useState<number | null>(null);
  // Keep the "Add college" form's type in step with whichever tab is open
  // — adding a college while looking at the BDS tab should default to
  // adding a BDS college, not silently add it to MBBS. Only follows real
  // tabs; the Unset tab has no matching add-kind, so it's left alone.
  useEffect(() => { if (kindTab === 'MBBS' || kindTab === 'BDS') setAddKind(kindTab); }, [kindTab]);

  const createInstitution = useMutation({ mutationFn: academicApi.createInstitution, onSuccess: invalidate, onError: (err: unknown) => toast({ title: 'Could not create institution', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const renameInstitution = useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => academicApi.updateInstitution(id, { name }), onSuccess: () => { invalidate(); setRenamingId(null); }, onError: (err: unknown) => toast({ title: 'Could not rename institution', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const toggleInstitution = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => academicApi.updateInstitution(id, { active }), onSuccess: invalidate });
  const updateInstitutionKind = useMutation({ mutationFn: ({ id, kind }: { id: number; kind: string }) => academicApi.updateInstitution(id, { kind }), onSuccess: invalidate, onError: (err: unknown) => toast({ title: 'Could not update college type', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removePermanent = useMutation({ mutationFn: academicApi.removeInstitutionPermanent, onSuccess: () => { invalidate(); setDeletingPermanentId(null); }, onError: (err: unknown) => toast({ title: 'Could not permanently delete institution', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  // Custom ordering — persisted via the existing `displayOrder` column
  // (already read by GET /institutions' ORDER BY and already accepted by
  // PATCH /institutions/:id; nothing new needed server-side).
  //
  // Root cause of "the arrows don't move anything": institutions created
  // from the "Add institution" form below never send a displayOrder, so
  // they're all persisted at the same default (0). Swapping two rows that
  // share the same displayOrder swaps 0 with 0 — a no-op the admin sees as
  // "nothing moved." Renumbering the *whole* list to a unique, sequential
  // 0..n-1 order on every move (instead of swapping just the two neighbors)
  // self-heals that — every click leaves the list with no duplicate
  // displayOrder values, so the next click always has something real to
  // swap, with no backend migration needed. This renumbers within the
  // active tab only, which is fine — MBBS and BDS colleges are never
  // shown in the same list, so their displayOrder spaces don't need to
  // stay globally unique, only unique within each kind.
  const reorder = useMutation({
    mutationFn: (rows: { id: number; displayOrder: number }[]) =>
      Promise.all(rows.map((r) => academicApi.updateInstitution(r.id, { displayOrder: r.displayOrder }))),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not reorder institutions', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const allInstitutions = institutions.data || [];
  const unsetCount = allInstitutions.filter((i) => !i.kind).length;
  const tabs = unsetCount > 0 ? [...INSTITUTION_KIND_TABS, { key: '' as const, label: 'Unset' }] : INSTITUTION_KIND_TABS;
  const orderedInstitutions = allInstitutions.filter((i) => (i.kind || '') === kindTab).sort((x, y) => x.displayOrder - y.displayOrder || x.name.localeCompare(y.name));
  const moveInstitution = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= orderedInstitutions.length || reorder.isPending) return;
    const reordered = [...orderedInstitutions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorder.mutate(reordered.map((inst, i) => ({ id: inst.id, displayOrder: i })));
  };

  return <div className="rounded-2xl border border-border bg-card p-5">
    <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Institutions</h4>
    <p className="mt-1 text-[11px] text-muted-foreground">The colleges students can register under, split by MBBS and BDS since they're different institutions — use the arrows to arrange each list in your own order. Manage programmes, years, and batches below.</p>
    <div className="mt-3 flex gap-1.5 rounded-xl bg-muted p-1">
      {tabs.map((t) => <button key={t.key} type="button" onClick={() => setKindTab(t.key)} className={cn('flex-1 rounded-lg py-1.5 text-[11px] font-bold transition-colors', kindTab === t.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')} data-testid={`tab-institution-kind-${t.key || 'unset'}`}>{t.label} <span className="font-mono-app text-[10px] opacity-70">({allInstitutions.filter((i) => (i.kind || '') === t.key).length})</span></button>)}
    </div>
    <div className="mt-3 space-y-1.5">
      {orderedInstitutions.map((i: Institution, idx) => <div key={i.id} onClick={() => onSelect(i.id)} className={cn('flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer hover:bg-muted', selectedId === i.id && 'bg-[#eef7f1] font-bold')} data-testid={`row-institution-${i.id}`}>
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div className="flex shrink-0 flex-col" onClick={(e) => e.stopPropagation()}>
            <button type="button" disabled={idx === 0 || reorder.isPending} onClick={() => moveInstitution(idx, -1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-up-institution-${i.id}`} aria-label="Move up"><ChevronUp size={12} /></button>
            <button type="button" disabled={idx === orderedInstitutions.length - 1 || reorder.isPending} onClick={() => moveInstitution(idx, 1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-down-institution-${i.id}`} aria-label="Move down"><ChevronDown size={12} /></button>
          </div>
          {renamingId === i.id
            ? <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) renameInstitution.mutate({ id: i.id, name: renameValue.trim() }); }} className="flex flex-1 items-center gap-1.5">
                <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-7 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-rename-institution-${i.id}`} />
                <button type="submit" className="rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground" data-testid={`button-save-rename-institution-${i.id}`}>Save</button>
                <button type="button" onClick={() => setRenamingId(null)} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold" data-testid={`button-cancel-rename-institution-${i.id}`}>Cancel</button>
              </form>
            : <span className={cn('flex-1 truncate', !i.active && 'text-muted-foreground line-through')}>{i.name}</span>}
        </div>
        {renamingId !== i.id && <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Always editable, not just while unset — an admin who typed a
              college into the wrong tab (or is fixing a legacy row) needs
              a way to correct it, not just set it once. */}
          <select value={i.kind || ''} onChange={(e) => updateInstitutionKind.mutate({ id: i.id, kind: e.target.value })} className="h-6 rounded border border-border bg-background px-1 text-[10px] font-bold" data-testid={`select-institution-kind-${i.id}`}><option value="">Unset</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select>
          <button type="button" onClick={() => { setRenamingId(i.id); setRenameValue(i.name); }} className="text-[10px] font-bold text-primary" data-testid={`button-rename-institution-${i.id}`}>Rename</button>
          <button type="button" onClick={() => toggleInstitution.mutate({ id: i.id, active: !i.active })} className="text-[10px] font-bold text-primary" data-testid={`button-toggle-institution-${i.id}`}>{i.active ? 'Archive' : 'Activate'}</button>
          {/* No longer gated behind "archived first" — the backend already
              safely refuses (with a clear error) if programs/students are
              still attached, so there's no need to force admins through
              Archive before they can even attempt a permanent delete. */}
          <button type="button" onClick={() => setDeletingPermanentId(i.id)} className="text-[10px] font-bold text-destructive" data-testid={`button-delete-permanent-institution-${i.id}`}>Delete permanently</button>
        </div>}
      </div>)}
      {!orderedInstitutions.length && <p className="text-xs text-muted-foreground">{kindTab === '' ? 'Nothing left unset.' : `No ${kindTab} colleges yet — add one below.`}</p>}
    </div>
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { createInstitution.mutate({ name: name.trim(), kind: addKind, active: true }); setName(''); } }} className="mt-3 flex gap-1.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add college, e.g. King Edward Medical University" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-add-institution" />
      <select value={addKind} onChange={(e) => setAddKind(e.target.value as 'MBBS' | 'BDS')} className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-bold" data-testid="select-add-institution-kind"><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select>
      <button className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" data-testid="button-add-institution"><Plus size={13} /></button>
    </form>
    {deletingPermanentId !== null && <ConfirmDialog title="Delete this institution permanently?" body="This erases it for good — there is no undo. Any programmes, academic years, and batches under it are deleted along with it. Only blocked if students are still assigned to it — reassign or remove them first." confirmLabel="Delete forever" onCancel={() => setDeletingPermanentId(null)} onConfirm={() => removePermanent.mutate(deletingPermanentId)} pending={removePermanent.isPending} />}
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

  return <div className="mt-12 overflow-hidden rounded-3xl bg-[#164b4b] text-[#eaf2e9]">
    <div className="border-b border-white/10 p-8 text-center"><h3 className="font-display text-2xl">Connect With Us</h3><p className="mt-2 text-sm text-[#bfd4cb]">Join our community and stay updated with the latest resources</p><div className="mt-5 flex justify-center"><SocialIcons content={c} dark /></div></div>
    <div className="grid gap-8 p-8 sm:grid-cols-2">
      <div><h4 className="text-sm font-extrabold">{platformName}</h4><p className="mt-2 text-xs leading-6 text-[#bfd4cb]">{c?.PLATFORM_DESCRIPTION || 'Empowering medical students with comprehensive study resources and innovative learning tools to ace their professional exams.'}</p></div>
      <div><h4 className="text-sm font-extrabold">Contact Info</h4><div className="mt-3 space-y-2 text-xs text-[#bfd4cb]">{c?.CONTACT_EMAIL && <div className="flex items-center gap-2"><Mail size={13} className="text-[#e5a952]" /> {c.CONTACT_EMAIL}</div>}{c?.CONTACT_LOCATION && <div className="flex items-center gap-2"><Landmark size={13} className="text-[#e5a952]" /> {c.CONTACT_LOCATION}</div>}{c?.SUPPORT_HOURS && <div className="flex items-center gap-2"><Clock3 size={13} className="text-[#e5a952]" /> {c.SUPPORT_HOURS}</div>}</div></div>
      {!!c?.features?.length && <div><h4 className="text-sm font-extrabold">Features</h4><div className="mt-3 space-y-2 text-xs text-[#bfd4cb]">{c.features.map((f) => <div key={f} className="flex items-center gap-2"><Check size={13} className="text-[#e5a952]" /> {f}</div>)}</div></div>}
      {!!c?.quickLinks?.length && <div><h4 className="text-sm font-extrabold">Quick Links</h4><div className="mt-3 space-y-2 text-xs text-[#bfd4cb]">{c.quickLinks.map((l) => <Link key={l.label} href={l.url} className="block hover:text-white">{l.label}</Link>)}</div></div>}
    </div>
    <div className="border-t border-white/10 px-8 py-4 text-center font-mono-app text-[10px] text-[#8bcbb8]">© {year} {platformName}. {c?.COPYRIGHT_NOTICE || 'All rights reserved.'}</div>
  </div>;
}

export function AuthLayout({ children }: { children: ReactNode }) { return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]"><div className="flex flex-col p-6 md:p-10"><Logo /><div className="mx-auto flex w-full max-w-sm flex-1 items-center py-10">{children}</div><Footer /></div><div className="relative hidden overflow-hidden bg-sidebar p-14 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-20 top-20 size-96 rounded-full border-[44px] border-sidebar-accent/50" /><div className="absolute bottom-10 left-10 size-48 rounded-full border-[20px] border-sidebar-primary/25" /><div className="relative"><div className="font-mono-app text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/70">Command center</div><h2 className="mt-8 max-w-lg font-display text-6xl leading-[.93] tracking-[-.04em]">Run the<br /><em className="text-sidebar-primary not-italic">whole desk.</em></h2></div><div className="relative max-w-sm"><div className="mb-4 h-px bg-sidebar-border" /><p className="text-sm leading-6 text-sidebar-foreground/80">Students, payments, curriculum, and exams — everything the academic team manages, in one dashboard.</p><div className="mt-5 flex items-center gap-2 text-xs font-bold"><span className="grid size-7 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><ShieldCheck size={14} /></span> Restricted to invited admin accounts</div></div></div></div>; }

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

// The admin-settings key/value bag (raw string values keyed by setting
// name, e.g. PAYMENT_BANK_ACCOUNTS, PAYMENT_UPI_ID) and the setter the tabs
// below call to stage an edit before "Save changes" persists it.
export type PaymentSettingsValues = Record<string, string>;
export type SetSetting = (key: string, value: string) => void;

export const PAYMENT_METHODS: Array<{ value: string; label: string; icon: typeof Landmark }> = [
  { value: 'Bank transfer', label: 'Bank transfer', icon: Landmark },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'Raast', label: 'Raast', icon: Zap },
  { value: 'Mobile wallet', label: 'Mobile wallet', icon: Smartphone },
  { value: 'Card', label: 'Card', icon: CreditCard },
];

export function parseBankAccounts(values: PaymentSettingsValues): BankAccount[] {
  try {
    const parsed = JSON.parse(values.PAYMENT_BANK_ACCOUNTS || '[]');
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* fall through to legacy single-account seed below */ }
  // Seed from the legacy single-account fields so upgrading doesn't blank
  // out an account that's already configured and shown to students.
  if (values.PAYMENT_ACCOUNT_HOLDER || values.PAYMENT_BANK_NAME || values.PAYMENT_ACCOUNT_NUMBER) {
    return [{ id: 'legacy', label: 'Primary account', accountHolder: values.PAYMENT_ACCOUNT_HOLDER || '', bankName: values.PAYMENT_BANK_NAME || '', accountNumber: values.PAYMENT_ACCOUNT_NUMBER || '', ifsc: values.PAYMENT_IFSC_OR_ROUTING || '', branch: '', isPrimary: true }];
  }
  return [];
}

export const DEFAULT_METHODS: PaymentMethodConfig[] = [
  { key: 'bank_transfer', label: 'Bank Transfer', type: 'bank', enabled: true, instructions: '' },
  { key: 'raast', label: 'Raast', type: 'wallet', enabled: false, instructions: '' },
  { key: 'jazzcash', label: 'JazzCash', type: 'wallet', enabled: false, instructions: '' },
  { key: 'easypaisa', label: 'EasyPaisa', type: 'wallet', enabled: false, instructions: '' },
  { key: 'cash', label: 'Cash / In person', type: 'cash', enabled: false, instructions: '' },
];

export function parseMethods(values: PaymentSettingsValues): PaymentMethodConfig[] {
  let methods: PaymentMethodConfig[];
  try {
    const parsed = JSON.parse(values.PAYMENT_METHODS_CONFIG || '[]');
    methods = Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_METHODS;
  } catch { methods = DEFAULT_METHODS; }
  // Backfill from the legacy per-method settings keys (PAYMENT_RAAST_NUMBER
  // etc.) so numbers/names entered before this fix still show up here —
  // matches the same backfill GET /payment-details does for students.
  return methods.map((m) => ({
    ...m,
    accountNumber: m.accountNumber || values[`PAYMENT_${m.key.toUpperCase()}_NUMBER`] || '',
    accountName: m.accountName || values[`PAYMENT_${m.key.toUpperCase()}_ACCOUNT_NAME`] || '',
  }));
}

// ── Tab: Collection Details (instructions, currency, QR, legacy wallet fields) ──

export function CollectionDetailsTab({ values, set }: { values: PaymentSettingsValues; set: SetSetting }) {
  return <div className="max-w-2xl space-y-4">
    <div className="rounded-2xl border border-border bg-card p-6"><p className="text-xs leading-5 text-muted-foreground">Students see these details when they submit a payment. Update them any time — changes apply immediately, no redeploy needed.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold">Default currency<input value={values.DEFAULT_CURRENCY || ''} onChange={(e) => set('DEFAULT_CURRENCY', e.target.value)} placeholder="PKR" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-currency-payment" /></label>
        <label className="text-xs font-bold">UPI ID<input value={values.PAYMENT_UPI_ID || ''} onChange={(e) => set('PAYMENT_UPI_ID', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-upi-id" /></label>
        <label className="text-xs font-bold sm:col-span-2">Instructions shown to students<textarea value={values.PAYMENT_INSTRUCTIONS || ''} onChange={(e) => set('PAYMENT_INSTRUCTIONS', e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid="input-payment-instructions-admin" /></label>
        <label className="text-xs font-bold sm:col-span-2">Refund policy<textarea value={values.PAYMENT_REFUND_POLICY || ''} onChange={(e) => set('PAYMENT_REFUND_POLICY', e.target.value)} className="mt-2 min-h-16 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid="input-refund-policy" /></label>
        <label className="text-xs font-bold sm:col-span-2">Late fee / renewal note<input value={values.PAYMENT_LATE_FEE_NOTE || ''} onChange={(e) => set('PAYMENT_LATE_FEE_NOTE', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-late-fee-note" /></label>
      </div>
    </div>
    <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Payment QR code</h3><p className="mt-1 text-xs text-muted-foreground">Shown next to your bank details at sign-up &amp; renewal — a scannable QR is faster than typing an account number.</p><div className="mt-5">
      <AdminImageUpload currentUrl={values.PAYMENT_QR_CODE_URL || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="PNG, JPEG, or WEBP · up to 8MB." testId="input-qr-upload" onUploaded={(storagePath) => set('PAYMENT_QR_CODE_PATH', storagePath)} />
    </div></div>
  </div>;
}

// ── Tab: Bank Accounts — multiple accounts, add/edit/remove/set-primary ──

export function BankAccountsTab({ values, set }: { values: PaymentSettingsValues; set: SetSetting }) {
  const accounts = parseBankAccounts(values);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyDraft: BankAccount = { id: '', label: '', accountHolder: '', bankName: '', accountNumber: '', ifsc: '', branch: '', isPrimary: accounts.length === 0 };
  const [draft, setDraft] = useState<BankAccount>(emptyDraft);

  const writeAccounts = (next: BankAccount[]) => set('PAYMENT_BANK_ACCOUNTS', JSON.stringify(next));
  const openNew = () => { setDraft({ ...emptyDraft, id: `acct_${Date.now()}` }); setEditingId(null); setShowForm(true); };
  const openEdit = (a: BankAccount) => { setDraft(a); setEditingId(a.id); setShowForm(true); };
  const saveDraft = () => {
    if (!draft.accountHolder.trim() || !draft.bankName.trim()) return;
    let next = editingId ? accounts.map((a) => (a.id === editingId ? draft : a)) : [...accounts, draft];
    if (draft.isPrimary) next = next.map((a) => ({ ...a, isPrimary: a.id === draft.id }));
    writeAccounts(next);
    setShowForm(false);
    setEditingId(null);
  };
  const removeAccount = (id: string) => writeAccounts(accounts.filter((a) => a.id !== id));
  const makePrimary = (id: string) => writeAccounts(accounts.map((a) => ({ ...a, isPrimary: a.id === id })));

  return <div className="max-w-3xl">
    <div className="mb-4 flex items-center justify-between"><p className="text-xs text-muted-foreground">Add every account students can pay into — the primary one is shown first.</p><button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-add-bank-account"><Plus size={15} /> Add account</button></div>
    {showForm && <div className="mb-5 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Label<input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Main collection account" className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-account-label" /></label>
        <label className="text-xs font-bold">Account holder name<input value={draft.accountHolder} onChange={(e) => setDraft({ ...draft, accountHolder: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-account-holder" /></label>
        <label className="text-xs font-bold">Bank name<input value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-bank-name" /></label>
        <label className="text-xs font-bold">Account number<input value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs font-mono-app" data-testid="input-account-number" /></label>
        <label className="text-xs font-bold">IFSC / routing code<input value={draft.ifsc} onChange={(e) => setDraft({ ...draft, ifsc: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs font-mono-app" data-testid="input-ifsc" /></label>
        <label className="text-xs font-bold">Branch<input value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-branch" /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={draft.isPrimary} onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })} className="size-4 accent-[#287058]" data-testid="checkbox-account-primary" /> Set as primary account</label>
      <div className="mt-4 flex gap-2"><button onClick={saveDraft} disabled={!draft.accountHolder.trim() || !draft.bankName.trim()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-bank-account">{editingId ? 'Save changes' : 'Add account'}</button><button onClick={() => setShowForm(false)} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-cancel-bank-account">Cancel</button></div>
    </div>}
    {accounts.length ? <div className="grid gap-3 sm:grid-cols-2">{accounts.map((a) => <div key={a.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-bank-account-${a.id}`}>
      <div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><span className="text-sm font-bold">{a.label || a.bankName}</span>{a.isPrimary && <Badge tone="green">Primary</Badge>}</div><div className="mt-1 text-xs text-muted-foreground">{a.accountHolder}</div></div><div className="flex gap-1"><button onClick={() => openEdit(a)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" data-testid={`button-edit-account-${a.id}`}><Pencil size={14} /></button><button onClick={() => removeAccount(a.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-account-${a.id}`}><Trash2 size={14} /></button></div></div>
      <div className="mt-3 space-y-1 font-mono-app text-[11px] text-muted-foreground"><div>{a.bankName}</div><div>{a.accountNumber}</div>{a.ifsc && <div>IFSC/Routing: {a.ifsc}</div>}{a.branch && <div>Branch: {a.branch}</div>}</div>
      {!a.isPrimary && <button onClick={() => makePrimary(a.id)} className="mt-3 text-[11px] font-bold text-primary" data-testid={`button-make-primary-${a.id}`}>Make primary</button>}
    </div>)}</div> : <EmptyState icon={Landmark} title="No bank accounts yet" body="Add one so students know where to send payment." />}
  </div>;
}

// ── Tab: Payment Methods — enable/disable each accepted method + per-method instructions & wallet numbers ──

export function PaymentMethodsTab({ values, set }: { values: PaymentSettingsValues; set: SetSetting }) {
  const methods = parseMethods(values);
  const writeMethods = (next: PaymentMethodConfig[]) => set('PAYMENT_METHODS_CONFIG', JSON.stringify(next));
  const updateMethod = (key: string, patch: Partial<PaymentMethodConfig>) => writeMethods(methods.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  return <div className="max-w-3xl space-y-3">
    <p className="text-xs text-muted-foreground">Toggle which payment methods students can use, and set per-method instructions. Bank Transfer details live under the Bank Accounts tab.</p>
    {methods.map((m) => <div key={m.key} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-method-${m.key}`}>
      <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className={cn('grid size-10 place-items-center rounded-xl', m.enabled ? 'bg-[#d7eee4] text-[#164b4b]' : 'bg-muted text-muted-foreground')}>{m.type === 'bank' ? <Landmark size={16} /> : m.type === 'wallet' ? <Smartphone size={16} /> : <CreditCard size={16} />}</div><div><div className="text-sm font-bold">{m.label}</div><div className="text-[11px] text-muted-foreground capitalize">{m.type}</div></div></div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold"><input type="checkbox" checked={m.enabled} onChange={(e) => updateMethod(m.key, { enabled: e.target.checked })} className="size-4 accent-[#287058]" data-testid={`checkbox-method-${m.key}`} />{m.enabled ? 'Enabled' : 'Disabled'}</label>
      </div>
      {m.enabled && <div className="mt-4 space-y-3 border-t border-border pt-4">
        {m.type === 'wallet' && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">{m.label} number<input value={m.accountNumber || ''} onChange={(e) => updateMethod(m.key, { accountNumber: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-mono-app" data-testid={`input-${m.key}-number`} /></label>
          <label className="text-xs font-bold">Account name<input value={m.accountName || ''} onChange={(e) => updateMethod(m.key, { accountName: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid={`input-${m.key}-account-name`} /></label>
        </div>}
        <label className="text-xs font-bold">Instructions for this method<textarea value={m.instructions} onChange={(e) => updateMethod(m.key, { instructions: e.target.value })} className="mt-2 min-h-16 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid={`input-${m.key}-instructions`} /></label>
      </div>}
    </div>)}
  </div>;
}

// ── Tab: Stats — derived client-side from the same payments the Proof Review tab uses, no extra endpoint needed ──

export function PaymentStatsTab() {
  const q = useListPayments();
  const payments = q.data ?? [];
  if (q.isLoading) return <SkeletonPage />;
  const total = payments.length;
  const pending = payments.filter((p) => p.status === 'pending').length;
  const approved = payments.filter((p) => p.status === 'approved').length;
  const rejected = payments.filter((p) => p.status === 'rejected').length;
  const revenue = payments.filter((p) => p.status === 'approved').reduce((sum, p) => sum + Number(p.amount), 0);
  const currency = payments[0]?.currency || 'PKR';
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = payments.filter((p) => p.submittedAt.slice(0, 10) === today).length;

  const byMethod = new Map<string, { count: number; total: number }>();
  for (const p of payments) {
    const row = byMethod.get(p.method) || { count: 0, total: 0 };
    row.count += 1; row.total += Number(p.amount);
    byMethod.set(p.method, row);
  }
  const methodRows = [...byMethod.entries()].sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(1, ...methodRows.map(([, v]) => v.count));
  const recent = [...payments].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 6);

  const cards: Array<[string, string | number, string]> = [
    ['Total submissions', total, ''],
    ["Today's submissions", todayCount, ''],
    ['Pending review', pending, 'text-[#94651c]'],
    ['Approved', approved, 'text-[#164b4b]'],
    ['Rejected', rejected, 'text-[#a34c3e]'],
    ['Total revenue', money(revenue, currency), 'text-primary'],
  ];

  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{cards.map(([label, value, cls]) => <div key={label} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-stat-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="text-[11px] text-muted-foreground">{label}</div><div className={cn('mt-2 font-display text-2xl', cls)}>{value}</div></div>)}</div>
    {!!methodRows.length && <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Revenue by method</h3><div className="mt-4 space-y-3">{methodRows.map(([method, v]) => <div key={method} className="flex items-center gap-3"><span className="w-28 shrink-0 text-xs font-semibold capitalize">{method.replace(/_/g, ' ')}</span><div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(v.count / maxCount) * 100}%` }} /></div><span className="w-28 shrink-0 text-right text-[11px] text-muted-foreground">{v.count} · {money(v.total, currency)}</span></div>)}</div></div>}
    {!!recent.length && <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Recent submissions</h3><div className="mt-4 space-y-3">{recent.map((p) => <div key={p.id} className="flex items-center gap-3 text-xs"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#fff0cb] text-[#94651c]"><ReceiptText size={13} /></div><div className="min-w-0 flex-1"><div className="truncate font-bold">{p.studentName}</div><div className="text-[11px] text-muted-foreground">{p.method} · {p.submittedAt.slice(0, 10)}</div></div><Badge tone={p.status === 'pending' ? 'amber' : p.status === 'approved' ? 'green' : 'red'}>{p.status}</Badge></div>)}</div></div>}
    {!total && <EmptyState icon={TrendingUp} title="No submissions yet" body="Stats will fill in as students submit payments." />}
  </div>;
}

export const PAYMENT_TABS = ['Collection Details', 'Bank Accounts', 'Payment Methods', 'Proof Review', 'Stats'] as const;

export const DEGREE_OPTIONS = ['MBBS', 'BDS'] as const;

export const DEGREE_YEAR_OPTIONS: Record<string, string[]> = {
  MBBS: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Final Year'],
  BDS: ['1st Year', '2nd Year', '3rd Year', 'Final Year'],
};

// Turns the Degree + Year picker's own selection straight into the
// programTargetKind/yearTargetNumber pair that actually gates visibility
// (see pastPapersTable's comment) — position within DEGREE_YEAR_OPTIONS is
// the year number, so "Final Year" lands on 5 for MBBS and 4 for BDS
// without needing a separate lookup table to keep in sync.

export function studyYearToNumber(degree: string, studyYear: string): number | undefined {
  const index = (DEGREE_YEAR_OPTIONS[degree] || []).indexOf(studyYear);
  return index >= 0 ? index + 1 : undefined;
}

// Shared classifier for Past papers and Pre-Proffs exams: buckets a flat
// list into MBBS / BDS (whatever a getDegree() callback resolves, falling
// back to "Unspecified" for legacy/untyped rows) and then, inside each of
// those, by whatever getYear() resolves — calendar year for past papers,
// study year for exams. Keeps MBBS before BDS before anything unset, and
// sorts years newest-first within a degree so the page reads as organized
// sections instead of one long flat list.
//
// Optional `getYearSortKey`: when the year groups are actually a study
// year (1st/2nd/.../Final) rather than a calendar year, plain string
// sorting gets "Final Year" wrong (no leading digit to compare against
// "4th Year" etc.) — pass a numeric key per item (e.g. yearTargetNumber)
// and groups sort ascending by it (1st Year first) instead, with any
// group that has no resolvable key sorted last. Omit it to keep the
// original newest-first string sort (past papers' calendar-year grouping,
// and exams' existing behavior — both unaffected by this addition).
export function groupByDegreeYear<T>(items: T[], getDegree: (item: T) => string, getYear: (item: T) => string, getYearSortKey?: (item: T) => number | undefined) {
  const DEGREE_ORDER = ['MBBS', 'BDS'];
  const byDegree = new Map<string, T[]>();
  for (const item of items) {
    const d = getDegree(item) || '';
    if (!byDegree.has(d)) byDegree.set(d, []);
    byDegree.get(d)!.push(item);
  }
  const degrees = [...DEGREE_ORDER.filter((d) => byDegree.has(d)), ...[...byDegree.keys()].filter((d) => !DEGREE_ORDER.includes(d))];
  return degrees.map((degree) => {
    const list = byDegree.get(degree)!;
    const byYear = new Map<string, T[]>();
    for (const item of list) {
      const y = getYear(item) || '';
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(item);
    }
    let years: string[];
    if (getYearSortKey) {
      const keyOf = (y: string) => byYear.get(y)!.map(getYearSortKey).find((k) => k !== undefined && !Number.isNaN(k));
      years = [...byYear.keys()].sort((a, b) => {
        const ka = keyOf(a); const kb = keyOf(b);
        if (ka === undefined && kb === undefined) return a.localeCompare(b);
        if (ka === undefined) return 1;
        if (kb === undefined) return -1;
        return ka - kb;
      });
    } else {
      years = [...byYear.keys()].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    }
    return { degree, groups: years.map((year) => ({ year, items: byYear.get(year)! })) };
  });
}

// Generic collapsible section header, matching McqTreeModule's chevron/
// rotate pattern (the MCQ bank tree) — reused here for Past papers so the
// two collapsible trees in the admin app read as the same design language
// rather than two different accordion implementations.

export function CollapsibleGroup({ title, count, icon, defaultOpen = true, nested, testId, children }: { title: string; count: number; icon?: React.ReactNode; defaultOpen?: boolean; nested?: boolean; testId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className={nested ? 'mb-4 last:mb-0' : 'mb-7 last:mb-0'}>
    <button type="button" onClick={() => setOpen((v) => !v)} className={cn('flex w-full items-center gap-2 text-left', nested ? 'mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground' : 'mb-3 text-xs font-extrabold uppercase tracking-[.08em] text-primary')} data-testid={`button-toggle-${testId}`}>
      <ChevronRight size={nested ? 13 : 14} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
      {icon}{title}<span className="ml-auto font-mono-app text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">{count}</span>
    </button>
    {open && children}
  </div>;
}

export function PastPaperEditForm({ paper, onSave, onCancel, saving, collegeOptions }: { paper: PastPaper; onSave: (body: Partial<PastPaper>) => void; onCancel: () => void; saving: boolean; collegeOptions: string[] }) {
  const [initialDegree, initialStudyYear] = (paper.level || '').split(' - ').map((s) => s.trim());
  const [formDegree, setFormDegree] = useState(DEGREE_OPTIONS.includes(initialDegree as typeof DEGREE_OPTIONS[number]) ? initialDegree : '');
  const [formStudyYear, setFormStudyYear] = useState((DEGREE_YEAR_OPTIONS[initialDegree] || []).includes(initialStudyYear) ? initialStudyYear : '');
  const [formProgramId, setFormProgramId] = useState(paper.programId ? String(paper.programId) : '');
  const programsQ = useQuery({ queryKey: ['admin-programs-flat'], queryFn: () => academicApi.programs(undefined, true) });
  const academicYearsQ = useQuery({ queryKey: ['admin-academic-years-flat', formProgramId], queryFn: () => academicApi.academicYears(formProgramId ? Number(formProgramId) : undefined, true) });
  const composedLevel = [formDegree, formStudyYear].filter(Boolean).join(' - ');

  return <form onSubmit={(e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const programId = f.get('programId') ? Number(f.get('programId')) : null;
    const academicYearId = f.get('academicYearId') ? Number(f.get('academicYearId')) : null;
    onSave({
      title: String(f.get('title')), examBoard: String(f.get('examBoard') || ''), year: String(f.get('year') || ''),
      level: composedLevel || String(f.get('level') || ''), programId, academicYearId,
      programTargetKind: formDegree || null, yearTargetNumber: studyYearToNumber(formDegree, formStudyYear) ?? null,
    });
  }} className="grid gap-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-4 sm:p-5 md:grid-cols-4">
    <input required name="title" defaultValue={paper.title} placeholder="Paper title, e.g. Block A" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 md:col-span-2" data-testid={`input-edit-paper-title-${paper.id}`} />
    <input name="examBoard" defaultValue={paper.examBoard} list={`edit-paper-college-options-${paper.id}`} placeholder="College, e.g. KMU" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25" data-testid={`input-edit-paper-board-${paper.id}`} />
    <datalist id={`edit-paper-college-options-${paper.id}`}>{collegeOptions.map((c) => <option key={c} value={c} />)}</datalist>
    <input name="year" defaultValue={paper.year} placeholder="Year, e.g. 2024" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25" data-testid={`input-edit-paper-year-${paper.id}`} />

    <div className="rounded-xl border-2 border-primary/40 bg-card/70 p-3 md:col-span-4">
      <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[.08em] text-primary">Degree &amp; year (shown to students)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold text-muted-foreground">Degree</span>
          <select value={formDegree} onChange={(e) => { setFormDegree(e.target.value); setFormStudyYear(''); }} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-xs font-semibold outline-none transition-shadow focus:ring-2 focus:ring-primary/25" data-testid={`select-edit-paper-degree-${paper.id}`}>
            <option value="">Select degree…</option>
            {DEGREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold text-muted-foreground">Year</span>
          <select value={formStudyYear} onChange={(e) => setFormStudyYear(e.target.value)} disabled={!formDegree} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-xs font-semibold outline-none transition-shadow focus:ring-2 focus:ring-primary/25 disabled:opacity-50" data-testid={`select-edit-paper-study-year-${paper.id}`}>
            <option value="">{formDegree ? 'Select year…' : 'Pick a degree first'}</option>
            {(DEGREE_YEAR_OPTIONS[formDegree] || []).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
    </div>

    <select name="programId" value={formProgramId} onChange={(e) => setFormProgramId(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 md:col-span-2" data-testid={`select-edit-paper-program-${paper.id}`}><option value="">All programs (advanced targeting, optional)</option>{(programsQ.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <select name="academicYearId" defaultValue={paper.academicYearId ?? ''} disabled={!formProgramId} className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 disabled:opacity-50 md:col-span-2" data-testid={`select-edit-paper-academic-year-${paper.id}`}><option value="">All years</option>{(academicYearsQ.data || []).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
    <input name="level" value={composedLevel} onChange={() => {}} placeholder="Level label (auto-filled from Degree + Year above)" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 md:col-span-2" data-testid={`input-edit-paper-level-${paper.id}`} readOnly />

    <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
      <button disabled={saving} className="btn-pop flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm sm:flex-none disabled:opacity-50" data-testid={`button-save-edit-paper-${paper.id}`}>{saving ? <span className="inline-flex items-center gap-2"><BrandSpinner size={13} /> Saving…</span> : 'Save changes'}</button>
      <button type="button" onClick={onCancel} className="btn-pop flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover:bg-muted sm:flex-none" data-testid={`button-cancel-edit-paper-${paper.id}`}>Cancel</button>
    </div>
  </form>;
}

// This paper's own question bank — MCQs with pastPaperId set are exclusively
// owned by their paper (no junction table like exams have), so this is a
// straight filter of the same admin MCQ list the main bank tree uses,
// reusing McqTreeRow for edit/delete so it behaves identically to editing a
// question there.

export function PastPaperQuestionsList({ pastPaperId }: { pastPaperId: number }) {
  const treeQ = useQuery({ queryKey: ['admin-mcqs-tree'], queryFn: mcqAdminApi.list });
  const rows = (treeQ.data ?? []).filter((m) => m.pastPaperId === pastPaperId);
  if (treeQ.isLoading) return <InlineLoading />;
  if (!rows.length) return <p className="text-[11px] text-muted-foreground">No questions yet — upload some below.</p>;
  return <div className="max-h-96 space-y-2 overflow-y-auto pr-1">{rows.map((m) => <McqTreeRow key={m.id} mcq={m} />)}</div>;
}

// Compact bulk-import widget scoped to one past paper — parses a file into
// candidate MCQs (reusing the same parser as the main MCQ bank) and commits
// them tagged with this paper's id.

export function PastPaperUploader({ pastPaperId, onImported }: { pastPaperId: number; onImported: () => void }) {
  const modulesQ = useListModules();
  const modules = modulesQ.data ?? [];
  const [moduleId, setModuleId] = useState('');
  const subjectsQ = useListSubjects(moduleId ? { moduleId: Number(moduleId) } : undefined);
  const [subjectId, setSubjectId] = useState('');
  const topicsQ = useListTopics(subjectId ? { subjectId: Number(subjectId) } : undefined);
  const [topicId, setTopicId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<McqCandidate[]>([]);
  const commit = useMutation({
    mutationFn: mcqImportApi.commit,
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }); setCandidates([]); setFile(null); toast({ title: `Imported ${res.imported} questions`, description: 'Linked to this past paper.' }); onImported(); },
    onError: (err: unknown) => toast({ title: 'Import failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const parseFile = async () => {
    if (!file) return;
    setParsing(true); setParseError(null);
    try { setCandidates((await mcqImportApi.parse(file)).candidates); }
    catch (err) { setParseError(err instanceof ApiRequestError ? err.message : 'Could not parse this file.'); }
    finally { setParsing(false); }
  };
  const importAll = () => {
    if (!candidates.length) return;
    const cleaned = candidates.map((c) => ({ ...c, options: c.options.map((o) => o.trim()).filter(Boolean) })).filter((c) => c.options.length >= 2);
    // pastPaperId alone is enough to save these — module/subject/topic below
    // are an optional "also file this under a topic" extra, not a gate.
    commit.mutate({ moduleId: moduleId ? Number(moduleId) : undefined, subjectId: subjectId ? Number(subjectId) : undefined, topicId: topicId ? Number(topicId) : undefined, pastPaperId, status: 'published', mcqs: cleaned });
  };

  return <div>
    <p className="mb-2 text-[11px] text-muted-foreground">Optional — also file these under a module/subject/topic. Not required to import; the past paper is enough on its own.</p>
    <div className="grid gap-2 sm:grid-cols-3"><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-9 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`select-paper-module-${pastPaperId}`}><option value="">No module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-9 rounded-lg border border-border bg-background px-2 text-xs disabled:opacity-50" data-testid={`select-paper-subject-${pastPaperId}`}><option value="">No subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-9 rounded-lg border border-border bg-background px-2 text-xs disabled:opacity-50" data-testid={`select-paper-topic-${pastPaperId}`}><option value="">No topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    <div className="mt-2 flex flex-wrap items-center gap-2"><input type="file" accept=".txt,.csv,.xlsx,.xls,.pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="flex-1 rounded-lg border border-dashed border-border bg-background px-2 py-2 text-xs" data-testid={`input-paper-file-${pastPaperId}`} /><button disabled={!file || parsing} onClick={parseFile} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-parse-paper-${pastPaperId}`}>{parsing ? 'Reading…' : 'Parse file'}</button></div>
    {parseError && <p className="mt-2 text-[11px] font-semibold text-destructive">{parseError}</p>}
    {candidates.length > 0 && <div className="mt-3"><div className="mb-2 flex items-center justify-between text-xs font-bold"><span>{candidates.length} questions found · {candidates.filter((c) => c.needsReview).length} need review</span><button disabled={commit.isPending} onClick={importAll} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid={`button-import-paper-${pastPaperId}`}>{commit.isPending ? 'Importing…' : `Import ${candidates.length} questions`}</button></div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">{candidates.map((c, i) => <div key={i} className="rounded-lg border border-border bg-background p-2 text-xs"><div className="line-clamp-2 font-semibold">{c.question}</div><div className="mt-1 text-[10px] text-muted-foreground">{c.options.filter(Boolean).length} options{c.needsReview ? ' · needs review' : ''}</div></div>)}</div>
    </div>}
  </div>;
}

// Editable row for one flashcard — front/back text, inline edit, delete.
// Mirrors McqTreeRow's shape (edit form replaces the display on click).

export function FlashcardTreeRow({ card }: { card: AdminFlashcard }) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [deleting, setDeleting] = useState(false);
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['admin-flashcards-tree'] }); queryClient.invalidateQueries({ queryKey: getListFlashcardsQueryKey() }); };
  const update = useMutation({ mutationFn: () => flashcardsAdminApi.update(card.id, { front: front.trim(), back: back.trim() }), onSuccess: () => { invalidate(); setEditing(false); }, onError: (err: unknown) => toast({ title: 'Could not save flashcard', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const remove = useMutation({ mutationFn: () => flashcardsAdminApi.remove(card.id), onSuccess: () => { invalidate(); setDeleting(false); }, onError: (err: unknown) => toast({ title: 'Could not delete flashcard', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });

  if (editing) return <div className="rounded-xl border border-primary/30 bg-[#eef7f1] p-3" data-testid={`row-edit-flashcard-${card.id}`}>
    <textarea value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" className="min-h-14 w-full rounded-lg border border-border bg-card p-2 text-xs" data-testid={`input-edit-flashcard-front-${card.id}`} />
    <textarea value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" className="mt-2 min-h-14 w-full rounded-lg border border-border bg-card p-2 text-xs" data-testid={`input-edit-flashcard-back-${card.id}`} />
    <div className="mt-2 flex gap-2"><button type="button" disabled={update.isPending || !front.trim() || !back.trim()} onClick={() => update.mutate()} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-flashcard-${card.id}`}>Save</button><button type="button" onClick={() => { setEditing(false); setFront(card.front); setBack(card.back); }} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground" data-testid={`button-cancel-edit-flashcard-${card.id}`}>Cancel</button></div>
  </div>;
  return <div className="rounded-xl border border-border bg-card p-3" data-testid={`row-flashcard-${card.id}`}>
    <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold leading-5">{card.front}</p><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-flashcard-${card.id}`}><Pencil size={13} /></button><button type="button" onClick={() => setDeleting(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-flashcard-${card.id}`}><Trash2 size={13} /></button></div></div>
    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{card.back}</p>
    {deleting && <ConfirmDialog title="Delete this flashcard?" body="This cannot be undone." onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()} pending={remove.isPending} />}
  </div>;
}

// "Delete every flashcard in this scope" — mirrors BulkDeleteInScope for MCQs.

export function FlashcardBulkDeleteInScope({ label, count, filters }: { label: string; count: number; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
  const [confirming, setConfirming] = useState(false);
  const bulkDelete = useMutation({
    mutationFn: () => flashcardsAdminApi.bulkRemove({ all: true, filters }),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ['admin-flashcards-tree'] }); queryClient.invalidateQueries({ queryKey: getListFlashcardsQueryKey() }); setConfirming(false); toast({ title: `Deleted ${res.deleted} flashcard${res.deleted === 1 ? '' : 's'}` }); },
    onError: (err: unknown) => toast({ title: 'Bulk delete failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  if (!count) return null;
  return <>
    <button type="button" onClick={(e) => { e.stopPropagation(); setConfirming(true); }} className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-all-flashcards-in-${label.replace(/\s+/g, '-').toLowerCase()}`} aria-label={`Delete all flashcards in ${label}`}><Trash2 size={13} /></button>
    {confirming && <ConfirmDialog title={`Delete all ${count} flashcard${count === 1 ? '' : 's'} in "${label}"?`} body="This removes every flashcard in this scope — there is no undo." confirmLabel={`Delete all ${count}`} onCancel={() => setConfirming(false)} onConfirm={() => bulkDelete.mutate()} pending={bulkDelete.isPending} />}
  </>;
}

export function FlashcardTreeTopic({ topicId, name, cardsByTopic }: { topicId: number; name: string; cardsByTopic: Map<number, AdminFlashcard[]> }) {
  const [open, setOpen] = useState(false);
  const rows = cardsByTopic.get(topicId) ?? [];
  return <div className="rounded-lg border border-border bg-background">
    <div className="flex items-center justify-between px-3 py-2"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-flashcard-tree-topic-${topicId}`}><ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[10px] font-normal text-muted-foreground">{rows.length} card{rows.length === 1 ? '' : 's'}</span><FlashcardBulkDeleteInScope label={name} count={rows.length} filters={{ topicId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-3">{rows.length ? rows.map((c) => <FlashcardTreeRow key={c.id} card={c} />) : <p className="text-[11px] text-muted-foreground">No flashcards in this topic yet.</p>}</div>}
  </div>;
}

export function FlashcardTreeSubject({ subjectId, name, cardsByTopic }: { subjectId: number; name: string; cardsByTopic: Map<number, AdminFlashcard[]> }) {
  const [open, setOpen] = useState(false);
  const topicsQ = useQuery({ queryKey: ['admin-topics', subjectId], queryFn: () => topicAdminApi.list(subjectId), enabled: open });
  const topics = topicsQ.data ?? [];
  const subjectCount = [...cardsByTopic.entries()].filter(([tId]) => topics.some((t) => t.id === tId)).reduce((sum, [, rows]) => sum + rows.length, 0);
  return <div className="rounded-xl border border-border bg-card">
    <div className="flex items-center justify-between px-4 py-2.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-flashcard-tree-subject-${subjectId}`}><ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />{name}</button>{open && <FlashcardBulkDeleteInScope label={name} count={subjectCount} filters={{ subjectId }} />}</div>
    {open && <div className="space-y-2 border-t border-border p-3">{topicsQ.isLoading ? <InlineLoading label="Loading topics…" /> : topics.length ? topics.map((t) => <FlashcardTreeTopic key={t.id} topicId={t.id} name={t.name} cardsByTopic={cardsByTopic} />) : <p className="text-[11px] text-muted-foreground">No topics in this subject yet.</p>}</div>}
  </div>;
}

export function FlashcardTreeModule({ moduleId, name, cardCount, cardsByTopic }: { moduleId: number; name: string; cardCount: number; cardsByTopic: Map<number, AdminFlashcard[]> }) {
  const [open, setOpen] = useState(false);
  const subjectsQ = useQuery({ queryKey: ['admin-subjects', moduleId], queryFn: () => subjectAdminApi.list(moduleId), enabled: open });
  const subjects = subjectsQ.data ?? [];
  return <div className="rounded-2xl border border-border bg-card">
    <div className="flex items-center justify-between px-5 py-3.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-sm font-extrabold" data-testid={`button-flashcard-tree-module-${moduleId}`}><ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[11px] text-muted-foreground">{cardCount} card{cardCount === 1 ? '' : 's'}</span><FlashcardBulkDeleteInScope label={name} count={cardCount} filters={{ moduleId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-4">{subjectsQ.isLoading ? <InlineLoading label="Loading subjects…" /> : subjects.length ? subjects.map((s) => <FlashcardTreeSubject key={s.id} subjectId={s.id} name={s.name} cardsByTopic={cardsByTopic} />) : <p className="text-xs text-muted-foreground">No subjects in this module yet.</p>}</div>}
  </div>;
}

// Top level of the flashcard bank tree — one "MBBS/BDS · Year N" group.
// Collapsed by default, exactly like McqTreeYearGroup in the MCQ bank:
// clicking it is what rolls out the Blocks (and their nested
// Modules/Subjects/Topics) underneath, instead of dumping every block and
// module open on screen at once.

export function FlashcardTreeYearGroup({ programLabel, yearLabel, groups, showBlockLabel, countByModule, cardsByTopic }: {
  programLabel: string; yearLabel: string;
  groups: Array<{ key: string; name: string; mods: AdminModule[] }>;
  showBlockLabel: boolean; countByModule: Map<number, number>; cardsByTopic: Map<number, AdminFlashcard[]>;
}) {
  const [open, setOpen] = useState(false);
  const groupCount = groups.reduce((sum, g) => sum + g.mods.reduce((s, m) => s + (countByModule.get(m.id) ?? 0), 0), 0);
  return <div className="rounded-2xl border border-border bg-card">
    <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-3.5 text-left" data-testid={`button-flashcard-tree-year-${programLabel}-${yearLabel}`}>
      <ChevronRight size={16} className={cn('shrink-0 text-primary transition-transform', open && 'rotate-90')} />
      <GraduationCap size={15} className="shrink-0 text-primary" />
      <h3 className="flex-1 text-sm font-extrabold" data-testid={`text-flashcard-program-year-group-${programLabel}-${yearLabel}`}>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></h3>
      <span className="text-[11px] text-muted-foreground">{groupCount} card{groupCount === 1 ? '' : 's'}</span>
    </button>
    {open && <div className="space-y-5 border-t border-border p-4">
      {groups.map((g) => <div key={g.key} className="space-y-3">
        {showBlockLabel && <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground" data-testid={`text-flashcard-block-group-${g.key}`}>{g.name}</p>}
        {g.mods.map((m) => <FlashcardTreeModule key={m.id} moduleId={m.id} name={m.name} cardCount={countByModule.get(m.id) ?? 0} cardsByTopic={cardsByTopic} />)}
      </div>)}
    </div>}
  </div>;
}

// Flashcard bank tree (module > subject > topic) — mirrors McqBankTree so
// flashcards get the same "not all crammed onto one screen" browsing and the
// same per-scope permanent delete as the MCQ bank.

export function FlashcardBankTree({ modules, blocks }: { modules: AdminModule[]; blocks: AdminBlock[] }) {
  const treeQ = useQuery({ queryKey: ['admin-flashcards-tree'], queryFn: () => flashcardsAdminApi.list() });
  const rows = treeQ.data ?? [];
  const cardsByTopic = new Map<number, AdminFlashcard[]>();
  const trulyUnassigned: AdminFlashcard[] = [];
  for (const row of rows) {
    if (row.topicId == null) { trulyUnassigned.push(row); continue; }
    const list = cardsByTopic.get(row.topicId);
    if (list) list.push(row); else cardsByTopic.set(row.topicId, [row]);
  }
  const countByModule = new Map<number, number>();
  for (const row of rows) if (row.moduleId != null) countByModule.set(row.moduleId, (countByModule.get(row.moduleId) ?? 0) + 1);
  if (treeQ.isLoading) return <SkeletonPage />;
  if (!modules.length && !trulyUnassigned.length) return <EmptyState icon={Zap} title="No modules yet" body="Create a module first under Academic content, then come back to browse its flashcards here." />;
  const modulesByBlock = new Map<number | 'other', AdminModule[]>();
  for (const m of modules) { const key = m.blockId ?? 'other'; const list = modulesByBlock.get(key); if (list) list.push(m); else modulesByBlock.set(key, [m]); }
  const blockLeaves = blocks.filter((b) => modulesByBlock.has(b.id)).map((b) => {
    const mods = modulesByBlock.get(b.id)!;
    const fallback = mods.find((m) => m.programTargetKind || m.yearTargetNumber);
    return { key: `block-${b.id}`, name: b.name, mods, program: b.programTargetKind || fallback?.programTargetKind || null, year: b.yearTargetNumber ?? fallback?.yearTargetNumber ?? null };
  });
  const standaloneLeaves = (modulesByBlock.get('other') ?? []).map((m) => ({ key: `module-${m.id}`, name: m.name, mods: [m], program: m.programTargetKind || null, year: m.yearTargetNumber ?? null }));
  const programYearGroups = groupByProgramYear([...blockLeaves, ...standaloneLeaves]);
  const showBlockLabel = blocks.length > 0 || standaloneLeaves.length > 0;
  return <div className="space-y-4">
    {programYearGroups.map(({ programLabel, yearLabel, groups }) => <FlashcardTreeYearGroup key={`${programLabel}-${yearLabel}`} programLabel={programLabel} yearLabel={yearLabel} groups={groups} showBlockLabel={showBlockLabel} countByModule={countByModule} cardsByTopic={cardsByTopic} />)}
    {!!trulyUnassigned.length && <div className="rounded-2xl border border-dashed border-border bg-card p-4"><p className="mb-3 text-xs font-bold text-muted-foreground">{trulyUnassigned.length} flashcard{trulyUnassigned.length === 1 ? '' : 's'} with no module/subject/topic</p><div className="space-y-2">{trulyUnassigned.map((c) => <FlashcardTreeRow key={c.id} card={c} />)}</div></div>}
  </div>;
}

export function FeedbackThread({ feedbackId }: { feedbackId: number }) {
  const repliesQ = useQuery({ queryKey: ['feedback-replies', feedbackId], queryFn: () => feedbackApi.listReplies(feedbackId) });
  const [message, setMessage] = useState('');
  const reply = useMutation({
    mutationFn: () => feedbackApi.reply(feedbackId, message.trim()),
    onSuccess: () => { setMessage(''); queryClient.invalidateQueries({ queryKey: ['feedback-replies', feedbackId] }); queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }); },
    onError: (err: unknown) => toast({ title: 'Could not send reply', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  return <div className="mt-4 space-y-3 border-t border-border pt-4">
    {repliesQ.isLoading ? <InlineLoading label="Loading replies…" /> : (repliesQ.data || []).map((r) => <div key={r.id} className={cn('max-w-[85%] rounded-xl p-3 text-xs', r.authorRole === 'admin' ? 'ml-auto bg-[#eef7f1]' : 'bg-muted')} data-testid={`row-feedback-reply-${r.id}`}><div className="mb-1 text-[10px] font-bold text-muted-foreground">{r.authorRole === 'admin' ? 'Academic team' : 'Student'} · {new Date(r.createdAt).toLocaleString()}</div>{r.message}</div>)}
    {!repliesQ.isLoading && !repliesQ.data?.length && <p className="text-xs text-muted-foreground">No replies yet — be the first to respond.</p>}
    <div className="flex gap-2"><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a reply…" className="min-h-16 flex-1 rounded-xl border border-border bg-background p-2 text-xs" data-testid={`input-feedback-reply-${feedbackId}`} /><button onClick={() => message.trim() && reply.mutate()} disabled={reply.isPending || !message.trim()} className="self-end rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-send-feedback-reply-${feedbackId}`}>{reply.isPending ? 'Sending…' : 'Reply'}</button></div>
  </div>;
}

export function ColorField({ label, value, onChange, testId }: { label: string; value: string; onChange: (value: string) => void; testId: string }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
  return <label className="block text-xs font-bold">{label}
    <div className="mt-2 flex items-center gap-2">
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border" style={{ backgroundColor: safe }}>
        <input type="color" value={safe} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" data-testid={`input-color-picker-${testId}`} />
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#000000" maxLength={7} className="h-10 w-28 rounded-lg border border-border bg-background px-2 font-mono-app text-xs uppercase outline-none focus:ring-2 focus:ring-primary/20" data-testid={`input-color-hex-${testId}`} />
    </div>
  </label>;
}

export function TeamPhoto({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  const url = member.photoPath ? resolveUploadUrl(member.photoPath) : null;
  if (!url || broken) return <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-xs font-extrabold text-[#164b4b]">{initials(member.name)}</div>;
  return <img src={url} alt={member.name} loading="lazy" decoding="async" className="size-11 shrink-0 rounded-full object-cover" onError={() => setBroken(true)} />;
}

// Full edit — every field the create form sets, pre-filled, so admins
// aren't stuck only being able to publish/archive after creation. Uses
// the same `update` mutation the parent already wires to a PATCH.

export function ExamEditForm({ exam, onSave, onCancel, saving }: { exam: AdminExam; onSave: (body: Partial<AdminExam>) => void; onCancel: () => void; saving: boolean }) {
  const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  return <form onSubmit={(e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    onSave({
      title: String(f.get('title')), description: String(f.get('description') || ''),
      programTargetKind: String(f.get('programTargetKind') || '') || null, yearTargetNumber: f.get('yearTargetNumber') ? Number(f.get('yearTargetNumber')) : null,
      durationMinutes: Number(f.get('durationMinutes') || 60), startAt: new Date(String(f.get('startAt'))).toISOString(), endAt: new Date(String(f.get('endAt'))).toISOString(),
      maxAttempts: Number(f.get('maxAttempts') || 1), negativeMarkingEnabled: f.get('negativeMarkingEnabled') === 'on', negativeMarkPerWrong: Number(f.get('negativeMarkPerWrong') || 0),
      passingPercent: f.get('passingPercent') ? Number(f.get('passingPercent')) : null, resultReleaseMode: f.get('resultReleaseMode') as Exam['resultReleaseMode'],
      showMarks: f.get('showMarks') === 'on', showPercentage: f.get('showPercentage') === 'on', showCorrectAnswers: f.get('showCorrectAnswers') === 'on',
    });
  }} className="mt-4 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
    <div className="grid gap-3 sm:grid-cols-2"><input required name="title" defaultValue={exam.title} placeholder="Exam title" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid={`input-edit-exam-title-${exam.id}`} /><input name="description" defaultValue={exam.description} placeholder="Short description" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid={`input-edit-exam-description-${exam.id}`} /></div>
    <div className="grid gap-3 sm:grid-cols-4"><select name="programTargetKind" defaultValue={exam.programTargetKind ?? ''} className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid={`select-edit-exam-program-${exam.id}`}><option value="">All Programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select><select name="yearTargetNumber" defaultValue={exam.yearTargetNumber ?? ''} className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid={`select-edit-exam-year-${exam.id}`}><option value="">All Years</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select><input required type="number" name="durationMinutes" defaultValue={exam.durationMinutes} placeholder="Duration (min)" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid={`input-edit-exam-duration-${exam.id}`} /><input required type="number" name="maxAttempts" defaultValue={exam.maxAttempts} min={1} placeholder="Max attempts" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid={`input-edit-exam-attempts-${exam.id}`} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-[11px] font-bold">Opens<input required type="datetime-local" name="startAt" defaultValue={toLocalInput(exam.startAt)} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid={`input-edit-exam-start-${exam.id}`} /></label><label className="text-[11px] font-bold">Closes<input required type="datetime-local" name="endAt" defaultValue={toLocalInput(exam.endAt)} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid={`input-edit-exam-end-${exam.id}`} /></label></div>
    <div className="grid gap-3 sm:grid-cols-3"><label className="text-[11px] font-bold">Passing %<input type="number" name="passingPercent" defaultValue={exam.passingPercent ?? ''} min={0} max={100} placeholder="e.g. 50" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid={`input-edit-exam-passing-${exam.id}`} /></label><label className="text-[11px] font-bold">Result release<select name="resultReleaseMode" defaultValue={exam.resultReleaseMode} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid={`select-edit-exam-release-${exam.id}`}><option value="immediate">Immediately after submit</option><option value="after_end">When exam window closes</option><option value="manual">Manually by admin</option></select></label><label className="text-[11px] font-bold">Negative mark / wrong<input type="number" step="0.25" name="negativeMarkPerWrong" defaultValue={exam.negativeMarkPerWrong} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid={`input-edit-exam-negative-${exam.id}`} /></label></div>
    <div className="flex flex-wrap gap-4 text-xs font-bold"><label className="flex items-center gap-1.5"><input type="checkbox" name="negativeMarkingEnabled" defaultChecked={exam.negativeMarkingEnabled} className="size-4 accent-[#287058]" data-testid={`checkbox-edit-negative-marking-${exam.id}`} /> Enable negative marking</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showMarks" defaultChecked={exam.showMarks} className="size-4 accent-[#287058]" data-testid={`checkbox-edit-show-marks-${exam.id}`} /> Show marks</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showPercentage" defaultChecked={exam.showPercentage} className="size-4 accent-[#287058]" data-testid={`checkbox-edit-show-percentage-${exam.id}`} /> Show percentage</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showCorrectAnswers" defaultChecked={exam.showCorrectAnswers} className="size-4 accent-[#287058]" data-testid={`checkbox-edit-show-answers-${exam.id}`} /> Show correct answers after release</label></div>
    <div className="flex gap-2"><button disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-edit-exam-${exam.id}`}>{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2 text-xs font-bold" data-testid={`button-cancel-edit-exam-${exam.id}`}>Cancel</button></div>
  </form>;
}

export function ExamManagePanel({ exam, autoOpenUpload }: { exam: AdminExam; autoOpenUpload?: boolean }) {
  const [mcqIdsInput, setMcqIdsInput] = useState('');
  const setQuestions = useMutation({ mutationFn: (mcqIds: number[]) => examsAdminApi.setQuestions(exam.id, mcqIds), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-exams'] }) });
  const attemptsQ = useQuery({ queryKey: ['exam-attempts', exam.id], queryFn: () => examsAdminApi.attempts(exam.id) });
  const existingQuestionsQ = useQuery({ queryKey: ['exam-questions', exam.id], queryFn: () => examsAdminApi.getQuestions(exam.id) });

  // Bulk upload — same file parser as the MCQ bank (txt/csv/xlsx/pdf/docx,
  // per-option explanations included). Parsed questions attach directly to
  // this exam (examId) and land in their own exam-questions bank — no
  // module/subject/topic needed, same as past-paper imports.
  const [uploadOpen, setUploadOpen] = useState(!!autoOpenUpload);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<McqCandidate[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const parseFile = async () => {
    if (!file) return;
    setParsing(true); setParseError(null);
    try {
      const res = await mcqImportApi.parse(file);
      setCandidates(res.candidates);
    } catch (err) {
      setParseError(err instanceof ApiRequestError ? err.message : 'Could not read this file.');
    } finally {
      setParsing(false);
    }
  };
  const updateCandidate = (i: number, patch: Partial<McqCandidate>) => setCandidates((prev) => prev.map((c, ci) => (ci === i ? { ...c, ...patch } : c)));
  const removeCandidate = (i: number) => setCandidates((prev) => prev.filter((_, ci) => ci !== i));

  const commitToExam = useMutation({
    mutationFn: async () => {
      // examId places these directly in the exam-questions bank and
      // auto-attaches them to this exam's paper server-side.
      const { ids } = await mcqImportApi.commit({ examId: exam.id, status: 'published', mcqs: candidates });
      if (replaceExisting) {
        const existingIds = (existingQuestionsQ.data ?? []).map((q) => q.id).filter((id) => !ids.includes(id));
        // Explicit "replace" still means only these new questions remain
        // attached — drop anything that isn't one of the freshly imported ids.
        await examsAdminApi.setQuestions(exam.id, ids);
        void existingIds; // old attachment already superseded by the commit route's auto-link + this setQuestions call
      }
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam-questions', exam.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] });
      setCandidates([]); setFile(null); setUploadOpen(false);
      toast({ title: `Added ${count} question${count === 1 ? '' : 's'} to this exam` });
    },
    onError: (err: unknown) => toast({ title: 'Could not add questions to this exam', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  return <div className="mt-4 space-y-4 border-t border-border pt-4">
    <div>
      <div className="flex items-center justify-between"><div className="text-xs font-bold">Attach questions</div><button onClick={() => setUploadOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold" data-testid={`button-toggle-exam-upload-${exam.id}`}><UploadCloud size={12} /> {uploadOpen ? 'Hide' : 'Upload a file'}</button></div>
      <p className="mt-1 text-[11px] text-muted-foreground">Paste MCQ IDs from the MCQ bank (comma-separated) to build this exam's paper, or upload a question file below.</p>
      <div className="mt-2 flex gap-2"><input value={mcqIdsInput} onChange={(e) => setMcqIdsInput(e.target.value)} placeholder="e.g. 12, 13, 14, 20" className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-exam-mcq-ids-${exam.id}`} /><button onClick={() => { const ids = mcqIdsInput.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)); if (ids.length) setQuestions.mutate(ids); }} disabled={setQuestions.isPending} className="rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-set-exam-questions-${exam.id}`}>Set paper ({exam.questionCount} currently)</button></div>

      {uploadOpen && <div className="mt-3 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-4">
        <p className="text-[11px] font-bold">Upload a question file — supports .txt, .csv, .xlsx, .xls, .pdf, .docx, and picks up per-option explanations if the file has them.</p>
        <p className="text-[11px] font-semibold text-muted-foreground">Imported questions attach straight to this exam and live in their own exam-questions bank — no module/subject/topic needed.</p>
        <div className="flex flex-wrap items-center gap-2"><input type="file" accept=".txt,.csv,.xlsx,.xls,.pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="flex-1 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-xs" data-testid={`input-exam-file-${exam.id}`} /><button disabled={!file || parsing} onClick={parseFile} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-parse-exam-file-${exam.id}`}>{parsing ? 'Reading…' : 'Parse file'}</button></div>
        {parseError && <p className="text-[11px] font-semibold text-destructive">{parseError}</p>}

        {candidates.length > 0 && <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-bold">{candidates.length} questions found · {candidates.filter((c) => c.needsReview).length} need review</div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} data-testid={`checkbox-exam-replace-${exam.id}`} /> Replace this exam's current paper instead of adding to it</label>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">{candidates.map((c, i) => <div key={i} className={cn('rounded-xl border bg-card p-3', c.needsReview ? 'border-[#e5a952]' : 'border-border')} data-testid={`card-exam-candidate-${i}`}>
            <div className="flex items-center justify-between"><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', c.needsReview ? 'bg-[#fdeecb] text-[#8a5a12]' : 'bg-[#d7eee4] text-[#164b4b]')}>{c.needsReview ? 'Needs review' : 'Looks good'}</span><button onClick={() => removeCandidate(i)} className="text-[11px] font-bold text-destructive" data-testid={`button-remove-exam-candidate-${i}`}>Remove</button></div>
            <textarea value={c.question} onChange={(e) => updateCandidate(i, { question: e.target.value })} className="mt-2 min-h-12 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-exam-candidate-question-${i}`} />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3, 4].map((oi) => <input key={oi} value={c.options[oi] || ''} onChange={(e) => { const opts = [...c.options]; opts[oi] = e.target.value; updateCandidate(i, { options: opts }); }} placeholder={`Option ${String.fromCharCode(65 + oi)}${oi === 4 ? ' (optional)' : ''}`} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-exam-candidate-option-${i}-${oi}`} />)}</div>
            <div className="mt-2 flex items-center gap-2"><span className="text-[11px] font-bold text-muted-foreground">Correct:</span><select value={c.correctAnswer ?? ''} onChange={(e) => updateCandidate(i, { correctAnswer: e.target.value || null })} className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`select-exam-candidate-answer-${i}`}><option value="">Not set</option>{c.options.map((opt, oi) => opt && <option key={oi} value={opt}>{String.fromCharCode(65 + oi)}. {opt.slice(0, 40)}</option>)}</select></div>
            <div className="mt-2 flex items-center gap-2"><span className="text-[11px] font-bold text-muted-foreground">Difficulty:</span><DifficultyPicker value={c.difficulty} onChange={(v) => updateCandidate(i, { difficulty: v })} testId={`button-exam-candidate-difficulty-${i}`} /></div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={c.hint ?? ''} onChange={(e) => updateCandidate(i, { hint: e.target.value || null })} placeholder="Hint (optional — shown while attempting)" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-exam-candidate-hint-${i}`} />
              <input value={c.reference ?? ''} onChange={(e) => updateCandidate(i, { reference: e.target.value || null })} placeholder="Reference (optional)" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-exam-candidate-reference-${i}`} />
            </div>
            {c.options.some((o) => o.trim()) && <details className="mt-2" open={!!c.optionExplanations?.some((e) => e?.trim())}>
              <summary className="cursor-pointer text-[11px] font-bold text-primary">Per-option explanations</summary>
              <div className="mt-2 space-y-1.5">{c.options.map((opt, oi) => opt.trim() && <div key={oi} className="flex items-start gap-2"><span className={cn('mt-1.5 grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold', c.correctAnswer === opt ? 'bg-[#d7eee4] text-[#287058]' : 'bg-[#fff1ed] text-[#a34c3e]')}>{String.fromCharCode(65 + oi)}</span><textarea value={c.optionExplanations?.[oi] ?? ''} onChange={(e) => { const next = [...(c.optionExplanations ?? c.options.map(() => null))]; next[oi] = e.target.value || null; updateCandidate(i, { optionExplanations: next }); }} placeholder={c.correctAnswer === opt ? 'Why this is correct...' : 'Why this is wrong...'} className="min-h-8 flex-1 rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-exam-candidate-option-explanation-${i}-${oi}`} /></div>)}</div>
            </details>}
          </div>)}</div>
          <button disabled={commitToExam.isPending} onClick={() => commitToExam.mutate()} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid={`button-commit-exam-candidates-${exam.id}`}>{commitToExam.isPending ? 'Adding…' : replaceExisting ? `Replace paper with these ${candidates.length} questions` : `Add these ${candidates.length} questions to the exam`}</button>
        </div>}
      </div>}
    </div>
    <div>
      <div className="flex items-center justify-between"><div className="text-xs font-bold">This exam's questions ({existingQuestionsQ.data?.length ?? 0})</div></div>
      <p className="mt-1 text-[11px] text-muted-foreground">The exam's actual paper — whether attached by upload, pasted ID, or set-questions above. Removing one here takes it off this exam's paper only; it stays in whichever bank it came from.</p>
      <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {(existingQuestionsQ.data ?? []).map((q) => <div key={q.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs" data-testid={`row-exam-question-${q.id}`}>
          <span className="line-clamp-2">{q.question}</span>
          <button onClick={() => setQuestions.mutate((existingQuestionsQ.data ?? []).filter((x) => x.id !== q.id).map((x) => x.id))} disabled={setQuestions.isPending} className="shrink-0 text-[11px] font-bold text-destructive" data-testid={`button-remove-exam-question-${q.id}`}>Remove</button>
        </div>)}
        {existingQuestionsQ.isLoading && <InlineLoading />}
        {!existingQuestionsQ.isLoading && !existingQuestionsQ.data?.length && <p className="text-[11px] text-muted-foreground">No questions attached yet — upload a file or paste IDs above.</p>}
      </div>
    </div>
    <div><div className="text-xs font-bold">Attempts &amp; results</div><div className="mt-2 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-[11px]"><thead className="bg-muted uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Institution</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">%</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th></tr></thead><tbody>{(attemptsQ.data || []).map((a) => <tr key={a.id} className="border-t border-border" data-testid={`row-exam-attempt-${a.id}`}><td className="px-3 py-2 font-bold">{a.studentName}</td><td className="px-3 py-2 text-muted-foreground">{a.institution}</td><td className="px-3 py-2">{a.score}</td><td className="px-3 py-2">{a.percentage}%</td><td className="px-3 py-2">{a.status}</td><td className="px-3 py-2">{a.status !== 'in_progress' && !a.resultsReleasedAt && <button onClick={() => examsAdminApi.releaseOne(a.id)} className="text-primary font-bold" data-testid={`button-release-attempt-${a.id}`}>Release</button>}</td></tr>)}{!attemptsQ.data?.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No attempts yet.</td></tr>}</tbody></table></div></div>
  </div>;
}

// Keeps the browser-tab icon in sync with whatever favicon an admin has
// uploaded, without needing a server-rendered <head> per request. Runs once
// per app load and again whenever the cached site-content changes (e.g.
// right after an admin saves a new favicon in Platform settings).

export function useFaviconSync() {
  const { data } = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  useEffect(() => {
    if (!data?.faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = resolveUploadUrl(data.faviconUrl) ?? data.faviconUrl;
  }, [data?.faviconUrl]);
}

// See frontend-student's useThemeSync for the full rationale — same
// ['site-content'] query as useFaviconSync above (deduped by react-query),
// applied from AppRoutes so signed-out /login and /admin/login match too.

export function useThemeSync() {
  const { data } = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  useEffect(() => { applyThemeVars(data ?? null); }, [data]);
}

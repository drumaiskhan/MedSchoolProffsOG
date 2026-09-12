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
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Loader2, Activity, Layers, BarChart3, GraduationCap
} from 'lucide-react';
import { applyThemeVars, DEFAULT_THEME, readableForegroundHsl } from '@/lib/theme';
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
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, analyticsApi, mcqImportApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, subjectAdminApi, topicAdminApi, flashcardsAdminApi, flashcardsAiApi, booksAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blockAdminApi, examsAdminApi, examsApi, explanationsApi, auditApi, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type TeamCategory, type AdminModule, type AdminBlock, type AdminSubject, type AdminTopic, type AdminFlashcard, type GeneratedFlashcard, type AdminMcqRow, type AdminBook, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type BankAccount, type PaymentMethodConfig, aiVisualizerAdminApi, type AiVisualizerLogEntry } from '@/lib/api';
import './index.css';

// Round 3, item 10 (performance) — same over-fetching fix as the student
// app (see its App.tsx for the full rationale): `new QueryClient()` with no
// options refetched on every mount and every window refocus. Admin
// mutations already call invalidateQueries on the specific keys they
// change, so edits still show up immediately — this only avoids redundant
// background refetches of data nothing has touched.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

// Renders page 1 of a PDF to a JPEG Blob for use as an auto cover thumbnail,
// loading pdfjs-dist from a CDN at call time rather than as an installed
// dependency — this repo has no PDF rasterizer available server-side or in
// its lockfile, and a CDN import needs no build step or install. Returns
// null (never throws) if rendering fails for any reason — the book upload
// should never be blocked by a missing thumbnail.
async function renderPdfFirstPageThumbnail(file: File): Promise<Blob | null> {
  try {
    const pdfjsUrl = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.min.mjs';
    const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85));
  } catch {
    return null;
  }
}

const cn = (...parts: Array<string | false | undefined | null>) => parts.filter(Boolean).join(' ');
const initials = (name = 'MedschoolProffs') => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
const money = (amount: number, currency = 'PKR') => new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
// Payment status codes stored in the DB are uppercase (PAYMENT_PENDING_REVIEW,
// APPROVED, REJECTED, VOIDED) — these map them to display labels and badge
// tones. Previously the UI compared these against lowercase literals like
// 'pending', which never matched, so the pending badge (and the filter tabs)
// silently fell through to the wrong tone/empty results.
const PAYMENT_STATUS_LABEL: Record<string, string> = { PAYMENT_PENDING_REVIEW: 'pending', APPROVED: 'approved', REJECTED: 'rejected', VOIDED: 'voided' };
const paymentStatusLabel = (status: string) => PAYMENT_STATUS_LABEL[status] || status.toLowerCase();
const paymentStatusTone = (status: string): 'amber' | 'green' | 'red' | 'neutral' => (status === 'PAYMENT_PENDING_REVIEW' ? 'amber' : status === 'APPROVED' ? 'green' : status === 'VOIDED' ? 'neutral' : 'red');

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
    ['/', 'Overview', LayoutDashboard], ['/modules', 'Modules', BookOpen], ['/practice', 'Practice', Target], ['/exams', 'Pre-Proffs Exams', ClipboardCheck], ['/past-papers', 'Past papers', FileStack], ['/flashcards', 'Flashcards', Zap], ['/resources', 'Resources', FolderOpen],
  ] },
  { label: 'Your tools', items: [
    ['/notebook', 'My notebook', NotebookPen], ['/saved-sessions', 'Saved sessions', Bookmark], ['/flagged-mcqs', 'Flagged MCQs', Flag], ['/leaderboard', 'Leaderboard', Trophy],
  ] },
  { label: 'Your account', items: [
    ['/payments', 'Membership', CreditCard], ['/notifications', 'Notifications', Bell], ['/feedback', 'Send feedback', MessageSquare], ['/profile', 'Profile & access', ShieldCheck],
  ] },
];
const adminGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Overview', items: [
    ['/admin', 'Admin overview', LayoutDashboard], ['/admin/students', 'Students', Users],
  ] },
  { label: 'Payments', items: [
    ['/admin/plans', 'Subscription plans', CreditCard], ['/admin/payments', 'Payments & collection', ReceiptText],
  ] },
  { label: 'Content', items: [
    ['/admin/academic-structure', 'Colleges & courses', FolderOpen], ['/admin/content', 'Academic content', Library], ['/admin/subjects', 'Subjects', BookOpen], ['/admin/topics', 'Topics', CircleHelp], ['/admin/mcqs', 'MCQ bank', CircleHelp], ['/admin/flashcards', 'Flashcards', Zap], ['/admin/books', 'Books library', BookOpen], ['/admin/past-papers', 'Past papers', FileStack], ['/admin/exams', 'Pre-Proffs Exams', ClipboardCheck],
  ] },
  { label: 'Community', items: [
    ['/admin/feedback', 'Feedback inbox', MessageSquare], ['/admin/ai-visualizer-logs', 'AI Visualizer activity', Wand2], ['/admin/team', 'Academic team', Users], ['/admin/site-content', 'Site content', Landmark],
  ] },
  { label: 'Workspace', items: [
    ['/admin/settings', 'Platform settings', Settings],
  ] },
];

function SideNav({ user, onClose }: { user: User; onClose: () => void }) {
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
function Shell({ children }: { children: ReactNode }) {
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

  if (userQuery.isLoading || !user || user.role !== 'admin') return <div className="grid min-h-[100dvh] place-items-center bg-background"><SkeletonPage /></div>;

  const title = location.slice(1).split('/').map((part) => part.replaceAll('-', ' ')).join(' / ') || 'Overview';
  return <div className="admin-shell flex min-h-[100dvh] bg-background"><div className={cn(menuOpen ? 'block' : 'hidden', 'fixed inset-0 z-30 bg-[#102c37]/40 md:hidden')} onClick={() => setMenuOpen(false)} />{(menuOpen || !isMobile) && <SideNav user={user} onClose={() => setMenuOpen(false)} />}<main className="admin-main min-w-0 flex-1"><header className="admin-header sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-10"><div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setMenuOpen(true)} data-testid="button-open-menu"><Menu size={20} /></button><div><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">MedschoolProffs / Admin</div><h1 className="mt-1 text-[17px] font-bold capitalize tracking-[-.02em] text-foreground">{title}</h1></div></div><div className="flex items-center gap-2"><span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-muted-foreground sm:inline-flex"><span className="size-1.5 rounded-full bg-primary" />Workspace live</span><Link href="/notifications" className="relative grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted" data-testid="link-notifications"><Bell size={17} /></Link><Link href="/profile" className="ml-1 grid size-9 place-items-center rounded-full bg-[#d7eee4] text-xs font-extrabold text-[#164b4b]" data-testid="link-header-profile">{initials(user.name)}</Link></div></header><div className="admin-content page-enter px-5 py-7 md:px-10 md:py-9">{children}</div></main></div>;
}

function SkeletonPage() { return <div className="space-y-5"><div className="skeleton h-8 w-56 rounded-lg" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /></div><div className="skeleton h-72 rounded-2xl" /></div>; }
function EmptyState({ icon: Icon = FolderOpen, title, body, action }: { icon?: typeof FolderOpen; title: string; body: string; action?: ReactNode }) { return <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"><div><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-primary"><Icon size={22} /></div><h3 className="font-bold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div></div>; }
function ErrorState({ retry }: { retry?: () => void }) { return <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-6 text-sm text-[#9e4c39]"><div className="flex items-center gap-2 font-bold"><CircleHelp size={17} /> We couldn't load this view.</div><p className="mt-2 text-[#a96a5b]">Check your connection, then try again.</p>{retry && <button onClick={retry} className="mt-4 rounded-lg bg-[#a9533f] px-3 py-2 text-xs font-bold text-white" data-testid="button-retry">Try again</button>}</div>; }
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize', tone === 'green' && 'bg-[#d7eee4] text-[#287058]', tone === 'amber' && 'bg-[#fff0cb] text-[#8d6420]', tone === 'red' && 'bg-[#f9ddd6] text-[#a34c3e]', tone === 'blue' && 'bg-[#dceaf1] text-[#32647b]', tone === 'neutral' && 'bg-muted text-muted-foreground')}>{children}</span>; }

// Round 3, item 5 — compact three-way Easy/Medium/Hard segmented control
// (colored dot + label, one pill highlighted as selected), styled after the
// emedcrack.com reference the admin pointed to, replacing a plain <select>
// for difficulty wherever MCQs render as individual tiles/rows during bulk
// upload/review (the manual single-add form and the MCQ edit form keep
// their existing <select> — those are forms, not per-row tiles, so they
// were out of scope for this swap). Keeps the same 'easy'|'moderate'|'hard'
// values as everywhere else in the app.
function DifficultyPicker({ value, onChange, testId }: { value: string; onChange: (v: 'easy' | 'moderate' | 'hard') => void; testId?: string }) {
  const options: Array<{ value: 'easy' | 'moderate' | 'hard'; label: string; dot: string; active: string }> = [
    { value: 'easy', label: 'Easy', dot: 'bg-[#3aa66b]', active: 'bg-[#d7eee4] text-[#164b4b] border-[#3aa66b]' },
    { value: 'moderate', label: 'Medium', dot: 'bg-[#e0a72f]', active: 'bg-[#fff0cb] text-[#8d6420] border-[#e0a72f]' },
    { value: 'hard', label: 'Hard', dot: 'bg-[#d1544a]', active: 'bg-[#f9ddd6] text-[#a34c3e] border-[#d1544a]' },
  ];
  return <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background p-1">
    {options.map((opt) => <button key={opt.value} type="button" onClick={() => onChange(opt.value)} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors', value === opt.value ? cn('border', opt.active) : 'text-muted-foreground hover:text-foreground')} data-testid={testId ? `${testId}-${opt.value}` : undefined}><span className={cn('size-1.5 rounded-full', opt.dot)} />{opt.label}</button>)}
  </div>;
}
function Progress({ value, color = 'bg-primary' }: { value: number; color?: string }) { return <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }
function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) { return <div className="mb-5 flex items-end justify-between gap-4"><div>{eyebrow && <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">{eyebrow}</div>}<h2 className="mt-1 text-[22px] font-extrabold tracking-[-.04em]">{title}</h2></div>{action}</div>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-card/70 p-3 text-center"><div className="font-display text-2xl">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div></div>; }

function Notifications() {
  const q = useListNotifications();
  const ns: Notification[] = q.data ?? [];
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) });
  const unread = ns.filter((n) => !n.read);
  const markAll = () => unread.forEach((n) => markRead.mutate(n.id));

  return <div className="max-w-3xl"><SectionHeader eyebrow="Stay oriented" title="Notifications" action={unread.length > 0 && <button onClick={markAll} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary" data-testid="button-mark-all-read"><CheckCheck size={14} /> Mark all as read</button>} /><div className="overflow-hidden rounded-2xl border border-border bg-card">{ns.map((n) => <div key={n.id} className={cn('flex gap-4 border-b border-border p-5 transition-colors last:border-0', !n.read && 'bg-[#f3f8f3]')} data-testid={`row-notification-${n.id}`}><div className={cn('grid size-10 shrink-0 place-items-center rounded-xl', n.type === 'payment' ? 'bg-[#fff0cb] text-[#94651c]' : n.type === 'milestone' ? 'bg-[#d7eee4] text-[#287058]' : 'bg-[#dceaf1] text-[#32647b]')}><Bell size={17} /></div><div className="flex-1"><div className="flex items-center gap-2 text-sm font-bold">{n.title}{!n.read && <span className="size-1.5 rounded-full bg-[#dc815e]" />}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{n.body}</p><div className="mt-2 font-mono-app text-[10px] text-muted-foreground">{n.createdAt}</div></div>{!n.read && <button onClick={() => markRead.mutate(n.id)} className="self-start rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-mark-read-${n.id}`}>Mark read</button>}</div>)}{!ns.length && <EmptyState icon={Bell} title="All caught up" body="Nothing new right now." />}</div></div>;
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

  return <div className="max-w-4xl"><SectionHeader eyebrow="Your account" title="Profile & access" /><div className="grid gap-5 md:grid-cols-[220px_1fr]"><div className="rounded-2xl bg-[#164b4b] p-6 text-[#eaf2e9]"><div className="grid size-16 place-items-center rounded-2xl bg-[#d7eee4] text-xl font-extrabold text-[#164b4b]">{initials(u.name)}</div><h2 className="mt-5 font-display text-2xl">{u.name}</h2><div className="mt-1 text-xs text-[#bfd4cb]">{u.program || 'Medical student'}</div><Badge tone={dashboard.data?.membershipStatus === 'ACTIVE' ? 'green' : 'amber'}>{dashboard.data?.membershipStatus === 'ACTIVE' ? 'Active member' : 'Pending activation'}</Badge></div>
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
  const card = (m: TeamMember) => <div key={m.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-team-${m.id}`}><div className="flex items-center gap-3">{m.photoPath ? <img src={resolveUploadUrl(m.photoPath)!} alt={m.name} className="size-14 rounded-full border border-border object-cover" /> : <div className="grid size-14 place-items-center rounded-full bg-[#d7eee4] text-sm font-extrabold text-[#164b4b]">{initials(m.name)}</div>}<div><div className="text-sm font-bold">{m.name}</div><div className="text-xs text-primary">{m.role}</div></div></div>{m.achievementBadge && <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#fdeecb] px-2.5 py-1 text-[10px] font-bold text-[#8a5a12]"><Trophy size={11} /> {m.achievementBadge}</span>}{m.bio && <p className="mt-3 text-xs leading-5 text-muted-foreground">{m.bio}</p>}{(m.linkedinUrl || m.instagramUrl || m.email) && <div className="mt-3 flex gap-2">{m.linkedinUrl && <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">in</a>}{m.instagramUrl && <a href={m.instagramUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold hover:bg-primary/10 hover:text-primary">ig</a>}{m.email && <a href={`mailto:${m.email}`} className="grid size-7 place-items-center rounded-full bg-muted hover:bg-primary/10 hover:text-primary"><Mail size={12} /></a>}</div>}</div>;
  return <div className="mt-9"><SectionHeader eyebrow="Behind the platform" title="Our Academic Team" />
    {TEAM_CATEGORIES.map((cat) => { const inCat = team.filter((m) => (m.category ?? 'reviewer') === cat); if (!inCat.length) return null; return <div key={cat} className="mb-6 last:mb-0"><div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{TEAM_CATEGORY_LABELS[cat]}</div><div className="grid gap-4 sm:grid-cols-2">{inCat.map(card)}</div></div>; })}
  </div>;
}

// Audit log actions are consistent SCREAMING_SNAKE_CASE codes (MCQ_CREATED,
// BLOCK_ARCHIVED, ...) — humanized generically rather than via a hardcoded
// per-action lookup table, so it stays correct for every action the backend
// logs today or adds later without needing updates here.
function humanizeAuditAction(action: string): string {
  const s = action.toLowerCase().replaceAll('_', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AdminOverview() {
  const q = useGetAdminDashboard({ query: { refetchInterval: 15000, queryKey: getGetAdminDashboardQueryKey() } });
  const d = q.data;
  const activity = useQuery({ queryKey: ['audit-logs', 'overview'], queryFn: () => auditApi.list(6), refetchInterval: 15000 });
  if (q.isLoading || !d) return <SkeletonPage />;
  const stats: Array<[string, string | number, typeof Users, string, string | null]> = [['Students', d.totalStudents, Users, 'bg-[#dceaf1] text-[#32647b]', '/admin/students'], ['Subscribed students', d.activeMembers, ShieldCheck, 'bg-[#d7eee4] text-[#287058]', '/admin/students?status=ACTIVE'], ['Pending payments', d.pendingPayments, Clock3, 'bg-[#fff0cb] text-[#94651c]', '/admin/payments'], ['This month\'s revenue', money(d.monthlyRevenue), TrendingUp, 'bg-[#f0e3ef] text-[#815276]', null]];
  // Donut gradient stops derived from real studentsByStatus counts — this
  // used to be a hardcoded "72%, 86%, 100%" regardless of actual data (see
  // section 10 fix notes). Colors cycle through the same 3-color sequence
  // the legend below already used (primary/amber/blue), so any number of
  // status buckets still renders sensibly.
  const statusEntries = Object.entries(d.studentsByStatus);
  const statusTotal = statusEntries.reduce((sum, [, count]) => sum + count, 0);
  const donutColors = ['#287058', '#e5a952', '#b7d2df', '#815276', '#a34c3e'];
  let cursor = 0;
  const gradientStops = statusTotal > 0
    ? statusEntries.map(([, count], i) => {
      const start = (cursor / statusTotal) * 100;
      cursor += count;
      const end = (cursor / statusTotal) * 100;
      return `${donutColors[i % donutColors.length]} ${start}% ${end}%`;
    }).join(', ')
    : '#dceaf1 0% 100%';
  return <div><SectionHeader eyebrow="Command center" title="Good morning, academic team" action={<span className="inline-flex items-center gap-1.5 rounded-full bg-[#d7eee4] px-3 py-1.5 text-[10px] font-bold text-[#164b4b]" data-testid="text-live-indicator"><span className="size-1.5 rounded-full bg-[#287058]" /> Live · refreshes every 15s</span>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value, Icon, color, href], i) => { const card = <div className={cn('rounded-2xl border border-border bg-card p-5', href && 'card-lift cursor-pointer transition hover:border-primary/40')}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{label}</span><div className={cn('grid size-9 place-items-center rounded-xl', color)}><Icon size={17} /></div></div><div className="mt-5 font-display text-4xl">{String(value)}</div><div className="mt-2 text-[11px] text-muted-foreground">{i === 2 ? 'Needs review today' : i === 3 ? 'Across active memberships' : 'Registered on the platform'}</div></div>; return href ? <Link key={String(label)} href={href} data-testid={`link-stat-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{card}</Link> : <div key={String(label)}>{card}</div>; })}</div><div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]"><div><SectionHeader eyebrow="Needs attention" title="Recent payments" action={<Link href="/admin/payments" className="text-xs font-bold text-primary" data-testid="link-admin-payments">View queue <ArrowRight size={13} className="ml-1 inline" /></Link>} />{d.recentPayments.length ? <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[580px] text-left text-xs"><thead className="bg-muted text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{d.recentPayments.slice(0, 4).map((p) => <tr key={p.id} className="border-t border-border" data-testid={`row-admin-payment-${p.id}`}><td className="px-5 py-4 font-bold">{p.studentName}</td><td className="px-5 py-4 text-muted-foreground">{p.planName}</td><td className="px-5 py-4 font-mono-app text-[11px]">{money(p.amount, p.currency)}</td><td className="px-5 py-4"><Badge tone={paymentStatusTone(p.status)}>{paymentStatusLabel(p.status)}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No payments yet" body="Payment submissions will show up here as students pay." />}</div><div><SectionHeader eyebrow="Membership health" title="Student status" /><div className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-center"><div className="relative grid size-44 place-items-center rounded-full" style={{ background: `conic-gradient(${gradientStops})` }}><div className="grid size-32 place-items-center rounded-full bg-card"><span className="font-display text-4xl">{d.activeMembers}</span><span className="text-[10px] text-muted-foreground">active</span></div></div></div><div className="mt-5 space-y-3">{statusEntries.map(([status, count], i) => <Link key={status} href={`/admin/students?status=${encodeURIComponent(status)}`} className="flex items-center justify-between text-xs transition hover:opacity-70" data-testid={`link-status-${status.toLowerCase()}`}><span className="flex items-center gap-2 capitalize"><span className="size-2 rounded-full" style={{ background: donutColors[i % donutColors.length] }} />{status}</span><span className="font-mono-app">{count}</span></Link>)}</div></div></div></div>
    <div className="mt-8"><SectionHeader eyebrow="What's happened lately" title="Recent activity" action={<Link href="/admin/team" className="text-xs font-bold text-primary" data-testid="link-admin-audit">Full history <ArrowRight size={13} className="ml-1 inline" /></Link>} />
      <div className="rounded-2xl border border-border bg-card p-2">{activity.isLoading ? <div className="p-4 text-xs text-muted-foreground">Loading…</div> : activity.data?.length ? activity.data.map((entry, i) => <div key={entry.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')} data-testid={`row-activity-${entry.id}`}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#dceaf1] text-[#2c6a8f]"><ClipboardCheck size={14} /></span><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{humanizeAuditAction(entry.action)}</div><div className="truncate text-[11px] text-muted-foreground">{entry.actorName}{entry.entity ? ` · ${entry.entity}${entry.entityId ? ` #${entry.entityId}` : ''}` : ''}</div></div><span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(entry.createdAt)}</span></div>) : <div className="p-4 text-xs text-muted-foreground">No activity recorded yet.</div>}</div>
    </div>
  </div>;
}

function StudentDrawer({ id, onClose }: { id: number; onClose: () => void }) {
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
  const s: StudentDetail | undefined = detail.data;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}><div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-2xl">
    <div className="flex items-center justify-between"><h3 className="text-lg font-extrabold">Student profile</h3><button onClick={onClose} className="rounded-lg p-2 hover:bg-muted" data-testid="button-close-drawer"><X size={16} /></button></div>
    {!s ? <div className="mt-8 text-xs text-muted-foreground">Loading…</div> : <div className="mt-6 space-y-6">
      <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-full bg-[#d7eee4] text-sm font-extrabold text-[#164b4b]">{initials(s.name)}</div><div><div className="font-bold">{s.name}</div><div className="text-xs text-muted-foreground">{s.email}</div></div></div>
      <div className="grid grid-cols-2 gap-3 text-xs"><div><div className="text-muted-foreground">Phone</div><div className="mt-0.5 font-bold">{s.phone || '—'}</div></div><div><div className="text-muted-foreground">Roll number</div><div className="mt-0.5 font-bold">{s.rollNumber || '—'}</div></div><div><div className="text-muted-foreground">Institution</div><div className="mt-0.5 font-bold">{s.institution || '—'}</div></div><div><div className="text-muted-foreground">Programme</div><div className="mt-0.5 font-bold">{s.program || '—'}</div></div><div><div className="text-muted-foreground">Year / batch</div><div className="mt-0.5 font-bold">{s.academicYear || '—'} · {s.batch || '—'}</div></div><div><div className="text-muted-foreground">Streak</div><div className="mt-0.5 font-bold">{s.currentStreak}d (best {s.longestStreak}d)</div></div><div><div className="text-muted-foreground">Joined</div><div className="mt-0.5 font-bold">{new Date(s.joinedAt).toLocaleDateString()}</div></div><div><div className="text-muted-foreground">Email verified</div>{s.emailVerified ? <div className="mt-0.5 font-bold text-primary">Yes</div> : <button onClick={() => verifyEmail.mutate()} disabled={verifyEmail.isPending} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-extrabold text-destructive underline disabled:opacity-50" data-testid="button-verify-email">{verifyEmail.isPending ? 'Verifying…' : 'No · verify now'}</button>}</div></div>
      {s.activeMembership && <div className="rounded-xl bg-[#eef7f1] p-3 text-xs font-semibold text-primary">Active membership until {new Date(s.activeMembership.expiresAt).toLocaleDateString()}</div>}
      {!s.emailVerified && s.status !== 'ACTIVE' && <div className="rounded-xl border border-[#e5a952]/40 bg-[#fdf6e8] p-3 text-[11px] leading-5 text-[#8a5a12]"><strong>Heads up:</strong> this student's email isn't verified yet, so they can't sign in at all even if you set their status below — the "No · verify now" link above (or "Activate now" here) clears that separately.</div>}
      <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Account status</span>{s.status !== 'ACTIVE' && <button onClick={() => updateStatus.mutate({ status: 'ACTIVE', emailVerified: true })} disabled={updateStatus.isPending} className="rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-activate-now">{updateStatus.isPending ? 'Activating…' : 'Activate now'}</button>}</div><p className="mb-2 text-[11px] text-muted-foreground">Status controls what the student can access. Moving to Verified, Payment review, or Active also clears the email-verification gate automatically.</p><div className="flex flex-wrap gap-2">{STUDENT_STATUSES.filter((status) => status !== 'DELETED').map((status) => <button key={status} onClick={() => updateStatus.mutate({ status })} disabled={updateStatus.isPending} className={cn('rounded-lg px-2.5 py-1.5 text-[10px] font-bold', s.status === status ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')} data-testid={`button-status-${status}`}>{status.replace(/_/g, ' ')}</button>)}</div></div>
      <div><div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Payment history</div><div className="space-y-2">{s.payments.map((p) => <div key={p.id} className="rounded-lg border border-border p-3 text-xs"><div className="flex items-center justify-between"><span className="font-bold">{p.planName}</span><Badge tone={p.status === 'APPROVED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'}>{p.status}</Badge></div><div className="mt-1 text-muted-foreground">{money(p.amount, p.currency)} · {p.method} · {p.paymentDate}</div>{p.proofPath && <a href={resolveUploadUrl(p.proofPath)!} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-primary" data-testid={`link-drawer-proof-${p.id}`}><FileText size={11} /> View payment proof</a>}</div>)}{!s.payments.length && <p className="text-xs text-muted-foreground">No payments yet.</p>}</div></div>
    </div>}
  </div></div>;
}

function AdminStudents() {
  const q = useListStudents();
  const search_ = useSearch();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(search_).get('status') ?? '');
  useEffect(() => { const fromUrl = new URLSearchParams(search_).get('status'); if (fromUrl) setStatusFilter(fromUrl); }, [search_]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const removeStudent = useMutation({ mutationFn: studentsAdminApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete student', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const students = (q.data ?? []).filter((s) => `${s.name} ${s.email} ${s.institution}`.toLowerCase().includes(search.toLowerCase()) && (!statusFilter || s.status === statusFilter));
  return <div><SectionHeader eyebrow="People operations" title="Students" action={<span className="text-[10px] text-muted-foreground">{students.length} students</span>} /><div className="mb-4 flex flex-wrap items-center gap-3"><div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students, institutions..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none" data-testid="input-search-students" /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-student-status-filter"><option value="">All statuses</option>{STUDENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></div>{q.isLoading ? <SkeletonPage /> : students.length ? <>
    <div className="space-y-3 sm:hidden">{students.map((s) => <div key={s.id} onClick={() => setSelectedId(s.id)} className="cursor-pointer rounded-2xl border border-border bg-card p-4" data-testid={`card-student-${s.id}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-[10px] font-bold text-primary">{initials(s.name)}</div><div><div className="text-sm font-bold">{s.name}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{s.email}</div></div></div><button onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-student-mobile-${s.id}`}><Trash2 size={14} /></button></div><div className="mt-3 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">{s.institution} · {s.program}</span><Badge tone={s.status === 'ACTIVE' ? 'green' : s.status === 'SUSPENDED' || s.status === 'REJECTED' ? 'red' : 'amber'}>{s.status}</Badge></div><div className="mt-3 flex items-center gap-2"><Progress value={s.progress || 0} /><span className="font-mono-app text-[10px] text-muted-foreground">{s.progress || 0}%</span></div></div>)}</div>
    <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-muted text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Institution</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3"></th></tr></thead><tbody>{students.map((s) => <tr key={s.id} className="cursor-pointer border-t border-border hover:bg-muted/40" data-testid={`row-student-${s.id}`}><td className="px-5 py-4" onClick={() => setSelectedId(s.id)}><div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-full bg-[#d7eee4] text-[10px] font-bold text-primary">{initials(s.name)}</div><div><div className="font-bold">{s.name}</div><div className="mt-1 text-[10px] text-muted-foreground">{s.email}</div></div></div></td><td className="px-5 py-4" onClick={() => setSelectedId(s.id)}><div>{s.institution}</div><div className="mt-1 text-[10px] text-muted-foreground">{s.program}</div></td><td className="px-5 py-4" onClick={() => setSelectedId(s.id)}><Badge tone={s.status === 'ACTIVE' ? 'green' : s.status === 'SUSPENDED' || s.status === 'REJECTED' ? 'red' : 'amber'}>{s.status}</Badge></td><td className="w-40 px-5 py-4" onClick={() => setSelectedId(s.id)}><div className="flex items-center gap-2"><Progress value={s.progress || 0} /><span className="font-mono-app text-[10px]">{s.progress || 0}%</span></div></td><td className="px-5 py-4 text-right"><button onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-student-${s.id}`}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
  </> : <EmptyState icon={Users} title="No students yet" body="Students will appear here once they register." />}{selectedId !== null && <StudentDrawer id={selectedId} onClose={() => setSelectedId(null)} />}{deletingId !== null && <ConfirmDialog title="Permanently delete this student?" body="This erases their account, payments, memberships, practice/exam history, and everything else tied to it, for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removeStudent.mutate(deletingId)} pending={removeStudent.isPending} />}</div>;
}

// ── Payments & collection: "Proof Review" tab (was the standalone AdminPayments page) ──
function PaymentProofsTab() {
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
    {p.proofPath && (() => { const url = resolveUploadUrl(p.proofPath)!; return <div className="mt-4 border-t border-border pt-4">{isImage(p.proofPath!) ? <a href={url} target="_blank" rel="noreferrer" data-testid={`link-proof-${p.id}`}><img src={url} alt="Payment proof" className="max-h-64 rounded-xl border border-border object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const fallback = e.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.display = 'flex'; }} /></a> : <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold" data-testid={`link-proof-${p.id}`}><FileText size={14} /> View payment proof</a>}{isImage(p.proofPath!) && <div style={{ display: 'none' }} className="hidden max-h-64 items-center gap-2 rounded-xl border border-dashed border-border bg-muted px-3 py-4 text-xs font-semibold text-muted-foreground"><FileText size={14} /> Couldn't load the proof image — <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">open it directly</a> instead.</div>}</div>; })()}
    {rejectingId === p.id && <div className="mt-4 flex gap-2 border-t border-border pt-4"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (shown to student)" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-reject-reason-${p.id}`} /><button onClick={() => doReject(p)} disabled={!reason.trim()} className="rounded-lg bg-destructive px-4 text-xs font-bold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirm-reject-${p.id}`}>Confirm reject</button></div>}
  </div>)}{!payments.length && <EmptyState icon={ReceiptText} title="Queue is clear" body="No payment submissions match this filter." />}</div>}{deletingId !== null && <ConfirmDialog title="Permanently delete this payment?" body="This erases the submission for good. If it already activated a membership, that membership itself is not revoked automatically." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removePaymentPermanent.mutate(deletingId)} pending={removePaymentPermanent.isPending} />}</div>;
}

function AdminPlans() {
  const q = useListMembershipPlans();
  type MembershipPlanWithPricing = MembershipPlan & { originalPrice?: number | null; discountLabel?: string | null };
  const plans = (q.data ?? []) as MembershipPlanWithPricing[];
  const create = useCreateMembershipPlan();
  const update = useUpdateMembershipPlan();
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingPermanentId, setDeletingPermanentId] = useState<number | null>(null);
  const removePlan = useMutation({ mutationFn: membershipPlansAdminApi.remove, onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMembershipPlansQueryKey() }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete plan', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removePlanPermanent = useMutation({ mutationFn: membershipPlansAdminApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMembershipPlansQueryKey() }); setDeletingPermanentId(null); }, onError: (err: unknown) => toast({ title: 'Could not permanently delete plan', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const save = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); const originalPriceRaw = String(f.get('originalPrice') || '').trim(); const discountLabel = String(f.get('discountLabel') || '').trim(); const data = { name: String(f.get('name')), description: String(f.get('description')), price: Number(f.get('price')), originalPrice: originalPriceRaw ? Number(originalPriceRaw) : null, discountLabel: discountLabel || null, currency: 'PKR', duration: Number(f.get('duration')), durationUnit: 'months', active: true, displayOrder: 1 }; if (editing) update.mutate({ id: editing, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMembershipPlansQueryKey() }); setEditing(null); setShowForm(false); }, onError: (err: unknown) => toast({ title: 'Could not save plan', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) }); else create.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMembershipPlansQueryKey() }); setShowForm(false); }, onError: (err: unknown) => toast({ title: 'Could not create plan', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) }); };
  return <div><SectionHeader eyebrow="Revenue & access" title="Membership plans" action={<button onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-create-plan"><Plus size={15} /> New plan</button>} />{showForm && <form onSubmit={save} className="mb-5 grid gap-4 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5 md:grid-cols-4"><input name="name" defaultValue={editing ? plans.find((p) => p.id === editing)?.name : ''} required placeholder="Plan name" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-plan-name" /><input name="description" defaultValue={editing ? plans.find((p) => p.id === editing)?.description : ''} required placeholder="Short description" className="h-10 rounded-xl border border-border bg-card px-3 text-xs md:col-span-2" data-testid="input-plan-description" /><input name="duration" defaultValue={editing ? plans.find((p) => p.id === editing)?.duration : 6} required type="number" placeholder="Months" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-plan-duration" /><input name="price" defaultValue={editing ? plans.find((p) => p.id === editing)?.price : ''} required type="number" placeholder="Price (PKR)" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-plan-price" /><input name="originalPrice" defaultValue={editing ? (plans.find((p) => p.id === editing)?.originalPrice ?? '') : ''} type="number" placeholder="Original price (optional, for a strikethrough)" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-plan-original-price" /><input name="discountLabel" defaultValue={editing ? (plans.find((p) => p.id === editing)?.discountLabel ?? '') : ''} placeholder="Discount label (optional), e.g. 25% OFF" className="h-10 rounded-xl border border-border bg-card px-3 text-xs md:col-span-2" data-testid="input-plan-discount-label" /><div className="flex gap-2 md:col-span-4"><button type="submit" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="button-save-plan">Save plan</button><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-cancel-plan">Cancel</button></div></form>}{q.isLoading ? <SkeletonPage /> : plans.length ? <div className="grid gap-4 md:grid-cols-2">{plans.map((p) => <div key={p.id} className="rounded-2xl border border-border bg-card p-6" data-testid={`card-plan-${p.id}`}><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><Badge tone={p.active ? 'green' : 'neutral'}>{p.active ? 'Active' : 'Paused'}</Badge>{p.discountLabel && <Badge tone="amber">{p.discountLabel}</Badge>}</div><h3 className="mt-4 font-display text-3xl">{p.name}</h3></div><div className="flex items-center gap-1"><button onClick={() => { setEditing(p.id); setShowForm(true); }} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" data-testid={`button-edit-plan-${p.id}`}><Pencil size={15} /></button>{p.active ? <button onClick={() => setDeletingId(p.id)} title="Archive (existing subscribers keep access)" className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-plan-${p.id}`}><Trash2 size={15} /></button> : <><button onClick={() => update.mutate({ id: p.id, data: { active: true } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembershipPlansQueryKey() }) })} className="rounded-lg px-2 py-1 text-[11px] font-bold text-primary" data-testid={`button-restore-plan-${p.id}`}>Restore</button><button onClick={() => setDeletingPermanentId(p.id)} className="rounded-lg px-2 py-1 text-[11px] font-bold text-destructive" data-testid={`button-delete-permanent-plan-${p.id}`}>Delete permanently</button></>}</div></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{p.description}</p><div className="mt-6 flex items-end gap-2">{p.originalPrice != null && p.originalPrice > p.price && <span className="mb-1 text-sm text-muted-foreground line-through">{money(p.originalPrice, p.currency)}</span>}<span className="font-display text-4xl">{money(p.price, p.currency)}</span><span className="mb-1 text-xs text-muted-foreground">/ {p.duration} {p.durationUnit}</span></div><div className="mt-5 border-t border-border pt-4 text-[11px] text-muted-foreground">Displayed to students · Order {p.displayOrder}</div></div>)}</div> : <EmptyState icon={CreditCard} title="No plans yet" body="Create your first membership plan above." />}{deletingId !== null && <ConfirmDialog title="Archive this plan?" body="Existing subscribers keep their access; the plan is just hidden from new signups. You can permanently delete it afterward from here." onCancel={() => setDeletingId(null)} onConfirm={() => removePlan.mutate(deletingId)} pending={removePlan.isPending} />}{deletingPermanentId !== null && <ConfirmDialog title="Delete this plan permanently?" body="This erases the plan for good — there is no undo. Blocked automatically if any subscriber is still actively on it." confirmLabel="Delete forever" onCancel={() => setDeletingPermanentId(null)} onConfirm={() => removePlanPermanent.mutate(deletingPermanentId)} pending={removePlanPermanent.isPending} />}</div>;
}

const YEAR_OPTIONS = [1, 2, 3, 4, 5];

function ModuleTargetingFields({ programTargetKind, yearTargetNumber, onChange }: { programTargetKind: string; yearTargetNumber: string; onChange: (patch: { programTargetKind?: string; yearTargetNumber?: string }) => void }) {
  return <div className="flex flex-wrap gap-3"><label className="text-xs font-bold">Program<select value={programTargetKind} onChange={(e) => onChange({ programTargetKind: e.target.value })} className="mt-1 h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-module-program-target"><option value="">All Programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select></label><label className="text-xs font-bold">Academic year<select value={yearTargetNumber} onChange={(e) => onChange({ yearTargetNumber: e.target.value })} className="mt-1 h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-module-year-target"><option value="">All Years</option>{YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}{y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year</option>)}</select></label></div>;
}

// A single module row — exactly the markup AdminContent always rendered,
// just extracted so it can be reused inside each block's group and inside
// the "Unassigned modules" group without redesigning it.
function ModuleRow({ m, canMoveUp, canMoveDown, onReorder, update, curriculumId, setCurriculumId, editingId, setEditingId, editProgram, setEditProgram, editYear, setEditYear, setDeletingId }: {
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
      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#d7eee4] text-primary">{m.iconUrl ? <img src={m.iconUrl} alt="" className="size-full object-cover" /> : <BookOpen size={18} />}</div>
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
function AddModuleForm({ blockId, onCreate, onDone }: { blockId: number | null; onCreate: ReturnType<typeof useMutation<AdminModule, unknown, Parameters<typeof moduleAdminApi.create>[0]>>; onDone: () => void }) {
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
function BlockForm({ initial, onSubmit, pending, onCancel }: { initial?: AdminBlock; onSubmit: (body: Parameters<typeof blockAdminApi.create>[0]) => void; pending: boolean; onCancel: () => void }) {
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

function AdminContent() {
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const blocksQ = useQuery({ queryKey: ['admin-blocks'], queryFn: blockAdminApi.listAll });
  const modules = modulesQ.data ?? [];
  const blocks = [...(blocksQ.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  const invalidateModules = () => { queryClient.invalidateQueries({ queryKey: ['admin-modules'] }); queryClient.invalidateQueries({ queryKey: getListModulesQueryKey() }); };
  const invalidateBlocks = () => queryClient.invalidateQueries({ queryKey: ['admin-blocks'] });

  const createModule = useMutation({ mutationFn: moduleAdminApi.create, onSuccess: invalidateModules, onError: (err: unknown) => toast({ title: 'Could not create module', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof moduleAdminApi.update>[1] }) => moduleAdminApi.update(id, body), onSuccess: invalidateModules, onError: (err: unknown) => toast({ title: 'Could not update module', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removeModulePermanent = useMutation({ mutationFn: moduleAdminApi.removePermanent, onSuccess: () => { invalidateModules(); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete module', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });

  const createBlock = useMutation({ mutationFn: blockAdminApi.create, onSuccess: invalidateBlocks, onError: (err: unknown) => toast({ title: 'Could not create block', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const updateBlock = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof blockAdminApi.update>[1] }) => blockAdminApi.update(id, body), onSuccess: invalidateBlocks, onError: (err: unknown) => toast({ title: 'Could not update block', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removeBlockPermanent = useMutation({ mutationFn: blockAdminApi.removePermanent, onSuccess: () => { invalidateBlocks(); invalidateModules(); setDeletingBlockId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete block', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });

  const [openBlockForm, setOpenBlockForm] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [deletingBlockId, setDeletingBlockId] = useState<number | null>(null);
  const [openModuleFormFor, setOpenModuleFormFor] = useState<number | 'unassigned' | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number | 'unassigned'>>(new Set());

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editProgram, setEditProgram] = useState('');
  const [editYear, setEditYear] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [curriculumId, setCurriculumId] = useState<number | null>(null);

  const modulesByBlock = new Map<number, AdminModule[]>();
  const unassigned: AdminModule[] = [];
  for (const m of modules) {
    if (m.blockId != null) {
      if (!modulesByBlock.has(m.blockId)) modulesByBlock.set(m.blockId, []);
      modulesByBlock.get(m.blockId)!.push(m);
    } else unassigned.push(m);
  }
  const sortByOrder = (list: AdminModule[]) => [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  const reorderModule = (list: AdminModule[], m: AdminModule, direction: 'up' | 'down') => {
    const sorted = sortByOrder(list);
    const idx = sorted.findIndex((x) => x.id === m.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    update.mutate({ id: m.id, body: { displayOrder: other.displayOrder ?? 0 } });
    update.mutate({ id: other.id, body: { displayOrder: m.displayOrder ?? 0 } });
  };

  const reorderBlock = (b: (typeof blocks)[number], direction: 'up' | 'down') => {
    const idx = blocks.findIndex((x) => x.id === b.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= blocks.length) return;
    const other = blocks[swapIdx];
    updateBlock.mutate({ id: b.id, body: { displayOrder: other.displayOrder } });
    updateBlock.mutate({ id: other.id, body: { displayOrder: b.displayOrder } });
  };

  const renderModuleGroup = (list: AdminModule[]) => {
    const sorted = sortByOrder(list);
    return sorted.map((m, i) => <ModuleRow key={m.id} m={m} canMoveUp={i > 0} canMoveDown={i < sorted.length - 1} onReorder={(dir) => reorderModule(sorted, m, dir)}
      update={update} curriculumId={curriculumId} setCurriculumId={setCurriculumId} editingId={editingId} setEditingId={setEditingId}
      editProgram={editProgram} setEditProgram={setEditProgram} editYear={editYear} setEditYear={setEditYear} setDeletingId={setDeletingId} />);
  };

  const loading = modulesQ.isLoading || blocksQ.isLoading;

  return <div>
    <SectionHeader eyebrow="Curriculum operations" title="Academic content" action={<div className="flex gap-2">
      <button onClick={() => setOpenBlockForm(true)} className="inline-flex items-center gap-2 rounded-xl border border-primary/40 px-4 py-2.5 text-xs font-extrabold text-primary" data-testid="button-create-block"><Plus size={15} /> Add block</button>
      <button onClick={() => setOpenModuleFormFor('unassigned')} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-create-module"><Plus size={15} /> Add module</button>
    </div>} />
    {openBlockForm && <BlockForm pending={createBlock.isPending} onCancel={() => setOpenBlockForm(false)} onSubmit={(body) => createBlock.mutate(body, { onSuccess: () => setOpenBlockForm(false) })} />}

    {loading ? <SkeletonPage /> : (!blocks.length && !modules.length) ? <EmptyState icon={Library} title="No modules yet" body="Add your first block or module above to start building the curriculum." /> : <div className="space-y-5">
      {blocks.map((b, bi) => {
        const list = modulesByBlock.get(b.id) ?? [];
        const isCollapsed = collapsed.has(b.id);
        return <div key={b.id} className="rounded-2xl border border-border bg-card" data-testid={`section-block-${b.id}`}>
          <div className="flex items-center gap-3 p-4">
            <button onClick={() => setCollapsed((s) => { const next = new Set(s); if (next.has(b.id)) next.delete(b.id); else next.add(b.id); return next; })} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" data-testid={`button-toggle-block-${b.id}`}><ChevronRight size={16} className={cn('transition-transform', !isCollapsed && 'rotate-90')} /></button>
            <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef7f1] text-primary">{b.iconUrl ? <img src={b.iconUrl} alt="" className="size-full object-cover" /> : <Library size={16} />}</div>
            <div className="flex-1"><div className="text-sm font-extrabold" data-testid={`text-block-name-${b.id}`}>{b.name}</div>{b.subtitle && <div className="text-xs text-muted-foreground">{b.subtitle}</div>}</div>
            <span className="text-[11px] text-muted-foreground">{list.length} module{list.length === 1 ? '' : 's'}</span>
            <div className="flex flex-col gap-0.5"><button onClick={() => reorderBlock(b, 'up')} disabled={bi === 0} className="rounded p-0.5 text-muted-foreground disabled:opacity-25 hover:bg-muted" data-testid={`button-block-move-up-${b.id}`}><ChevronUp size={13} /></button><button onClick={() => reorderBlock(b, 'down')} disabled={bi === blocks.length - 1} className="rounded p-0.5 text-muted-foreground disabled:opacity-25 hover:bg-muted" data-testid={`button-block-move-down-${b.id}`}><ChevronDown size={13} /></button></div>
            <button onClick={() => setOpenModuleFormFor(openModuleFormFor === b.id ? null : b.id)} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid={`button-add-module-to-block-${b.id}`}>+ Module</button>
            <button onClick={() => setEditingBlockId(editingBlockId === b.id ? null : b.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" data-testid={`button-edit-block-${b.id}`}><Pencil size={15} /></button>
            <button onClick={() => setDeletingBlockId(b.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-block-${b.id}`}><Trash2 size={15} /></button>
          </div>
          {editingBlockId === b.id && <div className="border-t border-border p-4"><BlockForm initial={b} pending={updateBlock.isPending} onCancel={() => setEditingBlockId(null)} onSubmit={(body) => updateBlock.mutate({ id: b.id, body }, { onSuccess: () => setEditingBlockId(null) })} /></div>}
          {!isCollapsed && <div className="border-t border-border">
            {openModuleFormFor === b.id && <div className="p-4"><AddModuleForm blockId={b.id} onCreate={createModule} onDone={() => setOpenModuleFormFor(null)} /></div>}
            {list.length ? renderModuleGroup(list) : <p className="p-5 text-xs text-muted-foreground">No modules in this block yet — use "+ Module" above to add one.</p>}
          </div>}
        </div>;
      })}

      <div className="rounded-2xl border border-dashed border-border bg-card" data-testid="section-block-unassigned">
        <div className="flex items-center gap-3 p-4">
          <button onClick={() => setCollapsed((s) => { const next = new Set(s); if (next.has('unassigned')) next.delete('unassigned'); else next.add('unassigned'); return next; })} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" data-testid="button-toggle-block-unassigned"><ChevronRight size={16} className={cn('transition-transform', !collapsed.has('unassigned') && 'rotate-90')} /></button>
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Library size={16} /></div>
          <div className="flex-1 text-sm font-extrabold text-muted-foreground">Unassigned modules</div>
          <span className="text-[11px] text-muted-foreground">{unassigned.length} module{unassigned.length === 1 ? '' : 's'}</span>
          <button onClick={() => setOpenModuleFormFor(openModuleFormFor === 'unassigned' ? null : 'unassigned')} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-add-module-unassigned">+ Module</button>
        </div>
        {!collapsed.has('unassigned') && <div className="border-t border-border">
          {openModuleFormFor === 'unassigned' && <div className="p-4"><AddModuleForm blockId={null} onCreate={createModule} onDone={() => setOpenModuleFormFor(null)} /></div>}
          {unassigned.length ? renderModuleGroup(unassigned) : <p className="p-5 text-xs text-muted-foreground">No unassigned modules.</p>}
        </div>}
      </div>
    </div>}

    {deletingId !== null && <ConfirmDialog title="Permanently delete this module?" body="This erases the module and its subjects/topics for good — MCQs and flashcards filed under it stay in their banks, just unassigned. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removeModulePermanent.mutate(deletingId)} pending={removeModulePermanent.isPending} />}
    {deletingBlockId !== null && <ConfirmDialog title="Permanently delete this block?" body="Modules inside it are kept — they move to Unassigned, not deleted. There is no undo for the block itself." confirmLabel="Delete forever" onCancel={() => setDeletingBlockId(null)} onConfirm={() => removeBlockPermanent.mutate(deletingBlockId)} pending={removeBlockPermanent.isPending} />}
  </div>;
}

// Inline subject/topic builder shown inside a module row on the Academic
// content screen — lets an admin build out a module's curriculum (subjects,
// then topics within each subject) without leaving the module list.
function SubjectsTopicsManager({ moduleId, breadcrumb }: { moduleId: number; breadcrumb?: string }) {
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
        {s.iconUrl && <img src={resolveUploadUrl(s.iconUrl)} alt="" className="size-8 shrink-0 rounded-lg object-cover" data-testid={`img-subject-thumbnail-${s.id}`} />}
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

function TopicsManager({ subjectId }: { subjectId: number }) {
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
function AdminSubjectsPage() {
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const subjectsQ = useQuery({ queryKey: ['admin-subjects-all'], queryFn: () => subjectAdminApi.list() });
  const modules = [...(modulesQ.data ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const moduleName = (id: number) => modules.find((m) => m.id === id)?.name ?? `Module #${id}`;
  const [moduleFilter, setModuleFilter] = useState<'all' | number>('all');
  const [newModuleId, setNewModuleId] = useState<number | ''>('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectIcon, setNewSubjectIcon] = useState<string | null>(null);
  const [newSubjectIconPreview, setNewSubjectIconPreview] = useState<string | null>(null);
  const [deletingSubjectId, setDeletingSubjectId] = useState<number | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectIcon, setEditSubjectIcon] = useState<string | null | undefined>(undefined);
  const [editSubjectIconPreview, setEditSubjectIconPreview] = useState<string | null>(null);

  // Also invalidates the per-module ['admin-subjects', moduleId] cache
  // Academic content's nested SubjectsTopicsManager uses, so editing a
  // subject from this standalone page doesn't leave that view stale.
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['admin-subjects-all'] }); queryClient.invalidateQueries({ queryKey: ['admin-subjects'] }); };
  const createSubject = useMutation({ mutationFn: subjectAdminApi.create, onSuccess: () => { invalidate(); setNewSubjectName(''); setNewSubjectIcon(null); setNewSubjectIconPreview(null); }, onError: (err: unknown) => toast({ title: 'Could not create subject', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const updateSubject = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof subjectAdminApi.update>[1] }) => subjectAdminApi.update(id, body), onSuccess: () => { invalidate(); setEditingSubjectId(null); }, onError: (err: unknown) => toast({ title: 'Could not update subject', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removeSubject = useMutation({ mutationFn: subjectAdminApi.remove, onSuccess: () => { invalidate(); setDeletingSubjectId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete subject', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const reorderSubjects = useMutation({
    mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => subjectAdminApi.update(r.id, { displayOrder: r.displayOrder }))),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not reorder subjects', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const startEditSubject = (s: AdminSubject) => { setEditingSubjectId(s.id); setEditSubjectName(s.name); setEditSubjectIcon(undefined); setEditSubjectIconPreview(s.iconUrl ?? null); };

  const allSubjects = subjectsQ.data ?? [];
  const grouped = new Map<number, AdminSubject[]>();
  for (const s of allSubjects) { if (moduleFilter !== 'all' && s.moduleId !== moduleFilter) continue; if (!grouped.has(s.moduleId)) grouped.set(s.moduleId, []); grouped.get(s.moduleId)!.push(s); }
  for (const list of grouped.values()) list.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const groupIds = [...grouped.keys()].sort((a, b) => moduleName(a).localeCompare(moduleName(b)));
  // Reorder within a single module's list — same self-healing whole-list
  // renumber as AdminInstitutionsList/SubjectsTopicsManager.
  const moveSubject = (moduleId: number, index: number, dir: -1 | 1) => {
    const list = grouped.get(moduleId) ?? [];
    const target = index + dir;
    if (target < 0 || target >= list.length || reorderSubjects.isPending) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderSubjects.mutate(reordered.map((s, i) => ({ id: s.id, displayOrder: i })));
  };

  return <div><SectionHeader eyebrow="Curriculum operations" title="Subjects" action={<select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-subjects-module-filter"><option value="all">All modules</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>} />
    {!groupIds.length && <EmptyState icon={BookOpen} title="No subjects yet" body="Add one below — every subject belongs to a module." />}
    <div className="space-y-6">{groupIds.map((moduleId) => { const list = grouped.get(moduleId)!; return <div key={moduleId}>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{moduleName(moduleId)}</div>
      <div className="space-y-2">{list.map((s, i) => <div key={s.id} className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 p-3">
          <div className="flex shrink-0 flex-col">
            <button type="button" disabled={i === 0 || reorderSubjects.isPending} onClick={() => moveSubject(moduleId, i, -1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-up-subject-${s.id}`} aria-label="Move up"><ChevronUp size={12} /></button>
            <button type="button" disabled={i === list.length - 1 || reorderSubjects.isPending} onClick={() => moveSubject(moduleId, i, 1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-down-subject-${s.id}`} aria-label="Move down"><ChevronDown size={12} /></button>
          </div>
          {s.iconUrl && <img src={resolveUploadUrl(s.iconUrl)} alt="" className="size-8 shrink-0 rounded-lg object-cover" data-testid={`img-subject-thumbnail-${s.id}`} />}
          <div className="flex-1 text-xs font-bold">{s.name} <span className="font-normal text-muted-foreground">· {s.topicCount} topics</span></div>
          <button onClick={() => startEditSubject(s)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-subject-${s.id}`}><Pencil size={13} /></button>
          <button onClick={() => setDeletingSubjectId(s.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-subject-${s.id}`}><Trash2 size={13} /></button>
        </div>
        {editingSubjectId === s.id && <form onSubmit={(e) => { e.preventDefault(); if (!editSubjectName.trim()) return; updateSubject.mutate({ id: s.id, body: { name: editSubjectName.trim(), ...(editSubjectIcon !== undefined ? { iconPath: editSubjectIcon } : {}) } }); }} className="space-y-2 border-t border-border p-3">
          <input autoFocus value={editSubjectName} onChange={(e) => setEditSubjectName(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-rename-subject-${s.id}`} />
          <AdminImageUpload currentUrl={editSubjectIconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId={`input-subject-icon-upload-${s.id}`} onUploaded={(storagePath, previewUrl) => { setEditSubjectIcon(storagePath); setEditSubjectIconPreview(previewUrl); }} />
          <div className="flex gap-2"><button type="submit" disabled={updateSubject.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-subject-${s.id}`}>Save</button><button type="button" onClick={() => setEditingSubjectId(null)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground" data-testid={`button-cancel-edit-subject-${s.id}`}>Cancel</button></div>
        </form>}
      </div>)}</div>
    </div>; })}</div>
    <form onSubmit={(e) => { e.preventDefault(); if (newModuleId && newSubjectName.trim()) createSubject.mutate({ moduleId: Number(newModuleId), name: newSubjectName.trim(), active: true, iconPath: newSubjectIcon ?? undefined }); }} className="mt-6 space-y-2 rounded-xl border border-dashed border-border p-4">
      <div className="text-xs font-bold">Add subject</div>
      <select required value={newModuleId} onChange={(e) => setNewModuleId(e.target.value ? Number(e.target.value) : '')} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-new-subject-module"><option value="">Choose a module…</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <input value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="Subject name, e.g. Anatomy" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-add-subject" />
      <AdminImageUpload currentUrl={newSubjectIconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId="input-new-subject-icon-upload" onUploaded={(storagePath, previewUrl) => { setNewSubjectIcon(storagePath); setNewSubjectIconPreview(previewUrl); }} />
      <button type="submit" disabled={createSubject.isPending || !newModuleId || !newSubjectName.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-add-subject">Add subject</button>
    </form>
    {deletingSubjectId !== null && <ConfirmDialog title="Delete this subject?" body="Its topics go with it. MCQs already tagged to it are kept but will need a new home." onCancel={() => setDeletingSubjectId(null)} onConfirm={() => removeSubject.mutate(deletingSubjectId)} pending={removeSubject.isPending} />}
  </div>;
}

// Standalone "Topics" settings page — mirrors AdminSubjectsPage, grouped by
// subject (with the parent module shown too, since a subject name alone
// isn't always unique across modules).
function AdminTopicsPage() {
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const subjectsQ = useQuery({ queryKey: ['admin-subjects-all'], queryFn: () => subjectAdminApi.list() });
  const topicsQ = useQuery({ queryKey: ['admin-topics-all'], queryFn: () => topicAdminApi.list() });
  const modules = modulesQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const moduleName = (id: number) => modules.find((m) => m.id === id)?.name ?? `Module #${id}`;
  const subjectLabel = (id: number) => { const s = subjects.find((x) => x.id === id); return s ? `${s.name} — ${moduleName(s.moduleId)}` : `Subject #${id}`; };
  const [subjectFilter, setSubjectFilter] = useState<'all' | number>('all');
  const [newSubjectId, setNewSubjectId] = useState<number | ''>('');
  const [newTopicName, setNewTopicName] = useState('');
  const [deletingTopicId, setDeletingTopicId] = useState<number | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
  const [editTopicName, setEditTopicName] = useState('');

  // Same cross-invalidation as AdminSubjectsPage, for TopicsManager's
  // per-subject cache.
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['admin-topics-all'] }); queryClient.invalidateQueries({ queryKey: ['admin-topics'] }); };
  const createTopic = useMutation({ mutationFn: topicAdminApi.create, onSuccess: () => { invalidate(); setNewTopicName(''); }, onError: (err: unknown) => toast({ title: 'Could not create topic', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const updateTopic = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof topicAdminApi.update>[1] }) => topicAdminApi.update(id, body), onSuccess: () => { invalidate(); setEditingTopicId(null); }, onError: (err: unknown) => toast({ title: 'Could not rename topic', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removeTopic = useMutation({ mutationFn: topicAdminApi.remove, onSuccess: () => { invalidate(); setDeletingTopicId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete topic', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const reorderTopics = useMutation({
    mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => topicAdminApi.update(r.id, { displayOrder: r.displayOrder }))),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not reorder topics', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const allTopics = topicsQ.data ?? [];
  const grouped = new Map<number, AdminTopic[]>();
  for (const t of allTopics) { if (subjectFilter !== 'all' && t.subjectId !== subjectFilter) continue; if (!grouped.has(t.subjectId)) grouped.set(t.subjectId, []); grouped.get(t.subjectId)!.push(t); }
  for (const list of grouped.values()) list.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const groupIds = [...grouped.keys()].sort((a, b) => subjectLabel(a).localeCompare(subjectLabel(b)));
  const moveTopic = (subjectId: number, index: number, dir: -1 | 1) => {
    const list = grouped.get(subjectId) ?? [];
    const target = index + dir;
    if (target < 0 || target >= list.length || reorderTopics.isPending) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderTopics.mutate(reordered.map((t, i) => ({ id: t.id, displayOrder: i })));
  };

  return <div><SectionHeader eyebrow="Curriculum operations" title="Topics" action={<select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-topics-subject-filter"><option value="all">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{subjectLabel(s.id)}</option>)}</select>} />
    {!groupIds.length && <EmptyState icon={CircleHelp} title="No topics yet" body="Add one below — every topic belongs to a subject." />}
    <div className="space-y-6">{groupIds.map((subjectId) => { const list = grouped.get(subjectId)!; return <div key={subjectId}>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{subjectLabel(subjectId)}</div>
      <div className="space-y-1.5">{list.map((t, i) => <div key={t.id} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs" data-testid={`row-topic-${t.id}`}>
        {editingTopicId === t.id
          ? <form onSubmit={(e) => { e.preventDefault(); if (editTopicName.trim()) updateTopic.mutate({ id: t.id, body: { name: editTopicName.trim() } }); }} className="flex items-center gap-1.5">
              <input autoFocus value={editTopicName} onChange={(e) => setEditTopicName(e.target.value)} className="h-7 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-rename-topic-${t.id}`} />
              <button type="submit" disabled={updateTopic.isPending} className="rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground" data-testid={`button-save-topic-${t.id}`}>Save</button>
              <button type="button" onClick={() => setEditingTopicId(null)} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold" data-testid={`button-cancel-edit-topic-${t.id}`}>Cancel</button>
            </form>
          : <div className="flex items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-1.5 min-w-0">
                <div className="flex shrink-0 flex-col">
                  <button type="button" disabled={i === 0 || reorderTopics.isPending} onClick={() => moveTopic(subjectId, i, -1)} className="grid size-3.5 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-up-topic-${t.id}`} aria-label="Move up"><ChevronUp size={11} /></button>
                  <button type="button" disabled={i === list.length - 1 || reorderTopics.isPending} onClick={() => moveTopic(subjectId, i, 1)} className="grid size-3.5 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-down-topic-${t.id}`} aria-label="Move down"><ChevronDown size={11} /></button>
                </div>
                <span className="truncate">{t.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => { setEditingTopicId(t.id); setEditTopicName(t.name); }} className="text-muted-foreground hover:text-foreground" data-testid={`button-edit-topic-${t.id}`}><Pencil size={12} /></button>
                <button onClick={() => setDeletingTopicId(t.id)} className="text-muted-foreground hover:text-destructive" data-testid={`button-delete-topic-${t.id}`}><Trash2 size={12} /></button>
              </div>
            </div>}
      </div>)}</div>
    </div>; })}</div>
    <form onSubmit={(e) => { e.preventDefault(); if (newSubjectId && newTopicName.trim()) createTopic.mutate({ subjectId: Number(newSubjectId), name: newTopicName.trim(), active: true }); }} className="mt-6 space-y-2 rounded-xl border border-dashed border-border p-4">
      <div className="text-xs font-bold">Add topic</div>
      <select required value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value ? Number(e.target.value) : '')} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-new-topic-subject"><option value="">Choose a subject…</option>{subjects.map((s) => <option key={s.id} value={s.id}>{subjectLabel(s.id)}</option>)}</select>
      <div className="flex gap-2"><input value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="Topic name" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-add-topic" /><button disabled={createTopic.isPending || !newSubjectId || !newTopicName.trim()} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-add-topic">Add</button></div>
    </form>
    {deletingTopicId !== null && <ConfirmDialog title="Delete this topic?" body="MCQs already tagged to it are kept but will need a new home." onCancel={() => setDeletingTopicId(null)} onConfirm={() => removeTopic.mutate(deletingTopicId)} pending={removeTopic.isPending} />}
  </div>;
}

function ExplanationCoverage({ onSelectStatus }: { onSelectStatus?: (status: ExplanationStatus) => void }) {
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

function McqExplanationRow({ mcq }: { mcq: { id: number; explanation?: string | null; explanationStatus?: ExplanationStatus } }) {
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
function McqEditForm({ mcq, onDone }: { mcq: AdminMcqRow; onDone: () => void }) {
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
function McqTreeRow({ mcq }: { mcq: AdminMcqRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => mcqAdminApi.remove(mcq.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] }); queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); setDeleting(false); },
    onError: (err: unknown) => toast({ title: 'Could not delete question', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  return <div className="rounded-xl border border-border bg-card p-3" data-testid={`row-tree-mcq-${mcq.id}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1"><div className="flex items-center gap-2"><Badge tone={mcq.status === 'published' ? 'green' : 'amber'}>{mcq.status}</Badge><Badge tone={mcq.explanationStatus === 'APPROVED' ? 'green' : mcq.explanationStatus === 'PENDING' ? 'neutral' : 'blue'}>{mcq.explanationStatus.replace('_', ' ')}</Badge></div><p className="mt-2 text-xs font-bold leading-5">{mcq.question}</p></div>
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
function BulkDeleteInScope({ label, count, filters }: { label: string; count: number; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
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
function analyzeMcqRows(rows: AdminMcqRow[]) {
  const easy = rows.filter((r) => r.difficulty === 'easy').length;
  const moderate = rows.filter((r) => r.difficulty === 'moderate').length;
  const hard = rows.filter((r) => r.difficulty === 'hard').length;
  const explained = rows.filter((r) => r.explanationStatus === 'APPROVED').length;
  return { total: rows.length, easy, moderate, hard, explained };
}

function AnalysisPanel({ rows, label, filters }: { rows: AdminMcqRow[]; label: string; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
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

function AnalysisToggle({ rows, label, filters }: { rows: AdminMcqRow[]; label: string; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
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
function TopicAiGenerate({ moduleId, subjectId, topicId, topicName }: { moduleId: number; subjectId: number; topicId: number; topicName: string }) {
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

function McqTreeTopic({ moduleId, subjectId, topicId, name, mcqsByTopic }: { moduleId: number; subjectId: number; topicId: number; name: string; mcqsByTopic: Map<number, AdminMcqRow[]> }) {
  const [open, setOpen] = useState(false);
  const rows = mcqsByTopic.get(topicId) ?? [];
  return <div className="rounded-lg border border-border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-2"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-tree-topic-${topicId}`}><ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[10px] font-normal text-muted-foreground">{rows.length} question{rows.length === 1 ? '' : 's'}</span><AnalysisToggle rows={rows} label={name} filters={{ topicId }} /><TopicAiGenerate moduleId={moduleId} subjectId={subjectId} topicId={topicId} topicName={name} /><BulkDeleteInScope label={name} count={rows.length} filters={{ topicId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-3">{rows.length ? rows.map((m) => <McqTreeRow key={m.id} mcq={m} />) : <p className="text-[11px] text-muted-foreground">No questions in this topic yet.</p>}</div>}
  </div>;
}

// Subject level — lazily loads its topics (same query key as TopicsManager, so cache is shared).
function McqTreeSubject({ moduleId, subjectId, name, mcqsByTopic }: { moduleId: number; subjectId: number; name: string; mcqsByTopic: Map<number, AdminMcqRow[]> }) {
  const [open, setOpen] = useState(false);
  const topicsQ = useQuery({ queryKey: ['admin-topics', subjectId], queryFn: () => topicAdminApi.list(subjectId), enabled: open });
  const topics = topicsQ.data ?? [];
  const subjectRows = [...mcqsByTopic.entries()].filter(([tId]) => topics.some((t) => t.id === tId)).flatMap(([, rows]) => rows);
  return <div className="rounded-xl border border-border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-1 px-4 py-2.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-tree-subject-${subjectId}`}><ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />{name}</button>{open && <><AnalysisToggle rows={subjectRows} label={name} filters={{ subjectId }} /><BulkDeleteInScope label={name} count={subjectRows.length} filters={{ subjectId }} /></>}</div>
    {open && <div className="space-y-2 border-t border-border p-3">{topicsQ.isLoading ? <p className="text-[11px] text-muted-foreground">Loading topics…</p> : topics.length ? topics.map((t) => <McqTreeTopic key={t.id} moduleId={moduleId} subjectId={subjectId} topicId={t.id} name={t.name} mcqsByTopic={mcqsByTopic} />) : <p className="text-[11px] text-muted-foreground">No topics in this subject yet.</p>}</div>}
  </div>;
}

// Module level (top of the tree) — lazily loads its subjects.
function McqTreeModule({ moduleId, name, mcqCount, mcqsByTopic }: { moduleId: number; name: string; mcqCount: number; mcqsByTopic: Map<number, AdminMcqRow[]> }) {
  const [open, setOpen] = useState(false);
  const subjectsQ = useQuery({ queryKey: ['admin-subjects', moduleId], queryFn: () => subjectAdminApi.list(moduleId), enabled: open });
  const subjects = subjectsQ.data ?? [];
  const moduleRows = [...mcqsByTopic.values()].flat().filter((r) => r.moduleId === moduleId);
  return <div className="rounded-2xl border border-border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-1 px-5 py-3.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-sm font-extrabold" data-testid={`button-tree-module-${moduleId}`}><ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[11px] text-muted-foreground">{mcqCount} question{mcqCount === 1 ? '' : 's'}</span><AnalysisToggle rows={moduleRows} label={name} filters={{ moduleId }} /><BulkDeleteInScope label={name} count={mcqCount} filters={{ moduleId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-4">{subjectsQ.isLoading ? <p className="text-xs text-muted-foreground">Loading subjects…</p> : subjects.length ? subjects.map((s) => <McqTreeSubject key={s.id} moduleId={moduleId} subjectId={s.id} name={s.name} mcqsByTopic={mcqsByTopic} />) : <p className="text-xs text-muted-foreground">No subjects in this module yet.</p>}</div>}
  </div>;
}

// Block level only shows the read-only breakdown (no AI-classify button
// here — that endpoint's scope filter takes one moduleId/subjectId/topicId,
// not a whole block's worth of modules at once; classify from the module
// row below instead).
function BlockAnalysisToggle({ rows }: { rows: AdminMcqRow[] }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen((v) => !v)} className={cn('rounded-lg p-1', open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} data-testid="button-toggle-block-analysis" aria-label="Analyze this block"><BarChart3 size={13} /></button>
    {open && <div className="w-full basis-full pt-1"><AnalysisStats rows={rows} /></div>}
  </>;
}

function AnalysisStats({ rows }: { rows: AdminMcqRow[] }) {
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
function groupByProgramYear<T extends { key: number | 'other'; block?: AdminBlock }>(groups: T[]): Array<{ programLabel: string; yearLabel: string; groups: T[] }> {
  const buckets = new Map<string, { program: string; year: number | null; groups: T[] }>();
  for (const g of groups) {
    const program = g.block?.programTargetKind || '';
    const year = g.block?.yearTargetNumber ?? null;
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

function McqBankTree({ modules, blocks }: { modules: AdminModule[]; blocks: AdminBlock[] }) {
  const treeQ = useQuery({ queryKey: ['admin-mcqs-tree'], queryFn: mcqAdminApi.list });
  const rows = treeQ.data ?? [];
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
  // narrows by. Modules with no blockId fall into an "Other modules" group,
  // shown after the program/year sections since it has no block to tag with
  // a program/year in the first place.
  const modulesByBlock = new Map<number | 'other', AdminModule[]>();
  for (const m of modules) { const key = m.blockId ?? 'other'; const list = modulesByBlock.get(key); if (list) list.push(m); else modulesByBlock.set(key, [m]); }
  const blockGroups: Array<{ key: number | 'other'; name: string; mods: AdminModule[]; block?: AdminBlock }> = blocks.filter((b) => modulesByBlock.has(b.id)).map((b) => ({ key: b.id, name: b.name, mods: modulesByBlock.get(b.id)!, block: b }));
  const otherMods = modulesByBlock.get('other');
  const programYearGroups = groupByProgramYear(blockGroups);
  return <div className="space-y-7">
    {programYearGroups.map(({ programLabel, yearLabel, groups }) => <div key={`${programLabel}-${yearLabel}`} className="space-y-5">
      {blocks.length > 0 && <div className="flex items-center gap-2 border-b border-border pb-2"><GraduationCap size={14} className="text-primary" /><h3 className="text-xs font-extrabold" data-testid={`text-program-year-group-${programLabel}-${yearLabel}`}>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></h3></div>}
      {groups.map((g) => { const blockRows = rows.filter((r) => r.moduleId != null && g.mods.some((m) => m.id === r.moduleId)); return <div key={g.key} className="space-y-3">
        {blocks.length > 0 && <div className="flex flex-wrap items-center justify-between gap-1"><p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground" data-testid={`text-mcq-block-group-${g.key}`}>{g.name}</p>{!!blockRows.length && <BlockAnalysisToggle rows={blockRows} />}</div>}
        {g.mods.map((m) => <McqTreeModule key={m.id} moduleId={m.id} name={m.name} mcqCount={countByModule.get(m.id) ?? 0} mcqsByTopic={mcqsByTopic} />)}
      </div>; })}
    </div>)}
    {!!otherMods?.length && <div className="space-y-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Other modules (not in a block)</p>
      {otherMods.map((m) => <McqTreeModule key={m.id} moduleId={m.id} name={m.name} mcqCount={countByModule.get(m.id) ?? 0} mcqsByTopic={mcqsByTopic} />)}
    </div>}
    {!!trulyUnassigned.length && <div className="rounded-2xl border border-dashed border-border bg-card p-4"><p className="mb-3 text-xs font-bold text-muted-foreground">{trulyUnassigned.length} question{trulyUnassigned.length === 1 ? '' : 's'} with no module/subject/topic, exam, or past paper</p><div className="space-y-2">{trulyUnassigned.map((m) => <McqTreeRow key={m.id} mcq={m} />)}</div></div>}
  </div>;
}

// Collapsible group of MCQs that belong to one exam or past paper (no
// module/subject/topic) — same row component as the module tree uses. Used
// by ExamManagePanel/AdminPastPapers, not the main bank tree above anymore.
function McqSourceGroup({ label, icon: Icon, rows }: { label: string; icon: typeof FolderOpen; rows: AdminMcqRow[] }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-xl border border-border bg-background">
    <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold" data-testid={`button-mcq-source-group-${label}`}><span className="flex items-center gap-2"><ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} /><Icon size={13} className="text-primary" />{label}</span><span className="text-[10px] font-normal text-muted-foreground">{rows.length} question{rows.length === 1 ? '' : 's'}</span></button>
    {open && <div className="space-y-2 border-t border-border p-3">{rows.map((m) => <McqTreeRow key={m.id} mcq={m} />)}</div>}
  </div>;
}

function AdminMcqs() {
  const create = useCreateMcq();
  // Shared with McqBankTree's ['admin-mcqs-tree'] cache — the flat list used
  // to source from the public useListMcqs() hook, whose response schema
  // strips moduleId/subjectId/topicId/explanationStatus (see GET /mcqs's
  // comment), so the explanation badges and the new status filter below
  // couldn't actually work against it. This is the same admin-only /admin/mcqs
  // data the tree view already uses, so switching views doesn't refetch.
  const mcqsTreeQ = useQuery({ queryKey: ['admin-mcqs-tree'], queryFn: mcqAdminApi.list });
  const allMcqs = mcqsTreeQ.data ?? [];
  const modulesForNamesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const subjectsForNamesQ = useQuery({ queryKey: ['admin-subjects-all'], queryFn: () => subjectAdminApi.list() });
  const topicsForNamesQ = useQuery({ queryKey: ['admin-topics-all'], queryFn: () => topicAdminApi.list() });
  const moduleName = (id: number | null) => id === null ? '—' : (modulesForNamesQ.data?.find((m) => m.id === id)?.name ?? `Module #${id}`);
  const subjectName = (id: number | null) => id === null ? '—' : (subjectsForNamesQ.data?.find((s) => s.id === id)?.name ?? `Subject #${id}`);
  const topicName = (id: number | null) => id === null ? '—' : (topicsForNamesQ.data?.find((t) => t.id === id)?.name ?? `Topic #${id}`);
  // Flat-list search + explanation-status filter (the latter driven by
  // clicking a tile in ExplanationCoverage below).
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExplanationStatus | null>(null);
  const mcqs = allMcqs.filter((m) =>
    (!search.trim() || m.question.toLowerCase().includes(search.trim().toLowerCase())) &&
    (!statusFilter || m.explanationStatus === statusFilter));
  const [manualOpen, setManualOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [deletingMcqId, setDeletingMcqId] = useState<number | null>(null);
  const [bankView, setBankView] = useState<'tree' | 'flat'>('tree');
  const invalidateMcqs = () => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] }); };
  const removeMcq = useMutation({ mutationFn: mcqAdminApi.remove, onSuccess: () => { invalidateMcqs(); setDeletingMcqId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete question', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });

  // Multi-select for bulk actions on the flat list view.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteMode, setBulkDeleteMode] = useState<'selected' | 'all' | null>(null);
  const toggleSelected = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleSelectAll = () => setSelectedIds((prev) => prev.size === mcqs.length ? new Set() : new Set(mcqs.map((m) => m.id)));
  const bulkDelete = useMutation({
    // Always an explicit id list, even for "delete all in view" — the
    // server-side {all:true, filters} path doesn't know about the
    // explanationStatus filter (client-only, see above), so this is the one
    // approach that reliably matches whatever's actually on screen.
    mutationFn: (ids: number[]) => mcqAdminApi.bulkRemove({ ids }),
    onSuccess: (res) => { invalidateMcqs(); setSelectedIds(new Set()); setBulkDeleteMode(null); toast({ title: `Deleted ${res.deleted} question${res.deleted === 1 ? '' : 's'}` }); },
    onError: (err: unknown) => toast({ title: 'Bulk delete failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const bulkAddRowsInit = () => [{ question: '', a: '', b: '', c: '', d: '', e: '', correct: 'a', explanation: '', ea: '', eb: '', ec: '', ed: '', ee: '', difficulty: 'moderate', showOptionExplanations: false }];
  const [bulkRows, setBulkRows] = useState(bulkAddRowsInit);
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<'mixed' | 'easy' | 'moderate' | 'hard'>('mixed');
  const draftsFromAi = (drafts: Array<{ question: string; options: string[]; correctAnswer: string; explanation: string; optionExplanations?: (string | null)[]; difficulty?: string }>) => drafts.map((d) => ({
    question: d.question,
    a: d.options[0] ?? '', b: d.options[1] ?? '', c: d.options[2] ?? '', d: d.options[3] ?? '', e: d.options[4] ?? '',
    correct: (['a', 'b', 'c', 'd', 'e'][d.options.findIndex((o) => o === d.correctAnswer)] ?? 'a'),
    explanation: d.explanation,
    ea: d.optionExplanations?.[0] ?? '', eb: d.optionExplanations?.[1] ?? '', ec: d.optionExplanations?.[2] ?? '', ed: d.optionExplanations?.[3] ?? '', ee: d.optionExplanations?.[4] ?? '',
    difficulty: d.difficulty ?? 'moderate',
    showOptionExplanations: !!(d.optionExplanations && d.optionExplanations.some((e) => e?.trim())),
  }));
  const generateAiMcqs = useMutation({
    mutationFn: () => mcqAdminApi.generateAi(Number(topicId), aiCount, aiDifficulty === 'mixed' ? undefined : aiDifficulty),
    onSuccess: (res) => {
      setBulkRows(draftsFromAi(res.drafts));
      toast({ title: `Generated ${res.drafts.length} draft questions`, description: 'Review each before saving — nothing is added to the bank yet.' });
    },
    onError: (err: unknown) => toast({ title: 'Could not generate questions', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  // "Full set" — one deliberate easy + moderate + hard batch instead of
  // leaving the mix up to the model. Three separate calls (one per pinned
  // difficulty) rather than asking for a bigger mixed batch and hoping the
  // split comes out even.
  const generateAiFullSet = useMutation({
    mutationFn: async () => {
      const [easy, moderate, hard] = await Promise.all([
        mcqAdminApi.generateAi(Number(topicId), aiCount, 'easy'),
        mcqAdminApi.generateAi(Number(topicId), aiCount, 'moderate'),
        mcqAdminApi.generateAi(Number(topicId), aiCount, 'hard'),
      ]);
      return [...easy.drafts, ...moderate.drafts, ...hard.drafts];
    },
    onSuccess: (drafts) => {
      setBulkRows(draftsFromAi(drafts));
      toast({ title: `Generated ${drafts.length} draft questions`, description: `${aiCount} easy, ${aiCount} moderate, ${aiCount} hard — review before saving.` });
    },
    onError: (err: unknown) => toast({ title: 'Could not generate the full set', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const bulkCreateMutation = useMutation({
    mutationFn: () => mcqAdminApi.bulkCreate(bulkRows.filter((r) => r.question.trim() && r.a.trim() && r.b.trim()).map((r) => {
      const options = [r.a, r.b, r.c, r.d, r.e].map((o) => o.trim()).filter(Boolean);
      const correctIndex = r.correct.charCodeAt(0) - 97;
      const rawOptionExplanations = [r.ea, r.eb, r.ec, r.ed, r.ee].slice(0, options.length).map((e) => e.trim() || null);
      const optionExplanations = rawOptionExplanations.some((e) => e) ? rawOptionExplanations : null;
      const explanation = r.explanation.trim() || rawOptionExplanations[correctIndex] || null;
      return { question: r.question.trim(), options, correctAnswer: options[correctIndex] ?? null, explanation, optionExplanations, difficulty: r.difficulty || 'moderate', moduleId: Number(moduleId), subjectId: Number(subjectId), topicId: Number(topicId) } as unknown as Partial<AdminMcqRow> & { question: string; options: string[] };
    })),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); setBulkRows(bulkAddRowsInit()); setBulkAddOpen(false); toast({ title: `Added ${res.created} questions` }); },
    onError: (err: unknown) => toast({ title: 'Could not add questions', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  // Target selection shared by both manual add and file import
  const blocksQ = useQuery({ queryKey: ['admin-blocks'], queryFn: blockAdminApi.listAll });
  const blocks = blocksQ.data ?? [];
  const [blockId, setBlockId] = useState('');
  // useListModules() (the public/student-facing hook) returns a `Module`
  // shape with no blockId — moduleAdminApi.listAll() returns `AdminModule`,
  // which carries blockId, so that's what the Block filter (and the bank
  // tree's grouping) need to filter/group by.
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const allModules = modulesQ.data ?? [];
  // Narrow the module choices to the selected Block, same cascade the
  // flashcard admin form already uses — "All blocks" (default) shows every
  // module, matching the previous behavior when nothing is selected.
  const modules = blockId ? allModules.filter((m) => String(m.blockId ?? '') === blockId) : allModules;
  const [moduleId, setModuleId] = useState('');
  const subjectsQ = useListSubjects(moduleId ? { moduleId: Number(moduleId) } : undefined);
  const [subjectId, setSubjectId] = useState('');
  const topicsQ = useListTopics(subjectId ? { subjectId: Number(subjectId) } : undefined);
  const [topicId, setTopicId] = useState('');
  const targetReady = !!moduleId && !!subjectId && !!topicId;

  // Optional: link imported/manual questions to a past paper
  const pastPapersQ = useQuery({ queryKey: ['admin-past-papers'], queryFn: () => pastPapersApi.list() });
  const [pastPaperId, setPastPaperId] = useState('');

  // Import profiles (admin-customizable extraction patterns)
  const profiles = useQuery({ queryKey: ['mcq-import-profiles'], queryFn: mcqImportApi.profiles });
  const [profileId, setProfileId] = useState('');
  const createProfile = useMutation({ mutationFn: mcqImportApi.createProfile, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mcq-import-profiles'] }) });
  const deleteProfile = useMutation({ mutationFn: mcqImportApi.deleteProfile, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mcq-import-profiles'] }) });

  // File parse → review → commit
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<McqCandidate[]>([]);
  const [importStatus, setImportStatus] = useState<'draft' | 'published'>('draft');
  const commit = useMutation({
    mutationFn: mcqImportApi.commit,
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); setCandidates([]); setFile(null); toast({ title: `Imported ${res.imported} questions`, description: 'Saved to the MCQ bank.' }); },
    onError: (err: unknown) => toast({ title: 'Import failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const parseFile = async () => {
    if (!file) return;
    setParsing(true); setParseError(null);
    try {
      const result = await mcqImportApi.parse(file, profileId ? Number(profileId) : undefined);
      setCandidates(result.candidates);
    } catch (err) {
      setParseError(err instanceof ApiRequestError ? err.message : 'Could not parse this file.');
    } finally {
      setParsing(false);
    }
  };

  const updateCandidate = (index: number, patch: Partial<McqCandidate>) => setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const removeCandidate = (index: number) => setCandidates((prev) => prev.filter((_, i) => i !== index));

  const importAll = () => {
    if (!targetReady || !candidates.length) return;
    const cleaned = candidates.map((c) => ({ ...c, options: c.options.map((o) => o.trim()).filter(Boolean) })).filter((c) => c.options.length >= 2);
    commit.mutate({ moduleId: Number(moduleId), subjectId: Number(subjectId), topicId: Number(topicId), pastPaperId: pastPaperId ? Number(pastPaperId) : undefined, status: importStatus, mcqs: cleaned });
  };

  return <div><SectionHeader eyebrow="Assessment bank" title="MCQ management" action={<button onClick={() => setManualOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold" data-testid="button-toggle-manual-mcq"><Pencil size={14} /> {manualOpen ? 'Hide manual entry' : 'Add one manually'}</button>} />

    <div className="rounded-3xl border border-primary/30 bg-[#eef7f1] p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileText size={18} /></div><div><h3 className="text-sm font-extrabold">Bulk upload from a file</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Upload a question bank as .txt, .csv, .xlsx/.xls, .pdf, or .docx. We'll extract the questions automatically — review and fix anything before it's added to the bank.</p></div></div>

      <div className="mt-5 grid gap-3 sm:grid-cols-5"><select value={blockId} onChange={(e) => { setBlockId(e.target.value); setModuleId(''); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-block"><option value="">All blocks</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-module"><option value="">Select module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-import-subject"><option value="">Select subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-import-topic"><option value="">Select topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><select value={pastPaperId} onChange={(e) => setPastPaperId(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-past-paper"><option value="">No past paper (optional)</option>{(pastPapersQ.data || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      {!targetReady && <p className="mt-2 text-[11px] font-semibold text-[#8a5a12]">Pick a module, subject, and topic before uploading — every imported question needs a home.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="file" accept=".txt,.csv,.xlsx,.xls,.pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="flex-1 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-xs" data-testid="input-mcq-file" />
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-profile"><option value="">Default pattern (numbered Q, A–E options)</option>{(profiles.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button onClick={() => setProfilesOpen((v) => !v)} className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold" data-testid="button-toggle-profiles">Custom patterns</button>
        <button disabled={!file || parsing} onClick={parseFile} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-parse-file">{parsing ? 'Reading file…' : 'Parse file'}</button>
      </div>
      {parseError && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-parse-error">{parseError}</div>}

      {profilesOpen && <div className="mt-4 rounded-2xl border border-border bg-card p-4"><div className="mb-3 text-xs font-bold">Extraction patterns (regular expressions, applied case-insensitively)</div><div className="space-y-3">{(profiles.data || []).map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs"><span className="font-bold">{p.name}</span><button onClick={() => deleteProfile.mutate(p.id)} className="font-bold text-destructive" data-testid={`button-delete-profile-${p.id}`}>Delete</button></div>)}</div><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); createProfile.mutate({ name: String(f.get('name')), questionPattern: String(f.get('questionPattern')), optionPattern: String(f.get('optionPattern')), answerPattern: String(f.get('answerPattern')), explanationPattern: String(f.get('explanationPattern')), hintPattern: String(f.get('hintPattern')) || undefined, referencePattern: String(f.get('referencePattern')) || undefined, isDefault: false }, { onSuccess: () => e.currentTarget.reset() }); }} className="mt-4 space-y-2 border-t border-border pt-4"><input required name="name" placeholder="Profile name, e.g. 'KMU paper format'" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-profile-name" /><input required name="questionPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.questionPattern} placeholder="Question line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-question-pattern" /><input required name="optionPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.optionPattern} placeholder="Option line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-option-pattern" /><input required name="answerPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.answerPattern} placeholder="Answer line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-answer-pattern" /><input required name="explanationPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.explanationPattern} placeholder="Explanation line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-explanation-pattern" /><input name="hintPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.hintPattern} placeholder="Hint line pattern (optional)" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-hint-pattern" /><input name="referencePattern" defaultValue={DEFAULT_IMPORT_PATTERNS.referencePattern} placeholder="Reference line pattern (optional)" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-reference-pattern" /><button className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="button-save-profile">Save pattern set</button></form></div>}

      {candidates.length > 0 && <div className="mt-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="text-xs font-bold">{candidates.length} questions found · {candidates.filter((c) => c.needsReview).length} need review</div><div className="flex items-center gap-3"><select value={importStatus} onChange={(e) => setImportStatus(e.target.value as 'draft' | 'published')} className="h-9 rounded-lg border border-border bg-card px-3 text-xs" data-testid="select-import-status"><option value="draft">Import as draft</option><option value="published">Import &amp; publish immediately</option></select><button disabled={!targetReady || commit.isPending} onClick={importAll} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-import-all">{commit.isPending ? 'Importing…' : `Import ${candidates.length} questions`}</button></div></div>
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">{candidates.map((c, i) => <div key={i} className={cn('rounded-2xl border bg-card p-4', c.needsReview ? 'border-[#e5a952]' : 'border-border')} data-testid={`card-candidate-${i}`}>
          <div className="flex items-center justify-between"><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', c.needsReview ? 'bg-[#fdeecb] text-[#8a5a12]' : 'bg-[#d7eee4] text-[#164b4b]')}>{c.needsReview ? 'Needs review' : 'Looks good'}</span><button onClick={() => removeCandidate(i)} className="text-[11px] font-bold text-destructive" data-testid={`button-remove-candidate-${i}`}>Remove</button></div>
          <textarea value={c.question} onChange={(e) => updateCandidate(i, { question: e.target.value })} className="mt-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-candidate-question-${i}`} />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3, 4].map((oi) => <input key={oi} value={c.options[oi] || ''} onChange={(e) => { const opts = [...c.options]; opts[oi] = e.target.value; updateCandidate(i, { options: opts }); }} placeholder={`Option ${String.fromCharCode(65 + oi)}${oi === 4 ? ' (optional)' : ''}`} className="h-9 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-candidate-option-${i}-${oi}`} />)}</div>
          <div className="mt-2 flex items-center gap-2"><span className="text-[11px] font-bold text-muted-foreground">Correct:</span><select value={c.correctAnswer ?? ''} onChange={(e) => updateCandidate(i, { correctAnswer: e.target.value || null })} className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`select-candidate-answer-${i}`}><option value="">Not set</option>{c.options.map((opt, oi) => opt && <option key={oi} value={opt}>{String.fromCharCode(65 + oi)}. {opt.slice(0, 40)}</option>)}</select></div>
          <div className="mt-2 flex items-center gap-2"><span className="text-[11px] font-bold text-muted-foreground">Difficulty:</span><DifficultyPicker value={c.difficulty} onChange={(v) => updateCandidate(i, { difficulty: v })} testId={`button-candidate-difficulty-${i}`} /></div>
          <input value={c.explanation ?? ''} onChange={(e) => updateCandidate(i, { explanation: e.target.value })} placeholder="Explanation (optional)" className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-candidate-explanation-${i}`} />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input value={c.hint ?? ''} onChange={(e) => updateCandidate(i, { hint: e.target.value || null })} placeholder="Hint (optional — shown while attempting)" className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-candidate-hint-${i}`} />
            <input value={c.reference ?? ''} onChange={(e) => updateCandidate(i, { reference: e.target.value || null })} placeholder="Reference (optional)" className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-candidate-reference-${i}`} />
          </div>
          {c.options.some((o) => o.trim()) && <details className="mt-2" open={!!c.optionExplanations?.some((e) => e?.trim())}>
            <summary className="cursor-pointer text-[11px] font-bold text-primary">Per-option explanations (why each option is right/wrong)</summary>
            <div className="mt-2 space-y-1.5">{c.options.map((opt, oi) => opt.trim() && <div key={oi} className="flex items-start gap-2"><span className={cn('mt-1.5 grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold', c.correctAnswer === opt ? 'bg-[#d7eee4] text-[#287058]' : 'bg-[#fff1ed] text-[#a34c3e]')}>{String.fromCharCode(65 + oi)}</span><textarea value={c.optionExplanations?.[oi] ?? ''} onChange={(e) => { const next = [...(c.optionExplanations ?? c.options.map(() => null))]; next[oi] = e.target.value || null; updateCandidate(i, { optionExplanations: next }); }} placeholder={c.correctAnswer === opt ? 'Why this is correct...' : 'Why this is wrong...'} className="min-h-9 flex-1 rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-candidate-option-explanation-${i}-${oi}`} /></div>)}</div>
          </details>}
        </div>)}</div>
      </div>}
    </div>

    {manualOpen && <form onSubmit={(e) => {
      e.preventDefault();
      if (!targetReady) return;
      const f = new FormData(e.currentTarget);
      const options = ['a', 'b', 'c', 'd', 'e'].map((x) => String(f.get(x) || '').trim()).filter(Boolean);
      const correctLetter = String(f.get('correct') || '');
      const correctIndex = correctLetter ? correctLetter.charCodeAt(0) - 97 : -1;
      const correctAnswer = correctIndex >= 0 ? options[correctIndex] ?? null : null;
      create.mutate({ data: { question: String(f.get('question')), options, correctAnswer: correctAnswer ?? '', explanation: String(f.get('explanation')), reference: '', difficulty: String(f.get('difficulty') || 'moderate'), moduleId: Number(moduleId), subjectId: Number(subjectId), topicId: Number(topicId) } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); e.currentTarget.reset(); } });
    }} className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">{!targetReady && <p className="text-[11px] font-semibold text-[#8a5a12]">Select module/subject/topic above first.</p>}<textarea name="question" required placeholder="Write the question..." className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid="input-mcq-question" /><div className="grid gap-3 sm:grid-cols-2">{['a', 'b', 'c', 'd', 'e'].map((x) => <input key={x} name={x} required={x !== 'e'} placeholder={`Option ${x.toUpperCase()}${x === 'e' ? ' (optional)' : ''}`} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid={`input-mcq-option-${x}`} />)}</div><div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs font-bold">Correct answer<select name="correct" required className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs font-normal" data-testid="select-mcq-correct"><option value="">Select the correct option</option>{['a', 'b', 'c', 'd', 'e'].map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label><label className="flex items-center gap-2 text-xs font-bold">Difficulty<select name="difficulty" defaultValue="moderate" className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs font-normal capitalize" data-testid="select-mcq-difficulty">{['easy', 'moderate', 'hard'].map((x) => <option key={x} value={x}>{x}</option>)}</select></label></div><input name="explanation" placeholder="Explanation shown after answer" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-mcq-explanation" /><button disabled={!targetReady} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-mcq">Save as draft</button></form>}

    <div className="mt-8"><SectionHeader eyebrow="Question bank" title={`${allMcqs.length} questions`} action={<div className="flex flex-wrap items-center gap-2"><button onClick={() => setBulkAddOpen((v) => !v)} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold" data-testid="button-toggle-bulk-add">Add multiple</button><div className="flex overflow-hidden rounded-xl border border-border text-xs font-bold"><button onClick={() => setBankView('tree')} className={cn('px-3 py-2', bankView === 'tree' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-bank-view-tree">Module tree</button><button onClick={() => setBankView('flat')} className={cn('px-3 py-2', bankView === 'flat' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-bank-view-flat">Flat list</button></div></div>} /><ExplanationCoverage onSelectStatus={(status) => { setStatusFilter(status); setBankView('flat'); }} />

      {bulkAddOpen && <div className="mt-4 space-y-4 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
        <div className="flex items-center justify-between"><p className="text-xs font-bold">Add multiple MCQs at once — uses the module/subject/topic selected above.</p><button onClick={() => setBulkRows((rows) => [...rows, ...bulkAddRowsInit()])} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold" data-testid="button-add-bulk-row"><Plus size={12} /> Add row</button></div>
        {!targetReady && <p className="text-[11px] font-semibold text-[#8a5a12]">Select module/subject/topic above first.</p>}
        {targetReady && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"><Sparkles size={14} className="text-primary" /><span className="text-[11px] font-bold">Generate</span><select value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid="select-ai-mcq-count">{[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select><span className="text-[11px] font-bold">questions</span><select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value as typeof aiDifficulty)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid="select-ai-mcq-difficulty"><option value="mixed">Mixed difficulty</option><option value="easy">Easy only</option><option value="moderate">Moderate only</option><option value="hard">Hard only</option></select><span className="text-[11px] font-bold">with AI for this topic</span><div className="ml-auto flex gap-2"><button type="button" disabled={generateAiFullSet.isPending || generateAiMcqs.isPending} onClick={() => generateAiFullSet.mutate()} title={`Generates ${aiCount} easy + ${aiCount} moderate + ${aiCount} hard in one go`} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-[#eef7f1] px-3 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50" data-testid="button-generate-ai-full-set">{generateAiFullSet.isPending ? 'Generating set…' : <><Layers size={12} /> Full E/M/H set</>}</button><button type="button" disabled={generateAiMcqs.isPending || generateAiFullSet.isPending} onClick={() => generateAiMcqs.mutate()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-generate-ai-mcqs">{generateAiMcqs.isPending ? 'Generating…' : <><Sparkles size={12} /> Generate</>}</button></div></div>}
        <div className="space-y-3">{bulkRows.map((row, i) => <div key={i} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-muted-foreground">Question {i + 1}</span>{bulkRows.length > 1 && <button onClick={() => setBulkRows((rows) => rows.filter((_, ri) => ri !== i))} className="text-[11px] font-bold text-destructive" data-testid={`button-remove-bulk-row-${i}`}>Remove</button>}</div>
          <textarea value={row.question} onChange={(e) => setBulkRows((rows) => rows.map((r, ri) => ri === i ? { ...r, question: e.target.value } : r))} placeholder="Write the question..." className="mt-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-bulk-question-${i}`} />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{(['a', 'b', 'c', 'd', 'e'] as const).map((x) => <input key={x} value={row[x]} onChange={(e) => setBulkRows((rows) => rows.map((r, ri) => ri === i ? { ...r, [x]: e.target.value } : r))} placeholder={`Option ${x.toUpperCase()}${x === 'e' ? ' (optional)' : ''}`} className="h-9 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-bulk-option-${i}-${x}`} />)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[11px] font-bold text-muted-foreground">Correct:</span><select value={row.correct} onChange={(e) => setBulkRows((rows) => rows.map((r, ri) => ri === i ? { ...r, correct: e.target.value } : r))} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`select-bulk-correct-${i}`}>{['a', 'b', 'c', 'd', 'e'].map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select>
            <span className="text-[11px] font-bold text-muted-foreground">Difficulty:</span><DifficultyPicker value={row.difficulty} onChange={(v) => setBulkRows((rows) => rows.map((r, ri) => ri === i ? { ...r, difficulty: v } : r))} testId={`button-bulk-difficulty-${i}`} />
            <button type="button" onClick={() => setBulkRows((rows) => rows.map((r, ri) => ri === i ? { ...r, showOptionExplanations: !r.showOptionExplanations } : r))} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-primary" data-testid={`button-toggle-option-explanations-${i}`}><CircleHelp size={12} /> {row.showOptionExplanations ? 'Hide' : 'Add'} explanations</button>
          </div>
          {row.showOptionExplanations && <div className="mt-2 space-y-1.5 rounded-lg bg-muted/50 p-2.5">
            <p className="text-[10px] text-muted-foreground">Explain why each option is right or wrong — this is what students see when they review the question.</p>
            {(['a', 'b', 'c', 'd', 'e'] as const).map((x, oi) => row[x].trim() && <div key={x} className="flex items-start gap-2"><span className={cn('mt-1.5 grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold', row.correct === x ? 'bg-[#d7eee4] text-[#287058]' : 'bg-[#fff1ed] text-[#a34c3e]')}>{x.toUpperCase()}</span><textarea value={row[(`e${x}`) as 'ea' | 'eb' | 'ec' | 'ed' | 'ee']} onChange={(e) => setBulkRows((rows) => rows.map((r, ri) => ri === i ? { ...r, [`e${x}`]: e.target.value } : r))} placeholder={row.correct === x ? 'Why this is the correct answer...' : 'Why this option is wrong...'} className="min-h-9 flex-1 rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-bulk-option-explanation-${i}-${oi}`} /></div>)}
          </div>}
        </div>)}</div>
        <div className="flex gap-2"><button disabled={!targetReady || bulkCreateMutation.isPending} onClick={() => bulkCreateMutation.mutate()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-bulk-mcqs">{bulkCreateMutation.isPending ? 'Adding…' : `Add ${bulkRows.filter((r) => r.question.trim()).length} questions`}</button><button onClick={() => { setBulkAddOpen(false); setBulkRows(bulkAddRowsInit()); }} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-cancel-bulk-mcqs">Cancel</button></div>
      </div>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a question by text..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none" data-testid="input-search-mcqs" /></div>
        {statusFilter && <button onClick={() => setStatusFilter(null)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#eef7f1] px-3 py-2 text-[11px] font-bold text-primary" data-testid="button-clear-explanation-filter">Explanation: {statusFilter.replace('_', ' ')} <X size={12} /></button>}
        {(search.trim() || statusFilter) && <span className="text-[11px] text-muted-foreground">{mcqs.length} match{mcqs.length === 1 ? '' : 'es'}</span>}
      </div>

      {bankView === 'tree' ? <McqBankTree modules={allModules} blocks={blocks} /> : (mcqs.length ? <div className="mt-3 space-y-3">
        {/* Sticky so bulk-selecting deep into a long list (380+ questions)
            never means scrolling all the way back to the top just to reach
            the delete action. */}
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === mcqs.length} onChange={toggleSelectAll} data-testid="checkbox-select-all-mcqs" />{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</label><div className="flex gap-2">{selectedIds.size > 0 && <button onClick={() => setBulkDeleteMode('selected')} className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-bold text-destructive" data-testid="button-bulk-delete-selected"><Trash2 size={12} /> Delete selected</button>}<button onClick={() => setBulkDeleteMode('all')} className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-bold text-destructive" data-testid="button-bulk-delete-all"><Trash2 size={12} /> Delete all ({mcqs.length})</button></div></div>
        {mcqs.map((m) => <div key={m.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-mcq-${m.id}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelected(m.id)} data-testid={`checkbox-select-mcq-${m.id}`} /><Badge tone={m.status === 'published' ? 'green' : 'amber'}>{m.status}</Badge></div><div className="flex items-center gap-2"><span className="text-[10px] text-muted-foreground">{m.difficulty}</span><button onClick={() => setDeletingMcqId(m.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-mcq-${m.id}`}><Trash2 size={14} /></button></div></div><p className="mt-4 text-sm font-bold leading-6">{m.question}</p><div className="mt-3 text-xs text-muted-foreground">{moduleName(m.moduleId)} · {subjectName(m.subjectId)} · {topicName(m.topicId)}</div><McqExplanationRow mcq={m} /></div>)}</div> : <EmptyState icon={CircleHelp} title={search.trim() || statusFilter ? 'No questions match' : 'Your question bank is quiet'} body={search.trim() || statusFilter ? 'Try a different search term or clear the explanation filter above.' : 'Upload a file above to bulk-import questions in seconds.'} />)}
      {deletingMcqId !== null && <ConfirmDialog title="Delete this question?" body="It will be removed from the bank and from any draft exams using it." onCancel={() => setDeletingMcqId(null)} onConfirm={() => removeMcq.mutate(deletingMcqId)} pending={removeMcq.isPending} />}
      {bulkDeleteMode === 'selected' && <ConfirmDialog title={`Delete ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'}?`} body="They'll be removed from the bank and from any draft exams using them." confirmLabel="Delete selected" onCancel={() => setBulkDeleteMode(null)} onConfirm={() => bulkDelete.mutate(Array.from(selectedIds))} pending={bulkDelete.isPending} />}
      {bulkDeleteMode === 'all' && <ConfirmDialog title={`Delete all ${mcqs.length} questions in this view?`} body="This removes every question currently loaded in the flat list (matching your search/filter, if any). There is no undo." confirmLabel={`Delete all ${mcqs.length}`} onCancel={() => setBulkDeleteMode(null)} onConfirm={() => bulkDelete.mutate(mcqs.map((m) => m.id))} pending={bulkDelete.isPending} />}
      </div>
  </div>;
}

function AdminAccountSection() {
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
function AdminImageUpload({ currentUrl, kind, accept, hint, testId, onUploaded }: { currentUrl: string; kind: 'favicon' | 'resource'; accept: string; hint: string; testId: string; onUploaded: (storagePath: string, previewUrl: string | null) => void }) {
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
function FaviconUploader({ currentUrl, onUploaded }: { currentUrl: string; onUploaded: (storagePath: string, previewUrl: string | null) => void }) {
  return <AdminImageUpload currentUrl={currentUrl} kind="favicon" accept="image/png,image/x-icon,image/svg+xml,image/webp" hint="PNG, ICO, SVG, or WEBP · square, under 1MB. Shows in the browser tab for both the student and admin sites." testId="input-favicon-upload" onUploaded={onUploaded} />;
}

function AdminSettings() {
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? settingsQuery.data ?? {};
  const save = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => { setForm(null); queryClient.setQueryData(['admin-settings'], data); queryClient.invalidateQueries({ queryKey: ['site-content'] }); },
    onError: (err: unknown) => toast({ title: 'Could not save settings', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const rotate = useMutation({ mutationFn: settingsApi.rotateAdminCode, onSuccess: (data) => setForm({ ...values, ...data }) });
  const testStorage = useMutation({
    mutationFn: settingsApi.testStorage,
    onError: (err: unknown) => toast({ title: 'Could not run the test', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const set = (key: string, value: string) => setForm({ ...values, [key]: value });
  const [tab, setTab] = useState<'general' | 'branding' | 'ai' | 'storage' | 'security' | 'notifications'>('general');
  const storageIssue = values.CLOUDINARY_CONFIGURED !== 'true';

  const TABS: Array<{ id: typeof tab; label: string; icon: typeof Sparkles; badge?: boolean }> = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'branding', label: 'Branding', icon: ImageOff },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'storage', label: 'Storage', icon: UploadCloud, badge: storageIssue },
    { id: 'security', label: 'Security & access', icon: ShieldCheck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return <div className="max-w-3xl"><SectionHeader eyebrow="Workspace" title="Platform settings" action={<span className="text-[10px] text-muted-foreground">Changes apply to every student instantly</span>} />
    <div className="mb-5 flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5">{TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={cn('relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors', tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} data-testid={`tab-settings-${t.id}`}><t.icon size={13} /> {t.label}{t.badge && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#e5a952]" />}</button>)}</div>

    <div className="space-y-4">
      {tab === 'general' && <>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Platform profile</h3><p className="mt-1 text-xs text-muted-foreground">The details students see across their study desk.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold">Platform name<input value={values.PLATFORM_NAME || ''} onChange={(e) => set('PLATFORM_NAME', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-platform-name" /></label>
          <label className="text-xs font-bold">Support email<input value={values.SUPPORT_EMAIL || ''} onChange={(e) => set('SUPPORT_EMAIL', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-support-email" /></label>
          <label className="text-xs font-bold">WhatsApp support number<input value={values.SUPPORT_WHATSAPP || ''} onChange={(e) => set('SUPPORT_WHATSAPP', e.target.value.replace(/[^\d+]/g, ''))} placeholder="e.g. 923001234567" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-support-whatsapp" /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Country code + number, digits only. Students get a "Chat on WhatsApp" button that opens this number.</span></label>
          <label className="text-xs font-bold sm:col-span-2">Tagline<input value={values.PLATFORM_TAGLINE || ''} onChange={(e) => set('PLATFORM_TAGLINE', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-platform-tagline" /></label>
          <label className="text-xs font-bold sm:col-span-2">Announcement banner (blank to hide)<input value={values.ANNOUNCEMENT_BANNER || ''} onChange={(e) => set('ANNOUNCEMENT_BANNER', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-announcement-banner" /></label>
        </div></div>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Registration</h3><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between text-xs font-bold">Open student registration<input type="checkbox" checked={values.REGISTRATION_ENABLED !== 'false'} onChange={(e) => set('REGISTRATION_ENABLED', e.target.checked ? 'true' : 'false')} className="size-4 accent-[#287058]" data-testid="checkbox-registration-enabled" /></label>
        </div><p className="mt-3 text-[11px] text-muted-foreground">Payment methods, bank accounts, and collection details have moved to <Link href="/admin/payments" className="font-bold text-primary">Payments &amp; collection</Link>.</p></div>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">AI Visualizer</h3><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between text-xs font-bold">Show in student sidebar<input type="checkbox" checked={values.AI_VISUALIZER_ENABLED !== 'false'} onChange={(e) => set('AI_VISUALIZER_ENABLED', e.target.checked ? 'true' : 'false')} className="size-4 accent-[#287058]" data-testid="checkbox-ai-visualizer-enabled" /></label>
        </div><p className="mt-3 text-[11px] text-muted-foreground">Off removes the "AI Visualizer" link from every student's sidebar and blocks the page directly; on brings it right back — no need to save anything else.</p></div>
      </>}

      {tab === 'branding' && <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Website favicon</h3><p className="mt-1 text-xs text-muted-foreground">The small icon shown in browser tabs and bookmarks.</p><div className="mt-5">
        <FaviconUploader currentUrl={values.SITE_FAVICON_URL || ''} onUploaded={(storagePath) => set('SITE_FAVICON_PATH', storagePath)} />
      </div></div>}

      {tab === 'ai' && <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">AI ("Ask AI to explain")</h3><p className="mt-1 text-xs text-muted-foreground">Powers the "Ask AI to explain differently" button students see on MCQs and flashcards, plus admin-side AI-generated questions, explanations, and flashcard drafts. Falls back to the server's ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY env vars if left blank here.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold">Provider<select value={values.AI_PROVIDER || 'anthropic'} onChange={(e) => set('AI_PROVIDER', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-ai-provider"><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="custom">Custom (OpenAI-compatible)</option></select></label>
        <label className="text-xs font-bold">API key{values.AI_API_KEY_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.AI_API_KEY_MASKED}</span>}<input type="password" value={values.AI_API_KEY || ''} onChange={(e) => set('AI_API_KEY', e.target.value)} placeholder={values.AI_API_KEY_SET === 'true' ? 'Leave blank to keep current key' : 'sk-...'} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-api-key" /></label>
        <label className="text-xs font-bold">Model <span className="font-normal text-muted-foreground">(optional — leave blank for the provider's default)</span><input value={values.AI_MODEL || ''} onChange={(e) => set('AI_MODEL', e.target.value)} placeholder="e.g. claude-sonnet-4-6, gpt-4o-mini, gemini-2.0-flash" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-model" /></label>
        {values.AI_PROVIDER === 'custom' && <label className="text-xs font-bold">Base URL <span className="font-normal text-muted-foreground">(required for Custom — an OpenAI-compatible /chat/completions endpoint)</span><input value={values.AI_BASE_URL || ''} onChange={(e) => set('AI_BASE_URL', e.target.value)} placeholder="https://api.example.com/v1" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-base-url" /></label>}
      </div>
      <div className="mt-6 border-t border-border pt-5">
        <label className="flex items-start gap-2.5 text-xs font-bold"><input type="checkbox" checked={values.AI_AUTO_EXPLAIN_ON_IMPORT === 'true'} onChange={(e) => set('AI_AUTO_EXPLAIN_ON_IMPORT', e.target.checked ? 'true' : 'false')} className="mt-0.5 size-4 accent-[#287058]" data-testid="checkbox-ai-auto-explain-import" /><span>Auto-generate explanations &amp; hints on MCQ import<span className="mt-1 block font-normal text-muted-foreground">Uses the same provider/API key above. Every imported question that doesn't already have an explanation gets one queued automatically (across every module/subject and exam/past-paper import), landing as "AI generated — awaiting review," never auto-approved. Runs in the background — a large import won't wait on it.</span></span></label>
        {values.AI_AUTO_EXPLAIN_ON_IMPORT === 'true' && <label className="mt-4 block text-xs font-bold">Bulk-generation model <span className="font-normal text-muted-foreground">(optional override — e.g. a cheaper/faster model for high-volume auto-explain; leave blank to use the Model field above)</span><input value={values.AI_AUTO_EXPLAIN_MODEL || ''} onChange={(e) => set('AI_AUTO_EXPLAIN_MODEL', e.target.value)} placeholder="e.g. claude-haiku-4-5, gpt-4o-mini" className="mt-2 h-10 w-full max-w-sm rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-auto-explain-model" /></label>}
      </div>
      </div>}

      {tab === 'storage' && <>
        {storageIssue && <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-5 text-xs text-[#9e4c39]" data-testid="banner-storage-warning"><div className="flex items-center gap-2 font-bold"><CircleHelp size={15} /> No file storage is configured</div><p className="mt-1.5 leading-5 text-[#a96a5b]">Every upload (favicon, payment QR code, payment proofs, team photos, MCQ images, books, resources) goes through Cloudinary — there's no fallback, so uploads will fail until it's configured below.</p></div>}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">The green "Saved" badge below only means credentials were entered — it doesn't confirm the connection actually works. Save your settings first, then test.</p>
          <button type="button" onClick={() => testStorage.mutate()} disabled={testStorage.isPending} className="ml-4 shrink-0 rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold disabled:opacity-50" data-testid="button-test-storage">{testStorage.isPending ? 'Testing…' : 'Test connection'}</button>
        </div>
        <p className="text-[11px] text-muted-foreground">Supabase is used for this platform's database only — file storage runs on Cloudinary.</p>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="flex items-center gap-2 font-bold">Cloudinary {values.CLOUDINARY_CONFIGURED === 'true' && <Badge tone="green">Saved</Badge>}
            {testStorage.data && (testStorage.data.cloudinary.ok
              ? <Badge tone="green">Connected</Badge>
              : <Badge tone="red">Not working</Badge>)}
          </h3><p className="mt-1 text-xs text-muted-foreground">Used for large files — book PDFs, resource files, and anything over ~5MB regardless of type.</p>
          {testStorage.data && !testStorage.data.cloudinary.ok && <p className="mt-2 rounded-xl bg-[#fff5f0] p-3 text-[11px] text-[#9e4c39]" data-testid="text-cloudinary-test-error">{testStorage.data.cloudinary.error}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">Cloud name<input value={values.CLOUDINARY_CLOUD_NAME || ''} onChange={(e) => set('CLOUDINARY_CLOUD_NAME', e.target.value)} placeholder="my-cloud-name" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-cloud-name" /></label>
            <label className="text-xs font-bold">API key<input value={values.CLOUDINARY_API_KEY || ''} onChange={(e) => set('CLOUDINARY_API_KEY', e.target.value)} placeholder="123456789012345" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-api-key" /></label>
            <label className="text-xs font-bold sm:col-span-2">API secret{values.CLOUDINARY_API_SECRET_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.CLOUDINARY_API_SECRET_MASKED}</span>}<input type="password" value={values.CLOUDINARY_API_SECRET || ''} onChange={(e) => set('CLOUDINARY_API_SECRET', e.target.value)} placeholder={values.CLOUDINARY_API_SECRET_SET === 'true' ? 'Leave blank to keep current key' : 'abc123...'} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-api-secret" /></label>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Save settings below, then re-upload anything affected by a past storage issue — old files aren't retroactively moved.</p>
      </>}

      {tab === 'security' && <div className="rounded-2xl border border-primary/30 bg-[#eef7f1] p-6"><h3 className="font-bold">Admin sign-up invite code</h3><p className="mt-1 text-xs text-muted-foreground">Share this code with anyone who should be able to create an admin account at <code className="rounded bg-card px-1 py-0.5">/admin-signup/1</code>. Rotate it any time to revoke access for anyone who has the old code.</p><div className="mt-4 flex flex-wrap items-center gap-3"><input value={values.ADMIN_SIGNUP_CODE || ''} onChange={(e) => set('ADMIN_SIGNUP_CODE', e.target.value)} className="h-10 w-56 rounded-xl border border-border bg-card px-3 text-xs font-mono-app tracking-wider" data-testid="input-admin-signup-code" /><button type="button" onClick={() => rotate.mutate()} disabled={rotate.isPending} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-rotate-admin-code">{rotate.isPending ? 'Rotating…' : 'Generate new code'}</button></div>
        {values.ADMIN_SIGNUP_CODE && <div className="mt-3 flex flex-wrap items-center gap-2"><input readOnly value={`${window.location.origin}/admin-signup/1?code=${encodeURIComponent(values.ADMIN_SIGNUP_CODE)}`} className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[11px] text-muted-foreground" data-testid="input-admin-invite-link" onFocus={(e) => e.currentTarget.select()} /><button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/admin-signup/1?code=${encodeURIComponent(values.ADMIN_SIGNUP_CODE || '')}`); toast({ title: 'Invite link copied' }); }} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground" data-testid="button-copy-admin-invite-link"><Copy size={12} /> Copy link</button></div>}
      </div>}

      {tab === 'notifications' && <NotificationBroadcastPanel />}
    </div>

    {tab !== 'notifications' && <button onClick={() => save.mutate(values)} disabled={save.isPending} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-settings">{save.isPending ? 'Saving…' : save.isSuccess && !form ? 'Settings saved' : 'Save settings'}</button>}
    <AdminAccountSection />
  </div>;
}

// Send a one-off notification to students, optionally narrowed to a
// program (MBBS/BDS) and/or academic year — a separate "Send" action
// rather than a settings field, since it fires immediately instead of
// being saved for later like the rest of this page.
function NotificationBroadcastPanel() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'warning'>('info');
  const [programTargetKind, setProgramTargetKind] = useState('');
  const [yearTargetNumber, setYearTargetNumber] = useState('');

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
      toast({ title: 'Notification sent', description: res.targetedUsers === null ? 'Delivered to every student.' : `Delivered to ${res.targetedUsers} matching student${res.targetedUsers === 1 ? '' : 's'}.` });
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
  </div>;
}

function AdminInstitutionsList({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const institutions = useQuery({ queryKey: ['admin-institutions'], queryFn: () => academicApi.institutions() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-institutions'] });
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingPermanentId, setDeletingPermanentId] = useState<number | null>(null);

  const createInstitution = useMutation({ mutationFn: academicApi.createInstitution, onSuccess: invalidate, onError: (err: unknown) => toast({ title: 'Could not create institution', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const renameInstitution = useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => academicApi.updateInstitution(id, { name }), onSuccess: () => { invalidate(); setRenamingId(null); }, onError: (err: unknown) => toast({ title: 'Could not rename institution', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const toggleInstitution = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => academicApi.updateInstitution(id, { active }), onSuccess: invalidate });
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
  // swap, with no backend migration needed.
  const reorder = useMutation({
    mutationFn: (rows: { id: number; displayOrder: number }[]) =>
      Promise.all(rows.map((r) => academicApi.updateInstitution(r.id, { displayOrder: r.displayOrder }))),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not reorder institutions', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const orderedInstitutions = [...(institutions.data || [])].sort((x, y) => x.displayOrder - y.displayOrder || x.name.localeCompare(y.name));
  const moveInstitution = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= orderedInstitutions.length || reorder.isPending) return;
    const reordered = [...orderedInstitutions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorder.mutate(reordered.map((inst, i) => ({ id: inst.id, displayOrder: i })));
  };

  return <div className="rounded-2xl border border-border bg-card p-5">
    <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Institutions</h4>
    <p className="mt-1 text-[11px] text-muted-foreground">Just the list of colleges students can register under — use the arrows to arrange them in your own order. Manage their programmes, years, and batches below.</p>
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
          <button type="button" onClick={() => { setRenamingId(i.id); setRenameValue(i.name); }} className="text-[10px] font-bold text-primary" data-testid={`button-rename-institution-${i.id}`}>Rename</button>
          <button type="button" onClick={() => toggleInstitution.mutate({ id: i.id, active: !i.active })} className="text-[10px] font-bold text-primary" data-testid={`button-toggle-institution-${i.id}`}>{i.active ? 'Archive' : 'Activate'}</button>
          {/* No longer gated behind "archived first" — the backend already
              safely refuses (with a clear error) if programs/students are
              still attached, so there's no need to force admins through
              Archive before they can even attempt a permanent delete. */}
          <button type="button" onClick={() => setDeletingPermanentId(i.id)} className="text-[10px] font-bold text-destructive" data-testid={`button-delete-permanent-institution-${i.id}`}>Delete permanently</button>
        </div>}
      </div>)}
      {!institutions.data?.length && <p className="text-xs text-muted-foreground">No institutions yet — add one below.</p>}
    </div>
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { createInstitution.mutate({ name: name.trim(), active: true }); setName(''); } }} className="mt-3 flex gap-1.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add institution, e.g. King Edward Medical University" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-add-institution" />
      <button className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" data-testid="button-add-institution"><Plus size={13} /></button>
    </form>
    {deletingPermanentId !== null && <ConfirmDialog title="Delete this institution permanently?" body="This erases it for good — there is no undo. Blocked automatically if it still has programmes or students assigned to it." confirmLabel="Delete forever" onCancel={() => setDeletingPermanentId(null)} onConfirm={() => removePermanent.mutate(deletingPermanentId)} pending={removePermanent.isPending} />}
  </div>;
}

function AdminAcademicStructure() {
  const [institutionId, setInstitutionId] = useState<number | null>(null);
  const [programId, setProgramId] = useState<number | null>(null);
  const [academicYearId, setAcademicYearId] = useState<number | null>(null);

  const institutions = useQuery({ queryKey: ['admin-institutions'], queryFn: () => academicApi.institutions() });
  const programs = useQuery({ queryKey: ['admin-programs', institutionId], queryFn: () => academicApi.programs(institutionId!), enabled: !!institutionId });
  const academicYears = useQuery({ queryKey: ['admin-academic-years', programId], queryFn: () => academicApi.academicYears(programId!), enabled: !!programId });
  const batches = useQuery({ queryKey: ['admin-batches', academicYearId], queryFn: () => academicApi.batches(academicYearId!), enabled: !!academicYearId });

  const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: [key] });
  const createProgram = useMutation({ mutationFn: academicApi.createProgram, onSuccess: () => invalidate('admin-programs'), onError: (err: unknown) => toast({ title: 'Could not create program', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const toggleProgram = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => academicApi.updateProgram(id, { active }), onSuccess: () => invalidate('admin-programs') });
  const createYear = useMutation({ mutationFn: academicApi.createAcademicYear, onSuccess: () => invalidate('admin-academic-years'), onError: (err: unknown) => toast({ title: 'Could not create academic year', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const toggleYear = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => academicApi.updateAcademicYear(id, { active }), onSuccess: () => invalidate('admin-academic-years') });
  const createBatch = useMutation({ mutationFn: academicApi.createBatch, onSuccess: () => invalidate('admin-batches'), onError: (err: unknown) => toast({ title: 'Could not create batch', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const toggleBatch = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => academicApi.updateBatch(id, { active }), onSuccess: () => invalidate('admin-batches') });

  const updateProgramKind = useMutation({ mutationFn: ({ id, kind }: { id: number; kind: string }) => academicApi.updateProgram(id, { kind }), onSuccess: () => invalidate('admin-programs') });
  const updateYearNumber = useMutation({ mutationFn: ({ id, yearNumber }: { id: number; yearNumber: number | null }) => academicApi.updateAcademicYear(id, { yearNumber }), onSuccess: () => invalidate('admin-academic-years') });

  const Column = <T extends { id: number; active: boolean }>({ title, items, label, selectedId, onSelect, onCreate, onToggle, disabled }: { title: string; items: T[]; label: (item: T) => string; selectedId: number | null; onSelect?: (id: number) => void; onCreate: (name: string) => void; onToggle: (item: T) => void; disabled?: boolean }) => {
    const [value, setValue] = useState('');
    return <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4"><h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{title}</h4>{disabled ? <p className="mt-4 text-xs text-muted-foreground">Select the item to the left first.</p> : <><div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">{items.map((item) => <div key={item.id} onClick={() => onSelect?.(item.id)} className={cn('flex items-center justify-between rounded-lg px-2.5 py-2 text-xs', onSelect && 'cursor-pointer hover:bg-muted', selectedId === item.id && 'bg-[#eef7f1] font-bold')} data-testid={`row-${title.toLowerCase()}-${item.id}`}><span className={cn(!item.active && 'text-muted-foreground line-through')}>{label(item)}</span><button type="button" onClick={(e) => { e.stopPropagation(); onToggle(item); }} className="text-[10px] font-bold text-primary" data-testid={`button-toggle-${title.toLowerCase()}-${item.id}`}>{item.active ? 'Archive' : 'Activate'}</button></div>)}{!items.length && <p className="text-xs text-muted-foreground">Nothing here yet.</p>}</div><form onSubmit={(e) => { e.preventDefault(); if (value.trim()) { onCreate(value.trim()); setValue(''); } }} className="mt-3 flex gap-1.5"><input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add new…" className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-add-${title.toLowerCase()}`} /><button className="rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground" data-testid={`button-add-${title.toLowerCase()}`}><Plus size={13} /></button></form></>}</div>;
  };

  function ProgramsColumn() {
    const [name, setName] = useState('');
    const [kind, setKind] = useState('MBBS');
    if (!institutionId) return <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4"><h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Programmes</h4><p className="mt-4 text-xs text-muted-foreground">Select an institution first.</p></div>;
    return <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4"><h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Programmes</h4>
      <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">{(programs.data || []).map((p) => <div key={p.id} onClick={() => { setProgramId(p.id); setAcademicYearId(null); }} className={cn('flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs', 'cursor-pointer hover:bg-muted', programId === p.id && 'bg-[#eef7f1] font-bold')} data-testid={`row-programmes-${p.id}`}>
        <span className={cn('flex-1', !p.active && 'text-muted-foreground line-through')}>{p.name}</span>
        <select value={p.kind || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateProgramKind.mutate({ id: p.id, kind: e.target.value })} className="h-6 rounded border border-border bg-background px-1 text-[10px]" data-testid={`select-program-kind-${p.id}`}><option value="">Kind: none</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option><option value="OTHER">Other</option></select>
        <button type="button" onClick={(e) => { e.stopPropagation(); toggleProgram.mutate({ id: p.id, active: !p.active }); }} className="text-[10px] font-bold text-primary" data-testid={`button-toggle-programmes-${p.id}`}>{p.active ? 'Archive' : 'Activate'}</button>
      </div>)}{!programs.data?.length && <p className="text-xs text-muted-foreground">Nothing here yet.</p>}</div>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { createProgram.mutate({ institutionId, name: name.trim(), kind, active: true }); setName(''); } }} className="mt-3 flex gap-1.5"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add new…" className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid="input-add-programmes" /><select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-1 text-[10px]" data-testid="select-new-program-kind"><option value="MBBS">MBBS</option><option value="BDS">BDS</option><option value="OTHER">Other</option></select><button className="rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground" data-testid="button-add-programmes"><Plus size={13} /></button></form>
    </div>;
  }

  function AcademicYearsColumn() {
    const [label, setLabel] = useState('');
    const [yearNum, setYearNum] = useState('1');
    if (!programId) return <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4"><h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Academic years</h4><p className="mt-4 text-xs text-muted-foreground">Select a programme first.</p></div>;
    return <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4"><h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Academic years</h4>
      <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">{(academicYears.data || []).map((y) => <div key={y.id} onClick={() => setAcademicYearId(y.id)} className={cn('flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs', 'cursor-pointer hover:bg-muted', academicYearId === y.id && 'bg-[#eef7f1] font-bold')} data-testid={`row-academic-years-${y.id}`}>
        <span className={cn('flex-1', !y.active && 'text-muted-foreground line-through')}>{y.label}</span>
        <select value={y.yearNumber ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateYearNumber.mutate({ id: y.id, yearNumber: e.target.value ? Number(e.target.value) : null })} className="h-6 rounded border border-border bg-background px-1 text-[10px]" data-testid={`select-year-number-${y.id}`}><option value="">Year #: none</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Year {n}</option>)}</select>
        <button type="button" onClick={(e) => { e.stopPropagation(); toggleYear.mutate({ id: y.id, active: !y.active }); }} className="text-[10px] font-bold text-primary" data-testid={`button-toggle-academic-years-${y.id}`}>{y.active ? 'Archive' : 'Activate'}</button>
      </div>)}{!academicYears.data?.length && <p className="text-xs text-muted-foreground">Nothing here yet.</p>}</div>
      <form onSubmit={(e) => { e.preventDefault(); if (label.trim()) { createYear.mutate({ programId, label: label.trim(), yearNumber: Number(yearNum), active: true }); setLabel(''); } }} className="mt-3 flex gap-1.5"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add new…" className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid="input-add-academic-years" /><select value={yearNum} onChange={(e) => setYearNum(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-1 text-[10px]" data-testid="select-new-year-number">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Year {n}</option>)}</select><button className="rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground" data-testid="button-add-academic-years"><Plus size={13} /></button></form>
    </div>;
  }

  return <div>
    <SectionHeader eyebrow="Registration structure" title="Institutions, programmes, years & batches" action={<span className="text-[10px] text-muted-foreground">These options power the student registration form</span>} />
    <AdminInstitutionsList selectedId={institutionId} onSelect={(id) => { setInstitutionId(id); setProgramId(null); setAcademicYearId(null); }} />
    <div className="mt-6">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Programmes, years & batches</h4>
      {!institutionId ? <p className="mt-3 text-xs text-muted-foreground">Select an institution above to manage its programmes.</p> : <>
        <div className="mt-1 mb-3 text-xs text-muted-foreground">For <span className="font-bold text-foreground">{institutions.data?.find((i) => i.id === institutionId)?.name}</span></div>
        <div className="flex flex-col gap-4 md:flex-row">
          <ProgramsColumn />
          <AcademicYearsColumn />
          <Column title="Batches" items={batches.data || []} label={(b: Batch) => b.label} selectedId={null} onCreate={(label) => academicYearId && createBatch.mutate({ academicYearId, label, active: true })} onToggle={(b: Batch) => toggleBatch.mutate({ id: b.id, active: !b.active })} disabled={!academicYearId} />
        </div>
      </>}
    </div>
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

function AuthLayout({ children }: { children: ReactNode }) { return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]"><div className="flex flex-col p-6 md:p-10"><Logo /><div className="mx-auto flex w-full max-w-sm flex-1 items-center py-10">{children}</div><Footer /></div><div className="relative hidden overflow-hidden bg-sidebar p-14 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-20 top-20 size-96 rounded-full border-[44px] border-sidebar-accent/50" /><div className="absolute bottom-10 left-10 size-48 rounded-full border-[20px] border-sidebar-primary/25" /><div className="relative"><div className="font-mono-app text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/70">Command center</div><h2 className="mt-8 max-w-lg font-display text-6xl leading-[.93] tracking-[-.04em]">Run the<br /><em className="text-sidebar-primary not-italic">whole desk.</em></h2></div><div className="relative max-w-sm"><div className="mb-4 h-px bg-sidebar-border" /><p className="text-sm leading-6 text-sidebar-foreground/80">Students, payments, curriculum, and exams — everything the academic team manages, in one dashboard.</p><div className="mt-5 flex items-center gap-2 text-xs font-bold"><span className="grid size-7 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><ShieldCheck size={14} /></span> Restricted to invited admin accounts</div></div></div></div>; }
function Login() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => { queryClient.invalidateQueries(); setLocation(res.user.role === 'admin' ? '/admin' : '/'); },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.'),
  });
  return <AuthLayout><div className="w-full"><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Welcome back</div><h1 className="mt-3 font-display text-4xl tracking-[-.04em]">Sign in to the admin desk.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">For the academic team only.</p><form onSubmit={(e) => { e.preventDefault(); setError(null); const f = new FormData(e.currentTarget); login.mutate({ email: String(f.get('email')), password: String(f.get('password')) }); }} className="mt-8 space-y-4">
    <label className="block text-xs font-bold">Email<div className="relative mt-2"><Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="email" type="email" autoComplete="email" placeholder="you@college.edu" className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-login-email" /></div></label>
    <label className="block text-xs font-bold">Password<div className="relative mt-2"><LockKeyhole size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="At least 8 characters" className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-11 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-login-password" /><button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground" data-testid="button-toggle-login-password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
    <div className="flex justify-end"><Link href="/forgot-password" className="text-xs font-bold text-primary hover:underline" data-testid="button-forgot-password">Forgot password?</Link></div>
    {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-login-error">{error}</div>}
    <button disabled={login.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm" data-testid="button-login-submit">{login.isPending && <Loader2 size={14} className="animate-spin" />}{login.isPending ? 'Signing in…' : 'Sign in'}</button>
  </form><p className="mt-7 text-center text-xs text-muted-foreground">Admin accounts are invite-only.</p></div></AuthLayout>;
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

function AdminSignup() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const codeFromUrl = new URLSearchParams(search).get('code') || '';
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const register = useMutation({
    mutationFn: authApi.adminRegister,
    onSuccess: () => { queryClient.invalidateQueries(); setLocation('/admin'); },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.'),
  });
  return <AuthLayout><div className="w-full"><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Restricted</div><h1 className="mt-3 font-display text-4xl tracking-[-.04em]">Create an admin account.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">You'll need the invite code from an existing admin (Admin → Platform settings).</p><form onSubmit={(e) => { e.preventDefault(); setError(null); const f = new FormData(e.currentTarget); register.mutate({ name: String(f.get('name')), email: String(f.get('email')), password: String(f.get('password')), inviteCode: String(f.get('inviteCode')) }); }} className="mt-7 space-y-3">
    <label className="block text-xs font-bold">Full name<div className="relative mt-2"><UserIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="name" className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-name" /></div></label>
    <label className="block text-xs font-bold">Email<div className="relative mt-2"><Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required type="email" name="email" className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-email" /></div></label>
    <label className="block text-xs font-bold">Password<div className="relative mt-2"><LockKeyhole size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required minLength={10} type={showPassword ? 'text' : 'password'} name="password" className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-11 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-password" /><button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground" data-testid="button-toggle-admin-signup-password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
    <label className="block text-xs font-bold">Invite code<div className="relative mt-2"><ShieldCheck size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="inviteCode" defaultValue={codeFromUrl} className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm font-mono-app tracking-wider outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-code" /></div></label>
    {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-admin-signup-error">{error}</div>}
    <button disabled={register.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm" data-testid="button-admin-signup-submit">{register.isPending && <Loader2 size={14} className="animate-spin" />}{register.isPending ? 'Creating account…' : 'Create admin account'}</button>
  </form></div></AuthLayout>;
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

// ── Payments & collection: shared types for the JSON-array settings ──
type PaymentSettingsValues = Record<string, string>;
type SetSetting = (key: string, value: string) => void;

function parseBankAccounts(values: PaymentSettingsValues): BankAccount[] {
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

const DEFAULT_METHODS: PaymentMethodConfig[] = [
  { key: 'bank_transfer', label: 'Bank Transfer', type: 'bank', enabled: true, instructions: '' },
  { key: 'raast', label: 'Raast', type: 'wallet', enabled: false, instructions: '' },
  { key: 'jazzcash', label: 'JazzCash', type: 'wallet', enabled: false, instructions: '' },
  { key: 'easypaisa', label: 'EasyPaisa', type: 'wallet', enabled: false, instructions: '' },
  { key: 'cash', label: 'Cash / In person', type: 'cash', enabled: false, instructions: '' },
];

function parseMethods(values: PaymentSettingsValues): PaymentMethodConfig[] {
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
function CollectionDetailsTab({ values, set }: { values: PaymentSettingsValues; set: SetSetting }) {
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
function BankAccountsTab({ values, set }: { values: PaymentSettingsValues; set: SetSetting }) {
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
function PaymentMethodsTab({ values, set }: { values: PaymentSettingsValues; set: SetSetting }) {
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
function PaymentStatsTab() {
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

const PAYMENT_TABS = ['Collection Details', 'Bank Accounts', 'Payment Methods', 'Proof Review', 'Stats'] as const;

function AdminPaymentsHub({ initialTab }: { initialTab?: (typeof PAYMENT_TABS)[number] }) {
  const [tab, setTab] = useState<(typeof PAYMENT_TABS)[number]>(initialTab || 'Proof Review');
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? settingsQuery.data ?? {};
  const save = useMutation({ mutationFn: settingsApi.update, onSuccess: (data) => { setForm(null); queryClient.setQueryData(['admin-settings'], data); } });
  const set: SetSetting = (key, value) => setForm({ ...values, [key]: value });
  const dirty = form !== null;

  return <div><SectionHeader eyebrow="Membership operations" title="Payments & collection" action={dirty ? <button onClick={() => save.mutate(values)} disabled={save.isPending} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-payment-settings">{save.isPending ? 'Saving…' : 'Save changes'}</button> : <span className="text-[10px] text-muted-foreground">Shown to students at sign-up &amp; renewal</span>} />
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">{PAYMENT_TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn('whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition-colors', tab === t ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-foreground')} data-testid={`button-payments-tab-${t.toLowerCase().replaceAll(' ', '-')}`}>{t}</button>)}</div>
    {tab === 'Collection Details' && <CollectionDetailsTab values={values} set={set} />}
    {tab === 'Bank Accounts' && <BankAccountsTab values={values} set={set} />}
    {tab === 'Payment Methods' && <PaymentMethodsTab values={values} set={set} />}
    {tab === 'Proof Review' && <PaymentProofsTab />}
    {tab === 'Stats' && <PaymentStatsTab />}
  </div>;
}

function AdminPastPapers() {
  const papers = useQuery({ queryKey: ['admin-past-papers'], queryFn: () => pastPapersApi.list() });
  const create = useMutation({ mutationFn: pastPapersApi.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }) });
  const toggle = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => pastPapersApi.update(id, { active }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }) });
  const removePermanent = useMutation({ mutationFn: pastPapersApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete paper', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const [open, setOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formProgramId, setFormProgramId] = useState('');
  const programsQ = useQuery({ queryKey: ['admin-programs-flat'], queryFn: () => academicApi.programs(undefined, true) });
  const academicYearsQ = useQuery({ queryKey: ['admin-academic-years-flat', formProgramId], queryFn: () => academicApi.academicYears(formProgramId ? Number(formProgramId) : undefined, true) });

  return <div><SectionHeader eyebrow="Content" title="Past papers" action={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-create-paper"><Plus size={15} /> Add paper</button>} />
    {open && <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const programId = f.get('programId') ? Number(f.get('programId')) : undefined; const academicYearId = f.get('academicYearId') ? Number(f.get('academicYearId')) : undefined; create.mutate({ title: String(f.get('title')), examBoard: String(f.get('examBoard') || ''), year: String(f.get('year') || ''), level: String(f.get('level') || ''), programId, academicYearId, active: true }, { onSuccess: () => { setOpen(false); setFormProgramId(''); } }); }} className="mb-5 grid gap-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5 md:grid-cols-4"><input required name="title" placeholder="Paper title, e.g. KMU 2024 G" className="h-10 rounded-xl border border-border bg-card px-3 text-xs md:col-span-2" data-testid="input-paper-title" /><input name="examBoard" placeholder="Exam board" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-paper-board" /><input name="year" placeholder="Year" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-paper-year" />
      <select name="programId" value={formProgramId} onChange={(e) => setFormProgramId(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-paper-program"><option value="">All programs</option>{(programsQ.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select name="academicYearId" disabled={!formProgramId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-paper-academic-year"><option value="">All years</option>{(academicYearsQ.data || []).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
      {/* This dropdown only lists MBBS/BDS-type Programs that have actually
          been added under an institution in Colleges & courses — it isn't
          pre-seeded with MBBS/BDS, since a Program has to belong to a
          specific institution. Both selects here are optional targeting
          (narrows which students see the paper); the free-text Level field
          below already covers just labeling a paper "3rd Year MBBS"
          without needing this set up at all. */}
      {!programsQ.isLoading && !programsQ.data?.length && <p className="text-[11px] font-semibold text-[#8a5a12] md:col-span-4">No programs set up yet, so this list is empty — that's expected, not a bug. Add one (e.g. "MBBS") under <Link href="/admin/academic-structure" className="underline">Colleges &amp; courses</Link> if you want to target papers by program/year, or just use the Level field below instead.</p>}
      <input name="level" placeholder="Level label, e.g. 3rd Year MBBS (display only)" className="h-10 rounded-xl border border-border bg-card px-3 text-xs md:col-span-2" data-testid="input-paper-level" /><div className="flex gap-2"><button className="rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground" data-testid="button-save-paper">Save</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border bg-card px-4 text-xs font-bold" data-testid="button-cancel-paper">Cancel</button></div></form>}
    <div className="rounded-2xl border border-border bg-card">{(papers.data || []).map((p) => <div key={p.id} className="border-b border-border p-5 last:border-0" data-testid={`row-admin-paper-${p.id}`}>
      <div className="flex items-center gap-4"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#dceaf1] text-[#32647b]"><FileStack size={17} /></div><div className="flex-1"><div className="text-sm font-bold">{p.title}</div><div className="mt-1 text-xs text-muted-foreground">{[p.examBoard, p.year, p.level].filter(Boolean).join(' · ')} · {p.mcqCount} MCQs linked</div></div><button onClick={() => setViewingId(viewingId === p.id ? null : p.id)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold', viewingId === p.id ? 'bg-[#eef7f1] text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-view-paper-questions-${p.id}`}><CircleHelp size={12} /> View questions</button><button onClick={() => setUploadingId(uploadingId === p.id ? null : p.id)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold', uploadingId === p.id ? 'bg-[#eef7f1] text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-upload-paper-${p.id}`}><UploadCloud size={12} /> Upload questions</button><button onClick={() => toggle.mutate({ id: p.id, active: !p.active })} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold', p.active ? 'bg-[#d7eee4] text-[#164b4b]' : 'bg-muted text-muted-foreground')} data-testid={`button-toggle-paper-${p.id}`}>{p.active ? 'Published' : 'Hidden'}</button><button onClick={() => setDeletingId(p.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-paper-${p.id}`}><Trash2 size={15} /></button></div>
      {viewingId === p.id && <div className="mt-4 border-t border-border pt-4"><PastPaperQuestionsList pastPaperId={p.id} /></div>}
      {uploadingId === p.id && <div className="mt-4 border-t border-border pt-4"><PastPaperUploader pastPaperId={p.id} onImported={() => setUploadingId(null)} /></div>}
    </div>)}{!papers.data?.length && <EmptyState icon={FileStack} title="No past papers yet" body="Add a paper, then upload its questions or attach them from the MCQ bank." />}</div>
    {deletingId !== null && <ConfirmDialog title="Permanently delete this past paper?" body="This erases the paper for good — MCQs already linked to it stay in the bank but lose the paper tag. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removePermanent.mutate(deletingId)} pending={removePermanent.isPending} />}
  </div>;
}

// This paper's own question bank — MCQs with pastPaperId set are exclusively
// owned by their paper (no junction table like exams have), so this is a
// straight filter of the same admin MCQ list the main bank tree uses,
// reusing McqTreeRow for edit/delete so it behaves identically to editing a
// question there.
function PastPaperQuestionsList({ pastPaperId }: { pastPaperId: number }) {
  const treeQ = useQuery({ queryKey: ['admin-mcqs-tree'], queryFn: mcqAdminApi.list });
  const rows = (treeQ.data ?? []).filter((m) => m.pastPaperId === pastPaperId);
  if (treeQ.isLoading) return <p className="text-[11px] text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="text-[11px] text-muted-foreground">No questions yet — upload some below.</p>;
  return <div className="max-h-96 space-y-2 overflow-y-auto pr-1">{rows.map((m) => <McqTreeRow key={m.id} mcq={m} />)}</div>;
}

// Compact bulk-import widget scoped to one past paper — parses a file into
// candidate MCQs (reusing the same parser as the main MCQ bank) and commits
// them tagged with this paper's id.
function PastPaperUploader({ pastPaperId, onImported }: { pastPaperId: number; onImported: () => void }) {
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
function FlashcardTreeRow({ card }: { card: AdminFlashcard }) {
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
function FlashcardBulkDeleteInScope({ label, count, filters }: { label: string; count: number; filters: { moduleId?: number; subjectId?: number; topicId?: number } }) {
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

function FlashcardTreeTopic({ topicId, name, cardsByTopic }: { topicId: number; name: string; cardsByTopic: Map<number, AdminFlashcard[]> }) {
  const [open, setOpen] = useState(false);
  const rows = cardsByTopic.get(topicId) ?? [];
  return <div className="rounded-lg border border-border bg-background">
    <div className="flex items-center justify-between px-3 py-2"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-flashcard-tree-topic-${topicId}`}><ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[10px] font-normal text-muted-foreground">{rows.length} card{rows.length === 1 ? '' : 's'}</span><FlashcardBulkDeleteInScope label={name} count={rows.length} filters={{ topicId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-3">{rows.length ? rows.map((c) => <FlashcardTreeRow key={c.id} card={c} />) : <p className="text-[11px] text-muted-foreground">No flashcards in this topic yet.</p>}</div>}
  </div>;
}

function FlashcardTreeSubject({ subjectId, name, cardsByTopic }: { subjectId: number; name: string; cardsByTopic: Map<number, AdminFlashcard[]> }) {
  const [open, setOpen] = useState(false);
  const topicsQ = useQuery({ queryKey: ['admin-topics', subjectId], queryFn: () => topicAdminApi.list(subjectId), enabled: open });
  const topics = topicsQ.data ?? [];
  const subjectCount = [...cardsByTopic.entries()].filter(([tId]) => topics.some((t) => t.id === tId)).reduce((sum, [, rows]) => sum + rows.length, 0);
  return <div className="rounded-xl border border-border bg-card">
    <div className="flex items-center justify-between px-4 py-2.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-xs font-bold" data-testid={`button-flashcard-tree-subject-${subjectId}`}><ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />{name}</button>{open && <FlashcardBulkDeleteInScope label={name} count={subjectCount} filters={{ subjectId }} />}</div>
    {open && <div className="space-y-2 border-t border-border p-3">{topicsQ.isLoading ? <p className="text-[11px] text-muted-foreground">Loading topics…</p> : topics.length ? topics.map((t) => <FlashcardTreeTopic key={t.id} topicId={t.id} name={t.name} cardsByTopic={cardsByTopic} />) : <p className="text-[11px] text-muted-foreground">No topics in this subject yet.</p>}</div>}
  </div>;
}

function FlashcardTreeModule({ moduleId, name, cardCount, cardsByTopic }: { moduleId: number; name: string; cardCount: number; cardsByTopic: Map<number, AdminFlashcard[]> }) {
  const [open, setOpen] = useState(false);
  const subjectsQ = useQuery({ queryKey: ['admin-subjects', moduleId], queryFn: () => subjectAdminApi.list(moduleId), enabled: open });
  const subjects = subjectsQ.data ?? [];
  return <div className="rounded-2xl border border-border bg-card">
    <div className="flex items-center justify-between px-5 py-3.5"><button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left text-sm font-extrabold" data-testid={`button-flashcard-tree-module-${moduleId}`}><ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} />{name}</button><span className="text-[11px] text-muted-foreground">{cardCount} card{cardCount === 1 ? '' : 's'}</span><FlashcardBulkDeleteInScope label={name} count={cardCount} filters={{ moduleId }} /></div>
    {open && <div className="space-y-2 border-t border-border p-4">{subjectsQ.isLoading ? <p className="text-xs text-muted-foreground">Loading subjects…</p> : subjects.length ? subjects.map((s) => <FlashcardTreeSubject key={s.id} subjectId={s.id} name={s.name} cardsByTopic={cardsByTopic} />) : <p className="text-xs text-muted-foreground">No subjects in this module yet.</p>}</div>}
  </div>;
}

// Flashcard bank tree (module > subject > topic) — mirrors McqBankTree so
// flashcards get the same "not all crammed onto one screen" browsing and the
// same per-scope permanent delete as the MCQ bank.
function FlashcardBankTree({ modules, blocks }: { modules: AdminModule[]; blocks: AdminBlock[] }) {
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
  const blockGroups: Array<{ key: number | 'other'; name: string; mods: AdminModule[]; block?: AdminBlock }> = blocks.filter((b) => modulesByBlock.has(b.id)).map((b) => ({ key: b.id, name: b.name, mods: modulesByBlock.get(b.id)!, block: b }));
  const otherMods = modulesByBlock.get('other');
  const programYearGroups = groupByProgramYear(blockGroups);
  return <div className="space-y-7">
    {programYearGroups.map(({ programLabel, yearLabel, groups }) => <div key={`${programLabel}-${yearLabel}`} className="space-y-5">
      {blocks.length > 0 && <div className="flex items-center gap-2 border-b border-border pb-2"><GraduationCap size={14} className="text-primary" /><h3 className="text-xs font-extrabold" data-testid={`text-flashcard-program-year-group-${programLabel}-${yearLabel}`}>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></h3></div>}
      {groups.map((g) => <div key={g.key} className="space-y-3">
        {blocks.length > 0 && <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground" data-testid={`text-flashcard-block-group-${g.key}`}>{g.name}</p>}
        {g.mods.map((m) => <FlashcardTreeModule key={m.id} moduleId={m.id} name={m.name} cardCount={countByModule.get(m.id) ?? 0} cardsByTopic={cardsByTopic} />)}
      </div>)}
    </div>)}
    {!!otherMods?.length && <div className="space-y-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Other modules (not in a block)</p>
      {otherMods.map((m) => <FlashcardTreeModule key={m.id} moduleId={m.id} name={m.name} cardCount={countByModule.get(m.id) ?? 0} cardsByTopic={cardsByTopic} />)}
    </div>}
    {!!trulyUnassigned.length && <div className="rounded-2xl border border-dashed border-border bg-card p-4"><p className="mb-3 text-xs font-bold text-muted-foreground">{trulyUnassigned.length} flashcard{trulyUnassigned.length === 1 ? '' : 's'} with no module/subject/topic</p><div className="space-y-2">{trulyUnassigned.map((c) => <FlashcardTreeRow key={c.id} card={c} />)}</div></div>}
  </div>;
}

function AdminFlashcards() {
  // moduleAdminApi.listAll() (not the student-facing useListModules()) so
  // blockId is actually populated — needed for the Block > Module grouping
  // in FlashcardBankTree below, same as the MCQ bank tree.
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const allModules = modulesQ.data ?? [];
  // Round 3, item 9 — Block filter ahead of Module, same cascading pattern
  // as Module -> Subject -> Topic: picking a Block narrows the Module
  // dropdown to that block's modules. Purely a filter — flashcards
  // themselves are still homed by module/subject/topic, never by block.
  const blocksQ = useQuery({ queryKey: ['admin-blocks'], queryFn: blockAdminApi.listAll });
  const blocks = (blocksQ.data ?? []).filter((b) => b.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const [blockId, setBlockId] = useState('');
  const modules = blockId ? allModules.filter((m) => String(m.blockId ?? '') === blockId) : allModules;
  const [moduleId, setModuleId] = useState('');
  const subjectsQ = useListSubjects(moduleId ? { moduleId: Number(moduleId) } : undefined);
  const [subjectId, setSubjectId] = useState('');
  const topicsQ = useListTopics(subjectId ? { subjectId: Number(subjectId) } : undefined);
  const [topicId, setTopicId] = useState('');
  // Shared with FlashcardBankTree's ['admin-flashcards-tree'] cache — same
  // reasoning as AdminMcqs switching off the public useListFlashcards() hook:
  // that response strips moduleId/subjectId/topicId, so the flat list
  // couldn't support edit or the module/subject/topic display either.
  const [bankView, setBankView] = useState<'tree' | 'flat'>('tree');
  const cardsQ = useQuery({ queryKey: ['admin-flashcards-tree'], queryFn: () => flashcardsAdminApi.list() });
  const cards = cardsQ.data ?? [];
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListFlashcardsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['admin-flashcards-tree'] }); };
  const create = useMutation({
    mutationFn: flashcardsAdminApi.create,
    onSuccess: () => invalidate(),
    onError: (err: unknown) => toast({ title: 'Could not create flashcard', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: flashcardsAdminApi.remove,
    onSuccess: () => { invalidate(); setDeletingId(null); },
    onError: (err: unknown) => toast({ title: 'Could not delete flashcard', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  // Multi-select for bulk delete, same pattern as the MCQ bank's flat list.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const toggleSelected = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleSelectAll = () => setSelectedIds((prev) => prev.size === cards.length ? new Set() : new Set(cards.map((c) => c.id)));
  const bulkDelete = useMutation({
    mutationFn: (ids: number[]) => flashcardsAdminApi.bulkRemove({ ids }),
    onSuccess: (res) => { invalidate(); setSelectedIds(new Set()); setBulkDeleteOpen(false); toast({ title: `Deleted ${res.deleted} flashcard${res.deleted === 1 ? '' : 's'}` }); },
    onError: (err: unknown) => toast({ title: 'Bulk delete failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const targetReady = !!moduleId && !!subjectId && !!topicId;
  const moduleName = modules.find((m) => String(m.id) === moduleId)?.name ?? '';
  const topicName = (topicsQ.data || []).find((t) => String(t.id) === topicId)?.name ?? '';

  // AI-generated flashcard drafts — reviewed/edited before saving, never auto-published.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSourceText, setAiSourceText] = useState('');
  const [aiCount, setAiCount] = useState(8);
  const [drafts, setDrafts] = useState<GeneratedFlashcard[] | null>(null);
  const generateDrafts = useMutation({
    mutationFn: () => flashcardsAiApi.generate({ topicId: topicId ? Number(topicId) : undefined, sourceText: aiSourceText.trim() || undefined, count: aiCount }),
    onSuccess: (res) => setDrafts(res.drafts),
    onError: (err: unknown) => toast({ title: 'Could not generate flashcards', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const updateDraft = (i: number, patch: Partial<GeneratedFlashcard>) => setDrafts((prev) => prev && prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const removeDraft = (i: number) => setDrafts((prev) => prev && prev.filter((_, idx) => idx !== i));
  const saveAllDrafts = async () => {
    if (!drafts?.length || !targetReady) return;
    for (const d of drafts) {
      if (!d.front.trim() || !d.back.trim()) continue;
      // eslint-disable-next-line no-await-in-loop
      await create.mutateAsync({ front: d.front.trim(), back: d.back.trim(), module: moduleName, topic: topicName, moduleId: Number(moduleId), subjectId: Number(subjectId), topicId: Number(topicId) });
    }
    setDrafts(null);
    setAiOpen(false);
    toast({ title: 'Flashcards saved', description: 'AI-generated drafts were added to the bank.' });
  };

  return <div><SectionHeader eyebrow="Study tools" title="Flashcards" action={<div className="flex items-center gap-2"><button onClick={() => { setAiOpen((v) => !v); setOpen(false); }} className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-[#eef7f1] px-4 py-2.5 text-xs font-extrabold text-primary" data-testid="button-toggle-ai-flashcards"><Sparkles size={15} /> {aiOpen ? 'Close' : 'Generate with AI'}</button><button onClick={() => { setOpen((v) => !v); setAiOpen(false); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-flashcard"><Plus size={15} /> {open ? 'Close' : 'Add flashcard'}</button></div>} />
    {aiOpen && <div className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
      <p className="text-xs text-muted-foreground">Pick a target topic below (its MCQs will be used as source material), or paste your own text. Drafts are editable — nothing saves until you review and click "Save all".</p>
      <div className="grid gap-2 sm:grid-cols-4"><select value={blockId} onChange={(e) => { setBlockId(e.target.value); setModuleId(''); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-ai-flashcard-block"><option value="">All blocks</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-ai-flashcard-module"><option value="">Select module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-ai-flashcard-subject"><option value="">Select subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-ai-flashcard-topic"><option value="">Select topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <textarea value={aiSourceText} onChange={(e) => setAiSourceText(e.target.value)} placeholder="Optional: paste notes or a passage to generate flashcards from instead of the topic's MCQs" className="min-h-20 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-ai-flashcard-source" />
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs font-bold">How many<input type="number" min={1} max={100} value={aiCount} onChange={(e) => setAiCount(Math.max(1, Math.min(100, Number(e.target.value) || 8)))} className="h-9 w-16 rounded-lg border border-border bg-card px-2 text-xs" data-testid="input-ai-flashcard-count" /></label><button onClick={() => generateDrafts.mutate()} disabled={generateDrafts.isPending || (!topicId && !aiSourceText.trim())} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-generate-flashcard-drafts"><Sparkles size={13} /> {generateDrafts.isPending ? 'Generating…' : 'Generate drafts'}</button>{!topicId && !aiSourceText.trim() && <span className="text-[11px] text-muted-foreground">Pick a topic or paste text first.</span>}</div>
      {drafts && <div className="space-y-3 border-t border-border pt-4">
        {!targetReady && <p className="text-[11px] font-semibold text-[#8a5a12]">Select a module, subject, and topic above before saving — drafts need a home.</p>}
        {drafts.map((d, i) => <div key={i} className="rounded-xl border border-border bg-card p-3" data-testid={`row-flashcard-draft-${i}`}>
          <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Draft {i + 1}</span><button onClick={() => removeDraft(i)} className="text-muted-foreground hover:text-destructive" data-testid={`button-reject-draft-${i}`}><X size={13} /></button></div>
          <textarea value={d.front} onChange={(e) => updateDraft(i, { front: e.target.value })} className="mt-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-draft-front-${i}`} />
          <textarea value={d.back} onChange={(e) => updateDraft(i, { back: e.target.value })} className="mt-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-draft-back-${i}`} />
        </div>)}
        {!drafts.length && <p className="text-xs text-muted-foreground">All drafts rejected.</p>}
        {!!drafts.length && <button onClick={saveAllDrafts} disabled={!targetReady || create.isPending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-all-drafts">{create.isPending ? 'Saving…' : `Save all ${drafts.length} to the bank`}</button>}
      </div>}
    </div>}
    {open && <form onSubmit={(e) => {
      e.preventDefault();
      if (!targetReady) return;
      const f = new FormData(e.currentTarget);
      create.mutate({ front: String(f.get('front')), back: String(f.get('back')), module: moduleName, topic: topicName, moduleId: Number(moduleId), subjectId: Number(subjectId), topicId: Number(topicId) }, { onSuccess: () => e.currentTarget.reset() });
    }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
      <div className="grid gap-2 sm:grid-cols-4"><select value={blockId} onChange={(e) => { setBlockId(e.target.value); setModuleId(''); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-flashcard-block"><option value="">All blocks</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-flashcard-module"><option value="">Select module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-flashcard-subject"><option value="">Select subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-flashcard-topic"><option value="">Select topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      {!targetReady && <p className="text-[11px] font-semibold text-[#8a5a12]">Pick a module, subject, and topic before saving — every flashcard needs a home.</p>}
      <textarea name="front" required placeholder="Front of card — the question or prompt" className="min-h-16 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-flashcard-front" />
      <textarea name="back" required placeholder="Back of card — the answer" className="min-h-16 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-flashcard-back" />
      <button disabled={!targetReady || create.isPending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-flashcard">{create.isPending ? 'Saving…' : 'Save flashcard'}</button>
    </form>}
    {cardsQ.isLoading ? <SkeletonPage /> : <div className="mt-2">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{cards.length} flashcards</h3><div className="flex overflow-hidden rounded-xl border border-border text-xs font-bold"><button onClick={() => setBankView('tree')} className={cn('px-3 py-2', bankView === 'tree' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-flashcard-view-tree">Module tree</button><button onClick={() => setBankView('flat')} className={cn('px-3 py-2', bankView === 'flat' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-flashcard-view-flat">Flat list</button></div></div>
      {bankView === 'tree' ? <FlashcardBankTree modules={allModules} blocks={blocks} /> : (cards.length ? <div className="space-y-3">
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === cards.length} onChange={toggleSelectAll} data-testid="checkbox-select-all-flashcards" />{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</label>{selectedIds.size > 0 && <button onClick={() => setBulkDeleteOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-bold text-destructive" data-testid="button-bulk-delete-flashcards"><Trash2 size={12} /> Delete selected</button>}</div>
        <div className="rounded-2xl border border-border bg-card">{cards.map((c) => <div key={c.id} className="flex items-start gap-4 border-b border-border p-5 last:border-0" data-testid={`row-flashcard-${c.id}`}>
          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} className="mt-1" data-testid={`checkbox-select-flashcard-${c.id}`} />
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f3e8d7] text-[#8a5a12]"><Zap size={17} /></div>
          <div className="flex-1"><div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{c.module}{c.topic ? ` · ${c.topic}` : ''}</div><div className="mt-1 text-sm font-bold">{c.front}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{c.back}</div></div>
          <button onClick={() => setDeletingId(c.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-flashcard-${c.id}`}><Trash2 size={15} /></button>
        </div>)}</div>
      </div> : <EmptyState icon={Zap} title="No flashcards yet" body="Add your first flashcard above — students can study them from their Flashcards tab." />)}
    </div>}
    {deletingId !== null && <ConfirmDialog title="Delete this flashcard?" body="This cannot be undone." onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
    {bulkDeleteOpen && <ConfirmDialog title={`Delete ${selectedIds.size} selected flashcard${selectedIds.size === 1 ? '' : 's'}?`} body="This cannot be undone." confirmLabel="Delete selected" onCancel={() => setBulkDeleteOpen(false)} onConfirm={() => bulkDelete.mutate(Array.from(selectedIds))} pending={bulkDelete.isPending} />}
  </div>;
}

function AdminBooks() {
  const modulesQ = useListModules();
  const modules = modulesQ.data ?? [];
  const [moduleId, setModuleId] = useState('');
  const subjectsQ = useListSubjects(moduleId ? { moduleId: Number(moduleId) } : undefined);
  const [subjectId, setSubjectId] = useState('');
  const topicsQ = useListTopics(subjectId ? { subjectId: Number(subjectId) } : undefined);
  const [topicId, setTopicId] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const booksQ = useQuery({ queryKey: ['admin-books'], queryFn: booksAdminApi.list });
  const books = booksQ.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-books'] });
  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a PDF to upload');
      const uploaded = await uploadFile(file, 'book');
      let coverPath: string | undefined;
      if (cover) {
        coverPath = (await uploadFile(cover, 'book')).storagePath;
      } else if (file.type === 'application/pdf') {
        // Auto-thumbnail: admin didn't supply a cover, so render page 1 of
        // the PDF itself instead of leaving the card blank. Best-effort —
        // if it fails for any reason, the book still saves, just without a
        // thumbnail (same as before this feature existed).
        const thumb = await renderPdfFirstPageThumbnail(file);
        if (thumb) coverPath = (await uploadFile(new File([thumb], 'cover.jpg', { type: 'image/jpeg' }), 'book')).storagePath;
      }
      return booksAdminApi.create({ title: title.trim(), author: author.trim() || undefined, moduleId: moduleId ? Number(moduleId) : undefined, subjectId: subjectId ? Number(subjectId) : undefined, topicId: topicId ? Number(topicId) : undefined, storagePath: uploaded.storagePath, coverImagePath: coverPath });
    },
    onSuccess: () => { invalidate(); setOpen(false); setTitle(''); setAuthor(''); setFile(null); setCover(null); setModuleId(''); setSubjectId(''); setTopicId(''); toast({ title: 'Book added', description: 'Now visible to students.' }); },
    onError: (err: unknown) => toast({ title: 'Could not add book', description: err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: booksAdminApi.removePermanent,
    // The backend also deletes the underlying Cloudinary file (and cover
    // image, if any) — `warning` comes back non-empty only if that remote
    // cleanup failed even though the book record itself was removed, so
    // surface it rather than showing a plain "Book deleted" that implies
    // everything went cleanly.
    onSuccess: (result) => { invalidate(); setDeletingId(null); toast(result?.warning ? { title: 'Book deleted', description: result.warning } : { title: 'Book deleted' }); },
    onError: (err: unknown) => toast({ title: 'Could not delete book', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const backfill = useMutation({
    mutationFn: booksAdminApi.backfillLinks,
    onSuccess: (result) => { invalidate(); toast({ title: 'Link check complete', description: `Fixed ${result.fixed}, skipped ${result.skipped}, failed ${result.failed}.` }); },
    onError: (err: unknown) => toast({ title: 'Could not fix links', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  return <div><SectionHeader eyebrow="Study tools" title="Books library" action={<div className="flex gap-2"><button onClick={() => backfill.mutate()} disabled={backfill.isPending} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-extrabold text-muted-foreground hover:text-foreground disabled:opacity-50" data-testid="button-backfill-book-links">{backfill.isPending ? 'Checking…' : 'Fix broken links'}</button><button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-book"><Plus size={15} /> {open ? 'Close' : 'Add book'}</button></div>} />
    {open && <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-2 sm:grid-cols-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-book-title" /><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-book-author" /></div>
      <div className="grid gap-2 sm:grid-cols-3"><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-book-module"><option value="">All modules</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-background px-3 text-xs disabled:opacity-50" data-testid="select-book-subject"><option value="">All subjects</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-background px-3 text-xs disabled:opacity-50" data-testid="select-book-topic"><option value="">All topics</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <p className="text-[11px] text-muted-foreground">Leave module/subject/topic unset to make the book visible to every student.</p>
      <div className="grid gap-2 sm:grid-cols-2"><label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground"><UploadCloud size={14} />{file ? file.name : 'Choose PDF'}<input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" data-testid="input-book-file" /></label><label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground"><UploadCloud size={14} />{cover ? cover.name : 'Cover image (optional)'}<input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} className="hidden" data-testid="input-book-cover" /></label></div>
      <button type="submit" disabled={create.isPending || !title.trim() || !file} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-submit-book">{create.isPending ? 'Uploading…' : 'Add book'}</button>
    </form>}
    {books.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{books.map((b) => <div key={b.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`card-book-${b.id}`}>
      {b.coverImagePath && <img src={resolveUploadUrl(b.coverImagePath) ?? undefined} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" />}
      <p className="text-sm font-bold leading-5">{b.title}</p>{b.author && <p className="mt-1 text-xs text-muted-foreground">{b.author}</p>}
      <div className="mt-3 flex items-center justify-between">{resolveUploadUrl(b.storagePath) ? <a href={resolveUploadUrl(b.storagePath)!} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary" data-testid={`link-open-book-${b.id}`}>Open PDF <ArrowRight size={12} className="ml-1 inline" /></a> : <span className="text-[11px] font-bold text-destructive" data-testid={`text-book-unavailable-${b.id}`}>Link broken — try "Fix broken links"</span>}<button onClick={() => setDeletingId(b.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-book-${b.id}`}><Trash2 size={14} /></button></div>
    </div>)}</div> : <EmptyState icon={BookOpen} title="No books yet" body="Upload a PDF above — students can browse and open it from their Books tab." />}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this book?" body="It will be removed from the students' library and the admin list for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
  </div>;
}

function FeedbackThread({ feedbackId }: { feedbackId: number }) {
  const repliesQ = useQuery({ queryKey: ['feedback-replies', feedbackId], queryFn: () => feedbackApi.listReplies(feedbackId) });
  const [message, setMessage] = useState('');
  const reply = useMutation({
    mutationFn: () => feedbackApi.reply(feedbackId, message.trim()),
    onSuccess: () => { setMessage(''); queryClient.invalidateQueries({ queryKey: ['feedback-replies', feedbackId] }); queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }); },
    onError: (err: unknown) => toast({ title: 'Could not send reply', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  return <div className="mt-4 space-y-3 border-t border-border pt-4">
    {repliesQ.isLoading ? <p className="text-xs text-muted-foreground">Loading replies…</p> : (repliesQ.data || []).map((r) => <div key={r.id} className={cn('max-w-[85%] rounded-xl p-3 text-xs', r.authorRole === 'admin' ? 'ml-auto bg-[#eef7f1]' : 'bg-muted')} data-testid={`row-feedback-reply-${r.id}`}><div className="mb-1 text-[10px] font-bold text-muted-foreground">{r.authorRole === 'admin' ? 'Academic team' : 'Student'} · {new Date(r.createdAt).toLocaleString()}</div>{r.message}</div>)}
    {!repliesQ.isLoading && !repliesQ.data?.length && <p className="text-xs text-muted-foreground">No replies yet — be the first to respond.</p>}
    <div className="flex gap-2"><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a reply…" className="min-h-16 flex-1 rounded-xl border border-border bg-background p-2 text-xs" data-testid={`input-feedback-reply-${feedbackId}`} /><button onClick={() => message.trim() && reply.mutate()} disabled={reply.isPending || !message.trim()} className="self-end rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-send-feedback-reply-${feedbackId}`}>{reply.isPending ? 'Sending…' : 'Reply'}</button></div>
  </div>;
}

function AdminFeedback() {
  const feedback = useQuery({ queryKey: ['admin-feedback'], queryFn: feedbackApi.listAll });
  const updateStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: 'open' | 'replied' | 'reviewed' }) => feedbackApi.updateStatus(id, status), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }) });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const statusTone = (status: string) => status === 'open' ? 'bg-[#fdeecb] text-[#8a5a12]' : status === 'replied' ? 'bg-[#dceaf1] text-[#32647b]' : 'bg-[#d7eee4] text-[#164b4b]';
  return <div><SectionHeader eyebrow="Community" title="Feedback inbox" /><div className="space-y-3">{(feedback.data || []).map((item: FeedbackEntry) => <div key={item.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-feedback-${item.id}`}><div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">{item.category}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', statusTone(item.status))}>{item.status}</span></div><p className="mt-2 text-sm leading-6">{item.message}</p><div className="mt-2 text-[10px] text-muted-foreground">{item.user?.name || 'Unknown'} · {item.user?.email || '—'} · {new Date(item.createdAt).toLocaleString()}</div></div><div className="flex shrink-0 items-center gap-2"><button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-toggle-thread-${item.id}`}>{expandedId === item.id ? 'Hide thread' : 'Reply'}</button>{item.status !== 'reviewed' && <button onClick={() => updateStatus.mutate({ id: item.id, status: 'reviewed' })} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-resolve-feedback-${item.id}`}>Mark reviewed</button>}</div></div>{expandedId === item.id && <FeedbackThread feedbackId={item.id} />}</div>)}{!feedback.data?.length && <EmptyState icon={MessageSquare} title="No feedback yet" body="Student feedback will show up here as it comes in." />}</div></div>;
}

function AdminAiVisualizerLogs() {
  const logs = useQuery({ queryKey: ['admin-ai-visualizer-logs'], queryFn: () => aiVisualizerAdminApi.list() });
  const successCount = (logs.data ?? []).filter((l) => l.status === 'success').length;
  const errorCount = (logs.data ?? []).filter((l) => l.status === 'error').length;
  return <div>
    <SectionHeader eyebrow="Community" title="AI Visualizer activity" />
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
      <Stat label="Generations shown" value={logs.data?.length ?? 0} />
      <Stat label="Succeeded" value={successCount} />
      <Stat label="Failed" value={errorCount} />
    </div>
    <div className="space-y-3">
      {(logs.data || []).map((log: AiVisualizerLogEntry) => (
        <div key={log.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-ai-visualizer-log-${log.id}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', log.status === 'success' ? 'bg-[#d7eee4] text-[#164b4b]' : 'bg-[#f9ddd6] text-[#a34c3e]')}>{log.status}</span>
                {log.visualizationType && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">{log.visualizationType}</span>}
              </div>
              <p className="mt-2 text-sm leading-6">{log.prompt}</p>
              {log.errorMessage && <p className="mt-1 text-xs text-destructive">{log.errorMessage}</p>}
              {log.rawResponse && <details className="mt-1"><summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">Raw AI response</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-[10px]">{log.rawResponse}</pre></details>}
              <div className="mt-2 text-[10px] text-muted-foreground">{log.student.name} · {log.student.email} · {new Date(log.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
      ))}
      {!logs.data?.length && <EmptyState icon={Wand2} title="No activity yet" body="Student AI Visualizer prompts will show up here as they come in." />}
    </div>
  </div>;
}

// Native <input type="color"> layered under a visible hex swatch/text pair —
// keeps the picker fully accessible (real OS color UI) while matching the
// reference design's "swatch + hex code" look.
function ColorField({ label, value, onChange, testId }: { label: string; value: string; onChange: (value: string) => void; testId: string }) {
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

function AdminSiteContent() {
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? settingsQuery.data ?? {};
  const save = useMutation({ mutationFn: settingsApi.update, onSuccess: (data) => { setForm(null); queryClient.setQueryData(['admin-settings'], data); queryClient.invalidateQueries({ queryKey: ['site-content'] }); } });
  const set = (key: string, value: string) => setForm({ ...values, [key]: value });

  let features: string[] = [];
  try { features = JSON.parse(values.FEATURES_LIST || '[]'); } catch { features = []; }
  const [newFeature, setNewFeature] = useState('');
  const setFeatures = (list: string[]) => set('FEATURES_LIST', JSON.stringify(list));

  let quickLinks: Array<{ label: string; url: string }> = [];
  try { quickLinks = JSON.parse(values.QUICK_LINKS || '[]'); } catch { quickLinks = []; }
  const setQuickLinks = (list: Array<{ label: string; url: string }>) => set('QUICK_LINKS', JSON.stringify(list));

  const theme = {
    primary: values.THEME_PRIMARY || DEFAULT_THEME.THEME_PRIMARY,
    secondary: values.THEME_SECONDARY || DEFAULT_THEME.THEME_SECONDARY,
    accent: values.THEME_ACCENT || DEFAULT_THEME.THEME_ACCENT,
    background: values.THEME_BACKGROUND || DEFAULT_THEME.THEME_BACKGROUND,
    card: values.THEME_CARD || DEFAULT_THEME.THEME_CARD,
    text: values.THEME_TEXT || DEFAULT_THEME.THEME_TEXT,
    mode: values.THEME_MODE || DEFAULT_THEME.THEME_MODE,
  };

  return <div className="max-w-3xl"><SectionHeader eyebrow="Site content" title="Footer & public content" action={<span className="text-[10px] text-muted-foreground">Shown across the sign-in pages and student profile</span>} />
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Design &amp; branding</h3><span className="text-[10px] text-muted-foreground">Applies across the student and admin apps, including sign-in pages</span></div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField label="Primary" value={theme.primary} onChange={(v) => set('THEME_PRIMARY', v)} testId="theme-primary" />
              <ColorField label="Secondary" value={theme.secondary} onChange={(v) => set('THEME_SECONDARY', v)} testId="theme-secondary" />
              <ColorField label="Accent" value={theme.accent} onChange={(v) => set('THEME_ACCENT', v)} testId="theme-accent" />
              <ColorField label="Background" value={theme.background} onChange={(v) => set('THEME_BACKGROUND', v)} testId="theme-background" />
              <ColorField label="Card" value={theme.card} onChange={(v) => set('THEME_CARD', v)} testId="theme-card" />
              <ColorField label="Text" value={theme.text} onChange={(v) => set('THEME_TEXT', v)} testId="theme-text" />
            </div>
            <div className="mt-5">
              <div className="text-xs font-bold">Theme mode</div>
              <div className="mt-2 inline-flex rounded-xl border border-border bg-background p-1">
                <button type="button" onClick={() => set('THEME_MODE', 'light')} className={cn('flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-colors', theme.mode === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid="button-theme-mode-light">Light</button>
                <button type="button" onClick={() => set('THEME_MODE', 'dark')} className={cn('flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-colors', theme.mode === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid="button-theme-mode-dark">Dark</button>
              </div>
            </div>
            <div className="mt-5">
              <div className="text-xs font-bold">Dashboard greeting photo</div>
              <div className="mt-2"><AdminImageUpload currentUrl={values.DASHBOARD_HERO_IMAGE_URL || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional — shown behind the student Dashboard's greeting card (e.g. a stethoscope photo). PNG, JPEG, or WEBP. Falls back to a plain pattern when unset." testId="input-dashboard-hero-upload" onUploaded={(storagePath) => set('DASHBOARD_HERO_IMAGE_PATH', storagePath)} /></div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Theme preview</div>
            <div className="mt-2 overflow-hidden rounded-xl border border-border" style={{ backgroundColor: theme.background }} data-testid="panel-theme-preview">
              <div className="m-3 overflow-hidden rounded-lg shadow-sm" style={{ backgroundColor: theme.card }}>
                <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: theme.primary }}>
                  <span className="grid size-5 place-items-center rounded-md" style={{ backgroundColor: theme.accent }}><Stethoscope size={11} color="#fff" /></span>
                  <span className="text-[10px] font-extrabold" style={{ color: readableForegroundHsl(theme.primary) === '0 0% 100%' ? '#fff' : theme.text }}>Dashboard</span>
                </div>
                <div className="space-y-2 p-3">
                  <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: theme.secondary, opacity: 0.4 }} />
                  <div className="h-2 w-1/2 rounded-full" style={{ backgroundColor: theme.secondary, opacity: 0.25 }} />
                  <button type="button" className="mt-2 rounded-md px-3 py-1.5 text-[10px] font-extrabold text-white" style={{ backgroundColor: theme.primary }}>Continue</button>
                  <span className="ml-2 inline-block rounded-md px-3 py-1.5 text-[10px] font-extrabold" style={{ backgroundColor: theme.accent, color: '#fff' }}>68%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">About</h3><label className="mt-4 block text-xs font-bold">Platform description<textarea value={values.PLATFORM_DESCRIPTION || ''} onChange={(e) => set('PLATFORM_DESCRIPTION', e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid="input-platform-description" /></label></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Social links</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Facebook<input value={values.SOCIAL_FACEBOOK || ''} onChange={(e) => set('SOCIAL_FACEBOOK', e.target.value)} placeholder="https://facebook.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-facebook" /></label>
        <label className="text-xs font-bold">YouTube<input value={values.SOCIAL_YOUTUBE || ''} onChange={(e) => set('SOCIAL_YOUTUBE', e.target.value)} placeholder="https://youtube.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-youtube" /></label>
        <label className="text-xs font-bold">LinkedIn<input value={values.SOCIAL_LINKEDIN || ''} onChange={(e) => set('SOCIAL_LINKEDIN', e.target.value)} placeholder="https://linkedin.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-linkedin" /></label>
        <label className="text-xs font-bold">Instagram<input value={values.SOCIAL_INSTAGRAM || ''} onChange={(e) => set('SOCIAL_INSTAGRAM', e.target.value)} placeholder="https://instagram.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-instagram" /></label>
      </div></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Contact info</h3><div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold">Email<input value={values.CONTACT_EMAIL || ''} onChange={(e) => set('CONTACT_EMAIL', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-contact-email" /></label>
        <label className="text-xs font-bold">Location<input value={values.CONTACT_LOCATION || ''} onChange={(e) => set('CONTACT_LOCATION', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-contact-location" /></label>
        <label className="text-xs font-bold">Support hours<input value={values.SUPPORT_HOURS || ''} onChange={(e) => set('SUPPORT_HOURS', e.target.value)} placeholder="24/7 Available" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-support-hours" /></label>
      </div></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Feature highlights</h3><div className="mt-3 flex flex-wrap gap-2">{features.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{f}<button onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-feature-${i}`}><X size={12} /></button></span>)}</div><div className="mt-3 flex gap-2"><input value={newFeature} onChange={(e) => setNewFeature(e.target.value)} placeholder="e.g. 30,000+ MCQs" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-new-feature" /><button type="button" onClick={() => { if (newFeature.trim()) { setFeatures([...features, newFeature.trim()]); setNewFeature(''); } }} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" data-testid="button-add-feature">Add</button></div></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Quick links</h3><div className="mt-3 space-y-2">{quickLinks.map((l, i) => <div key={i} className="flex items-center gap-2"><input value={l.label} onChange={(e) => setQuickLinks(quickLinks.map((q, idx) => idx === i ? { ...q, label: e.target.value } : q))} className="h-9 w-32 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-quicklink-label-${i}`} /><input value={l.url} onChange={(e) => setQuickLinks(quickLinks.map((q, idx) => idx === i ? { ...q, url: e.target.value } : q))} className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-quicklink-url-${i}`} /><button onClick={() => setQuickLinks(quickLinks.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-quicklink-${i}`}><Trash2 size={14} /></button></div>)}<button type="button" onClick={() => setQuickLinks([...quickLinks, { label: '', url: '/' }])} className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-primary" data-testid="button-add-quicklink"><Plus size={13} /> Add link</button></div></div>

      <label className="block text-xs font-bold">Copyright notice<input value={values.COPYRIGHT_NOTICE || ''} onChange={(e) => set('COPYRIGHT_NOTICE', e.target.value)} placeholder="All rights reserved." className="mt-2 h-10 w-full max-w-sm rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-copyright-notice" /></label>
      <button onClick={() => save.mutate(values)} disabled={save.isPending} className="rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-site-content">{save.isPending ? 'Saving…' : save.isSuccess && !form ? 'Saved' : 'Save site content'}</button>
    </div>
  </div>;
}

function AdminTeam() {
  const q = useQuery({ queryKey: ['admin-team'], queryFn: teamApi.listAll });
  const create = useMutation({ mutationFn: teamApi.create, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<TeamMember> }) => teamApi.update(id, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); } });
  const remove = useMutation({ mutationFn: teamApi.remove, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not hide member', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removePermanent = useMutation({ mutationFn: teamApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); setPermaDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not permanently delete member', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoPath, setPhotoPath] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [permaDeletingId, setPermaDeletingId] = useState<number | null>(null);
  const formOpen = open || !!editingMember;
  const closeForm = () => { setOpen(false); setEditingMember(null); setPhotoPath(''); };
  const allMembers = q.data || [];
  const hiddenCount = allMembers.filter((m) => !m.active).length;
  const members = allMembers.filter((m) => (showArchived ? true : m.active));

  return <div><SectionHeader eyebrow="Site content" title="Academic team" action={<div className="flex items-center gap-2"><button onClick={() => setShowArchived((v) => !v)} className={cn('rounded-xl border border-border px-3 py-2.5 text-xs font-bold', showArchived ? 'bg-muted' : 'bg-card')} data-testid="button-toggle-hidden-team">{showArchived ? 'Hide hidden' : `Show hidden${hiddenCount ? ` (${hiddenCount})` : ''}`}</button><button onClick={() => { if (formOpen) { closeForm(); } else { setOpen(true); } }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-add-team-member"><Plus size={15} /> Add member</button></div>} />
    {formOpen && <form key={editingMember?.id ?? 'new'} onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const body = { name: String(f.get('name')), role: String(f.get('role')), category: f.get('category') as TeamCategory, bio: String(f.get('bio') || ''), achievementBadge: String(f.get('achievementBadge') || ''), linkedinUrl: String(f.get('linkedinUrl') || ''), instagramUrl: String(f.get('instagramUrl') || ''), email: String(f.get('email') || ''), photoPath: photoPath || editingMember?.photoPath || undefined };
      if (editingMember) update.mutate({ id: editingMember.id, body }, { onSuccess: closeForm });
      else create.mutate({ ...body, active: true }, { onSuccess: closeForm });
    }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
      {editingMember && <p className="text-[11px] font-bold text-primary">Editing {editingMember.name}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><input required name="name" defaultValue={editingMember?.name} placeholder="Full name" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-name" /><input required name="role" defaultValue={editingMember?.role} placeholder="Role, e.g. Founder & CEO" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-role" /></div>
      <label className="block text-xs font-bold">Category<select name="category" defaultValue={editingMember?.category ?? 'reviewer'} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-team-category">{TEAM_CATEGORIES.map((cat) => <option key={cat} value={cat}>{TEAM_CATEGORY_LABELS[cat]}</option>)}</select></label>
      <input name="achievementBadge" defaultValue={editingMember?.achievementBadge ?? ''} placeholder="Achievement badge, e.g. 1st Position (All over KMU)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-badge" />
      <textarea name="bio" defaultValue={editingMember?.bio ?? ''} placeholder="Short bio" className="min-h-16 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-team-bio" />
      <div className="grid gap-3 sm:grid-cols-3"><input name="linkedinUrl" defaultValue={editingMember?.linkedinUrl ?? ''} placeholder="LinkedIn URL" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-linkedin" /><input name="instagramUrl" defaultValue={editingMember?.instagramUrl ?? ''} placeholder="Instagram URL" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-instagram" /><input name="email" defaultValue={editingMember?.email ?? ''} placeholder="Email" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-email" /></div>
      <label className="block text-xs font-bold">Photo{editingMember?.photoPath && !photoPath && <span className="ml-2 font-normal text-muted-foreground">(current photo kept unless you choose a new one)</span>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const res = await uploadFile(file, 'profile-picture'); setPhotoPath(res.storagePath); } catch (err) { toast({ title: 'Could not upload photo', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }); } finally { setUploading(false); } }} className="mt-2 w-full rounded-xl border border-dashed border-border bg-card px-3 py-2 text-xs" data-testid="input-team-photo" />{uploading && <p className="mt-1 text-[11px] text-muted-foreground">Uploading…</p>}{photoPath && <img src={resolveUploadUrl(photoPath) ?? undefined} alt="" className="mt-2 size-14 rounded-full border border-border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}</label>
      <div className="flex gap-2"><button disabled={create.isPending || update.isPending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-team-member">{editingMember ? 'Save changes' : 'Save'}</button><button type="button" onClick={closeForm} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-cancel-team-member">Cancel</button></div>
    </form>}
    <div className="space-y-6">{TEAM_CATEGORIES.map((cat) => { const inCat = members.filter((m) => (m.category ?? 'reviewer') === cat); return <div key={cat}><div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{TEAM_CATEGORY_LABELS[cat]}</div><div className="grid gap-3 sm:grid-cols-2">{inCat.map((m) => <div key={m.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-admin-team-${m.id}`}><div className="flex items-center justify-between"><div className="flex items-center gap-3"><TeamPhoto member={m} />{" "}<div><div className="text-sm font-bold">{m.name}</div><div className="text-xs text-muted-foreground">{m.role}</div></div></div>{m.active ? <button onClick={() => update.mutate({ id: m.id, body: { active: false } })} className="rounded-lg bg-[#d7eee4] px-2.5 py-1 text-[10px] font-bold text-[#164b4b]" data-testid={`button-toggle-team-${m.id}`}>Visible</button> : <button onClick={() => update.mutate({ id: m.id, body: { active: true } })} className="rounded-lg bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground" data-testid={`button-toggle-team-${m.id}`}>Hidden</button>}</div>{m.bio && <p className="mt-3 text-xs text-muted-foreground">{m.bio}</p>}<div className="mt-3 flex items-center gap-3"><button onClick={() => { setEditingMember(m); setOpen(false); setPhotoPath(''); }} className="text-[11px] font-bold text-primary" data-testid={`button-edit-team-${m.id}`}>Edit</button>{m.active ? <button onClick={() => setDeletingId(m.id)} className="text-[11px] font-bold text-destructive" data-testid={`button-delete-team-${m.id}`}>Hide</button> : <><button onClick={() => update.mutate({ id: m.id, body: { active: true } })} className="text-[11px] font-bold text-primary" data-testid={`button-restore-team-${m.id}`}>Restore</button><button onClick={() => setPermaDeletingId(m.id)} className="text-[11px] font-bold text-destructive" data-testid={`button-permanent-delete-team-${m.id}`}>Delete permanently</button></>}</div></div>)}{!inCat.length && <p className="text-xs text-muted-foreground">No one here yet.</p>}</div></div>; })}{!members.length && <EmptyState icon={Users} title={showArchived ? 'No hidden members' : 'No team members yet'} body={showArchived ? 'Members you hide will show up here so you can restore or permanently delete them.' : 'Add reviewers, question setters, or ownership to show on the student profile page.'} />}</div>
    {deletingId !== null && <ConfirmDialog title="Hide this team member?" body={'They\'ll disappear from the public profile page. You can restore or permanently delete them later from "Show hidden."'} confirmLabel="Hide" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
    {permaDeletingId !== null && <ConfirmDialog title="Permanently delete this team member?" body="This erases their profile for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setPermaDeletingId(null)} onConfirm={() => removePermanent.mutate(permaDeletingId)} pending={removePermanent.isPending} />}
  </div>;
}

// Same broken-image failure mode as the favicon/QR uploaders: an upload can
// succeed and still 404 a moment later if this server's local disk doesn't
// persist (see the storage note on the Settings page). Falls back to the
// initials avatar instead of a broken image icon when that happens.
function TeamPhoto({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  const url = member.photoPath ? resolveUploadUrl(member.photoPath) : null;
  if (!url || broken) return <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d7eee4] text-xs font-extrabold text-[#164b4b]">{initials(member.name)}</div>;
  return <img src={url} alt={member.name} className="size-11 shrink-0 rounded-full object-cover" onError={() => setBroken(true)} />;
}

// Full edit — every field the create form sets, pre-filled, so admins
// aren't stuck only being able to publish/archive after creation. Uses
// the same `update` mutation the parent already wires to a PATCH.
function ExamEditForm({ exam, onSave, onCancel, saving }: { exam: AdminExam; onSave: (body: Partial<AdminExam>) => void; onCancel: () => void; saving: boolean }) {
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

function AdminExams() {
  const q = useQuery({ queryKey: ['admin-exams'], queryFn: examsAdminApi.list });
  const create = useMutation({ mutationFn: examsAdminApi.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-exams'] }) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<AdminExam> }) => examsAdminApi.update(id, body), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-exams'] }) });
  const archive = useMutation({ mutationFn: examsAdminApi.archive, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-exams'] }) });
  const [open, setOpen] = useState(false);
  const [managingId, setManagingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [freshlyCreatedId, setFreshlyCreatedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Set once the backend refuses a plain delete because the exam has
  // recorded attempts (see the /permanent route's requiresForce response) —
  // drives the second, stronger confirm dialog instead of just failing.
  const [forceDeleteWarning, setForceDeleteWarning] = useState<{ id: number; attemptCount: number } | null>(null);
  const removePermanent = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) => examsAdminApi.removePermanent(id, force),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-exams'] }); setDeletingId(null); setForceDeleteWarning(null); },
    onError: (err: unknown, variables) => {
      const data = err instanceof ApiRequestError ? (err.data as { requiresForce?: boolean; attemptCount?: number; error?: string } | undefined) : undefined;
      if (data?.requiresForce) {
        // First refusal — surface the stronger warning instead of a plain
        // error toast, so the admin can explicitly choose to also erase
        // the recorded attempts rather than the delete just silently
        // failing forever (which was the reported bug).
        setDeletingId(null);
        setForceDeleteWarning({ id: variables.id, attemptCount: data.attemptCount ?? 0 });
        return;
      }
      toast({ title: 'Could not delete exam', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' });
    },
  });

  return <div><SectionHeader eyebrow="Assessment" title="Pre-Proffs Exams" action={<button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-create-exam"><Plus size={15} /> New exam</button>} />
    {open && <form onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      create.mutate({
        title: String(f.get('title')), description: String(f.get('description') || ''),
        programTargetKind: String(f.get('programTargetKind') || '') || null, yearTargetNumber: f.get('yearTargetNumber') ? Number(f.get('yearTargetNumber')) : null,
        // startAt/endAt: the <input type="datetime-local"> value has no
        // timezone info (e.g. "2026-09-08T14:30"). Sending that raw string
        // let the SERVER's own timezone (not the admin's) decide what
        // moment it means — on a UTC-hosted API that silently shifted the
        // real open/close time by the admin's UTC offset, so an exam
        // meant to open "now" could sit stuck on "Upcoming" for hours.
        // `new Date(...)` parses it as the admin's browser-local time,
        // and `.toISOString()` converts that to the correct absolute UTC
        // instant before it ever leaves the browser.
        durationMinutes: Number(f.get('durationMinutes') || 60), startAt: new Date(String(f.get('startAt'))).toISOString(), endAt: new Date(String(f.get('endAt'))).toISOString(),
        maxAttempts: Number(f.get('maxAttempts') || 1), negativeMarkingEnabled: f.get('negativeMarkingEnabled') === 'on', negativeMarkPerWrong: Number(f.get('negativeMarkPerWrong') || 0),
        passingPercent: f.get('passingPercent') ? Number(f.get('passingPercent')) : null, resultReleaseMode: f.get('resultReleaseMode') as Exam['resultReleaseMode'],
        showMarks: f.get('showMarks') === 'on', showPercentage: f.get('showPercentage') === 'on', showCorrectAnswers: f.get('showCorrectAnswers') === 'on', status: 'draft',
      }, {
        onSuccess: (exam) => {
          setOpen(false);
          // Jump straight into "Manage questions & results" with the
          // uploader already expanded, instead of leaving the admin to
          // find and click through two separate toggles to attach
          // questions right after creating the exam.
          setManagingId(exam.id);
          setFreshlyCreatedId(exam.id);
        },
      });
    }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-[#eef7f1] p-5">
      <div className="grid gap-3 sm:grid-cols-2"><input required name="title" placeholder="Exam title" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-title" /><input name="description" placeholder="Short description" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-description" /></div>
      <div className="grid gap-3 sm:grid-cols-4"><select name="programTargetKind" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="select-exam-program"><option value="">All Programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select><select name="yearTargetNumber" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="select-exam-year"><option value="">All Years</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select><input required type="number" name="durationMinutes" defaultValue={60} placeholder="Duration (min)" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-duration" /><input required type="number" name="maxAttempts" defaultValue={1} min={1} placeholder="Max attempts" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-attempts" /></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-[11px] font-bold">Opens<input required type="datetime-local" name="startAt" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-start" /></label><label className="text-[11px] font-bold">Closes<input required type="datetime-local" name="endAt" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-end" /></label></div>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-[11px] font-bold">Passing %<input type="number" name="passingPercent" min={0} max={100} placeholder="e.g. 50" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-passing" /></label><label className="text-[11px] font-bold">Result release<select name="resultReleaseMode" defaultValue="immediate" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="select-exam-release"><option value="immediate">Immediately after submit</option><option value="after_end">When exam window closes</option><option value="manual">Manually by admin</option></select></label><label className="text-[11px] font-bold">Negative mark / wrong<input type="number" step="0.25" name="negativeMarkPerWrong" defaultValue={0} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-negative" /></label></div>
      <div className="flex flex-wrap gap-4 text-xs font-bold"><label className="flex items-center gap-1.5"><input type="checkbox" name="negativeMarkingEnabled" className="size-4 accent-[#287058]" data-testid="checkbox-negative-marking" /> Enable negative marking</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showMarks" defaultChecked className="size-4 accent-[#287058]" data-testid="checkbox-show-marks" /> Show marks</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showPercentage" defaultChecked className="size-4 accent-[#287058]" data-testid="checkbox-show-percentage" /> Show percentage</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showCorrectAnswers" defaultChecked className="size-4 accent-[#287058]" data-testid="checkbox-show-answers" /> Show correct answers after release</label></div>
      <button disabled={create.isPending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-exam">Create as draft</button>
      <p className="text-[11px] text-muted-foreground">After you create the exam, you'll go straight into attaching its questions.</p>
    </form>}
    <div className="space-y-3">{(q.data || []).map((exam) => <div key={exam.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-admin-exam-${exam.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-bold">{exam.title}</h3><Badge tone={exam.status === 'published' ? 'green' : exam.status === 'archived' ? 'red' : 'amber'}>{exam.status}</Badge></div><div className="mt-1 text-[11px] text-muted-foreground">{exam.programTargetKind || 'All Programs'} · {exam.yearTargetNumber ? `Year ${exam.yearTargetNumber}` : 'All Years'} · {exam.durationMinutes} min · {exam.questionCount} questions · {exam.attemptCount} attempts</div></div>
      <div className="flex flex-wrap gap-2">{exam.status === 'draft' && <button onClick={() => update.mutate({ id: exam.id, body: { status: 'published' } })} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground" data-testid={`button-publish-exam-${exam.id}`}>Publish</button>}{exam.resultReleaseMode === 'manual' && <button onClick={() => examsAdminApi.releaseAll(exam.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-release-exam-${exam.id}`}>Release results</button>}<button onClick={() => setEditingId(editingId === exam.id ? null : exam.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-edit-exam-${exam.id}`}><Pencil size={12} /> {editingId === exam.id ? 'Close edit' : 'Edit'}</button><button onClick={() => setManagingId(managingId === exam.id ? null : exam.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-manage-exam-${exam.id}`}>{managingId === exam.id ? 'Close' : 'Manage questions & results'}</button>{exam.status !== 'archived' && <button onClick={() => archive.mutate(exam.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-destructive" data-testid={`button-archive-exam-${exam.id}`}>Archive</button>}<button onClick={() => exam.status === 'archived' && setDeletingId(exam.id)} disabled={exam.status !== 'archived'} title={exam.status !== 'archived' ? 'Archive this exam first, then Delete permanently erases it' : 'Permanently delete this exam'} className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-[11px] font-bold text-destructive disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-delete-exam-${exam.id}`}>Delete permanently</button></div></div>
      {editingId === exam.id && <ExamEditForm exam={exam} saving={update.isPending} onCancel={() => setEditingId(null)} onSave={(body) => update.mutate({ id: exam.id, body }, { onSuccess: () => setEditingId(null) })} />}
      {managingId === exam.id && <ExamManagePanel exam={exam} autoOpenUpload={freshlyCreatedId === exam.id} />}
    </div>)}{!q.data?.length && <EmptyState icon={ClipboardCheck} title="No exams yet" body="Create your first Pre-Proffs exam above." />}</div>
    {deletingId !== null && <ConfirmDialog title="Delete this exam permanently?" body="This erases the exam and its question list for good — blocked automatically if it already has recorded attempts. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removePermanent.mutate({ id: deletingId })} pending={removePermanent.isPending} />}
    {forceDeleteWarning !== null && <ConfirmDialog title="This exam has recorded attempts" body={`${forceDeleteWarning.attemptCount} student attempt${forceDeleteWarning.attemptCount === 1 ? '' : 's'} — including scores and results — will be permanently erased along with the exam. This cannot be undone. Delete anyway?`} confirmLabel="Delete exam and attempts" onCancel={() => setForceDeleteWarning(null)} onConfirm={() => removePermanent.mutate({ id: forceDeleteWarning.id, force: true })} pending={removePermanent.isPending} />}
  </div>;
}

function ExamManagePanel({ exam, autoOpenUpload }: { exam: AdminExam; autoOpenUpload?: boolean }) {
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
        {existingQuestionsQ.isLoading && <p className="text-[11px] text-muted-foreground">Loading…</p>}
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
function useFaviconSync() {
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
function useThemeSync() {
  const { data } = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  useEffect(() => { applyThemeVars(data ?? null); }, [data]);
}

function AppRoutes() {
 useFaviconSync();
 useThemeSync();
 return <Switch><Route path="/login" component={Login} /><Route path="/admin/login" component={Login} /><Route path="/admin-signup/1" component={AdminSignup} /><Route path="/forgot-password" component={ForgotPassword} /><Route path="/reset-password" component={ResetPassword} /><Route path="/verify-email" component={VerifyEmail} /><Route path="/notifications"><Shell><Notifications /></Shell></Route><Route path="/profile"><Shell><Profile /></Shell></Route><Route path="/"><Shell><AdminOverview /></Shell></Route><Route path="/admin"><Shell><AdminOverview /></Shell></Route><Route path="/admin/students"><Shell><AdminStudents /></Shell></Route><Route path="/admin/payments"><Shell><AdminPaymentsHub initialTab="Proof Review" /></Shell></Route><Route path="/admin/plans"><Shell><AdminPlans /></Shell></Route><Route path="/admin/payment-details"><Shell><AdminPaymentsHub initialTab="Collection Details" /></Shell></Route><Route path="/admin/academic-structure"><Shell><AdminAcademicStructure /></Shell></Route><Route path="/admin/content"><Shell><AdminContent /></Shell></Route><Route path="/admin/subjects"><Shell><AdminSubjectsPage /></Shell></Route><Route path="/admin/topics"><Shell><AdminTopicsPage /></Shell></Route><Route path="/admin/mcqs"><Shell><AdminMcqs /></Shell></Route><Route path="/admin/flashcards"><Shell><AdminFlashcards /></Shell></Route><Route path="/admin/books"><Shell><AdminBooks /></Shell></Route><Route path="/admin/past-papers"><Shell><AdminPastPapers /></Shell></Route><Route path="/admin/exams"><Shell><AdminExams /></Shell></Route><Route path="/admin/feedback"><Shell><AdminFeedback /></Shell></Route><Route path="/admin/ai-visualizer-logs"><Shell><AdminAiVisualizerLogs /></Shell></Route><Route path="/admin/site-content"><Shell><AdminSiteContent /></Shell></Route><Route path="/admin/team"><Shell><AdminTeam /></Shell></Route><Route path="/admin/settings"><Shell><AdminSettings /></Shell></Route><Route component={NotFound} /></Switch>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppRoutes /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;
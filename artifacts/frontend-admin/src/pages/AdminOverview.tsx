// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useSearch, useParams, Router as WouterRouter } from 'wouter';
import {ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, ChevronUp, ChevronDown, CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen, LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus, ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2, TrendingUp, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark, Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash, GraduationCap, CalendarDays, Eye, EyeOff, Smartphone, UploadCloud, ImageOff, RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Activity, Layers, BarChart3, ToggleLeft, Download, Database, Loader2} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
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
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, analyticsApi, mcqImportApi, flashcardImportApi, mcqBackupApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, subjectAdminApi, topicAdminApi, flashcardsAdminApi, flashcardsAiApi, booksAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blockAdminApi, examsAdminApi, examsApi, explanationsApi, auditApi, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type FlashcardCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type TeamCategory, type AdminModule, type AdminBlock, type AdminSubject, type AdminTopic, type AdminFlashcard, type GeneratedFlashcard, type AdminMcqRow, type AdminBook, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type BankAccount, type PaymentMethodConfig, aiVisualizerAdminApi, type AiVisualizerLogEntry, type AuditLogEntry } from '@/lib/api';

// Round 3, item 10 (performance) — same over-fetching fix as the student
// app (see its App.tsx for the full rationale): `new QueryClient()` with no
// options refetched on every mount and every window refocus. Admin
// mutations already call invalidateQueries on the specific keys they
// change, so edits still show up immediately — this only avoids redundant
// background refetches of data nothing has touched.
import { Badge, EmptyState, InlineLoading, SectionHeader, SkeletonPage, buildMcqImportSeries, cn, humanizeAuditAction, money, paymentStatusLabel, paymentStatusTone, timeAgo } from '@/lib/shared';

function AdminOverview() {
  const q = useGetAdminDashboard({ query: { refetchInterval: 15000, queryKey: getGetAdminDashboardQueryKey() } });
  const d = q.data;
  const activity = useQuery({ queryKey: ['audit-logs', 'overview'], queryFn: () => auditApi.list(6), refetchInterval: 15000 });
  // Content totals — shares the ['admin-modules'] cache the MCQ/flashcard
  // bank pages already populate, so subjectCount/topicCount (already
  // returned per module by GET /modules) are just summed here rather than
  // needing a new backend aggregate.
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const allModules = modulesQ.data ?? [];
  const totalModules = allModules.length;
  const totalSubjects = allModules.reduce((sum, m) => sum + (m.subjectCount ?? 0), 0);
  const totalTopics = allModules.reduce((sum, m) => sum + (m.topicCount ?? 0), 0);
  const importLogsQ = useQuery({ queryKey: ['audit-logs', 'mcq-imports-7d'], queryFn: () => auditApi.list(500), refetchInterval: 15000 });
  const mcqImportSeries = buildMcqImportSeries(importLogsQ.data ?? []);
  const mcqImportsThisWeek = mcqImportSeries.reduce((sum, row) => sum + row.count, 0);
  const meQ = useGetCurrentUser();
  // Recomputed once a minute so "Good morning/afternoon/evening" doesn't
  // freeze at whatever hour the dashboard first rendered if this tab is
  // left open past a boundary (same fix as the student dashboard's hero —
  // see useCurrentHour in frontend-student/src/lib/fx3d.tsx).
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  if (q.isLoading || !d) return <SkeletonPage />;
  // One-tap shortcuts to the jobs admins do most — each is just a link, so
  // there's no new behaviour to maintain, only fewer clicks to get there.
  const quickActions: Array<[string, string, typeof Users, string]> = [
    ['Review payments', '/admin/payments', ReceiptText, 'bg-accent/20 text-accent-text'],
    ['Add or import MCQs', '/admin/mcqs', Database, 'bg-primary/15 text-primary'],
    ['Students', '/admin/students', Users, 'bg-info/15 text-info'],
    ['Books', '/admin/books', Library, 'bg-violet/15 text-violet'],
    ['Platform settings', '/admin/settings', Settings, 'bg-violet/15 text-violet'],
    ['Free trial controls', '/admin/settings?tab=access', Zap, 'bg-destructive/15 text-destructive'],
  ];
  const stats: Array<[string, string | number, typeof Users, string, string | null]> = [['Students', d.totalStudents, Users, 'bg-info/15 text-info', '/admin/students'], ['Subscribed students', d.activeMembers, ShieldCheck, 'bg-primary/15 text-primary', '/admin/students?status=ACTIVE'], ['Pending payments', d.pendingPayments, Clock3, 'bg-accent/20 text-accent-text', '/admin/payments'], ['This month\'s revenue', money(d.monthlyRevenue), TrendingUp, 'bg-violet/15 text-violet', null]];
  const contentStats: Array<[string, number, typeof Users, string, string]> = [['Total modules', totalModules, BookOpen, 'bg-primary/10 text-primary', '/admin/content'], ['Total subjects', totalSubjects, Layers, 'bg-info/15 text-info', '/admin/subjects'], ['Total topics', totalTopics, Library, 'bg-accent/10 text-accent-text', '/admin/topics']];
  // Donut gradient stops derived from real studentsByStatus counts — this
  // used to be a hardcoded "72%, 86%, 100%" regardless of actual data (see
  // section 10 fix notes). Colors cycle through the same 3-color sequence
  // the legend below already used (primary/amber/blue), so any number of
  // status buckets still renders sensibly.
  const statusEntries = Object.entries(d.studentsByStatus);
  const statusTotal = statusEntries.reduce((sum, [, count]) => sum + count, 0);
  const donutColors = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--info) / .45)', 'hsl(var(--violet))', 'hsl(var(--destructive))'];
  let cursor = 0;
  const gradientStops = statusTotal > 0
    ? statusEntries.map(([, count], i) => {
      const start = (cursor / statusTotal) * 100;
      cursor += count;
      const end = (cursor / statusTotal) * 100;
      return `${donutColors[i % donutColors.length]} ${start}% ${end}%`;
    }).join(', ')
    : 'hsl(var(--info) / .15) 0% 100%';
  return <div><SectionHeader eyebrow="Command center" title={`${greeting}${meQ.data?.name ? `, ${meQ.data.name.split(' ')[0]}` : ''}`} action={<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-[10px] font-bold text-primary" data-testid="text-live-indicator"><span className="size-1.5 rounded-full bg-primary" /> Live · refreshes every 15s</span>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value, Icon, color, href], i) => { const card = <div className={cn('rounded-2xl border border-border bg-card p-5', href && 'card-lift cursor-pointer transition hover:border-primary/40')}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{label}</span><div className={cn('grid size-9 place-items-center rounded-xl', color)}><Icon size={17} /></div></div><div className="mt-5 font-display text-4xl">{String(value)}</div><div className="mt-2 text-[11px] text-muted-foreground">{i === 2 ? 'Needs review today' : i === 3 ? 'Across active memberships' : 'Registered on the platform'}</div></div>; return href ? <Link key={String(label)} href={href} data-testid={`link-stat-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{card}</Link> : <div key={String(label)}>{card}</div>; })}</div>
    <div className="mt-8"><SectionHeader eyebrow="Jump straight in" title="Quick actions" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{quickActions.map(([label, href, Icon, color]) => <Link key={label} href={href} className="card-lift group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4" data-testid={`link-quick-action-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}><span className={cn('grid size-10 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3', color)}><Icon size={18} /></span><span className="text-xs font-extrabold leading-tight">{label}</span></Link>)}</div></div>
    <div className="mt-8"><SectionHeader eyebrow="Platform content" title="Content library" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">{contentStats.map(([label, value, Icon, color, href]) => <Link key={label} href={href} className="card-lift block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40" data-testid={`link-content-stat-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{label}</span><div className={cn('grid size-9 place-items-center rounded-xl', color)}><Icon size={17} /></div></div><div className="mt-5 font-display text-4xl">{modulesQ.isLoading ? '—' : value}</div></Link>)}</div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">MCQ imports</span><span className="text-[11px] text-muted-foreground">{mcqImportsThisWeek} question{mcqImportsThisWeek === 1 ? '' : 's'} · last 7 days</span></div>
          <div className="mt-3 h-52">
            {importLogsQ.isLoading ? <InlineLoading label="Loading import history…" /> : <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mcqImportSeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs><linearGradient id="mcqImportsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="currentColor" className="text-muted-foreground" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={28} stroke="currentColor" className="text-muted-foreground" />
                <RechartsTooltip formatter={(value: number) => [`${value} question${value === 1 ? '' : 's'}`, 'Imported']} labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.date : '')} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#mcqImportsFill)" />
              </AreaChart>
            </ResponsiveContainer>}
          </div>
        </div>
      </div>
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]"><div><SectionHeader eyebrow="Needs attention" title="Recent payments" action={<Link href="/admin/payments" className="text-xs font-bold text-primary" data-testid="link-admin-payments">View queue <ArrowRight size={13} className="ml-1 inline" /></Link>} />{d.recentPayments.length ? <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[580px] text-left text-xs"><thead className="bg-muted text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{d.recentPayments.slice(0, 4).map((p) => <tr key={p.id} className="border-t border-border" data-testid={`row-admin-payment-${p.id}`}><td className="px-5 py-4 font-bold">{p.studentName}</td><td className="px-5 py-4 text-muted-foreground">{p.planName}</td><td className="px-5 py-4 font-mono-app text-[11px]">{money(p.amount, p.currency)}</td><td className="px-5 py-4"><Badge tone={paymentStatusTone(p.status)}>{paymentStatusLabel(p.status)}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No payments yet" body="Payment submissions will show up here as students pay." />}</div><div><SectionHeader eyebrow="Membership health" title="Student status" /><div className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-center"><div className="relative grid size-44 place-items-center rounded-full" style={{ background: `conic-gradient(${gradientStops})` }}><div className="grid size-32 place-items-center rounded-full bg-card"><span className="font-display text-4xl">{d.activeMembers}</span><span className="text-[10px] text-muted-foreground">active</span></div></div></div><div className="mt-5 space-y-3">{statusEntries.map(([status, count], i) => <Link key={status} href={`/admin/students?status=${encodeURIComponent(status)}`} className="flex items-center justify-between text-xs transition hover:opacity-70" data-testid={`link-status-${status.toLowerCase()}`}><span className="flex items-center gap-2 capitalize"><span className="size-2 rounded-full" style={{ background: donutColors[i % donutColors.length] }} />{status}</span><span className="font-mono-app">{count}</span></Link>)}</div></div></div></div>
    <div className="mt-8"><SectionHeader eyebrow="What's happened lately" title="Recent activity" action={<Link href="/admin/team" className="text-xs font-bold text-primary" data-testid="link-admin-audit">Full history <ArrowRight size={13} className="ml-1 inline" /></Link>} />
      <div className="rounded-2xl border border-border bg-card p-2">{activity.isLoading ? <div className="p-4"><InlineLoading /></div> : activity.data?.length ? activity.data.map((entry, i) => <div key={entry.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')} data-testid={`row-activity-${entry.id}`}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-info/15 text-info"><ClipboardCheck size={14} /></span><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{humanizeAuditAction(entry.action)}</div><div className="truncate text-[11px] text-muted-foreground">{entry.actorName}{entry.entity ? ` · ${entry.entity}${entry.entityId ? ` #${entry.entityId}` : ''}` : ''}</div></div><span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(entry.createdAt)}</span></div>) : <div className="p-4 text-xs text-muted-foreground">No activity recorded yet.</div>}</div>
    </div>
  </div>;
}

export default AdminOverview;

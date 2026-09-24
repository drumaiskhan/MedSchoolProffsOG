// Auto-extracted route page — code-split via React.lazy() in App.tsx.
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
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Activity, Layers, BarChart3, ToggleLeft,
  Download, Database, Loader2, ShieldCheck, CreditCard, TrendingUp
} from 'lucide-react';
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
import { Badge, ConfirmDialog, EmptyState, Progress, SectionHeader, SkeletonPage, StudentDrawer, groupByProgramYear, cn, initials } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

// Mirrors McqTreeYearGroup (shared.tsx) — one collapsed-by-default
// "MBBS/BDS · Year N" section, so the roster reads the same way the MCQ
// bank does instead of one long flat list/table. Students with no
// programId/academicYearId on record (legacy rows, or admin-created
// accounts) land under "Unspecified program" / "All years" via the same
// groupByProgramYear fallback the bank uses — never hidden or dropped.
const statusTone = (status: string) => status === 'ACTIVE' ? 'green' : status === 'SUSPENDED' || status === 'REJECTED' ? 'red' : 'amber';
const avatarRing = (status: string) => status === 'ACTIVE' ? 'ring-2 ring-primary/30' : status === 'SUSPENDED' || status === 'REJECTED' ? 'ring-2 ring-destructive/30' : 'ring-2 ring-accent/30';

function StudentYearGroup({ programLabel, yearLabel, students, onSelect, onDelete }: { programLabel: string; yearLabel: string; students: Student[]; onSelect: (id: number) => void; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const avgProgress = students.length ? Math.round(students.reduce((a, s) => a + (s.progress || 0), 0) / students.length) : 0;
  const activeCount = students.filter((s) => s.status === 'ACTIVE').length;
  return <div className="overflow-hidden rounded-2xl border border-border bg-card">
    <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-3.5 text-left transition-colors hover:bg-muted/30" data-testid={`button-student-year-group-${programLabel}-${yearLabel}`}>
      <ChevronRight size={16} className={cn('shrink-0 text-primary transition-transform', open && 'rotate-90')} />
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><GraduationCap size={15} /></div>
      <h3 className="flex-1 text-sm font-extrabold" data-testid={`text-student-group-${programLabel}-${yearLabel}`}>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></h3>
      <div className="hidden items-center gap-3 sm:flex">
        <span className="text-[11px] font-semibold text-primary">{activeCount} active</span>
        <div className="flex items-center gap-1.5"><div className="w-20"><Progress value={avgProgress} /></div><span className="w-8 text-right font-mono-app text-[10px] text-muted-foreground">{avgProgress}%</span></div>
      </div>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{students.length}</span>
    </button>
    {open && <div className="space-y-3 border-t border-border p-4">
      <div className="space-y-3 sm:hidden">{students.map((s) => <div key={s.id} onClick={() => onSelect(s.id)} className="cursor-pointer rounded-2xl border border-border bg-background p-4 transition-colors active:bg-muted/40" data-testid={`card-student-${s.id}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary', avatarRing(s.status))}>{initials(s.name)}</div><div><div className="text-sm font-bold">{s.name}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{s.email}</div></div></div><button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-student-mobile-${s.id}`}><Trash2 size={14} /></button></div><div className="mt-3 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">{s.institution} · {s.program}</span><Badge tone={statusTone(s.status)}>{s.status}</Badge></div><div className="mt-3 flex items-center gap-2"><Progress value={s.progress || 0} /><span className="font-mono-app text-[10px] text-muted-foreground">{s.progress || 0}%</span></div></div>)}</div>
      <div className="hidden overflow-x-auto rounded-xl border border-border sm:block"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-muted text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Institution</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3"></th></tr></thead><tbody>{students.map((s) => <tr key={s.id} className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40" data-testid={`row-student-${s.id}`}><td className="px-5 py-4" onClick={() => onSelect(s.id)}><div className="flex items-center gap-3"><div className={cn('grid size-8 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary', avatarRing(s.status))}>{initials(s.name)}</div><div><div className="font-bold">{s.name}</div><div className="mt-1 text-[10px] text-muted-foreground">{s.email}</div></div></div></td><td className="px-5 py-4" onClick={() => onSelect(s.id)}><div>{s.institution}</div><div className="mt-1 text-[10px] text-muted-foreground">{s.program}</div></td><td className="px-5 py-4" onClick={() => onSelect(s.id)}><Badge tone={statusTone(s.status)}>{s.status}</Badge></td><td className="w-40 px-5 py-4" onClick={() => onSelect(s.id)}><div className="flex items-center gap-2"><Progress value={s.progress || 0} /><span className="font-mono-app text-[10px]">{s.progress || 0}%</span></div></td><td className="px-5 py-4 text-right"><button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-student-${s.id}`}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
    </div>}
  </div>;
}

// KPI strip above the roster — counts computed from the same list feeding
// the table below, so it always matches the current filter/search.
function StudentKpiBar({ students }: { students: Student[] }) {
  const total = students.length;
  const active = students.filter((s) => s.status === 'ACTIVE').length;
  const pendingReview = students.filter((s) => s.status === 'PAYMENT_PENDING_REVIEW' || s.status === 'VERIFIED' || s.status === 'UNVERIFIED').length;
  const avgProgress = total ? Math.round(students.reduce((a, s) => a + (s.progress || 0), 0) / total) : 0;
  const cards: Array<[string, string, string, typeof Users]> = [
    ['Students', String(total), 'text-foreground', Users],
    ['Active', String(active), 'text-primary', ShieldCheck],
    ['Needs review', String(pendingReview), pendingReview ? 'text-accent-text' : 'text-foreground', ClipboardCheck],
    ['Avg progress', `${avgProgress}%`, 'text-foreground', TrendingUp],
  ];
  return <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">{cards.map(([label, value, tone, Icon]) => <div key={label} className="rounded-2xl border border-border bg-card p-3.5" data-testid={`kpi-students-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Icon size={11} />{label}</div>
    <div className={cn('mt-1 font-display text-xl', tone)}>{value}</div>
  </div>)}</div>;
}

function AdminStudents() {
  const q = useListStudents();
  const search_ = useSearch();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(search_).get('status') ?? '');
  useEffect(() => { const fromUrl = new URLSearchParams(search_).get('status'); if (fromUrl) setStatusFilter(fromUrl); }, [search_]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Deep link from the header's universal search (AdminGlobalSearch in
  // shared.tsx) — a student result links here with ?focus=<id> so picking
  // it from the search palette opens straight to that student's drawer
  // instead of just landing on the roster and leaving the admin to find
  // them again (especially awkward now that the roster is grouped into
  // collapsed-by-default year sections — see StudentYearGroup above).
  useEffect(() => { const focusId = new URLSearchParams(search_).get('focus'); if (focusId) setSelectedId(Number(focusId)); }, [search_]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'progress' | 'recent'>('name');
  const removeStudent = useMutation({ mutationFn: studentsAdminApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete student', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const students = (q.data ?? []).filter((s) => `${s.name} ${s.email} ${s.institution}`.toLowerCase().includes(search.toLowerCase()) && (!statusFilter || s.status === statusFilter));
  const groups = groupByProgramYear(students.map((s) => ({ key: s.id, program: s.programKind ?? null, year: s.yearNumber ?? null, student: s })));
  const sortStudents = (arr: Student[]) => [...arr].sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'progress' ? (b.progress || 0) - (a.progress || 0) : b.id - a.id);
  return <div>
    <SectionHeader eyebrow="People operations" title="Students" action={<span className="text-[10px] text-muted-foreground">{students.length} of {(q.data ?? []).length} students</span>} />
    <StudentKpiBar students={students} />
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students, institutions..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none" data-testid="input-search-students" /></div>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-student-status-filter"><option value="">All statuses</option>{STUDENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-student-sort"><option value="name">Sort: Name</option><option value="progress">Sort: Progress</option><option value="recent">Sort: Newest</option></select>
    </div>
    {q.isLoading ? <SkeletonPage /> : students.length ? <div className="space-y-3">
      {groups.map((g) => <StudentYearGroup key={`${g.programLabel}-${g.yearLabel}`} programLabel={g.programLabel} yearLabel={g.yearLabel} students={sortStudents(g.groups.map((x) => x.student))} onSelect={setSelectedId} onDelete={setDeletingId} />)}
    </div> : <EmptyState icon={Users} title="No students yet" body="Students will appear here once they register." />}
    {selectedId !== null && <StudentDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this student?" body="This erases their account, payments, memberships, practice/exam history, and everything else tied to it, for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removeStudent.mutate(deletingId)} pending={removeStudent.isPending} />}
  </div>;
}

// ── Payments & collection: "Proof Review" tab (was the standalone AdminPayments page) ──

export default AdminStudents;

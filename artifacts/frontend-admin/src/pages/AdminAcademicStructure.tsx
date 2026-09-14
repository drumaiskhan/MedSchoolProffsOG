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
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Activity, Layers, BarChart3, GraduationCap, ToggleLeft,
  Download, Database, Loader2
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
import { AdminInstitutionsList, SectionHeader, cn } from '@/lib/shared';

function AdminAcademicStructure() {
  const [institutionId, setInstitutionId] = useState<number | null>(null);
  const [programId, setProgramId] = useState<number | null>(null);
  const [academicYearId, setAcademicYearId] = useState<number | null>(null);

  const institutions = useQuery({ queryKey: ['admin-institutions'], queryFn: () => academicApi.institutions() });
  const programs = useQuery({ queryKey: ['admin-programs', institutionId], queryFn: () => academicApi.programs(institutionId!), enabled: !!institutionId });
  const academicYears = useQuery({ queryKey: ['admin-academic-years', programId], queryFn: () => academicApi.academicYears(programId!), enabled: !!programId });
  const batches = useQuery({ queryKey: ['admin-batches', academicYearId], queryFn: () => academicApi.batches(academicYearId!), enabled: !!academicYearId });

  // Programs/years feed two different caches: this page's own drill-down
  // (['admin-programs', institutionId]) and the flat, unfiltered lists the
  // Past Papers "Add paper" form uses (['admin-programs-flat'], etc). Only
  // invalidating the first meant creating a program here never refreshed
  // that form's dropdown — it looked empty/broken even right after adding
  // one, until a full page reload. Invalidating both closes that gap.
  const invalidate = (key: string) => { queryClient.invalidateQueries({ queryKey: [key] }); queryClient.invalidateQueries({ queryKey: [`${key}-flat`] }); };
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
    // Default the new-program type to the college's own MBBS/BDS type
    // where it has one — a BDS college's first program is almost always
    // going to be BDS, not MBBS — while still leaving the dropdown open
    // to "Other" for colleges that predate the type split.
    const selectedInstitutionKind = institutions.data?.find((i) => i.id === institutionId)?.kind;
    const [kind, setKind] = useState(selectedInstitutionKind === 'BDS' ? 'BDS' : 'MBBS');
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

export default AdminAcademicStructure;

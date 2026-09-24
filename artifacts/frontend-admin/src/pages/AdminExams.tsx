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
import { SectionHeader, Badge, ConfirmDialog, EmptyState, ExamEditForm, ExamManagePanel, groupByDegreeYear } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

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
    }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
      <div className="grid gap-3 sm:grid-cols-2"><input required name="title" placeholder="Exam title" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-title" /><input name="description" placeholder="Short description" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-description" /></div>
      <div className="grid gap-3 sm:grid-cols-4"><select name="programTargetKind" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="select-exam-program"><option value="">All Programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select><select name="yearTargetNumber" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="select-exam-year"><option value="">All Years</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select><input required type="number" name="durationMinutes" defaultValue={60} placeholder="Duration (min)" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-duration" /><input required type="number" name="maxAttempts" defaultValue={1} min={1} placeholder="Max attempts" className="h-10 rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-attempts" /></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-[11px] font-bold">Opens<input required type="datetime-local" name="startAt" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-start" /></label><label className="text-[11px] font-bold">Closes<input required type="datetime-local" name="endAt" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-end" /></label></div>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-[11px] font-bold">Passing %<input type="number" name="passingPercent" min={0} max={100} placeholder="e.g. 50" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-passing" /></label><label className="text-[11px] font-bold">Result release<select name="resultReleaseMode" defaultValue="immediate" className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="select-exam-release"><option value="immediate">Immediately after submit</option><option value="after_end">When exam window closes</option><option value="manual">Manually by admin</option></select></label><label className="text-[11px] font-bold">Negative mark / wrong<input type="number" step="0.25" name="negativeMarkPerWrong" defaultValue={0} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-xs" data-testid="input-exam-negative" /></label></div>
      <div className="flex flex-wrap gap-4 text-xs font-bold"><label className="flex items-center gap-1.5"><input type="checkbox" name="negativeMarkingEnabled" className="size-4 accent-primary" data-testid="checkbox-negative-marking" /> Enable negative marking</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showMarks" defaultChecked className="size-4 accent-primary" data-testid="checkbox-show-marks" /> Show marks</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showPercentage" defaultChecked className="size-4 accent-primary" data-testid="checkbox-show-percentage" /> Show percentage</label><label className="flex items-center gap-1.5"><input type="checkbox" name="showCorrectAnswers" defaultChecked className="size-4 accent-primary" data-testid="checkbox-show-answers" /> Show correct answers after release</label></div>
      <button disabled={create.isPending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-exam">Create as draft</button>
      <p className="text-[11px] text-muted-foreground">After you create the exam, you'll go straight into attaching its questions.</p>
    </form>}
    {!q.data?.length && <EmptyState icon={ClipboardCheck} title="No exams yet" body="Create your first Pre-Proffs exam above." />}
    {/* Classified into MBBS / BDS, then by study year — same
        groupByDegreeYear helper the Past papers page uses, so both
        content types read as organized sections. */}
    {groupByDegreeYear(q.data || [], (exam) => exam.programTargetKind || '', (exam) => exam.yearTargetNumber ? `Year ${exam.yearTargetNumber}` : '').map((g) => <div key={g.degree || 'unspecified'} className="mb-7 last:mb-0">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.08em] text-primary"><GraduationCap size={14} /> {g.degree === 'MBBS' || g.degree === 'BDS' ? `${g.degree} colleges` : 'All Programs'}</h3>
      {g.groups.map((yg) => <div key={yg.year || 'no-year'} className="mb-4 space-y-3 last:mb-0">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{yg.year || 'All Years'}</h4>
        {yg.items.map((exam) => <div key={exam.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-admin-exam-${exam.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-bold">{exam.title}</h3><Badge tone={exam.status === 'published' ? 'green' : exam.status === 'archived' ? 'red' : 'amber'}>{exam.status}</Badge></div><div className="mt-1 text-[11px] text-muted-foreground">{exam.programTargetKind || 'All Programs'} · {exam.yearTargetNumber ? `Year ${exam.yearTargetNumber}` : 'All Years'} · {exam.durationMinutes} min · {exam.questionCount} questions · {exam.attemptCount} attempts</div></div>
          <div className="flex flex-wrap gap-2">{exam.status === 'draft' && <button onClick={() => update.mutate({ id: exam.id, body: { status: 'published' } })} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground" data-testid={`button-publish-exam-${exam.id}`}>Publish</button>}{exam.resultReleaseMode === 'manual' && <button onClick={() => examsAdminApi.releaseAll(exam.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-release-exam-${exam.id}`}>Release results</button>}<button onClick={() => setEditingId(editingId === exam.id ? null : exam.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-edit-exam-${exam.id}`}><Pencil size={12} /> {editingId === exam.id ? 'Close edit' : 'Edit'}</button><button onClick={() => setManagingId(managingId === exam.id ? null : exam.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-manage-exam-${exam.id}`}>{managingId === exam.id ? 'Close' : 'Manage questions & results'}</button>{exam.status !== 'archived' && <button onClick={() => archive.mutate(exam.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-destructive" data-testid={`button-archive-exam-${exam.id}`}>Archive</button>}<button onClick={() => exam.status === 'archived' && setDeletingId(exam.id)} disabled={exam.status !== 'archived'} title={exam.status !== 'archived' ? 'Archive this exam first, then Delete permanently erases it' : 'Permanently delete this exam'} className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-[11px] font-bold text-destructive disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-delete-exam-${exam.id}`}>Delete permanently</button></div></div>
          {editingId === exam.id && <ExamEditForm exam={exam} saving={update.isPending} onCancel={() => setEditingId(null)} onSave={(body) => update.mutate({ id: exam.id, body }, { onSuccess: () => setEditingId(null) })} />}
          {managingId === exam.id && <ExamManagePanel exam={exam} autoOpenUpload={freshlyCreatedId === exam.id} />}
        </div>)}
      </div>)}
    </div>)}
    {deletingId !== null && <ConfirmDialog title="Delete this exam permanently?" body="This erases the exam and its question list for good, along with any MCQs uploaded specifically for it — blocked automatically if it already has recorded attempts. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removePermanent.mutate({ id: deletingId })} pending={removePermanent.isPending} />}
    {forceDeleteWarning !== null && <ConfirmDialog title="This exam has recorded attempts" body={`${forceDeleteWarning.attemptCount} student attempt${forceDeleteWarning.attemptCount === 1 ? '' : 's'} — including scores and results — will be permanently erased along with the exam. This cannot be undone. Delete anyway?`} confirmLabel="Delete exam and attempts" onCancel={() => setForceDeleteWarning(null)} onConfirm={() => removePermanent.mutate({ id: forceDeleteWarning.id, force: true })} pending={removePermanent.isPending} />}
  </div>;
}

export default AdminExams;

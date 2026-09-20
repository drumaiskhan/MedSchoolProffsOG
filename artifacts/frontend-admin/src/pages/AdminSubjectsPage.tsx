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
import { AdminImageUpload, CollapsibleGroup, ConfirmDialog, EmptyState, SectionHeader, groupByProgramYear } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

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
  // Program/Year layer above the per-module groups — same grouping
  // (groupByProgramYear) and same collapsed-by-default UX as the MCQ
  // bank/flashcard bank trees: click "MBBS · Year 1" open to see its
  // modules underneath.
  const yearGroups = groupByProgramYear(groupIds.map((id) => {
    const m = modules.find((mod) => mod.id === id);
    return { key: id, program: m?.programTargetKind ?? null, year: m?.yearTargetNumber ?? null };
  }));
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
    <div className="space-y-6">{yearGroups.map(({ programLabel, yearLabel, groups }) => {
      const yearKey = `${programLabel}-${yearLabel}`;
      const yearCount = groups.reduce((n, g) => n + (grouped.get(g.key)?.length ?? 0), 0);
      return <CollapsibleGroup key={yearKey} defaultOpen={false} icon={<GraduationCap size={14} className="mr-0.5 text-primary" />} count={yearCount} title={`${programLabel} · ${yearLabel}`} testId={`subjects-year-${yearKey}`}>
        <div className="space-y-4">{groups.map(({ key: moduleId }) => { const list = grouped.get(moduleId)!; return <CollapsibleGroup key={moduleId} nested defaultOpen count={list.length} title={moduleName(moduleId)} testId={`subjects-module-${moduleId}`}>
          <div className="space-y-2">{list.map((s, i) => <div key={s.id} className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 p-3">
              <div className="flex shrink-0 flex-col">
                <button type="button" disabled={i === 0 || reorderSubjects.isPending} onClick={() => moveSubject(moduleId, i, -1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-up-subject-${s.id}`} aria-label="Move up"><ChevronUp size={12} /></button>
                <button type="button" disabled={i === list.length - 1 || reorderSubjects.isPending} onClick={() => moveSubject(moduleId, i, 1)} className="grid size-4 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-move-down-subject-${s.id}`} aria-label="Move down"><ChevronDown size={12} /></button>
              </div>
              {s.iconUrl && <img src={resolveUploadUrl(s.iconUrl)} alt="" loading="lazy" decoding="async" className="size-8 shrink-0 rounded-lg object-cover" data-testid={`img-subject-thumbnail-${s.id}`} />}
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
        </CollapsibleGroup>; })}</div>
      </CollapsibleGroup>;
    })}</div>
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

export default AdminSubjectsPage;

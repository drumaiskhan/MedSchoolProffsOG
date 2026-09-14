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
import { CollapsibleGroup, ConfirmDialog, EmptyState, SectionHeader } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

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
    <div className="space-y-6">{groupIds.map((subjectId) => { const list = grouped.get(subjectId)!; return <CollapsibleGroup key={subjectId} defaultOpen count={list.length} title={subjectLabel(subjectId)} testId={`topics-subject-${subjectId}`}>
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
    </CollapsibleGroup>; })}</div>
    <form onSubmit={(e) => { e.preventDefault(); if (newSubjectId && newTopicName.trim()) createTopic.mutate({ subjectId: Number(newSubjectId), name: newTopicName.trim(), active: true }); }} className="mt-6 space-y-2 rounded-xl border border-dashed border-border p-4">
      <div className="text-xs font-bold">Add topic</div>
      <select required value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value ? Number(e.target.value) : '')} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-new-topic-subject"><option value="">Choose a subject…</option>{subjects.map((s) => <option key={s.id} value={s.id}>{subjectLabel(s.id)}</option>)}</select>
      <div className="flex gap-2"><input value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="Topic name" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-add-topic" /><button disabled={createTopic.isPending || !newSubjectId || !newTopicName.trim()} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-add-topic">Add</button></div>
    </form>
    {deletingTopicId !== null && <ConfirmDialog title="Delete this topic?" body="MCQs already tagged to it are kept but will need a new home." onCancel={() => setDeletingTopicId(null)} onConfirm={() => removeTopic.mutate(deletingTopicId)} pending={removeTopic.isPending} />}
  </div>;
}

export default AdminTopicsPage;

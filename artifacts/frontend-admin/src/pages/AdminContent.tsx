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
import { AddModuleForm, BlockForm, ConfirmDialog, EmptyState, ModuleRow, SectionHeader, SkeletonPage, cn, groupByProgramYear } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

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
  // Program/Year groups (MBBS · Year 1, etc.) — collapsed by default, same
  // pattern as McqBankTree/FlashcardBankTree's top-level grouping, so this
  // page reads the same way: click a year open to see its blocks/modules.
  const [yearOpen, setYearOpen] = useState<Set<string>>(new Set());

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

  // Group every block (even empty ones — they still need to show up
  // somewhere) and every unassigned (blockless) module under its
  // Program/Year, same as McqBankTree/FlashcardBankTree do for the
  // question/flashcard banks — a block with no targeting of its own falls
  // back to whatever one of its modules says, so "I tagged the modules as
  // MBBS Year 1 but never touched the block" still lands under MBBS ·
  // Year 1 instead of Unspecified.
  type BlockLeaf = { key: string; kind: 'block'; block: AdminBlock; program: string | null; year: number | null };
  type ModuleLeaf = { key: string; kind: 'module'; module: AdminModule; program: string | null; year: number | null };
  const blockLeaves: BlockLeaf[] = blocks.map((b) => {
    const list = modulesByBlock.get(b.id) ?? [];
    const fallback = list.find((m) => m.programTargetKind || m.yearTargetNumber);
    return { key: `block-${b.id}`, kind: 'block', block: b, program: b.programTargetKind || fallback?.programTargetKind || null, year: b.yearTargetNumber ?? fallback?.yearTargetNumber ?? null };
  });
  const standaloneLeaves: ModuleLeaf[] = unassigned.map((m) => ({ key: `module-${m.id}`, kind: 'module', module: m, program: m.programTargetKind || null, year: m.yearTargetNumber ?? null }));
  const yearGroups = groupByProgramYear<BlockLeaf | ModuleLeaf>([...blockLeaves, ...standaloneLeaves]);

  const loading = modulesQ.isLoading || blocksQ.isLoading;

  const renderBlockCard = (b: (typeof blocks)[number]) => {
    const list = modulesByBlock.get(b.id) ?? [];
    const bi = blocks.findIndex((x) => x.id === b.id);
    const isCollapsed = collapsed.has(b.id);
    return <div key={b.id} className="rounded-2xl border border-border bg-card" data-testid={`section-block-${b.id}`}>
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => setCollapsed((s) => { const next = new Set(s); if (next.has(b.id)) next.delete(b.id); else next.add(b.id); return next; })} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" data-testid={`button-toggle-block-${b.id}`}><ChevronRight size={16} className={cn('transition-transform', !isCollapsed && 'rotate-90')} /></button>
        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef7f1] text-primary">{b.iconUrl ? <img src={b.iconUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <Library size={16} />}</div>
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
  };


  return <div>
    <SectionHeader eyebrow="Curriculum operations" title="Academic content" action={<div className="flex gap-2">
      <button onClick={() => setOpenBlockForm(true)} className="inline-flex items-center gap-2 rounded-xl border border-primary/40 px-4 py-2.5 text-xs font-extrabold text-primary" data-testid="button-create-block"><Plus size={15} /> Add block</button>
      <button onClick={() => setOpenModuleFormFor('unassigned')} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-create-module"><Plus size={15} /> Add module</button>
    </div>} />
    {openBlockForm && <BlockForm pending={createBlock.isPending} onCancel={() => setOpenBlockForm(false)} onSubmit={(body) => createBlock.mutate(body, { onSuccess: () => setOpenBlockForm(false) })} />}

    {loading ? <SkeletonPage /> : (!blocks.length && !modules.length) ? <EmptyState icon={Library} title="No modules yet" body="Add your first block or module above to start building the curriculum." /> : <div className="space-y-5">
      {openModuleFormFor === 'unassigned' && <div className="rounded-2xl border border-border bg-card p-4"><AddModuleForm blockId={null} onCreate={createModule} onDone={() => setOpenModuleFormFor(null)} /></div>}
      {yearGroups.map(({ programLabel, yearLabel, groups }) => {
        const groupKey = `${programLabel}-${yearLabel}`;
        const isOpen = yearOpen.has(groupKey);
        const blockGroups = groups.filter((g): g is BlockLeaf => g.kind === 'block');
        const moduleGroups = groups.filter((g): g is ModuleLeaf => g.kind === 'module');
        const totalModules = blockGroups.reduce((n, g) => n + (modulesByBlock.get(g.block.id)?.length ?? 0), 0) + moduleGroups.length;
        return <div key={groupKey} className="rounded-2xl border border-border bg-card" data-testid={`section-year-${groupKey}`}>
          <button type="button" onClick={() => setYearOpen((s) => { const next = new Set(s); if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey); return next; })} className="flex w-full items-center gap-3 p-4 text-left" data-testid={`button-toggle-year-${groupKey}`}>
            <ChevronRight size={18} className={cn('shrink-0 text-primary transition-transform', isOpen && 'rotate-90')} />
            <GraduationCap size={17} className="shrink-0 text-primary" />
            <span className="flex-1 text-sm font-extrabold" data-testid={`text-year-group-${groupKey}`}>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></span>
            <span className="text-[11px] text-muted-foreground">{totalModules} module{totalModules === 1 ? '' : 's'}</span>
          </button>
          {isOpen && <div className="space-y-5 border-t border-border p-4">
            {blockGroups.map((g) => renderBlockCard(g.block))}
            {!!moduleGroups.length && <div className="rounded-2xl border border-dashed border-border bg-card" data-testid={`section-year-unassigned-${groupKey}`}>
              <div className="p-4 text-sm font-extrabold text-muted-foreground">Modules not in a block</div>
              <div className="border-t border-border">{renderModuleGroup(moduleGroups.map((g) => g.module))}</div>
            </div>}
          </div>}
        </div>;
      })}
    </div>}

    {deletingId !== null && <ConfirmDialog title="Permanently delete this module?" body="This erases the module and its subjects/topics for good — MCQs and flashcards filed under it stay in their banks, just unassigned. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removeModulePermanent.mutate(deletingId)} pending={removeModulePermanent.isPending} />}
    {deletingBlockId !== null && <ConfirmDialog title="Permanently delete this block?" body="Modules inside it are kept — they move to Unassigned, not deleted. There is no undo for the block itself." confirmLabel="Delete forever" onCancel={() => setDeletingBlockId(null)} onConfirm={() => removeBlockPermanent.mutate(deletingBlockId)} pending={removeBlockPermanent.isPending} />}
  </div>;
}

// Inline subject/topic builder shown inside a module row on the Academic
// content screen — lets an admin build out a module's curriculum (subjects,
// then topics within each subject) without leaving the module list.

export default AdminContent;

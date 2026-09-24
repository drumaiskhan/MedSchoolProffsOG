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
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, analyticsApi, mcqImportApi, flashcardImportApi, mcqBackupApi, flashcardBackupApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, subjectAdminApi, topicAdminApi, flashcardsAdminApi, flashcardsAiApi, booksAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blockAdminApi, examsAdminApi, examsApi, explanationsApi, auditApi, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type FlashcardCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type TeamCategory, type AdminModule, type AdminBlock, type AdminSubject, type AdminTopic, type AdminFlashcard, type GeneratedFlashcard, type AdminMcqRow, type AdminBook, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type BankAccount, type PaymentMethodConfig, aiVisualizerAdminApi, type AiVisualizerLogEntry, type AuditLogEntry, type BackupScope } from '@/lib/api';

// Round 3, item 10 (performance) — same over-fetching fix as the student
// app (see its App.tsx for the full rationale): `new QueryClient()` with no
// options refetched on every mount and every window refocus. Admin
// mutations already call invalidateQueries on the specific keys they
// change, so edits still show up immediately — this only avoids redundant
// background refetches of data nothing has touched.
import { ConfirmDialog, EmptyState, FlashcardBankTree, SectionHeader, SkeletonPage, cn, groupBlocksForPicker, BackupScopePicker, ProgramYearFilter, filterBlocksByProgramYear, studyYearToNumber } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

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
  // Program (MBBS/BDS) + Year filter, ahead of Block — picking a program
  // narrows Year to that program's own years (5 for MBBS, 4 for BDS via
  // DEGREE_YEAR_OPTIONS), and narrows the Block/Module picker below to
  // just that branch, same as groupBlocksForPicker's optgroups but as an
  // explicit two-step filter instead of scanning every optgroup by hand.
  const [programFilter, setProgramFilter] = useState('');
  const [studyYearFilter, setStudyYearFilter] = useState('');
  const filteredBlocks = filterBlocksByProgramYear(blocks, allModules, programFilter, studyYearToNumber(programFilter, studyYearFilter));
  const [blockId, setBlockId] = useState('');
  const modules = blockId ? allModules.filter((m) => String(m.blockId ?? '') === blockId) : allModules;
  const [moduleId, setModuleId] = useState('');
  // Changing Program/Year invalidates whatever Block/Module/Subject/Topic
  // was already picked (it may no longer be in the filtered branch), same
  // "reset everything below" pattern the Block select itself already uses.
  const resetPickerBelowProgramYear = () => { setBlockId(''); setModuleId(''); setSubjectId(''); setTopicId(''); };
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

  // Bulk upload from a file — same "upload, parse, review, commit" flow as
  // AdminMcqs' file importer, minus the profile picker (a flashcard is just
  // front/back, so there's no regex pattern to customize).
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FlashcardCandidate[]>([]);
  const importCommit = useMutation({
    mutationFn: () => flashcardImportApi.commit({ moduleId: Number(moduleId), subjectId: Number(subjectId), topicId: Number(topicId), module: moduleName, topic: topicName, cards: candidates.filter((c) => c.front.trim() && c.back.trim()) }),
    onSuccess: (res) => { invalidate(); setCandidates([]); setFile(null); toast({ title: `Imported ${res.imported} flashcard${res.imported === 1 ? '' : 's'}`, description: 'Saved to the flashcard bank.' }); },
    onError: (err: unknown) => toast({ title: 'Import failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const parseFile = async () => {
    if (!file) return;
    setParsing(true); setParseError(null);
    try {
      const result = await flashcardImportApi.parse(file);
      setCandidates(result.candidates);
    } catch (err) {
      setParseError(err instanceof ApiRequestError ? err.message : 'Could not parse this file.');
    } finally {
      setParsing(false);
    }
  };
  const updateCandidate = (index: number, patch: Partial<FlashcardCandidate>) => setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const removeCandidate = (index: number) => setCandidates((prev) => prev.filter((_, i) => i !== index));
  const importAll = () => {
    if (!targetReady || !candidates.filter((c) => c.front.trim() && c.back.trim()).length) return;
    importCommit.mutate();
  };

  // Whole-bank backup/restore — separate from the file-import flow above
  // (which parses loosely-formatted front/back text). This exports/restores
  // every flashcard field verbatim as one JSON file, optionally narrowed to
  // one Year/Block/Module/Subject/Topic branch via backupScope (null =
  // whole bank) — same shape and UX as AdminMcqs' own Backup / restore panel.
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupScope, setBackupScope] = useState<BackupScope | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupMode, setBackupMode] = useState<'append' | 'replace'>('append');
  const [backupConfirmOpen, setBackupConfirmOpen] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const downloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      await flashcardBackupApi.downloadBackup(backupScope);
    } catch (err) {
      toast({ title: 'Could not download backup', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' });
    } finally {
      setDownloadingBackup(false);
    }
  };
  const restoreBackup = useMutation({
    mutationFn: () => flashcardBackupApi.importBackup(backupFile!, backupMode),
    onSuccess: (res) => {
      invalidate();
      setBackupFile(null);
      setBackupConfirmOpen(false);
      const scopeNote = res.scope ? ` (${res.scope.label})` : '';
      toast({ title: `Restored ${res.restored} flashcard${res.restored === 1 ? '' : 's'}${scopeNote}`, description: res.mode === 'replace' ? `Replaced ${res.scope ? 'that branch' : 'the whole bank'} (${res.deletedFirst} previous flashcard${res.deletedFirst === 1 ? '' : 's'} removed first).` : 'Added alongside the existing bank.' });
    },
    onError: (err: unknown) => { setBackupConfirmOpen(false); toast({ title: 'Restore failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }); },
  });

  return <div><SectionHeader eyebrow="Study tools" title="Flashcards" action={<div className="flex items-center gap-2"><button onClick={() => { setUploadOpen((v) => !v); setAiOpen(false); setOpen(false); }} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold" data-testid="button-toggle-upload-flashcards"><FileText size={15} /> {uploadOpen ? 'Close' : 'Upload file'}</button><button onClick={() => { setAiOpen((v) => !v); setOpen(false); setUploadOpen(false); }} className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs font-extrabold text-primary" data-testid="button-toggle-ai-flashcards"><Sparkles size={15} /> {aiOpen ? 'Close' : 'Generate with AI'}</button><button onClick={() => { setOpen((v) => !v); setAiOpen(false); setUploadOpen(false); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-flashcard"><Plus size={15} /> {open ? 'Close' : 'Add flashcard'}</button></div>} />
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"><span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Program &amp; year</span><ProgramYearFilter program={programFilter} studyYear={studyYearFilter} onProgramChange={(v) => { setProgramFilter(v); resetPickerBelowProgramYear(); }} onStudyYearChange={(v) => { setStudyYearFilter(v); resetPickerBelowProgramYear(); }} testIdPrefix="flashcard-filter" /><span className="text-[11px] text-muted-foreground">Narrows the Block/Module/Subject/Topic pickers below to MBBS or BDS and, optionally, one year.</span></div>
    {uploadOpen && <div className="mb-5 rounded-3xl border border-primary/30 bg-primary/10 p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileText size={18} /></div><div><h3 className="text-sm font-extrabold">Bulk upload from a file</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Upload a flashcard set as .txt, .csv, .xlsx/.xls, .pdf, or .docx. We'll extract front/back pairs automatically — review and fix anything before it's added to the bank.</p></div></div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4"><select value={blockId} onChange={(e) => { setBlockId(e.target.value); setModuleId(''); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-upload-flashcard-block"><option value="">All blocks</option>{groupBlocksForPicker(filteredBlocks, allModules).map((g) => <optgroup key={`${g.programLabel}-${g.yearLabel}`} label={`${g.programLabel} · ${g.yearLabel}`}>{g.blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>)}</select><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-upload-flashcard-module"><option value="">Select module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-upload-flashcard-subject"><option value="">Select subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-upload-flashcard-topic"><option value="">Select topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      {!targetReady && <p className="mt-2 text-[11px] font-semibold text-accent-text">Pick a module, subject, and topic before uploading — every imported flashcard needs a home.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="file" accept=".txt,.csv,.xlsx,.xls,.pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="flex-1 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-xs" data-testid="input-flashcard-file" />
        <button disabled={!file || parsing} onClick={parseFile} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-parse-flashcard-file">{parsing ? 'Reading file…' : 'Parse file'}</button>
      </div>
      {parseError && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-flashcard-parse-error">{parseError}</div>}

      {candidates.length > 0 && <div className="mt-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="text-xs font-bold">{candidates.length} flashcards found · {candidates.filter((c) => c.needsReview).length} need review</div><button disabled={!targetReady || importCommit.isPending} onClick={importAll} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-import-all-flashcards">{importCommit.isPending ? 'Importing…' : `Import ${candidates.length} flashcards`}</button></div>
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">{candidates.map((c, i) => <div key={i} className={cn('rounded-2xl border bg-card p-4', c.needsReview ? 'border-accent' : 'border-border')} data-testid={`card-flashcard-candidate-${i}`}>
          <div className="flex items-center justify-between"><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', c.needsReview ? 'bg-accent/20 text-accent-text' : 'bg-primary/15 text-primary')}>{c.needsReview ? 'Needs review' : 'Looks good'}</span><button onClick={() => removeCandidate(i)} className="text-[11px] font-bold text-destructive" data-testid={`button-remove-flashcard-candidate-${i}`}>Remove</button></div>
          <textarea value={c.front} onChange={(e) => updateCandidate(i, { front: e.target.value })} placeholder="Front" className="mt-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-flashcard-candidate-front-${i}`} />
          <textarea value={c.back} onChange={(e) => updateCandidate(i, { back: e.target.value })} placeholder="Back" className="mt-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-flashcard-candidate-back-${i}`} />
        </div>)}</div>
      </div>}
    </div>}
    {aiOpen && <div className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
      <p className="text-xs text-muted-foreground">Pick a target topic below (its MCQs will be used as source material), or paste your own text. Drafts are editable — nothing saves until you review and click "Save all".</p>
      <div className="grid gap-2 sm:grid-cols-4"><select value={blockId} onChange={(e) => { setBlockId(e.target.value); setModuleId(''); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-ai-flashcard-block"><option value="">All blocks</option>{groupBlocksForPicker(filteredBlocks, allModules).map((g) => <optgroup key={`${g.programLabel}-${g.yearLabel}`} label={`${g.programLabel} · ${g.yearLabel}`}>{g.blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>)}</select><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-ai-flashcard-module"><option value="">Select module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-ai-flashcard-subject"><option value="">Select subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-ai-flashcard-topic"><option value="">Select topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <textarea value={aiSourceText} onChange={(e) => setAiSourceText(e.target.value)} placeholder="Optional: paste notes or a passage to generate flashcards from instead of the topic's MCQs" className="min-h-20 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-ai-flashcard-source" />
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs font-bold">How many<input type="number" min={1} max={100} value={aiCount} onChange={(e) => setAiCount(Math.max(1, Math.min(100, Number(e.target.value) || 8)))} className="h-9 w-16 rounded-lg border border-border bg-card px-2 text-xs" data-testid="input-ai-flashcard-count" /></label><button onClick={() => generateDrafts.mutate()} disabled={generateDrafts.isPending || (!topicId && !aiSourceText.trim())} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-generate-flashcard-drafts"><Sparkles size={13} /> {generateDrafts.isPending ? 'Generating…' : 'Generate drafts'}</button>{!topicId && !aiSourceText.trim() && <span className="text-[11px] text-muted-foreground">Pick a topic or paste text first.</span>}</div>
      {drafts && <div className="space-y-3 border-t border-border pt-4">
        {!targetReady && <p className="text-[11px] font-semibold text-accent-text">Select a module, subject, and topic above before saving — drafts need a home.</p>}
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
    }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
      <div className="grid gap-2 sm:grid-cols-4"><select value={blockId} onChange={(e) => { setBlockId(e.target.value); setModuleId(''); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-flashcard-block"><option value="">All blocks</option>{groupBlocksForPicker(filteredBlocks, allModules).map((g) => <optgroup key={`${g.programLabel}-${g.yearLabel}`} label={`${g.programLabel} · ${g.yearLabel}`}>{g.blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>)}</select><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-flashcard-module"><option value="">Select module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-flashcard-subject"><option value="">Select subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-flashcard-topic"><option value="">Select topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      {!targetReady && <p className="text-[11px] font-semibold text-accent-text">Pick a module, subject, and topic before saving — every flashcard needs a home.</p>}
      <textarea name="front" required placeholder="Front of card — the question or prompt" className="min-h-16 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-flashcard-front" />
      <textarea name="back" required placeholder="Back of card — the answer" className="min-h-16 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-flashcard-back" />
      <button disabled={!targetReady || create.isPending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-flashcard">{create.isPending ? 'Saving…' : 'Save flashcard'}</button>
    </form>}
    {cardsQ.isLoading ? <SkeletonPage /> : <div className="mt-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{cards.length} flashcards</h3><div className="flex flex-wrap items-center gap-2"><button onClick={() => setBackupOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold transition-transform active:scale-95" data-testid="button-toggle-flashcard-backup"><Database size={13} className={cn('transition-transform duration-300', backupOpen && 'rotate-180')} /> Backup / restore</button><div className="flex overflow-hidden rounded-xl border border-border text-xs font-bold"><button onClick={() => setBankView('tree')} className={cn('px-3 py-2', bankView === 'tree' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-flashcard-view-tree">MBBS/BDS tree</button><button onClick={() => setBankView('flat')} className={cn('px-3 py-2', bankView === 'flat' ? 'bg-primary text-primary-foreground' : 'bg-card')} data-testid="button-flashcard-view-flat">Flat list</button></div></div></div>

      {backupOpen && <div className="mb-4 space-y-4 rounded-2xl border border-border bg-card p-5 animate-in fade-in slide-in-from-top-2 duration-300">
        <div>
          <p className="text-xs font-bold">Backup flashcard bank</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Downloads flashcards as one JSON file you can keep as a snapshot or move to another environment, with every field (module/subject/topic placement, active/archived state) intact.</p>
          <div className="mt-3"><BackupScopePicker blocks={blocks} allModules={allModules} onChange={setBackupScope} /></div>
          <p className="mt-2 text-[11px] text-muted-foreground">{backupScope ? <>Backing up just <span className="font-semibold text-foreground">{backupScope.label}</span>.</> : 'Backing up the whole bank.'}</p>
          <button disabled={downloadingBackup} onClick={downloadBackup} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100" data-testid="button-download-flashcard-backup">{downloadingBackup ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {downloadingBackup ? 'Preparing…' : 'Download backup'}</button>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-bold">Import backed-up flashcards</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Restore a backup JSON file made by the button above. Every flashcard comes back with its original module/subject/topic placement — no need to pick a target first. A backup made for one Year/Block/Module/Subject/Topic only affects that same branch, even in Replace mode.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input type="file" accept=".json,application/json" onChange={(e) => setBackupFile(e.target.files?.[0] ?? null)} className="flex-1 rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-xs transition-colors focus-within:border-primary" data-testid="input-flashcard-backup-file" />
            <select value={backupMode} onChange={(e) => setBackupMode(e.target.value as 'append' | 'replace')} className="h-10 rounded-xl border border-border bg-background px-3 text-xs transition-colors focus:border-primary" data-testid="select-flashcard-backup-mode">
              <option value="append">Add alongside existing bank</option>
              <option value="replace">Replace (that backup's scope, or the entire bank if it has none)</option>
            </select>
            <button disabled={!backupFile || restoreBackup.isPending} onClick={() => setBackupConfirmOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100" data-testid="button-restore-flashcard-backup">{restoreBackup.isPending && <Loader2 size={13} className="animate-spin" />} {restoreBackup.isPending ? 'Restoring…' : 'Import backup'}</button>
          </div>
          {backupFile && !restoreBackup.isPending && <p className="mt-2 text-[11px] text-muted-foreground animate-in fade-in duration-200">Selected: <span className="font-semibold text-foreground">{backupFile.name}</span></p>}
          {backupMode === 'replace' && <p className="mt-2 text-[11px] font-semibold text-destructive animate-in fade-in duration-200">Replace deletes every existing flashcard in that branch before restoring — or the entire bank, if the file is a whole-bank backup. This can't be undone.</p>}
        </div>
      </div>}
      {backupConfirmOpen && <ConfirmDialog
        title={backupMode === 'replace' ? 'Replace with this backup?' : 'Import this backup?'}
        body={backupMode === 'replace' ? "Every existing flashcard in this backup's branch (or the whole bank, if it was a whole-bank backup) will be permanently deleted first, then replaced with the backup file's contents." : "The backup file's flashcards will be added alongside what's already in the bank."}
        confirmLabel={backupMode === 'replace' ? 'Delete and restore' : 'Import'}
        onCancel={() => setBackupConfirmOpen(false)}
        onConfirm={() => restoreBackup.mutate()}
        pending={restoreBackup.isPending}
      />}


      {bankView === 'tree' ? <FlashcardBankTree modules={allModules} blocks={blocks} /> : (cards.length ? <div className="space-y-3">
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === cards.length} onChange={toggleSelectAll} data-testid="checkbox-select-all-flashcards" />{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</label>{selectedIds.size > 0 && <button onClick={() => setBulkDeleteOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-bold text-destructive" data-testid="button-bulk-delete-flashcards"><Trash2 size={12} /> Delete selected</button>}</div>
        <div className="rounded-2xl border border-border bg-card">{cards.map((c) => <div key={c.id} className="flex items-start gap-4 border-b border-border p-5 last:border-0" data-testid={`row-flashcard-${c.id}`}>
          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} className="mt-1" data-testid={`checkbox-select-flashcard-${c.id}`} />
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-text"><Zap size={17} /></div>
          <div className="flex-1"><div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{c.module}{c.topic ? ` · ${c.topic}` : ''}</div><div className="mt-1 text-sm font-bold">{c.front}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{c.back}</div></div>
          <button onClick={() => setDeletingId(c.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-flashcard-${c.id}`}><Trash2 size={15} /></button>
        </div>)}</div>
      </div> : <EmptyState icon={Zap} title="No flashcards yet" body="Add your first flashcard above — students can study them from their Flashcards tab." />)}
    </div>}
    {deletingId !== null && <ConfirmDialog title="Delete this flashcard?" body="This cannot be undone." onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
    {bulkDeleteOpen && <ConfirmDialog title={`Delete ${selectedIds.size} selected flashcard${selectedIds.size === 1 ? '' : 's'}?`} body="This cannot be undone." confirmLabel="Delete selected" onCancel={() => setBulkDeleteOpen(false)} onConfirm={() => bulkDelete.mutate(Array.from(selectedIds))} pending={bulkDelete.isPending} />}
  </div>;
}

export default AdminFlashcards;

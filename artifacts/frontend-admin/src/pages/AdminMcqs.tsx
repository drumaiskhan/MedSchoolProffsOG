// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useSearch, useParams, Router as WouterRouter } from 'wouter';
import {ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, ChevronUp, ChevronDown, CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen, LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus, ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2, TrendingUp, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark, Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash, GraduationCap, CalendarDays, Eye, EyeOff, Smartphone, UploadCloud, ImageOff, RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Activity, Layers, BarChart3, ToggleLeft, Download, Database, Loader2, Shuffle} from 'lucide-react';
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
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, analyticsApi, mcqImportApi, flashcardImportApi, mcqBackupApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, subjectAdminApi, topicAdminApi, flashcardsAdminApi, flashcardsAiApi, booksAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blockAdminApi, examsAdminApi, examsApi, explanationsApi, auditApi, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type FlashcardCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type TeamCategory, type AdminModule, type AdminBlock, type AdminSubject, type AdminTopic, type AdminFlashcard, type GeneratedFlashcard, type AdminMcqRow, type AdminBook, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type BankAccount, type PaymentMethodConfig, aiVisualizerAdminApi, type AiVisualizerLogEntry, type AuditLogEntry, type BackupScope } from '@/lib/api';

// Round 3, item 10 (performance) — same over-fetching fix as the student
// app (see its App.tsx for the full rationale): `new QueryClient()` with no
// options refetched on every mount and every window refocus. Admin
// mutations already call invalidateQueries on the specific keys they
// change, so edits still show up immediately — this only avoids redundant
// background refetches of data nothing has touched.
import { DifficultyPicker, ExplanationCoverage, SectionHeader, cn, ConfirmDialog, McqBankTree, groupBlocksForPicker, BackupScopePicker, ProgramYearFilter, filterBlocksByProgramYear, studyYearToNumber, SuggestedPathHint } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';
import { EyeOff as IconEyeOff, FolderX as IconFolderX, ListChecks as IconListChecks } from 'lucide-react';
import { Chip, StatTiles } from '@/lib/admin-ui';

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
  // Search + explanation-status filter (the latter driven by clicking a
  // tile in ExplanationCoverage below) — applied by McqBankTree itself now
  // that the tree is the only view. `mcqs` here is only used to know which
  // ids are selectable for "select all" / bulk delete, so it excludes
  // exam-/past-paper-owned rows the same way the tree does.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExplanationStatus | null>(null);
  // v37: difficulty + published/draft filters next to the search box. Applied to
  // BOTH the tree (McqBankTree props) and `mcqs` below so "Select all" only ever
  // selects what is on screen.
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);
  const [publishFilter, setPublishFilter] = useState<'published' | 'draft' | null>(null);
  const isPublished = (m: { status: string }) => m.status.toLowerCase() === 'published';
  const mcqs = allMcqs.filter((m) =>
    m.examId === null && m.pastPaperId === null &&
    (!search.trim() || m.question.toLowerCase().includes(search.trim().toLowerCase())) &&
    (!statusFilter || m.explanationStatus === statusFilter) &&
    (!difficultyFilter || m.difficulty === difficultyFilter) &&
    (!publishFilter || (publishFilter === 'published') === isPublished(m)));
  // Bank overview (exam-/past-paper-owned rows are not part of the bank tree).
  const bankRows = allMcqs.filter((m) => m.examId === null && m.pastPaperId === null);
  const bankStats = {
    total: bankRows.length,
    published: bankRows.filter(isPublished).length,
    drafts: bankRows.filter((m) => !isPublished(m)).length,
    unassigned: bankRows.filter((m) => m.topicId === null).length,
    needExplanation: bankRows.filter((m) => m.explanationStatus === 'PENDING').length,
  };
  const anyFilter = !!(search.trim() || statusFilter || difficultyFilter || publishFilter);
  const [manualOpen, setManualOpen] = useState(false);
  // Toggle for the per-option explanation fields on the single-question
  // manual add form below — off by default so the common case (just an
  // overall explanation) stays compact, matching the "Add multiple" bulk
  // rows' own show/hide toggle for the same fields.
  const [manualShowOptionExplanations, setManualShowOptionExplanations] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const invalidateMcqs = () => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); queryClient.invalidateQueries({ queryKey: ['admin-mcqs-tree'] }); };

  // Whole-bank backup/restore — separate from the file-import flow above
  // (which parses loosely-formatted question papers). This exports/restores
  // every MCQ field verbatim as one JSON file, optionally narrowed to one
  // Year/Block/Module/Subject/Topic branch via backupScope (null = whole
  // bank, the original behavior).
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupScope, setBackupScope] = useState<BackupScope | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupMode, setBackupMode] = useState<'append' | 'replace'>('append');
  const [backupConfirmOpen, setBackupConfirmOpen] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const downloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      await mcqBackupApi.downloadBackup(backupScope);
    } catch (err) {
      toast({ title: 'Could not download backup', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' });
    } finally {
      setDownloadingBackup(false);
    }
  };
  const restoreBackup = useMutation({
    mutationFn: () => mcqBackupApi.importBackup(backupFile!, backupMode),
    onSuccess: (res) => {
      invalidateMcqs();
      setBackupFile(null);
      setBackupConfirmOpen(false);
      const scopeNote = res.scope ? ` (${res.scope.label})` : '';
      toast({ title: `Restored ${res.restored} question${res.restored === 1 ? '' : 's'}${scopeNote}`, description: res.mode === 'replace' ? `Replaced ${res.scope ? 'that branch' : 'the whole bank'} (${res.deletedFirst} previous question${res.deletedFirst === 1 ? '' : 's'} removed first).` : 'Added alongside the existing bank.' });
    },
    onError: (err: unknown) => { setBackupConfirmOpen(false); toast({ title: 'Restore failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }); },
  });

  // Multi-select for bulk delete — now lives in the MBBS/BDS tree itself
  // (a checkbox on every question row), with the "Delete selected" action
  // pinned to a sticky bar at the top of the bank so it's always in reach
  // no matter how deep/long the tree is scrolled.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteMode, setBulkDeleteMode] = useState<'selected' | null>(null);
  const toggleSelected = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleSelectAll = () => setSelectedIds((prev) => prev.size === mcqs.length && mcqs.length > 0 ? new Set() : new Set(mcqs.map((m) => m.id)));
  const bulkDelete = useMutation({
    mutationFn: (ids: number[]) => mcqAdminApi.bulkRemove({ ids }),
    onSuccess: (res) => { invalidateMcqs(); setSelectedIds(new Set()); setBulkDeleteMode(null); toast({ title: `Deleted ${res.deleted} question${res.deleted === 1 ? '' : 's'}` }); },
    onError: (err: unknown) => toast({ title: 'Bulk delete failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  // Shuffles option order on just the checked questions — the same fix as
  // AnalysisPanel's scope-wide "Shuffle option order" button, but for an
  // explicit hand-picked selection instead of a whole module/subject/topic.
  // correctAnswer is never touched (see /admin/mcqs/shuffle-options), so
  // the correct option just moves to wherever it lands after the reorder.
  const bulkShuffle = useMutation({
    mutationFn: (ids: number[]) => mcqAdminApi.shuffleOptions({ ids }),
    onSuccess: (res) => { invalidateMcqs(); setSelectedIds(new Set()); toast({ title: `Shuffled options on ${res.shuffled} question${res.shuffled === 1 ? '' : 's'}`, description: res.skipped ? `${res.skipped} skipped (fewer than 2 options).` : undefined }); },
    onError: (err: unknown) => toast({ title: 'Shuffle failed', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
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
  // Program (MBBS/BDS) + Year filter, ahead of Block — picking a program
  // narrows Year to that program's own years (5 for MBBS, 4 for BDS via
  // DEGREE_YEAR_OPTIONS), and narrows the Block/Module picker below to
  // just that branch, same as groupBlocksForPicker's optgroups but as an
  // explicit two-step filter instead of scanning every optgroup by hand.
  const [programFilter, setProgramFilter] = useState('');
  const [studyYearFilter, setStudyYearFilter] = useState('');
  const filteredBlocks = filterBlocksByProgramYear(blocks, allModules, programFilter, studyYearToNumber(programFilter, studyYearFilter));
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
  // Changing Program/Year invalidates whatever Block/Module/Subject/Topic
  // was already picked (it may no longer be in the filtered branch), same
  // "reset everything below" pattern the Block select itself already uses.
  const resetPickerBelowProgramYear = () => { setBlockId(''); setModuleId(''); setSubjectId(''); setTopicId(''); };

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
  // Defaults to "published" (used to be "draft") — see CommitBody.status in
  // mcq-import.ts. Draft is still one click away in the dropdown below for
  // an admin who actually wants a review pass before questions go live.
  const [importStatus, setImportStatus] = useState<'draft' | 'published'>('published');
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
    <StatTiles items={[
      { label: 'In the bank', value: bankStats.total.toLocaleString(), icon: IconListChecks, tone: 'green', testId: 'stat-mcq-total' },
      { label: 'Published', value: bankStats.published.toLocaleString(), icon: CheckCircle2, tone: 'blue', testId: 'stat-mcq-published' },
      { label: 'Drafts', value: bankStats.drafts.toLocaleString(), icon: IconEyeOff, tone: bankStats.drafts ? 'amber' : 'neutral', hint: 'Not visible to students', testId: 'stat-mcq-drafts' },
      { label: 'Unassigned', value: bankStats.unassigned.toLocaleString(), icon: IconFolderX, tone: bankStats.unassigned ? 'amber' : 'neutral', hint: 'No topic yet — students cannot practise these by topic', testId: 'stat-mcq-unassigned' },
      { label: 'Need explanation', value: bankStats.needExplanation.toLocaleString(), icon: FileText, tone: bankStats.needExplanation ? 'violet' : 'neutral', hint: 'Explanation status: pending', testId: 'stat-mcq-pending' },
    ]} />
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"><span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Program &amp; year</span><ProgramYearFilter program={programFilter} studyYear={studyYearFilter} onProgramChange={(v) => { setProgramFilter(v); resetPickerBelowProgramYear(); }} onStudyYearChange={(v) => { setStudyYearFilter(v); resetPickerBelowProgramYear(); }} testIdPrefix="mcq-filter" /><span className="text-[11px] text-muted-foreground">Narrows the Block/Module/Subject/Topic pickers below to MBBS or BDS and, optionally, one year.</span></div>

    <div className="rounded-3xl border border-primary/30 bg-primary/10 p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileText size={18} /></div><div><h3 className="text-sm font-extrabold">Bulk upload from a file</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Upload a question bank as .txt, .csv, .xlsx/.xls, .pdf, or .docx. We'll extract the questions automatically — review and fix anything before it's added to the bank.</p></div></div>

      <div className="mt-5 grid gap-3 sm:grid-cols-5"><select value={blockId} onChange={(e) => { setBlockId(e.target.value); setModuleId(''); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-block"><option value="">All blocks</option>{groupBlocksForPicker(filteredBlocks, allModules).map((g) => <optgroup key={`${g.programLabel}-${g.yearLabel}`} label={`${g.programLabel} · ${g.yearLabel}`}>{g.blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>)}</select><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-module"><option value="">Select module</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-import-subject"><option value="">Select subject</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-card px-3 text-xs disabled:opacity-50" data-testid="select-import-topic"><option value="">Select topic</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><select value={pastPaperId} onChange={(e) => setPastPaperId(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-past-paper"><option value="">No past paper (optional)</option>{(pastPapersQ.data || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      {!targetReady && <p className="mt-2 text-[11px] font-semibold text-accent-text">Pick a module, subject, and topic before uploading — every imported question needs a home.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="file" accept=".txt,.csv,.xlsx,.xls,.pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="flex-1 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-xs" data-testid="input-mcq-file" />
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-import-profile"><option value="">Default pattern (numbered Q, A–E options)</option>{(profiles.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button onClick={() => setProfilesOpen((v) => !v)} className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold" data-testid="button-toggle-profiles">Custom patterns</button>
        <button disabled={!file || parsing} onClick={parseFile} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-parse-file">{parsing ? 'Reading file…' : 'Parse file'}</button>
      </div>
      {parseError && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-parse-error">{parseError}</div>}

      {profilesOpen && <div className="mt-4 rounded-2xl border border-border bg-card p-4"><div className="mb-3 text-xs font-bold">Extraction patterns (regular expressions, applied case-insensitively)</div><div className="space-y-3">{(profiles.data || []).map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs"><span className="font-bold">{p.name}</span><button onClick={() => deleteProfile.mutate(p.id)} className="font-bold text-destructive" data-testid={`button-delete-profile-${p.id}`}>Delete</button></div>)}</div><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); createProfile.mutate({ name: String(f.get('name')), questionPattern: String(f.get('questionPattern')), optionPattern: String(f.get('optionPattern')), answerPattern: String(f.get('answerPattern')), explanationPattern: String(f.get('explanationPattern')), hintPattern: String(f.get('hintPattern')) || undefined, referencePattern: String(f.get('referencePattern')) || undefined, isDefault: false }, { onSuccess: () => e.currentTarget.reset() }); }} className="mt-4 space-y-2 border-t border-border pt-4"><input required name="name" placeholder="Profile name, e.g. 'KMU paper format'" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-profile-name" /><input required name="questionPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.questionPattern} placeholder="Question line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-question-pattern" /><input required name="optionPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.optionPattern} placeholder="Option line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-option-pattern" /><input required name="answerPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.answerPattern} placeholder="Answer line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-answer-pattern" /><input required name="explanationPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.explanationPattern} placeholder="Explanation line pattern" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-explanation-pattern" /><input name="hintPattern" defaultValue={DEFAULT_IMPORT_PATTERNS.hintPattern} placeholder="Hint line pattern (optional)" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-hint-pattern" /><input name="referencePattern" defaultValue={DEFAULT_IMPORT_PATTERNS.referencePattern} placeholder="Reference line pattern (optional)" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono-app" data-testid="input-profile-reference-pattern" /><button className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="button-save-profile">Save pattern set</button></form></div>}

      {candidates.length > 0 && <div className="mt-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="text-xs font-bold">{candidates.length} questions found · {candidates.filter((c) => c.needsReview).length} need review</div><div className="flex items-center gap-3"><select value={importStatus} onChange={(e) => setImportStatus(e.target.value as 'draft' | 'published')} className="h-9 rounded-lg border border-border bg-card px-3 text-xs" data-testid="select-import-status"><option value="published">Import &amp; publish immediately</option><option value="draft">Import as draft</option></select><button disabled={!targetReady || commit.isPending} onClick={importAll} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-import-all">{commit.isPending ? 'Importing…' : `Import ${candidates.length} questions`}</button></div></div>
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">{candidates.map((c, i) => <div key={i} className={cn('rounded-2xl border bg-card p-4', c.needsReview ? 'border-accent' : 'border-border')} data-testid={`card-candidate-${i}`}>
          <div className="flex items-center justify-between"><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', c.needsReview ? 'bg-accent/20 text-accent-text' : 'bg-primary/15 text-primary')}>{c.needsReview ? 'Needs review' : 'Looks good'}</span><button onClick={() => removeCandidate(i)} className="text-[11px] font-bold text-destructive" data-testid={`button-remove-candidate-${i}`}>Remove</button></div>
          <textarea value={c.question} onChange={(e) => updateCandidate(i, { question: e.target.value })} className="mt-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-candidate-question-${i}`} />
          <SuggestedPathHint path={c.suggestedPath} />
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
            <div className="mt-2 space-y-1.5">{c.options.map((opt, oi) => opt.trim() && <div key={oi} className="flex items-start gap-2"><span className={cn('mt-1.5 grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold', c.correctAnswer === opt ? 'bg-primary/15 text-primary' : 'bg-destructive/10 text-destructive')}>{String.fromCharCode(65 + oi)}</span><textarea value={c.optionExplanations?.[oi] ?? ''} onChange={(e) => { const next = [...(c.optionExplanations ?? c.options.map(() => null))]; next[oi] = e.target.value || null; updateCandidate(i, { optionExplanations: next }); }} placeholder={c.correctAnswer === opt ? 'Why this is correct...' : 'Why this is wrong...'} className="min-h-9 flex-1 rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-candidate-option-explanation-${i}-${oi}`} /></div>)}</div>
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
      // Bug fix: this form had no per-option explanation fields at all, so
      // a question created here (the default "single question" add flow —
      // as opposed to "Add multiple" or the AI generator, which both
      // already had these) could never carry optionExplanations. That's
      // why the student panel showed no per-option breakdown for most
      // manually-added questions: the data was simply never collected.
      // Same null-if-all-empty convention as the bulk-add rows below.
      const rawOptionExplanations = ['ea', 'eb', 'ec', 'ed', 'ee'].map((x) => String(f.get(x) || '').trim()).slice(0, options.length).map((v) => v || null);
      const optionExplanations = rawOptionExplanations.some((v) => v) ? rawOptionExplanations : null;
      create.mutate({ data: { question: String(f.get('question')), options, correctAnswer: correctAnswer ?? '', explanation: String(f.get('explanation')), optionExplanations, reference: '', difficulty: String(f.get('difficulty') || 'moderate'), moduleId: Number(moduleId), subjectId: Number(subjectId), topicId: Number(topicId) } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMcqsQueryKey() }); e.currentTarget.reset(); setManualShowOptionExplanations(false); } });
    }} className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">{!targetReady && <p className="text-[11px] font-semibold text-accent-text">Select module/subject/topic above first.</p>}<textarea name="question" required placeholder="Write the question..." className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid="input-mcq-question" /><div className="grid gap-3 sm:grid-cols-2">{['a', 'b', 'c', 'd', 'e'].map((x) => <input key={x} name={x} required={x !== 'e'} placeholder={`Option ${x.toUpperCase()}${x === 'e' ? ' (optional)' : ''}`} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid={`input-mcq-option-${x}`} />)}</div><div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs font-bold">Correct answer<select name="correct" required className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs font-normal" data-testid="select-mcq-correct"><option value="">Select the correct option</option>{['a', 'b', 'c', 'd', 'e'].map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label><label className="flex items-center gap-2 text-xs font-bold">Difficulty<select name="difficulty" defaultValue="moderate" className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs font-normal capitalize" data-testid="select-mcq-difficulty">{['easy', 'moderate', 'hard'].map((x) => <option key={x} value={x}>{x}</option>)}</select></label></div><input name="explanation" placeholder="Explanation shown after answer" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-mcq-explanation" />
      <button type="button" onClick={() => setManualShowOptionExplanations((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary" data-testid="button-toggle-manual-option-explanations"><CircleHelp size={12} /> {manualShowOptionExplanations ? 'Hide' : 'Add'} per-option explanations</button>
      {manualShowOptionExplanations && <div className="space-y-1.5 rounded-lg bg-muted/50 p-2.5">{['a', 'b', 'c', 'd', 'e'].map((x, oi) => <div key={x} className="flex items-start gap-2"><span className="mt-1.5 grid size-5 shrink-0 place-items-center rounded bg-background text-[10px] font-bold">{x.toUpperCase()}</span><textarea name={`e${x}`} placeholder={`Why option ${x.toUpperCase()} is right or wrong...`} className="min-h-9 flex-1 rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-mcq-option-explanation-${oi}`} /></div>)}</div>}
      <button disabled={!targetReady} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-mcq">Save as draft</button></form>}

    <div className="mt-8"><SectionHeader eyebrow="Question bank" title={`${allMcqs.length} questions`} action={<div className="flex flex-wrap items-center gap-2"><button onClick={() => setBulkAddOpen((v) => !v)} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold transition-transform active:scale-95" data-testid="button-toggle-bulk-add">Add multiple</button><button onClick={() => setBackupOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold transition-transform active:scale-95" data-testid="button-toggle-backup"><Database size={13} className={cn('transition-transform duration-300', backupOpen && 'rotate-180')} /> Backup / restore</button><span className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground" data-testid="text-bank-view-label">MBBS/BDS tree</span></div>} /><ExplanationCoverage onSelectStatus={(status) => setStatusFilter(status)} />

      {backupOpen && <div className="mt-4 space-y-4 rounded-2xl border border-border bg-card p-5 animate-in fade-in slide-in-from-top-2 duration-300">
        <div>
          <p className="text-xs font-bold">Backup MCQs bank</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Downloads questions as one JSON file you can keep as a snapshot or move to another environment, with every field (explanations, hints, difficulty, tags) intact.</p>
          <div className="mt-3"><BackupScopePicker blocks={blocks} allModules={allModules} onChange={setBackupScope} /></div>
          <p className="mt-2 text-[11px] text-muted-foreground">{backupScope ? <>Backing up just <span className="font-semibold text-foreground">{backupScope.label}</span>.</> : 'Backing up the whole bank — main tree, past papers, and exams alike.'}</p>
          <button disabled={downloadingBackup} onClick={downloadBackup} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100" data-testid="button-download-backup">{downloadingBackup ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {downloadingBackup ? 'Preparing…' : 'Download backup'}</button>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-bold">Import backed-up MCQs</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Restore a backup JSON file made by the button above. Every question comes back with its original module/subject/topic (or past paper/exam) placement — no need to pick a target first. A backup made for one Year/Block/Module/Subject/Topic only affects that same branch, even in Replace mode.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input type="file" accept=".json,application/json" onChange={(e) => setBackupFile(e.target.files?.[0] ?? null)} className="flex-1 rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-xs transition-colors focus-within:border-primary" data-testid="input-backup-file" />
            <select value={backupMode} onChange={(e) => setBackupMode(e.target.value as 'append' | 'replace')} className="h-10 rounded-xl border border-border bg-background px-3 text-xs transition-colors focus:border-primary" data-testid="select-backup-mode">
              <option value="append">Add alongside existing bank</option>
              <option value="replace">Replace (that backup's scope, or the entire bank if it has none)</option>
            </select>
            <button disabled={!backupFile || restoreBackup.isPending} onClick={() => setBackupConfirmOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100" data-testid="button-restore-backup">{restoreBackup.isPending && <Loader2 size={13} className="animate-spin" />} {restoreBackup.isPending ? 'Restoring…' : 'Import backup'}</button>
          </div>
          {backupFile && !restoreBackup.isPending && <p className="mt-2 text-[11px] text-muted-foreground animate-in fade-in duration-200">Selected: <span className="font-semibold text-foreground">{backupFile.name}</span></p>}
          {backupMode === 'replace' && <p className="mt-2 text-[11px] font-semibold text-destructive animate-in fade-in duration-200">Replace deletes every existing question in that branch (and its practice/exam history) before restoring — or the entire bank, if the file is a whole-bank backup. This can't be undone.</p>}
        </div>
      </div>}
      {backupConfirmOpen && <ConfirmDialog
        title={backupMode === 'replace' ? 'Replace with this backup?' : 'Import this backup?'}
        body={backupMode === 'replace' ? "Every existing question in this backup's branch (or the whole bank, if it was a whole-bank backup), plus its practice history and exam attachments, will be permanently deleted first, then replaced with the backup file's contents." : "The backup file's questions will be added alongside what's already in the bank."}
        confirmLabel={backupMode === 'replace' ? 'Delete and restore' : 'Import'}
        onCancel={() => setBackupConfirmOpen(false)}
        onConfirm={() => restoreBackup.mutate()}
        pending={restoreBackup.isPending}
      />}


      {bulkAddOpen && <div className="mt-4 space-y-4 rounded-2xl border border-primary/30 bg-primary/10 p-5">
        <div className="flex items-center justify-between"><p className="text-xs font-bold">Add multiple MCQs at once — uses the module/subject/topic selected above.</p><button onClick={() => setBulkRows((rows) => [...rows, ...bulkAddRowsInit()])} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold" data-testid="button-add-bulk-row"><Plus size={12} /> Add row</button></div>
        {!targetReady && <p className="text-[11px] font-semibold text-accent-text">Select module/subject/topic above first.</p>}
        {targetReady && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"><Sparkles size={14} className="text-primary" /><span className="text-[11px] font-bold">Generate</span><select value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid="select-ai-mcq-count">{[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select><span className="text-[11px] font-bold">questions</span><select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value as typeof aiDifficulty)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid="select-ai-mcq-difficulty"><option value="mixed">Mixed difficulty</option><option value="easy">Easy only</option><option value="moderate">Moderate only</option><option value="hard">Hard only</option></select><span className="text-[11px] font-bold">with AI for this topic</span><div className="ml-auto flex gap-2"><button type="button" disabled={generateAiFullSet.isPending || generateAiMcqs.isPending} onClick={() => generateAiFullSet.mutate()} title={`Generates ${aiCount} easy + ${aiCount} moderate + ${aiCount} hard in one go`} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50" data-testid="button-generate-ai-full-set">{generateAiFullSet.isPending ? 'Generating set…' : <><Layers size={12} /> Full E/M/H set</>}</button><button type="button" disabled={generateAiMcqs.isPending || generateAiFullSet.isPending} onClick={() => generateAiMcqs.mutate()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-generate-ai-mcqs">{generateAiMcqs.isPending ? 'Generating…' : <><Sparkles size={12} /> Generate</>}</button></div></div>}
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
            {(['a', 'b', 'c', 'd', 'e'] as const).map((x, oi) => row[x].trim() && <div key={x} className="flex items-start gap-2"><span className={cn('mt-1.5 grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold', row.correct === x ? 'bg-primary/15 text-primary' : 'bg-destructive/10 text-destructive')}>{x.toUpperCase()}</span><textarea value={row[(`e${x}`) as 'ea' | 'eb' | 'ec' | 'ed' | 'ee']} onChange={(e) => setBulkRows((rows) => rows.map((r, ri) => ri === i ? { ...r, [`e${x}`]: e.target.value } : r))} placeholder={row.correct === x ? 'Why this is the correct answer...' : 'Why this option is wrong...'} className="min-h-9 flex-1 rounded-lg border border-border bg-background p-2 text-xs" data-testid={`input-bulk-option-explanation-${i}-${oi}`} /></div>)}
          </div>}
        </div>)}</div>
        <div className="flex gap-2"><button disabled={!targetReady || bulkCreateMutation.isPending} onClick={() => bulkCreateMutation.mutate()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-bulk-mcqs">{bulkCreateMutation.isPending ? 'Adding…' : `Add ${bulkRows.filter((r) => r.question.trim()).length} questions`}</button><button onClick={() => { setBulkAddOpen(false); setBulkRows(bulkAddRowsInit()); }} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-cancel-bulk-mcqs">Cancel</button></div>
      </div>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a question by text..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none" data-testid="input-search-mcqs" /></div>
        {statusFilter && <button onClick={() => setStatusFilter(null)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-[11px] font-bold text-primary" data-testid="button-clear-explanation-filter">Explanation: {statusFilter.replace('_', ' ')} <X size={12} /></button>}
        <div className="flex flex-wrap items-center gap-1.5" data-testid="filters-mcq-difficulty">
          {(['easy', 'moderate', 'hard'] as const).map((d) => <Chip key={d} active={difficultyFilter === d} onClick={() => setDifficultyFilter(difficultyFilter === d ? null : d)} testId={`chip-mcq-difficulty-${d}`}><span className="capitalize">{d}</span></Chip>)}
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          {(['published', 'draft'] as const).map((k) => <Chip key={k} active={publishFilter === k} onClick={() => setPublishFilter(publishFilter === k ? null : k)} testId={`chip-mcq-state-${k}`}><span className="capitalize">{k}</span></Chip>)}
        </div>
        {anyFilter && <button onClick={() => { setSearch(''); setStatusFilter(null); setDifficultyFilter(null); setPublishFilter(null); }} className="text-[11px] font-bold text-muted-foreground underline-offset-2 hover:underline" data-testid="button-clear-all-mcq-filters">Clear all</button>}
        {anyFilter && <span className="text-[11px] text-muted-foreground">{mcqs.length} match{mcqs.length === 1 ? '' : 'es'}</span>}
      </div>

      {/* Sticky so bulk-selecting deep into a long MBBS/BDS tree (380+
          questions across many modules) never means scrolling all the way
          back to the top just to reach the delete action. Always visible
          (not just once something's selected) so "select all" is
          discoverable too. */}
      <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
        <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={mcqs.length > 0 && selectedIds.size === mcqs.length} onChange={toggleSelectAll} data-testid="checkbox-select-all-mcqs" />{selectedIds.size > 0 ? `${selectedIds.size} selected` : `Select all ${mcqs.length}`}</label>
        {selectedIds.size > 0 && <button onClick={() => bulkShuffle.mutate(Array.from(selectedIds))} disabled={bulkShuffle.isPending} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50" data-testid="button-bulk-shuffle-selected" title="Randomly reorders each selected question's options — correct answer moves with it, never changes">{bulkShuffle.isPending ? 'Shuffling…' : <><Shuffle size={12} /> Shuffle selected</>}</button>}
        {selectedIds.size > 0 && <button onClick={() => setBulkDeleteMode('selected')} className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-bold text-destructive" data-testid="button-bulk-delete-selected"><Trash2 size={12} /> Delete selected</button>}
      </div>

      <div className="mt-3"><McqBankTree modules={allModules} blocks={blocks} search={search} statusFilter={statusFilter} difficultyFilter={difficultyFilter} publishFilter={publishFilter} selectedIds={selectedIds} onToggleSelect={toggleSelected} /></div>
      {bulkDeleteMode === 'selected' && <ConfirmDialog title={`Delete ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'}?`} body="They'll be removed from the bank and from any draft exams using them." confirmLabel="Delete selected" onCancel={() => setBulkDeleteMode(null)} onConfirm={() => bulkDelete.mutate(Array.from(selectedIds))} pending={bulkDelete.isPending} />}
      </div>
  </div>;
}

export default AdminMcqs;

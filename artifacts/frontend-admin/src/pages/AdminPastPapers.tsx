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
import { DEGREE_OPTIONS, DEGREE_YEAR_OPTIONS, McqTreeModule, SectionHeader, groupByDegreeYear, studyYearToNumber, BrandSpinner, CollapsibleGroup, ConfirmDialog, EmptyState, PastPaperEditForm, PastPaperQuestionsList, PastPaperUploader, cn } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

function AdminPastPapers() {
  const papers = useQuery({ queryKey: ['admin-past-papers'], queryFn: () => pastPapersApi.list() });
  const create = useMutation({ mutationFn: pastPapersApi.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<PastPaper> }) => pastPapersApi.update(id, body), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }), onError: (err: unknown) => toast({ title: 'Could not save changes', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.', variant: 'destructive' }) });
  const toggle = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => pastPapersApi.update(id, { active }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }) });
  const removePermanent = useMutation({ mutationFn: pastPapersApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete paper', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  // One-time fix for papers uploaded before the Degree + Year picker
  // existed — they only have the old free-text `level` label (e.g. "MBBS -
  // 1st Year") with no real yearTargetNumber/programTargetKind set, which
  // means they're currently visible to every program/year, not just the
  // one in their label. This parses `level` and fills in the real
  // targeting fields. Safe to click repeatedly — already-tagged papers are
  // left alone.
  const backfillYearTargeting = useMutation({
    mutationFn: pastPapersApi.backfillYearTargeting,
    onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: ['admin-past-papers'] }); toast({ title: 'Year targeting fixed', description: `${result.fixed} paper${result.fixed === 1 ? '' : 's'} updated from their Level label${result.skipped ? `, ${result.skipped} skipped (label didn't match a known Degree/Year)` : ''}.` }); },
    onError: (err: unknown) => toast({ title: 'Could not fix year targeting', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const [open, setOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formProgramId, setFormProgramId] = useState('');
  const [formDegree, setFormDegree] = useState('');
  const [formStudyYear, setFormStudyYear] = useState('');
  const programsQ = useQuery({ queryKey: ['admin-programs-flat'], queryFn: () => academicApi.programs(undefined, true) });
  const academicYearsQ = useQuery({ queryKey: ['admin-academic-years-flat', formProgramId], queryFn: () => academicApi.academicYears(formProgramId ? Number(formProgramId) : undefined, true) });
  const resetForm = () => { setOpen(false); setFormProgramId(''); setFormDegree(''); setFormStudyYear(''); };
  const composedLevel = [formDegree, formStudyYear].filter(Boolean).join(' - ');
  // Every college code that's already been typed into a paper (the "KMU" /
  // "WMC" / "NWSM" etc. in the exam-board field, which is what's actually
  // functioning as the college name) — offered back as datalist suggestions
  // so the same college is always spelled the same way, instead of drifting
  // into near-duplicates that would then group/filter inconsistently.
  const collegeOptions = Array.from(new Set((papers.data || []).map((p) => p.examBoard).filter(Boolean))).sort();
  // Classified into MBBS / BDS, then by study year (1st Year … Final Year)
  // instead of the paper's calendar Year field — the study year is what an
  // admin actually thinks in terms of when uploading a batch ("here are
  // all of First Year's papers"), and it's already captured by the same
  // Degree + Year picker the create form uses (yearTargetNumber, with a
  // fallback to parsing the old "Degree - Year" text `level` field for any
  // paper saved before that structured field existed). The paper's own
  // calendar year still shows in its row subtitle below, just not as a
  // separate collapsible level anymore.
  const paperDegree = (p: PastPaper) => p.programTargetKind || (p.level || '').split(' - ')[0].trim();
  const paperStudyYear = (p: PastPaper): string => {
    const degree = paperDegree(p);
    if (p.yearTargetNumber) {
      const label = (DEGREE_YEAR_OPTIONS[degree] || DEGREE_YEAR_OPTIONS.MBBS)[p.yearTargetNumber - 1];
      if (label) return label;
    }
    return (p.level || '').split(' - ')[1]?.trim() || '';
  };
  const paperStudyYearSortKey = (p: PastPaper) => p.yearTargetNumber ?? studyYearToNumber(paperDegree(p), paperStudyYear(p));
  const grouped = groupByDegreeYear(papers.data || [], paperDegree, paperStudyYear, paperStudyYearSortKey);

  return <div><SectionHeader eyebrow="Content" title="Past papers" action={<div className="flex gap-2"><button onClick={() => backfillYearTargeting.mutate()} disabled={backfillYearTargeting.isPending} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-extrabold text-muted-foreground hover:text-foreground disabled:opacity-50" data-testid="button-backfill-paper-year-targeting" title="Fix old papers whose Level label (e.g. &quot;MBBS - 1st Year&quot;) was never turned into real year/degree targeting, so they show up for every year">{backfillYearTargeting.isPending ? 'Checking…' : 'Fix year targeting'}</button><button onClick={() => setOpen(true)} className="btn-pop inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="button-create-paper"><Plus size={15} /> Add paper</button></div>} />
    <datalist id="past-paper-college-options">{collegeOptions.map((c) => <option key={c} value={c} />)}</datalist>
    {open && <form onSubmit={(e) => { e.preventDefault(); if (!formDegree || !formStudyYear) { toast({ title: 'Degree and year required', description: 'Pick both so this paper only shows to the right students — leaving them blank is what made First Year papers show up for Third Year.', variant: 'destructive' }); return; } const f = new FormData(e.currentTarget); const programId = f.get('programId') ? Number(f.get('programId')) : undefined; const academicYearId = f.get('academicYearId') ? Number(f.get('academicYearId')) : undefined; const level = String(f.get('level') || '') || composedLevel; create.mutate({ title: String(f.get('title')), examBoard: String(f.get('examBoard') || ''), year: String(f.get('year') || ''), level, programId, academicYearId, programTargetKind: formDegree || null, yearTargetNumber: studyYearToNumber(formDegree, formStudyYear) ?? null, active: true }, { onSuccess: resetForm }); }} className="mb-5 grid gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:p-5 md:grid-cols-4">
      <input required name="title" placeholder="Paper title, e.g. Block A" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 md:col-span-2" data-testid="input-paper-title" />
      <input name="examBoard" list="past-paper-college-options" placeholder="College, e.g. KMU" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25" data-testid="input-paper-board" />
      <input name="year" placeholder="Year, e.g. 2024" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25" data-testid="input-paper-year" />

      {/* Priority fields: a proper MBBS/BDS degree selector plus a matching
          study-year selector, so admins aren't stuck typing a free-text
          level label. These two combine into the Level field below
          automatically (e.g. "MBBS - 3rd Year"), which is what's shown to
          students and used for filtering — no academic structure setup
          required first. */}
      <div className="rounded-xl border-2 border-primary/40 bg-card/70 p-3 md:col-span-4">
        <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[.08em] text-primary">Degree &amp; year (shown to students) — required</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-muted-foreground">Degree</span>
            <select required name="degree" value={formDegree} onChange={(e) => { setFormDegree(e.target.value); setFormStudyYear(''); }} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-xs font-semibold outline-none transition-shadow focus:ring-2 focus:ring-primary/25" data-testid="select-paper-degree">
              <option value="">Select degree…</option>
              {DEGREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-muted-foreground">Year</span>
            <select required value={formStudyYear} onChange={(e) => setFormStudyYear(e.target.value)} disabled={!formDegree} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-xs font-semibold outline-none transition-shadow focus:ring-2 focus:ring-primary/25 disabled:opacity-50" data-testid="select-paper-study-year">
              <option value="">{formDegree ? 'Select year…' : 'Pick a degree first'}</option>
              {(DEGREE_YEAR_OPTIONS[formDegree] || []).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        {/* Leaving either of these blank is exactly what made a First Year
            paper show up in every other year's account — a blank axis
            means "visible to everyone" on that axis (see past-papers.ts).
            Both are now required so a new paper can't be saved untargeted
            by accident. */}
        <p className="mt-2 text-[11px] font-semibold text-accent-text">Both are required — leaving either blank makes this paper visible to every year, which is the bug this fixes.</p>
      </div>

      <select name="programId" value={formProgramId} onChange={(e) => setFormProgramId(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 md:col-span-2" data-testid="select-paper-program"><option value="">All programs (advanced targeting, optional)</option>{(programsQ.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select name="academicYearId" disabled={!formProgramId} className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 disabled:opacity-50 md:col-span-2" data-testid="select-paper-academic-year"><option value="">All years</option>{(academicYearsQ.data || []).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
      {/* This dropdown only lists MBBS/BDS-type Programs that have actually
          been added under an institution in Colleges & courses — it isn't
          pre-seeded with MBBS/BDS, since a Program has to belong to a
          specific institution. Both selects here are optional extra
          targeting (narrows which students see the paper); the Degree +
          Year picker above already covers labeling and student-facing
          display without needing this set up at all. */}
      {!programsQ.isLoading && !programsQ.data?.length && <p className="text-[11px] font-semibold text-accent-text md:col-span-4">No programs set up yet — that's expected, not a bug. The Degree/Year fields above already label and display the paper correctly. Only add a program under <Link href="/admin/academic-structure" className="underline">Colleges &amp; courses</Link> if you also want to restrict who can see it.</p>}
      <input name="level" defaultValue="" value={composedLevel} onChange={() => {}} placeholder="Level label (auto-filled from Degree + Year above)" className="h-11 rounded-xl border border-border bg-card px-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/25 md:col-span-2" data-testid="input-paper-level" readOnly />
      <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
        <button className="btn-pop flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm sm:flex-none" data-testid="button-save-paper">{create.isPending ? <span className="inline-flex items-center gap-2"><BrandSpinner size={13} /> Saving…</span> : 'Save'}</button>
        <button type="button" onClick={resetForm} className="btn-pop flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover:bg-muted sm:flex-none" data-testid="button-cancel-paper">Cancel</button>
      </div>
    </form>}

    {!papers.data?.length && <EmptyState icon={FileStack} title="No past papers yet" body="Add a paper, then upload its questions or attach them from the MCQ bank." />}

    {/* Classified into MBBS / BDS, then by study year — see the grouping
        setup above — and collapsible the same way the MCQ bank's Module ->
        Subject -> Topic tree is (McqTreeModule), so a long list of papers
        across many years doesn't turn into one endless scroll. */}
    {grouped.map((g) => <CollapsibleGroup key={g.degree || 'unspecified'} defaultOpen icon={<GraduationCap size={14} />} title={g.degree === 'MBBS' || g.degree === 'BDS' ? `${g.degree} colleges` : 'Unspecified degree'} count={g.groups.reduce((sum, yg) => sum + yg.items.length, 0)} testId={`degree-${g.degree || 'unspecified'}`}>
      {g.groups.map((yg) => <CollapsibleGroup key={yg.year || 'no-year'} defaultOpen={false} title={yg.year ? [yg.year, (g.degree === 'MBBS' || g.degree === 'BDS') ? g.degree : ''].filter(Boolean).join(' ') : 'No year set'} count={yg.items.length} nested testId={`year-${g.degree || 'unspecified'}-${yg.year || 'no-year'}`}>
        <div className="rounded-2xl border border-border bg-card">{yg.items.map((p) => <div key={p.id} className="border-b border-border p-5 last:border-0" data-testid={`row-admin-paper-${p.id}`}>
          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-info/15 text-info"><FileStack size={17} /></div><div className="min-w-[160px] flex-1"><div className="text-sm font-bold">{p.title}</div><div className="mt-1 text-xs text-muted-foreground">{[p.examBoard, p.year, p.level].filter(Boolean).join(' · ')} · {p.mcqCount} MCQs linked</div></div><div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setViewingId(viewingId === p.id ? null : p.id)} className={cn('btn-pop inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold', viewingId === p.id ? 'bg-primary/10 text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-view-paper-questions-${p.id}`}><CircleHelp size={12} /> View questions</button>
            <button onClick={() => setUploadingId(uploadingId === p.id ? null : p.id)} className={cn('btn-pop inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold', uploadingId === p.id ? 'bg-primary/10 text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-upload-paper-${p.id}`}><UploadCloud size={12} /> Upload questions</button>
            <button onClick={() => setEditingId(editingId === p.id ? null : p.id)} className={cn('btn-pop inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold', editingId === p.id ? 'bg-primary/10 text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-edit-paper-${p.id}`}><Pencil size={12} /> Edit</button>
            <button onClick={() => toggle.mutate({ id: p.id, active: !p.active })} className={cn('btn-pop rounded-lg px-3 py-1.5 text-[11px] font-bold', p.active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} data-testid={`button-toggle-paper-${p.id}`}>{p.active ? 'Published' : 'Hidden'}</button>
            <button onClick={() => setDeletingId(p.id)} className="btn-pop rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-paper-${p.id}`}><Trash2 size={15} /></button>
          </div></div>
          {editingId === p.id && <div className="mt-4 border-t border-border pt-4"><PastPaperEditForm paper={p} saving={update.isPending} collegeOptions={collegeOptions} onCancel={() => setEditingId(null)} onSave={(body) => update.mutate({ id: p.id, body }, { onSuccess: () => setEditingId(null) })} /></div>}
          {viewingId === p.id && <div className="mt-4 border-t border-border pt-4"><PastPaperQuestionsList pastPaperId={p.id} /></div>}
          {uploadingId === p.id && <div className="mt-4 border-t border-border pt-4"><PastPaperUploader pastPaperId={p.id} onImported={() => setUploadingId(null)} /></div>}
        </div>)}</div>
      </CollapsibleGroup>)}
    </CollapsibleGroup>)}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this past paper?" body="This erases the paper for good, along with every MCQ linked to it — they're removed from the question bank and from students' practice history too. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removePermanent.mutate(deletingId)} pending={removePermanent.isPending} />}
  </div>;
}

// Full edit — every field the create form sets, pre-filled, so an existing
// paper isn't stuck with whatever was typed at creation (title/"Block"
// name, college, year, degree+year, and the optional program/year
// targeting). Mirrors ExamEditForm's pattern: local state for the two
// derived Degree/Year selects, PATCHed as a single composed `level`
// string exactly like the create form does.

export default AdminPastPapers;

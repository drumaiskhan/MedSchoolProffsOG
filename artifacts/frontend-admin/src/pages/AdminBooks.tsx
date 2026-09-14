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
import { renderPdfFirstPageThumbnail } from '@/lib/pdf-thumbnail';

function AdminBooks() {
  const modulesQ = useListModules();
  const modules = modulesQ.data ?? [];
  const [moduleId, setModuleId] = useState('');
  const subjectsQ = useListSubjects(moduleId ? { moduleId: Number(moduleId) } : undefined);
  const [subjectId, setSubjectId] = useState('');
  const topicsQ = useListTopics(subjectId ? { subjectId: Number(subjectId) } : undefined);
  const [topicId, setTopicId] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const booksQ = useQuery({ queryKey: ['admin-books'], queryFn: booksAdminApi.list });
  const books = booksQ.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-books'] });
  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a PDF to upload');
      const uploaded = await uploadFile(file, 'book');
      let coverPath: string | undefined;
      if (cover) {
        coverPath = (await uploadFile(cover, 'book')).storagePath;
      } else if (file.type === 'application/pdf') {
        // Auto-thumbnail: admin didn't supply a cover, so render page 1 of
        // the PDF itself instead of leaving the card blank. Best-effort —
        // if it fails for any reason, the book still saves, just without a
        // thumbnail (same as before this feature existed).
        const thumb = await renderPdfFirstPageThumbnail(file);
        if (thumb) coverPath = (await uploadFile(new File([thumb], 'cover.jpg', { type: 'image/jpeg' }), 'book')).storagePath;
      }
      return booksAdminApi.create({ title: title.trim(), author: author.trim() || undefined, moduleId: moduleId ? Number(moduleId) : undefined, subjectId: subjectId ? Number(subjectId) : undefined, topicId: topicId ? Number(topicId) : undefined, storagePath: uploaded.storagePath, coverImagePath: coverPath });
    },
    onSuccess: () => { invalidate(); setOpen(false); setTitle(''); setAuthor(''); setFile(null); setCover(null); setModuleId(''); setSubjectId(''); setTopicId(''); toast({ title: 'Book added', description: 'Now visible to students.' }); },
    onError: (err: unknown) => toast({ title: 'Could not add book', description: err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: booksAdminApi.removePermanent,
    // The backend also deletes the underlying Cloudinary file (and cover
    // image, if any) — `warning` comes back non-empty only if that remote
    // cleanup failed even though the book record itself was removed, so
    // surface it rather than showing a plain "Book deleted" that implies
    // everything went cleanly.
    onSuccess: (result) => { invalidate(); setDeletingId(null); toast(result?.warning ? { title: 'Book deleted', description: result.warning } : { title: 'Book deleted' }); },
    onError: (err: unknown) => toast({ title: 'Could not delete book', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const backfill = useMutation({
    mutationFn: booksAdminApi.backfillLinks,
    onSuccess: (result) => { invalidate(); toast({ title: 'Link check complete', description: `Fixed ${result.fixed}, skipped ${result.skipped}, failed ${result.failed}.` }); },
    onError: (err: unknown) => toast({ title: 'Could not fix links', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  // Groups books by their module's targeting label (same MBBS/BDS + year
  // wording used when editing a module) — a book with no module set is its
  // own "Every student" group instead of silently blending into whichever
  // group happened to render first.
  const modulesById = new Map(modules.map((m) => [m.id, m]));
  const bookGroups = (() => {
    const map = new Map<string, AdminBook[]>();
    for (const b of books) {
      const mod = b.moduleId ? modulesById.get(b.moduleId) : undefined;
      const label = mod ? (mod.targetingLabel || 'All Programs + All Years') : 'Every student (no module set)';
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(b);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({ label, items }));
  })();

  return <div><SectionHeader eyebrow="Study tools" title="Books library" action={<div className="flex gap-2"><button onClick={() => backfill.mutate()} disabled={backfill.isPending} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-extrabold text-muted-foreground hover:text-foreground disabled:opacity-50" data-testid="button-backfill-book-links">{backfill.isPending ? 'Checking…' : 'Fix broken links'}</button><button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-book"><Plus size={15} /> {open ? 'Close' : 'Add book'}</button></div>} />
    {open && <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-2 sm:grid-cols-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-book-title" /><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-book-author" /></div>
      <div className="grid gap-2 sm:grid-cols-3"><select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubjectId(''); setTopicId(''); }} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-book-module"><option value="">All modules</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }} disabled={!moduleId} className="h-10 rounded-xl border border-border bg-background px-3 text-xs disabled:opacity-50" data-testid="select-book-subject"><option value="">All subjects</option>{(subjectsQ.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId} className="h-10 rounded-xl border border-border bg-background px-3 text-xs disabled:opacity-50" data-testid="select-book-topic"><option value="">All topics</option>{(topicsQ.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <p className="text-[11px] text-muted-foreground">Leave module/subject/topic unset to make the book visible to every student.</p>
      <div className="grid gap-2 sm:grid-cols-2"><label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground"><UploadCloud size={14} />{file ? file.name : 'Choose PDF'}<input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" data-testid="input-book-file" /></label><label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground"><UploadCloud size={14} />{cover ? cover.name : 'Cover image (optional)'}<input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} className="hidden" data-testid="input-book-cover" /></label></div>
      <button type="submit" disabled={create.isPending || !title.trim() || !file} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-submit-book">{create.isPending ? 'Uploading…' : 'Add book'}</button>
    </form>}
    {/* Grouped by the targeting of each book's module (same MBBS/BDS +
        year label already shown when editing a module), instead of one
        flat grid — a book with no module set is its own "Every student"
        bucket, which doubles as a quick way to see at a glance how many
        books are currently visible to everyone rather than scoped to a
        year, since that's opt-in per the hint above and easy to forget. */}
    {books.length ? bookGroups.map((g) => <CollapsibleGroup key={g.label} defaultOpen count={g.items.length} title={g.label} testId={`books-group-${g.label.replace(/\W+/g, '-')}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{g.items.map((b) => <div key={b.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`card-book-${b.id}`}>
        {b.coverImagePath && <img src={resolveUploadUrl(b.coverImagePath) ?? undefined} alt="" loading="lazy" decoding="async" className="mb-3 h-32 w-full rounded-lg object-cover" />}
        <p className="text-sm font-bold leading-5">{b.title}</p>{b.author && <p className="mt-1 text-xs text-muted-foreground">{b.author}</p>}
        <div className="mt-3 flex items-center justify-between">{resolveUploadUrl(b.storagePath) ? <a href={resolveUploadUrl(b.storagePath)!} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary" data-testid={`link-open-book-${b.id}`}>Open PDF <ArrowRight size={12} className="ml-1 inline" /></a> : <span className="text-[11px] font-bold text-destructive" data-testid={`text-book-unavailable-${b.id}`}>Link broken — try "Fix broken links"</span>}<button onClick={() => setDeletingId(b.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-book-${b.id}`}><Trash2 size={14} /></button></div>
      </div>)}</div>
    </CollapsibleGroup>) : <EmptyState icon={BookOpen} title="No books yet" body="Upload a PDF above — students can browse and open it from their Books tab." />}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this book?" body="It will be removed from the students' library and the admin list for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
  </div>;
}

export default AdminBooks;

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
import { CollapsibleGroup, ConfirmDialog, EmptyState, SectionHeader, DEGREE_OPTIONS, DEGREE_YEAR_OPTIONS, studyYearToNumber, groupByDegreeYear, cn } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';
import { renderPdfFirstPageThumbnail } from '@/lib/pdf-thumbnail';

function BookEditForm({ book, onSave, onCancel, pending }: { book: AdminBook; onSave: (body: { isFree: boolean; price: number | null; currency: string | null }) => void; onCancel: () => void; pending: boolean }) {
  const [isFree, setIsFree] = useState(book.isFree);
  const [price, setPrice] = useState(book.price != null ? String(book.price) : '');
  const [currency, setCurrency] = useState(book.currency || 'PKR');
  return <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3">
    <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} data-testid={`checkbox-edit-book-free-${book.id}`} /> Free (no membership required)</label>
    {!isFree && <div className="flex items-center gap-2">
      <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`select-edit-book-currency-${book.id}`}><option value="PKR">PKR</option><option value="USD">USD</option></select>
      <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="Price (optional)" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-edit-book-price-${book.id}`} />
    </div>}
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid={`button-cancel-edit-book-${book.id}`}>Cancel</button>
      <button onClick={() => onSave({ isFree, price: isFree ? null : (price ? Number(price) : null), currency: isFree ? null : currency })} disabled={pending} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-save-edit-book-${book.id}`}>{pending ? 'Saving…' : 'Save'}</button>
    </div>
  </div>;
}

function AdminBooks() {
  const [degree, setDegree] = useState('');
  const [studyYear, setStudyYear] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
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
      return booksAdminApi.create({ title: title.trim(), author: author.trim() || undefined, programTargetKind: degree || null, yearTargetNumber: studyYearToNumber(degree, studyYear) ?? null, storagePath: uploaded.storagePath, coverImagePath: coverPath, isFree, price: isFree ? null : (price ? Number(price) : null), currency: isFree ? null : currency });
    },
    onSuccess: () => { invalidate(); setOpen(false); setTitle(''); setAuthor(''); setFile(null); setCover(null); setDegree(''); setStudyYear(''); setIsFree(false); setPrice(''); toast({ title: 'Book added', description: 'Now visible to students.' }); },
    onError: (err: unknown) => toast({ title: 'Could not add book', description: err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof booksAdminApi.update>[1] }) => booksAdminApi.update(id, body),
    onSuccess: () => { invalidate(); setEditingId(null); toast({ title: 'Book updated' }); },
    onError: (err: unknown) => toast({ title: 'Could not update book', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
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

  // Grouped by Degree (MBBS/BDS) then Year, same as Past papers/Pre-Proffs
  // exams — a book with no targeting set falls into "Unspecified degree" /
  // "No year set", same convention those pages use for "visible to
  // everyone".
  const bookDegree = (b: AdminBook) => b.programTargetKind || '';
  const bookStudyYear = (b: AdminBook) => (b.yearTargetNumber ? (DEGREE_YEAR_OPTIONS[bookDegree(b)] || DEGREE_YEAR_OPTIONS.MBBS)[b.yearTargetNumber - 1] || '' : '');
  const bookGroups = groupByDegreeYear(books, bookDegree, bookStudyYear, (b) => b.yearTargetNumber ?? undefined);

  return <div><SectionHeader eyebrow="Study tools" title="Books library" action={<div className="flex gap-2"><button onClick={() => backfill.mutate()} disabled={backfill.isPending} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-extrabold text-muted-foreground hover:text-foreground disabled:opacity-50" data-testid="button-backfill-book-links">{backfill.isPending ? 'Checking…' : 'Fix broken links'}</button><button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-book"><Plus size={15} /> {open ? 'Close' : 'Add book'}</button></div>} />
    {open && <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-2 sm:grid-cols-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-book-title" /><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-book-author" /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={degree} onChange={(e) => { setDegree(e.target.value); setStudyYear(''); }} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-book-degree">
          <option value="">All programs (MBBS &amp; BDS)</option>
          {DEGREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={studyYear} onChange={(e) => setStudyYear(e.target.value)} disabled={!degree} className="h-10 rounded-xl border border-border bg-background px-3 text-xs disabled:opacity-50" data-testid="select-book-year">
          <option value="">{degree ? 'All years' : 'Pick a program first'}</option>
          {(DEGREE_YEAR_OPTIONS[degree] || []).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-muted-foreground">Leave program/year unset to make the book visible to every student.</p>
      <div className="flex items-center gap-4 rounded-xl border border-border bg-background px-3 py-2.5">
        <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} data-testid="checkbox-book-free" /> Free (no membership required)</label>
        {!isFree && <div className="flex items-center gap-2">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" data-testid="select-book-currency"><option value="PKR">PKR</option><option value="USD">USD</option></select>
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="Price (optional)" className="h-8 w-32 rounded-lg border border-border bg-background px-2 text-xs" data-testid="input-book-price" />
        </div>}
      </div>
      <p className="text-[11px] text-muted-foreground">{isFree ? 'Visible to every logged-in student, regardless of membership.' : 'Requires an active membership. Price shown here is informational only — students still get access through membership, not a separate purchase.'}</p>
      <div className="grid gap-2 sm:grid-cols-2"><label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground"><UploadCloud size={14} />{file ? file.name : 'Choose PDF'}<input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" data-testid="input-book-file" /></label><label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground"><UploadCloud size={14} />{cover ? cover.name : 'Cover image (optional)'}<input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} className="hidden" data-testid="input-book-cover" /></label></div>
      <button type="submit" disabled={create.isPending || !title.trim() || !file} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-submit-book">{create.isPending ? 'Uploading…' : 'Add book'}</button>
    </form>}
    {/* Grouped by Degree (MBBS/BDS) then Year, same classification Past
        papers and Pre-Proffs exams use — a book with no program/year set
        falls under "Unspecified degree" / "No year set", which doubles as
        a quick way to see at a glance how many books are currently
        visible to everyone rather than scoped to a year, since that's
        opt-in per the hint above and easy to forget. */}
    {books.length ? bookGroups.map((g) => <CollapsibleGroup key={g.degree || 'unspecified'} defaultOpen icon={<GraduationCap size={14} />} title={g.degree === 'MBBS' || g.degree === 'BDS' ? `${g.degree} colleges` : 'Unspecified degree'} count={g.groups.reduce((sum, yg) => sum + yg.items.length, 0)} testId={`books-degree-${g.degree || 'unspecified'}`}>
      {g.groups.map((yg) => <CollapsibleGroup key={yg.year || 'no-year'} defaultOpen title={yg.year ? [yg.year, (g.degree === 'MBBS' || g.degree === 'BDS') ? g.degree : ''].filter(Boolean).join(' ') : 'No year set'} count={yg.items.length} nested testId={`books-year-${g.degree || 'unspecified'}-${yg.year || 'no-year'}`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{yg.items.map((b) => <div key={b.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`card-book-${b.id}`}>
          {b.coverImagePath && <img src={resolveUploadUrl(b.coverImagePath) ?? undefined} alt="" loading="lazy" decoding="async" className="mb-3 h-32 w-full rounded-lg object-cover" />}
          <div className="flex items-start justify-between gap-2">
            <div><p className="text-sm font-bold leading-5">{b.title}</p>{b.author && <p className="mt-1 text-xs text-muted-foreground">{b.author}</p>}</div>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold', b.isFree ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} data-testid={`text-book-tier-${b.id}`}>{b.isFree ? 'Free' : b.price != null ? `${b.currency ?? ''} ${b.price}`.trim() : 'Paid'}</span>
          </div>
          {editingId === b.id ? <BookEditForm book={b} onSave={(body) => update.mutate({ id: b.id, body })} onCancel={() => setEditingId(null)} pending={update.isPending} /> : <div className="mt-3 flex items-center justify-between">
            {resolveUploadUrl(b.storagePath) ? <a href={resolveUploadUrl(b.storagePath)!} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary" data-testid={`link-open-book-${b.id}`}>Open PDF <ArrowRight size={12} className="ml-1 inline" /></a> : <span className="text-[11px] font-bold text-destructive" data-testid={`text-book-unavailable-${b.id}`}>Link broken — try "Fix broken links"</span>}
            <div className="flex items-center gap-1">
              <button onClick={() => setEditingId(b.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit book" data-testid={`button-edit-book-${b.id}`}><Pencil size={14} /></button>
              <button onClick={() => setDeletingId(b.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete book" data-testid={`button-delete-book-${b.id}`}><Trash2 size={14} /></button>
            </div>
          </div>}
        </div>)}</div>
      </CollapsibleGroup>)}
    </CollapsibleGroup>) : <EmptyState icon={BookOpen} title="No books yet" body="Upload a PDF above — students can browse and open it from their Books tab." />}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this book?" body="It will be removed from the students' library and the admin list for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
  </div>;
}

export default AdminBooks;

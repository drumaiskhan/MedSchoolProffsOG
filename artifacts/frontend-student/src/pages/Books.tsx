// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, type TouchEvent, useState, useEffect, useRef, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ElementType } from 'react';
import { Link, Route, Switch, useLocation, useParams, useSearch, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen,
  LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus,
  ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2,
  TrendingUp, TrendingDown, Minus, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark,
  Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash,
  GraduationCap, Eye, EyeOff, Smartphone, UploadCloud, ImageOff,
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Link2 as LinkIcon, Lightbulb,
  LayoutGrid, Presentation, Wand2, Crown, Globe, Star, Activity
} from 'lucide-react';
import { applyThemeVars } from '@/lib/theme';
import {
  getListMembershipPlansQueryKey, getListPaymentsQueryKey, getListMcqsQueryKey, getListModulesQueryKey, getListStudentsQueryKey, getListNotificationsQueryKey, getGetCurrentUserQueryKey,
  useApprovePayment, useCreateMembershipPlan, useCreateMcq, useCreateModule, useGetAdminDashboard,
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
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, type MyFeedbackEntry, analyticsApi, type ProgressTrend, mcqImportApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blocksApi, type Block, examsAdminApi, examsApi, explanationsApi, booksApi, type AdminBookStudent, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type AdminModule, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type PaymentDetails, type PaymentMethodConfig, aiVisualizerApi, type VisualizationSpec, LeaderboardRow } from '@/lib/api';
import { VisualizationRenderer, isStepBased } from '@/components/visualizer/VisualizationRenderer';
import { StepControls } from '@/components/visualizer/StepControls';
import { ExplanationPanel } from '@/components/visualizer/ExplanationPanel';

// Round 3, item 10 (performance) — this was `new QueryClient()` with no
// options, meaning every query defaulted to `staleTime: 0` and refetched
// on every component mount AND every window refocus. For a study app where
// most data (modules, subjects, MCQs, progress) doesn't change
// second-to-second, that's a real over-fetching cost on every navigation
// and every alt-tab back to the app — exactly the "waterfalls/refetch on
// every mount" pattern item 10 flagged as a likely culprit. A 30s
// staleTime means switching between pages you've already visited in the
// last 30s reuses cached data instead of re-hitting the API, and turning
// off refetch-on-window-focus stops a background-tab refocus from firing
// a full page's worth of requests. Individual queries that DO need to
// react fast (the live leaderboard's refetchInterval, mutations that
// invalidateQueries after a save) already set their own options, which
// override these defaults per-query — this only changes the fallback for
// queries that didn't specify anything.
import { EmptyState, SectionHeader, cn, money, PAYMENT_METHODS, PaymentDestinationCard } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Matches the registration & membership-renewal payment flows: a "where to
// send payment" card (bank/wallet/card destinations with copy-to-clipboard
// details) sits above the reference/date/proof fields, instead of asking the
// student to fill in a reference number with no idea what account it's for.
function BookPurchaseForm({ book, onDone }: { book: AdminBookStudent; onDone: () => void }) {
  const paymentDetails = useQuery({ queryKey: ['payment-details'], queryFn: publicApi.paymentDetails });
  const pd = paymentDetails.data;
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [proof, setProof] = useState<{ storagePath: string; fileName: string; previewUrl: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buy = useMutation({
    mutationFn: () => booksApi.purchase(book.id, { method, reference, paymentDate, proofPath: proof?.storagePath ?? null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['books'] }); onDone(); },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : 'Could not submit — try again.'),
  });
  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file, 'payment-proof');
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setProof({ storagePath: res.storagePath, fileName: file.name, previewUrl });
    } finally {
      setUploading(false);
    }
  };

  return <Dialog open onOpenChange={(open) => { if (!open) onDone(); }}>
    <DialogContent className="max-w-lg gap-0 rounded-3xl border-border p-0" data-testid={`dialog-buy-book-${book.id}`}>
      <DialogHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-inset ring-primary/15"><BookOpen size={20} /></div>
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-extrabold leading-5">{book.title}</DialogTitle>
            <p className="mt-1 text-xs font-bold text-primary">{book.price != null ? money(book.price, book.currency ?? 'PKR') : 'Paid access'}</p>
          </div>
        </div>
      </DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); if (!method || !reference || !paymentDate) { setError('Fill in payment method, reference, and date.'); return; } buy.mutate(); }} className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5" data-testid={`form-buy-book-${book.id}`}>
        <div>
          <div className="mb-2 text-xs font-bold">Payment method</div>
          <div className="flex flex-wrap gap-2">{PAYMENT_METHODS.map(({ value, label, icon: Icon }) => <button type="button" key={value} onClick={() => setMethod(value)} className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors', method === value ? 'border-primary bg-[#eef7f1] text-primary' : 'border-border bg-card hover:bg-muted')} data-testid={`button-book-method-${book.id}-${value.toLowerCase().replaceAll(' ', '-')}`}><Icon size={14} /> {label}</button>)}</div>
        </div>

        {pd && <PaymentDestinationCard pd={pd} />}

        <label className="block text-xs font-bold">Transaction reference<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. NBX-20481" required className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid={`input-book-reference-${book.id}`} /></label>
        <label className="block text-xs font-bold">Payment date<input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid={`input-book-payment-date-${book.id}`} /></label>

        <div>
          <div className="mb-2 text-xs font-bold">Upload payment proof <span className="font-normal text-muted-foreground">(required)</span></div>
          <label onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }} className={cn('flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center transition-colors', dragOver ? 'border-primary bg-[#eef7f1]' : proof ? 'border-primary/40 bg-[#eef7f1]/40' : 'border-border bg-card hover:bg-muted')} data-testid={`dropzone-book-proof-${book.id}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" data-testid={`input-book-proof-${book.id}`} />
            {uploading ? <p className="text-xs font-semibold text-muted-foreground">Uploading…</p> : proof ? <>{proof.previewUrl ? <img src={proof.previewUrl} alt="Payment proof preview" className="max-h-24 rounded-lg border border-border object-contain" /> : <FileText size={20} className="text-primary" />}<p className="text-xs font-bold text-primary">{proof.fileName}</p><span className="text-[10px] text-muted-foreground">Click to replace</span></> : <><UploadCloud size={20} className="text-muted-foreground" /><p className="text-xs font-semibold">Drag your payment screenshot here, or click to browse</p><span className="text-[10px] text-muted-foreground">PNG, JPEG, WEBP, or PDF</span></>}
          </label>
        </div>

        {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid={`text-book-error-${book.id}`}>{error}</p>}
        <div className="flex gap-2 border-t border-border pt-4"><button type="button" onClick={onDone} className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button><button disabled={buy.isPending || uploading} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0" data-testid={`button-submit-buy-book-${book.id}`}>{buy.isPending && <CheckCircle2 size={13} className="animate-pulse" />}{buy.isPending ? 'Submitting…' : 'Submit for review'}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function Books() {
  const q = useQuery({ queryKey: ['books'], queryFn: booksApi.list });
  const books: AdminBookStudent[] = q.data ?? [];
  const [search, setSearch] = useState('');
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const filtered = books.filter((b) => `${b.title} ${b.author ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return <div><SectionHeader eyebrow="Library" title="Books" description="Read free books, or unlock paid ones for the protected reader." action={<div className="relative"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books" className="h-9 w-44 rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/20" data-testid="input-search-books" /></div>} />
    {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((b) => { const url = resolveUploadUrl(b.storagePath); const secure = !b.locked && !!b.secureReader; const openable = !b.locked && (secure || url); const Card: ElementType = openable ? (secure ? Link : 'a') : 'div'; return <Card key={b.id} {...(openable ? (secure ? { href: `/books/${b.id}/read` } : { href: url!, target: '_blank', rel: 'noreferrer' }) : {})} className={cn('card-lift overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-2xs)] transition-all hover:shadow-[var(--shadow-md)]', !openable && !b.locked && 'opacity-60')} data-testid={`row-book-${b.id}`}>
      {b.coverImagePath ? <img src={resolveUploadUrl(b.coverImagePath) ?? undefined} alt="" loading="lazy" decoding="async" className="h-40 w-full object-cover" /> : <div className="grid h-40 w-full place-items-center bg-gradient-to-br from-primary/20 via-primary/10 to-transparent"><BookOpen size={30} className="text-primary/70" /></div>}
      <div className="p-4">
      <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold leading-5">{b.title}</h3><span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ring-1 ring-inset ring-black/5', b.isFree ? 'bg-[#d7eee4] text-[#164b4b]' : !b.locked ? 'bg-[#d7eee4] text-[#164b4b]' : 'bg-muted text-muted-foreground')} data-testid={`text-book-tier-${b.id}`}>{b.isFree ? 'Free' : !b.locked ? 'Owned' : b.price != null ? money(b.price, b.currency ?? 'PKR') : 'Paid'}</span></div>
      {b.author && <p className="mt-1 text-xs text-muted-foreground">{b.author}</p>}
      {secure && <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-primary" data-testid={`text-book-secure-${b.id}`}><ShieldCheck size={11} /> Read in the protected reader</p>}
      {!b.locked && !url && !secure && <p className="mt-1.5 text-[10px] font-bold text-destructive">Unavailable right now — ask your admin to re-upload this book.</p>}
      {b.locked && b.purchasePending && <p className="mt-2 text-[11px] font-bold text-[#8a5a12]" data-testid={`text-book-pending-${b.id}`}>Submitted — awaiting review</p>}
      {b.locked && !b.purchasePending && <button onClick={(e) => { e.preventDefault(); setBuyingId(b.id); }} className="mt-3 flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[11px] font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid={`button-buy-book-${b.id}`}><CreditCard size={12} /> Buy access</button>}
      {b.locked && buyingId === b.id && <BookPurchaseForm book={b} onDone={() => setBuyingId(null)} />}
      </div>
    </Card>; })}</div> : <EmptyState icon={BookOpen} title="No books yet" body="Your admin hasn't added any books to the library yet." />}
  </div>;
}

export default Books;

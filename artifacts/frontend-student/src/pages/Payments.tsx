// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, type TouchEvent, useState, useEffect, useRef, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { authApi, couponsApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, type MyFeedbackEntry, analyticsApi, type ProgressTrend, mcqImportApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blocksApi, type Block, examsAdminApi, examsApi, explanationsApi, booksApi, type AdminBookStudent, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type AdminModule, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type PaymentDetails, type PaymentMethodConfig, aiVisualizerApi, type VisualizationSpec, LeaderboardRow } from '@/lib/api';
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
import { TiltDiv, vars } from '@/lib/tilt';
import { MembershipPass } from '@/components/profile/ProfileVisuals';
import { Badge, EmptyState, PAYMENT_METHODS, PaymentDestinationCard, SectionHeader, SubscriptionStatusCard, cn, money } from '@/lib/shared';

function Payments() {
  const plansQ = useListMembershipPlans();
  const payQ = useListPayments();
  const paymentDetails = useQuery({ queryKey: ['payment-details'], queryFn: publicApi.paymentDetails });
  const dashboard = useGetStudentDashboard();
  const plans = plansQ.data ?? [];
  const payments = payQ.data ?? [];
  const isActive = dashboard.data?.membershipStatus === 'ACTIVE';
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  useEffect(() => { if (selectedPlan === null && plans.length) setSelectedPlan(plans[1]?.id ?? plans[0].id); }, [plans, selectedPlan]);
  useEffect(() => { setCouponResult(null); setCouponError(null); }, [selectedPlan]);
  const [couponInput, setCouponInput] = useState('');
  const [couponResult, setCouponResult] = useState<{ code: string; discountedAmount: number; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [method, setMethod] = useState('');
  const [proof, setProof] = useState<{ storagePath: string; fileName: string; previewUrl: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const submit = useSubmitPayment();
  const pd = paymentDetails.data;
  const selectedPlanObj = plans.find((p) => p.id === selectedPlan) || null;

  const applyCoupon = async () => {
    if (!selectedPlan || !couponInput.trim()) return;
    setCouponChecking(true); setCouponError(null);
    try {
      const result = await couponsApi.validate(couponInput.trim(), selectedPlan);
      setCouponResult({ code: couponInput.trim().toUpperCase(), discountedAmount: result.discountedAmount, discountAmount: result.discountAmount });
    } catch (err) {
      setCouponResult(null);
      setCouponError(err instanceof ApiRequestError ? err.message : 'Could not check that code right now.');
    } finally {
      setCouponChecking(false);
    }
  };

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

  // Best-value plan: the same heuristic Register uses (biggest saving vs.
  // its own original price) so the badge lines up whether a student
  // registers or renews here.
  const bestValueId = plans.reduce<number | null>((best, p) => {
    const saving = p.originalPrice != null && p.originalPrice > p.price ? p.originalPrice - p.price : 0;
    if (saving <= 0) return best;
    const bestSaving = best != null ? (plans.find((x) => x.id === best)!.originalPrice ?? 0) - plans.find((x) => x.id === best)!.price : -1;
    return saving > bestSaving ? p.id : best;
  }, null);

  return <div className="max-w-5xl"><SectionHeader eyebrow="Membership" title="Access that fits your semester" description="Choose a plan, pay, and upload your proof — we activate your account after review." />
  <div className="mb-6"><MembershipPass payments={payments} /></div>
  {!showForm ? <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center"><p className="text-xs text-muted-foreground">{isActive ? "Your access is active. Renewing early? You can submit a new payment any time." : 'Choose a plan and submit your payment to activate access.'}</p><button onClick={() => setShowForm(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="button-show-payment-form">{isActive ? 'Renew / change plan' : 'Choose a plan & pay'}</button></div> : <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]"><div>
    <div className="mb-3 text-xs font-bold text-muted-foreground">Choose your access</div>
    <div className="grid gap-3 sm:grid-cols-2">{plans.map((p, i) => <TiltDiv key={p.id} style={vars({ '--tilt': 5, '--i': Math.min(i, 8) })}><button type="button" aria-pressed={selectedPlan === p.id} onClick={() => setSelectedPlan(p.id)} className="plan-3d group h-full" data-testid={`button-plan-${p.id}`}>
      {p.id === bestValueId && <span className="absolute right-3 top-3 rounded-full bg-[#e5a952] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#183844]">Best value</span>}
      {p.discountLabel && p.id !== bestValueId && <span className="absolute right-3 top-3 rounded-full bg-[#fff0cb] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#94651c]">{p.discountLabel}</span>}
      <div className="flex items-center gap-2"><div className={cn('plan-3d__icon grid size-8 place-items-center rounded-lg', selectedPlan === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><CreditCard size={15} /></div>{selectedPlan === p.id && <CheckCircle2 size={16} className="plan-3d__check text-primary" />}</div>
      <div className="mt-3 text-sm font-extrabold">{p.name}</div>
      {p.description && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{p.description}</p>}
      <div className="mt-2 flex items-center gap-2">{p.originalPrice != null && p.originalPrice > p.price && <span className="text-xs text-muted-foreground line-through">{money(p.originalPrice, p.currency)}</span>}<span className="font-display text-2xl">{money(p.price, p.currency)}</span></div>
      <div className="mt-1 text-[11px] text-muted-foreground">{p.duration} {p.durationUnit} access</div>
    </button></TiltDiv>)}{!plans.length && <EmptyState icon={CreditCard} title="No plans available yet" body="Your academic team hasn't published any membership plans yet." />}</div>
    {pd && <div className="mt-5"><PaymentDestinationCard pd={pd} /></div>}
    {selectedPlanObj && <div className="mt-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2"><input value={couponInput} onChange={(e) => { setCouponInput(e.target.value); setCouponResult(null); setCouponError(null); }} placeholder="Coupon code (optional)" className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-payment-coupon" /><button type="button" onClick={applyCoupon} disabled={!couponInput.trim() || couponChecking} className="h-10 shrink-0 rounded-xl border border-border px-4 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid="button-apply-payment-coupon">{couponChecking ? 'Checking…' : 'Apply'}</button></div>
      {couponError && <p className="mt-2 text-[11px] font-bold text-destructive" data-testid="text-payment-coupon-error">{couponError}</p>}
      {couponResult && <p className="mt-2 text-[11px] font-bold text-primary" data-testid="text-payment-coupon-applied">Coupon applied — new price {money(couponResult.discountedAmount, selectedPlanObj.currency)}</p>}
    </div>}
  </div>
  <form onSubmit={(e) => { e.preventDefault(); if (!method || selectedPlan === null) return; const f = new FormData(e.currentTarget); submit.mutate({ data: { planId: selectedPlan, method, reference: String(f.get('reference')), paymentDate: String(f.get('paymentDate')), proofPath: proof?.storagePath ?? null, ...(couponResult ? { couponCode: couponResult.code } : {}) } as Parameters<typeof submit.mutate>[0]['data'] }, { onSuccess: () => setSubmitted(true) }); }} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
    <div className="flex items-center gap-2 text-sm font-bold"><CreditCard size={17} className="text-primary" /> Submit payment proof</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Your access activates after a quick review by your institution team.</p>
    <div className="mt-6"><div className="mb-2 text-xs font-bold">Payment method</div><div className="flex flex-wrap gap-2">{PAYMENT_METHODS.map(({ value, label, icon: Icon }) => <button type="button" key={value} onClick={() => setMethod(value)} className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors', method === value ? 'border-primary bg-[#eef7f1] text-primary' : 'border-border bg-background hover:bg-muted')} data-testid={`button-method-${value.toLowerCase().replaceAll(' ', '-')}`}><Icon size={14} /> {label}</button>)}</div></div>
    <label className="mt-4 block text-xs font-bold">Transaction reference<input required name="reference" placeholder="e.g. NBX-20481" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-payment-reference" /></label>
    <label className="mt-4 block text-xs font-bold">Payment date<input required type="date" name="paymentDate" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-payment-date" /></label>
    <div className="mt-4"><div className="mb-2 text-xs font-bold">Payment proof</div><label onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }} className={cn('flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center transition-colors', dragOver ? 'border-primary bg-[#eef7f1]' : proof ? 'border-primary/40 bg-[#eef7f1]/40' : 'border-border bg-background hover:bg-muted')} data-testid="dropzone-payment-proof"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" data-testid="input-payment-proof" />{uploading ? <p className="text-xs font-semibold text-muted-foreground">Uploading…</p> : proof ? <>{proof.previewUrl ? <img src={proof.previewUrl} alt="Payment proof preview" className="max-h-20 rounded-lg border border-border object-contain" /> : <FileText size={18} className="text-primary" />}<p className="text-xs font-bold text-primary">{proof.fileName}</p></> : <><UploadCloud size={18} className="text-muted-foreground" /><p className="text-[11px] font-semibold">Drag a file, or click to browse</p></>}</label></div>
    {submitted && <div className="mt-4 rounded-xl bg-[#e6f3ed] p-3 text-xs font-bold text-[#287058]"><CheckCircle2 size={15} className="mr-1 inline" /> Submitted for review</div>}
    <div className="mt-6 flex gap-2"><button disabled={submit.isPending || !method || uploading || selectedPlan === null} className="flex-1 rounded-xl bg-primary py-3 text-xs font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0" data-testid="button-submit-payment">{submit.isPending ? 'Submitting…' : 'Submit for review'}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-border px-4 text-xs font-bold" data-testid="button-hide-payment-form">Close</button></div>
  </form></div>}
  <div className="mt-9"><SectionHeader eyebrow="Your history" title="Payment submissions" />{payments.length ? <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-muted text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id} className="border-t border-border" data-testid={`row-payment-${p.id}`}><td className="px-5 py-4 font-bold">{p.planName}</td><td className="px-5 py-4 font-mono-app text-[11px]">{p.reference}</td><td className="px-5 py-4 text-muted-foreground">{p.submittedAt.slice(0, 10)}</td><td className="px-5 py-4"><Badge tone={p.status === 'approved' ? 'green' : p.status === 'rejected' ? 'red' : 'amber'}>{p.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No submissions yet" body="Your payment history will appear here." />}</div></div>;
}

export default Payments;

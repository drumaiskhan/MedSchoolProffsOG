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
import { AuthLayout, IconField, PasswordStrength, cn, money, BrandSpinner, PaymentDestinationCard, trialScopeLabel, trialFeatureSummary } from '@/lib/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function Register() {
  const [institutionId, setInstitutionId] = useState('');
  const [programKind, setProgramKind] = useState<'MBBS' | 'BDS' | ''>('');
  const [yearNumber, setYearNumber] = useState('');
  const [planId, setPlanId] = useState<number | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponResult, setCouponResult] = useState<{ code: string; discountedAmount: number; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [proof, setProof] = useState<{ storagePath: string; fileName: string; previewUrl: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // College options are now scoped to the chosen program — an MBBS college
  // and a BDS college are different institutions, so showing every college
  // regardless of program (then asking MBBS/BDS separately, unconnected to
  // that choice) let a student pick a college that doesn't even offer the
  // program they're about to select. Query key includes programKind so
  // switching MBBS/BDS refetches the right list instead of reusing MBBS's
  // cached one.
  const institutions = useQuery({ queryKey: ['institutions', 'active', programKind], queryFn: () => academicApi.institutions(true, programKind || undefined), enabled: !!programKind });
  // Changing the program invalidates whichever college was picked under
  // the old program — it may not even be in the new list.
  useEffect(() => { setInstitutionId(''); }, [programKind]);
  const plans = useListMembershipPlans();
  const paymentDetails = useQuery({ queryKey: ['payment-details'], queryFn: publicApi.paymentDetails });
  // Same site-content query Shell (shared.tsx) reads for its post-login
  // trial banner — surfaced here too so a signed-out visitor sees trial
  // availability *before* they commit to picking a plan and uploading
  // payment proof, not just after logging in.
  const siteQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const trialOn = !!siteQ.data?.trial?.active;
  const trialScope = trialScopeLabel(siteQ.data?.trial?.program, siteQ.data?.trial?.years);

  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => setDone(true),
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.'),
  });

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const res = await uploadFile(file, 'payment-proof-signup');
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setProof({ storagePath: res.storagePath, fileName: file.name, previewUrl });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not upload that file. Try a smaller image or PDF.');
    } finally {
      setUploading(false);
    }
  };

  if (done) return <AuthLayout register><div className="w-full text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-[#d7eee4] text-[#164b4b]"><CheckCircle2 size={26} /></div><h1 className="font-display text-3xl tracking-[-.04em]">Almost there</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">We just emailed a 6-digit code to <span className="font-bold text-foreground">{registeredEmail}</span>. Enter it to confirm your email — once our team verifies your payment, your account is activated automatically.</p><Link href={`/verify-email?email=${encodeURIComponent(registeredEmail)}`} className="mt-7 inline-block rounded-xl bg-primary px-6 py-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="link-enter-code">Enter verification code</Link></div></AuthLayout>;

  const selectedPlan = (plans.data || []).find((p) => p.id === planId) || null;
  const bestValueId = (plans.data || []).length > 1 ? [...(plans.data || [])].sort((a, b) => (a.price / a.duration) - (b.price / b.duration))[0].id : null;

  const applyCoupon = async () => {
    if (!planId || !couponInput.trim()) return;
    setCouponChecking(true); setCouponError(null);
    try {
      const result = await couponsApi.validate(couponInput.trim(), planId);
      setCouponResult({ code: couponInput.trim().toUpperCase(), discountedAmount: result.discountedAmount, discountAmount: result.discountAmount });
    } catch (err) {
      setCouponResult(null);
      setCouponError(err instanceof ApiRequestError ? err.message : 'Could not check that code right now.');
    } finally {
      setCouponChecking(false);
    }
  };
  const pd = paymentDetails.data;

  return <AuthLayout register><div className="w-full"><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Create your account</div><h1 className="mt-3 font-display text-4xl tracking-[-.04em]">Join MedschoolProffs.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The complete MCQ bank for MBBS &amp; BDS students — built for daily practice and learning, not exam pressure.</p>

    {trialOn && <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#e5a952] bg-[#fff9ee] p-3 text-xs font-semibold text-[#8a5a12]" data-testid="banner-register-trial-mode"><Sparkles size={14} className="mt-0.5 shrink-0" /><span>Trial mode is on{trialScope ? <> for <strong>{trialScope}</strong> students</> : ''} — you'll get {siteQ.data?.trial ? trialFeatureSummary(siteQ.data.trial.features) : 'free access'} free, right after you verify your email, no need to wait on payment review while it's active.</span></div>}

    <form onSubmit={(e) => {
      e.preventDefault(); setError(null);
      if (!institutionId) { setError('Please select your college.'); return; }
      if (!programKind) { setError('Please select MBBS or BDS.'); return; }
      if (!yearNumber) { setError('Please select your academic year.'); return; }
      if (!planId) { setError('Please choose a membership plan.'); return; }
      if (!proof) { setError('Please upload your payment proof before submitting.'); return; }
      const f = new FormData(e.currentTarget);
      const email = String(f.get('email'));
      setRegisteredEmail(email);
      register.mutate({
        name: String(f.get('name')), email, password: String(f.get('password')),
        phone: String(f.get('phone')), institutionId: Number(institutionId), programKind, yearNumber: Number(yearNumber), planId, proofPath: proof.storagePath,
        couponCode: couponResult?.code,
      });
    }} className="mt-7 space-y-3.5">
      <label className="block text-xs font-bold">Full name<div className="mt-2"><IconField icon={UserIcon} required name="name" placeholder="Your name" data-testid="input-register-name" /></div></label>
      {/* Program now comes before College: MBBS colleges and BDS colleges
          are different institutions, so the college list can't be shown
          (or made sense of) until we know which one the student needs. */}
      <label className="block text-xs font-bold">Program<div className="mt-2 grid grid-cols-2 gap-2">{(['MBBS', 'BDS'] as const).map((p) => <button type="button" key={p} onClick={() => { setProgramKind(p); setYearNumber(''); }} className={cn('h-11 rounded-xl border text-sm font-bold transition-colors', programKind === p ? 'border-primary bg-[#eef7f1] text-primary' : 'border-border bg-card hover:bg-muted')} data-testid={`button-program-${p.toLowerCase()}`}>{p}</button>)}</div></label>
      {/* Radix Select (same component the Flashcards filters use), not a
          native <select> — the native element renders its dropdown via the
          browser itself, which is what made this field's picker (and Past
          Papers' filters) render inconsistently. Validity is still enforced
          manually on submit ("Please select your college."), same as before. */}
      <label className="block text-xs font-bold">College<div className="relative mt-2"><GraduationCap size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 z-10 text-muted-foreground" />
        <Select value={institutionId} onValueChange={setInstitutionId} disabled={!programKind}>
          <SelectTrigger className="h-11 w-full rounded-xl border-border bg-card pl-10 pr-9 text-sm transition-transform hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0" data-testid="select-register-institution">
            <SelectValue placeholder={!programKind ? 'Select program first' : institutions.isLoading ? 'Loading…' : `Select your ${programKind} college`} />
          </SelectTrigger>
          <SelectContent>
            {(institutions.data || []).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>{programKind && !institutions.isLoading && !institutions.data?.length && <p className="mt-1.5 text-[11px] text-muted-foreground">No {programKind} colleges are set up yet — ask an admin to add one first.</p>}</label>
      {/* Buttons (not a <select>) to match the Program picker above — a row
          of tappable year buttons is faster to use on mobile than opening a
          dropdown for a list this short, and keeps the selected year
          visually obvious the same way the MBBS/BDS buttons do. */}
      <label className="block text-xs font-bold">Academic year{!programKind && <span className="ml-2 font-normal text-muted-foreground">(select a program first)</span>}<div className="mt-2 grid grid-cols-5 gap-2">{programKind ? Array.from({ length: programKind === 'MBBS' ? 5 : 4 }, (_, i) => i + 1).map((y) => <button type="button" key={y} onClick={() => setYearNumber(String(y))} className={cn('flex h-11 flex-col items-center justify-center rounded-xl border text-sm font-bold leading-none transition-colors', yearNumber === String(y) ? 'border-primary bg-[#eef7f1] text-primary' : 'border-border bg-card hover:bg-muted')} data-testid={`button-year-${y}`}>{y}<span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">{y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} yr</span></button>) : Array.from({ length: 5 }, (_, i) => <button type="button" disabled key={i} className="h-11 rounded-xl border border-border bg-card text-sm font-bold opacity-40" />)}</div></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold">Email<div className="mt-2"><IconField icon={Mail} required type="email" name="email" placeholder="you@college.edu" data-testid="input-register-email" /></div></label><label className="block text-xs font-bold">WhatsApp number<div className="mt-2"><IconField icon={Phone} required name="phone" placeholder="03xx-xxxxxxx" data-testid="input-register-phone" /></div></label></div>
      <label className="block text-xs font-bold">Password<div className="relative mt-2"><LockKeyhole size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required minLength={8} type={showPassword ? 'text' : 'password'} name="password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-register-password" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" data-testid="button-toggle-password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><PasswordStrength value={passwordValue} /></label>

      <div><div className="mb-2 text-xs font-bold">Selected plan</div><div className="grid gap-3 sm:grid-cols-2">{(plans.data || []).map((plan) => <button type="button" key={plan.id} onClick={() => setPlanId(plan.id)} className={cn('group relative overflow-hidden rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5', planId === plan.id ? 'border-primary bg-[#eef7f1] shadow-sm' : 'border-border bg-card hover:border-primary/40')} data-testid={`button-select-plan-${plan.id}`}>
        {plan.id === bestValueId && <span className="absolute right-3 top-3 rounded-full bg-[#e5a952] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#183844]">Best value</span>}
        {plan.discountLabel && plan.id !== bestValueId && <span className="absolute right-3 top-3 rounded-full bg-[#fff0cb] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#94651c]">{plan.discountLabel}</span>}
        <div className="flex items-center gap-2"><div className={cn('grid size-8 place-items-center rounded-lg', planId === plan.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><CreditCard size={15} /></div>{planId === plan.id && <CheckCircle2 size={16} className="text-primary" />}</div>
        <div className="mt-3 text-sm font-extrabold">{plan.name}</div><div className="mt-1 flex items-center gap-2">{plan.originalPrice != null && plan.originalPrice > plan.price && <span className="text-xs text-muted-foreground line-through">{money(plan.originalPrice, plan.currency)}</span>}<span className="font-display text-2xl">{money(plan.price, plan.currency)}</span></div><div className="mt-1 text-[11px] text-muted-foreground">{plan.duration} {plan.durationUnit} access</div>
      </button>)}{!plans.data?.length && <p className="text-xs text-muted-foreground sm:col-span-2">{plans.isLoading ? 'Loading plans…' : 'No membership plans are available yet — ask an admin to add one.'}</p>}</div></div>
      {selectedPlan && <div className="flex items-center gap-2"><input value={couponInput} onChange={(e) => { setCouponInput(e.target.value); setCouponResult(null); setCouponError(null); }} placeholder="Coupon code (optional)" className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-register-coupon" /><button type="button" onClick={applyCoupon} disabled={!couponInput.trim() || couponChecking} className="h-10 shrink-0 rounded-xl border border-border px-4 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid="button-apply-coupon">{couponChecking ? 'Checking…' : 'Apply'}</button></div>}
      {couponError && <p className="text-[11px] font-bold text-destructive" data-testid="text-coupon-error">{couponError}</p>}
      {couponResult && <p className="text-[11px] font-bold text-primary" data-testid="text-coupon-applied">Coupon applied — new price {selectedPlan ? money(couponResult.discountedAmount, selectedPlan.currency) : couponResult.discountedAmount}</p>}
      {programKind && yearNumber && <p className="text-[11px] text-muted-foreground">You'll see content for <span className="font-bold text-primary">{programKind} · {yearNumber}{yearNumber === '1' ? 'st' : yearNumber === '2' ? 'nd' : yearNumber === '3' ? 'rd' : 'th'} Year</span> — set by your college admin.</p>}

      {pd && <PaymentDestinationCard pd={pd} />}

      <div><div className="mb-2 text-xs font-bold">Upload payment proof <span className="font-normal text-muted-foreground">(required)</span></div><label onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }} className={cn('flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors', dragOver ? 'border-primary bg-[#eef7f1]' : proof ? 'border-primary/40 bg-[#eef7f1]/40' : 'border-border bg-card hover:bg-muted')} data-testid="dropzone-payment-proof">
        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" data-testid="input-payment-proof" />
        {uploading ? <p className="text-xs font-semibold text-muted-foreground">Uploading…</p> : proof ? <>{proof.previewUrl ? <img src={proof.previewUrl} alt="Payment proof preview" className="max-h-28 rounded-lg border border-border object-contain" /> : <FileText size={22} className="text-primary" />}<p className="text-xs font-bold text-primary">{proof.fileName}</p><span className="text-[10px] text-muted-foreground">Click to replace</span></> : <><UploadCloud size={22} className="text-muted-foreground" /><p className="text-xs font-semibold">Drag your payment screenshot here, or click to browse</p><span className="text-[10px] text-muted-foreground">PNG, JPEG, WEBP, or PDF</span></>}
      </label></div>

      {selectedPlan && <div className="flex items-center gap-2 rounded-xl bg-[#eef7f1] p-3 text-xs font-semibold text-primary"><CheckCircle2 size={14} /> Paying {money(couponResult ? couponResult.discountedAmount : selectedPlan.price, selectedPlan.currency)} for {selectedPlan.name} — your order goes to the admin for approval</div>}
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-register-error">{error}</div>}
      <button disabled={register.isPending || uploading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm" data-testid="button-register-submit">{register.isPending && <BrandSpinner size={14} />}{register.isPending ? 'Creating your account…' : 'Create account & submit payment'}</button>
    </form>
    <p className="mt-6 text-center text-xs text-muted-foreground">Already have an account? <Link href="/login" className="font-bold text-primary hover:underline" data-testid="link-login">Sign in</Link></p>
  </div></AuthLayout>;
}

export default Register;

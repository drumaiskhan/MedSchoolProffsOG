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
import { Badge, SectionHeader, cn, AdminAccountSection, FaviconUploader, NotificationBroadcastPanel } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

function AdminSettings() {
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? settingsQuery.data ?? {};
  const save = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => { setForm(null); queryClient.setQueryData(['admin-settings'], data); queryClient.invalidateQueries({ queryKey: ['site-content'] }); },
    onError: (err: unknown) => toast({ title: 'Could not save settings', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const rotate = useMutation({ mutationFn: settingsApi.rotateAdminCode, onSuccess: (data) => setForm({ ...values, ...data }) });
  const testStorage = useMutation({
    mutationFn: settingsApi.testStorage,
    onError: (err: unknown) => toast({ title: 'Could not run the test', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const [testEmailTo, setTestEmailTo] = useState('');
  const testEmail = useMutation({
    mutationFn: settingsApi.testEmail,
    onError: (err: unknown) => toast({ title: 'Could not run the test', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const set = (key: string, value: string) => setForm({ ...values, [key]: value });
  const [tab, setTab] = useState<'general' | 'features' | 'branding' | 'ai' | 'email' | 'storage' | 'security' | 'notifications'>('general');

  // Bug fix: ANNOUNCEMENT_BANNER used to be a single plain-text setting —
  // now it's a JSON array of strings (same pattern as FEATURES_LIST /
  // QUICK_LINKS on the Site content page) so an admin can queue up more
  // than one announcement, which the student app scrolls through in
  // sequence. The try/catch fallback below means a site that still has the
  // old plain-text value saved shows it as a single existing entry instead
  // of silently losing it the first time this page loads.
  let announcements: string[] = [];
  try {
    const parsed = JSON.parse(values.ANNOUNCEMENT_BANNER || '[]');
    if (Array.isArray(parsed)) announcements = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    if (values.ANNOUNCEMENT_BANNER?.trim()) announcements = [values.ANNOUNCEMENT_BANNER.trim()];
  }
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const setAnnouncements = (list: string[]) => set('ANNOUNCEMENT_BANNER', JSON.stringify(list));
  const storageIssue = values.CLOUDINARY_CONFIGURED !== 'true';
  const emailIssue = values.EMAIL_CONFIGURED !== 'true';

  const TABS: Array<{ id: typeof tab; label: string; icon: typeof Sparkles; badge?: boolean }> = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'features', label: 'Features', icon: ToggleLeft },
    { id: 'branding', label: 'Branding', icon: ImageOff },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'email', label: 'Email', icon: Mail, badge: emailIssue },
    { id: 'storage', label: 'Storage', icon: UploadCloud, badge: storageIssue },
    { id: 'security', label: 'Security & access', icon: ShieldCheck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return <div className="max-w-3xl"><SectionHeader eyebrow="Workspace" title="Platform settings" action={<span className="text-[10px] text-muted-foreground">Changes apply to every student instantly</span>} />
    <div className="mb-5 flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5">{TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={cn('relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors', tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} data-testid={`tab-settings-${t.id}`}><t.icon size={13} /> {t.label}{t.badge && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#e5a952]" />}</button>)}</div>

    <div className="space-y-4">
      {tab === 'general' && <>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Platform profile</h3><p className="mt-1 text-xs text-muted-foreground">The details students see across their study desk.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold">Platform name<input value={values.PLATFORM_NAME || ''} onChange={(e) => set('PLATFORM_NAME', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-platform-name" /></label>
          <label className="text-xs font-bold">Support email<input value={values.SUPPORT_EMAIL || ''} onChange={(e) => set('SUPPORT_EMAIL', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-support-email" /></label>
          <label className="text-xs font-bold">WhatsApp support number<input value={values.SUPPORT_WHATSAPP || ''} onChange={(e) => set('SUPPORT_WHATSAPP', e.target.value.replace(/[^\d+]/g, ''))} placeholder="e.g. 923001234567" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-support-whatsapp" /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Country code + number, digits only. Students get a "Chat on WhatsApp" button that opens this number.</span></label>
          <label className="text-xs font-bold sm:col-span-2">Tagline<input value={values.PLATFORM_TAGLINE || ''} onChange={(e) => set('PLATFORM_TAGLINE', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-platform-tagline" /></label>
        </div></div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-bold">Announcement banner</h3>
          <p className="mt-1 text-xs text-muted-foreground">Scrolls across the top of the student app so it's never cut off on mobile. Add more than one and they'll scroll through together, separated by a dot. Remove them all to hide the banner.</p>
          {announcements.length > 0 && <div className="mt-4 space-y-2">
            {announcements.map((a, i) => <div key={i} className="flex items-center gap-2">
              <input value={a} onChange={(e) => setAnnouncements(announcements.map((x, idx) => idx === i ? e.target.value : x))} className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-announcement-${i}`} />
              <button type="button" onClick={() => setAnnouncements(announcements.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Remove announcement" data-testid={`button-remove-announcement-${i}`}><Trash2 size={14} /></button>
            </div>)}
          </div>}
          <div className="mt-3 flex gap-2">
            <input value={newAnnouncement} onChange={(e) => setNewAnnouncement(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newAnnouncement.trim()) { e.preventDefault(); setAnnouncements([...announcements, newAnnouncement.trim()]); setNewAnnouncement(''); } }} placeholder="e.g. New batch enrollment opens Monday" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-new-announcement" />
            <button type="button" onClick={() => { if (newAnnouncement.trim()) { setAnnouncements([...announcements, newAnnouncement.trim()]); setNewAnnouncement(''); } }} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" data-testid="button-add-announcement">Add</button>
          </div>
        </div>
      </>}

      {/* Split out from General — this is every site-wide on/off switch in
          one place, instead of scattered one-per-card wherever a feature
          happened to land when it was built (Registration and AI Visualizer
          were both dropped into General before this). New feature toggles
          belong here going forward. */}
      {tab === 'features' && <>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Registration</h3><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between text-xs font-bold">Open student registration<input type="checkbox" checked={values.REGISTRATION_ENABLED !== 'false'} onChange={(e) => set('REGISTRATION_ENABLED', e.target.checked ? 'true' : 'false')} className="size-4 accent-[#287058]" data-testid="checkbox-registration-enabled" /></label>
        </div><p className="mt-3 text-[11px] text-muted-foreground">Payment methods, bank accounts, and collection details have moved to <Link href="/admin/payments" className="font-bold text-primary">Payments &amp; collection</Link>.</p></div>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">AI Visualizer</h3><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between text-xs font-bold">Show in student sidebar<input type="checkbox" checked={values.AI_VISUALIZER_ENABLED !== 'false'} onChange={(e) => set('AI_VISUALIZER_ENABLED', e.target.checked ? 'true' : 'false')} className="size-4 accent-[#287058]" data-testid="checkbox-ai-visualizer-enabled" /></label>
        </div><p className="mt-3 text-[11px] text-muted-foreground">Off removes the "AI Visualizer" link from every student's sidebar and blocks the page directly; on brings it right back — no need to save anything else.</p></div>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Ask AI to explain</h3><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between text-xs font-bold">Show "Ask AI to explain differently" button<input type="checkbox" checked={values.AI_EXPLAIN_ENABLED !== 'false'} onChange={(e) => set('AI_EXPLAIN_ENABLED', e.target.checked ? 'true' : 'false')} className="size-4 accent-[#287058]" data-testid="checkbox-ai-explain-enabled" /></label>
        </div><p className="mt-3 text-[11px] text-muted-foreground">Off removes the button everywhere students see it — MCQs, flashcards, and past papers (past papers are practiced through the same MCQ screen) — and blocks it directly if someone still has it open in a tab; on brings it right back. Doesn't touch admin-side AI generation (bulk explanations, AI-generated MCQs/flashcards) or auto-explain-on-import, configured below.</p></div>
        <div className={cn('rounded-2xl border p-6', values.GLOBAL_TRIAL_MODE === 'true' ? 'border-[#e5a952] bg-[#fff9ee]' : 'border-border bg-card')}><h3 className="font-bold">General trial mode</h3><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between text-xs font-bold">Give students full access<input type="checkbox" checked={values.GLOBAL_TRIAL_MODE === 'true'} onChange={(e) => set('GLOBAL_TRIAL_MODE', e.target.checked ? 'true' : 'false')} className="size-4 accent-[#e5a952]" data-testid="checkbox-global-trial-mode" /></label>
        </div>
        {values.GLOBAL_TRIAL_MODE === 'true' && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold">Limit to Program<select value={values.GLOBAL_TRIAL_PROGRAM || ''} onChange={(e) => set('GLOBAL_TRIAL_PROGRAM', e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-global-trial-program"><option value="">All Programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select></label>
          <label className="block text-xs font-bold">Limit to Year Group<select value={values.GLOBAL_TRIAL_YEAR || ''} onChange={(e) => set('GLOBAL_TRIAL_YEAR', e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-global-trial-year"><option value="">All Years</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}{y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year</option>)}</select></label>
        </div>}
        <p className="mt-3 text-[11px] text-muted-foreground">Unlocks every membership-gated page — MCQs, flashcards, exams, books, everything — regardless of payment/membership status, for <strong>{values.GLOBAL_TRIAL_MODE === 'true' && (values.GLOBAL_TRIAL_PROGRAM || values.GLOBAL_TRIAL_YEAR) ? [values.GLOBAL_TRIAL_PROGRAM, values.GLOBAL_TRIAL_YEAR && `${values.GLOBAL_TRIAL_YEAR}${values.GLOBAL_TRIAL_YEAR === '1' ? 'st' : values.GLOBAL_TRIAL_YEAR === '2' ? 'nd' : values.GLOBAL_TRIAL_YEAR === '3' ? 'rd' : 'th'} Year`].filter(Boolean).join(' · ') + ' students' : 'every signed-in student'}</strong>. Leave both dropdowns on "All" to open it to everyone. Doesn't touch anyone's individual membership record, so turning this back off (or narrowing the scope) instantly restores normal per-student access with nothing to undo. This is separate from granting a trial to one student at a time on <Link href="/admin/students" className="font-bold text-primary">Students</Link>. {values.GLOBAL_TRIAL_MODE === 'true' && <span className="font-bold text-[#8a5a12]">Currently ON{(values.GLOBAL_TRIAL_PROGRAM || values.GLOBAL_TRIAL_YEAR) ? ' for the group above' : ' — the whole platform is free to use right now'}.</span>}</p></div>
      </>}

      {tab === 'branding' && <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Website favicon</h3><p className="mt-1 text-xs text-muted-foreground">The small icon shown in browser tabs and bookmarks.</p><div className="mt-5">
        <FaviconUploader currentUrl={values.SITE_FAVICON_URL || ''} onUploaded={(storagePath) => set('SITE_FAVICON_PATH', storagePath)} />
      </div></div>}

      {tab === 'ai' && <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">AI ("Ask AI to explain")</h3><p className="mt-1 text-xs text-muted-foreground">Powers the "Ask AI to explain differently" button students see on MCQs and flashcards, plus admin-side AI-generated questions, explanations, and flashcard drafts. Falls back to the server's ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY env vars if left blank here.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold">Provider<select value={values.AI_PROVIDER || 'anthropic'} onChange={(e) => set('AI_PROVIDER', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-ai-provider"><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="custom">Custom (OpenAI-compatible)</option></select></label>
        <label className="text-xs font-bold">API key{values.AI_API_KEY_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.AI_API_KEY_MASKED}</span>}<input type="password" value={values.AI_API_KEY || ''} onChange={(e) => set('AI_API_KEY', e.target.value)} placeholder={values.AI_API_KEY_SET === 'true' ? 'Leave blank to keep current key' : 'sk-...'} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-api-key" /></label>
        <label className="text-xs font-bold">Model <span className="font-normal text-muted-foreground">(optional — leave blank for the provider's default)</span><input value={values.AI_MODEL || ''} onChange={(e) => set('AI_MODEL', e.target.value)} placeholder="e.g. claude-sonnet-4-6, gpt-4o-mini, gemini-flash-latest" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-model" /></label>
        {values.AI_PROVIDER === 'custom' && <label className="text-xs font-bold">Base URL <span className="font-normal text-muted-foreground">(required for Custom — an OpenAI-compatible /chat/completions endpoint)</span><input value={values.AI_BASE_URL || ''} onChange={(e) => set('AI_BASE_URL', e.target.value)} placeholder="https://api.example.com/v1" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-base-url" /></label>}
      </div>
      <div className="mt-6 border-t border-border pt-5">
        <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Backup AI providers <span className="font-normal normal-case text-muted-foreground/80">(optional, up to 5)</span></h4>
        <p className="mt-1 text-xs text-muted-foreground">Tried automatically, in order, whenever an earlier provider's request fails — an outage, a rate limit, an expired key, a timeout — so one API running out or going down doesn't take "Ask AI to explain" down with it; the request just moves on to the next one you've configured. Mix and match providers/accounts (e.g. Anthropic, then OpenAI, then a couple of Groq/OpenRouter keys via Custom) for up to 6 total including the primary above. Leave a slot blank to skip it — earlier slots (and any ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY env vars, which are still tried last) keep working exactly as before.</p>
        {(['2', '3', '4', '5', '6'] as const).map((n) => {
          const providerKey = `AI_PROVIDER_${n}`, apiKeyKey = `AI_API_KEY_${n}`, modelKey = `AI_MODEL_${n}`, baseUrlKey = `AI_BASE_URL_${n}`;
          return <div key={n} className="mt-4 grid gap-4 border-t border-border/60 pt-4 first:mt-0 first:border-t-0 first:pt-0 sm:grid-cols-2">
            <label className="text-xs font-bold">Backup {Number(n) - 1} provider<select value={values[providerKey] || ''} onChange={(e) => set(providerKey, e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid={`select-ai-provider-${n}`}><option value="">None — slot not configured</option><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="custom">Custom (OpenAI-compatible)</option></select></label>
            {values[providerKey] && <>
              <label className="text-xs font-bold">API key{values[`${apiKeyKey}_SET`] === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values[`${apiKeyKey}_MASKED`]}</span>}<input type="password" value={values[apiKeyKey] || ''} onChange={(e) => set(apiKeyKey, e.target.value)} placeholder={values[`${apiKeyKey}_SET`] === 'true' ? 'Leave blank to keep current key' : 'sk-...'} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid={`input-ai-api-key-${n}`} /></label>
              <label className="text-xs font-bold">Model <span className="font-normal text-muted-foreground">(optional — leave blank for the provider's default)</span><input value={values[modelKey] || ''} onChange={(e) => set(modelKey, e.target.value)} placeholder="e.g. claude-sonnet-4-6, gpt-4o-mini, gemini-flash-latest" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid={`input-ai-model-${n}`} /></label>
              {values[providerKey] === 'custom' && <label className="text-xs font-bold">Base URL <span className="font-normal text-muted-foreground">(required for Custom — an OpenAI-compatible /chat/completions endpoint)</span><input value={values[baseUrlKey] || ''} onChange={(e) => set(baseUrlKey, e.target.value)} placeholder="https://api.example.com/v1" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid={`input-ai-base-url-${n}`} /></label>}
            </>}
          </div>;
        })}
      </div>
      <div className="mt-6 border-t border-border pt-5">
        <label className="flex items-start gap-2.5 text-xs font-bold"><input type="checkbox" checked={values.AI_AUTO_EXPLAIN_ON_IMPORT === 'true'} onChange={(e) => set('AI_AUTO_EXPLAIN_ON_IMPORT', e.target.checked ? 'true' : 'false')} className="mt-0.5 size-4 accent-[#287058]" data-testid="checkbox-ai-auto-explain-import" /><span>Auto-generate explanations &amp; hints on MCQ import<span className="mt-1 block font-normal text-muted-foreground">Uses the same provider/API key above (and the backup, if configured). Every imported question that doesn't already have an explanation gets one queued automatically (across every module/subject and exam/past-paper import), landing as "AI generated — awaiting review," never auto-approved. Runs in the background — a large import won't wait on it.</span></span></label>
        {values.AI_AUTO_EXPLAIN_ON_IMPORT === 'true' && <label className="mt-4 block text-xs font-bold">Bulk-generation model <span className="font-normal text-muted-foreground">(optional override — e.g. a cheaper/faster model for high-volume auto-explain; leave blank to use the Model field above)</span><input value={values.AI_AUTO_EXPLAIN_MODEL || ''} onChange={(e) => set('AI_AUTO_EXPLAIN_MODEL', e.target.value)} placeholder="e.g. claude-haiku-4-5, gpt-4o-mini" className="mt-2 h-10 w-full max-w-sm rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-ai-auto-explain-model" /></label>}
      </div>
      </div>}

      {tab === 'email' && <>
        {emailIssue && <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-5 text-xs text-[#9e4c39]" data-testid="banner-email-warning"><div className="flex items-center gap-2 font-bold"><CircleHelp size={15} /> No email provider is configured</div><p className="mt-1.5 leading-5 text-[#a96a5b]">Verification, welcome, password reset, membership/trial, and payment emails are all logged to the server console instead of actually sent until one of the providers below is set up.</p></div>}
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="flex items-center gap-2 font-bold">Email provider {values.EMAIL_CONFIGURED === 'true' && <Badge tone="green">Configured</Badge>}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Used for every automated email the platform sends: account verification, welcome, forgot/reset password, membership activated, trial started, and payment submitted/rejected. Pick one provider — the fields for the other two can stay filled in without being used.</p>
          <label className="mt-4 block text-xs font-bold">Provider<select value={values.EMAIL_PROVIDER || ''} onChange={(e) => set('EMAIL_PROVIDER', e.target.value)} className="mt-2 h-10 w-full max-w-xs rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-email-provider"><option value="">None — use server env vars only</option><option value="brevo">Brevo</option><option value="smtp">SMTP</option><option value="custom">Custom API</option></select></label>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold">"From" email<input value={values.MAIL_FROM || ''} onChange={(e) => set('MAIL_FROM', e.target.value)} placeholder="no-reply@yourdomain.com" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-mail-from" /></label>
            <label className="text-xs font-bold">"From" name<input value={values.MAIL_FROM_NAME || ''} onChange={(e) => set('MAIL_FROM_NAME', e.target.value)} placeholder="MedschoolProffs" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-mail-from-name" /></label>
          </div>

          {values.EMAIL_PROVIDER === 'brevo' && <div className="mt-5 border-t border-border pt-5">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Brevo</h4>
            <label className="mt-3 block text-xs font-bold">API key{values.BREVO_API_KEY_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.BREVO_API_KEY_MASKED}</span>}<input type="password" value={values.BREVO_API_KEY || ''} onChange={(e) => set('BREVO_API_KEY', e.target.value)} placeholder={values.BREVO_API_KEY_SET === 'true' ? 'Leave blank to keep current key' : 'xkeysib-...'} className="mt-2 h-10 w-full max-w-sm rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-brevo-api-key" /></label>
            <p className="mt-2 text-[11px] text-muted-foreground">From Brevo: Settings → SMTP &amp; API → API keys.</p>
          </div>}

          {values.EMAIL_PROVIDER === 'smtp' && <div className="mt-5 border-t border-border pt-5">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">SMTP</h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold">Host<input value={values.SMTP_HOST || ''} onChange={(e) => set('SMTP_HOST', e.target.value)} placeholder="smtp.yourprovider.com" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-smtp-host" /></label>
              <label className="text-xs font-bold">Port<input value={values.SMTP_PORT || ''} onChange={(e) => set('SMTP_PORT', e.target.value.replace(/[^\d]/g, ''))} placeholder="587" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-smtp-port" /></label>
              <label className="text-xs font-bold">Username<input value={values.SMTP_USER || ''} onChange={(e) => set('SMTP_USER', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-smtp-user" /></label>
              <label className="text-xs font-bold">Password{values.SMTP_PASS_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.SMTP_PASS_MASKED}</span>}<input type="password" value={values.SMTP_PASS || ''} onChange={(e) => set('SMTP_PASS', e.target.value)} placeholder={values.SMTP_PASS_SET === 'true' ? 'Leave blank to keep current password' : ''} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-smtp-pass" /></label>
            </div>
          </div>}

          {values.EMAIL_PROVIDER === 'custom' && <div className="mt-5 border-t border-border pt-5">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Custom API</h4>
            <p className="mt-1 text-[11px] text-muted-foreground">For any provider that isn't Brevo — Postmark, Resend, an internal mailer, etc. Point this at an endpoint that accepts a JSON body: <code className="rounded bg-background px-1 py-0.5">{'{ to, subject, html, from, fromName }'}</code>.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold sm:col-span-2">Endpoint URL<input value={values.CUSTOM_EMAIL_API_URL || ''} onChange={(e) => set('CUSTOM_EMAIL_API_URL', e.target.value)} placeholder="https://api.example.com/send-email" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-custom-email-url" /></label>
              <label className="text-xs font-bold">API key{values.CUSTOM_EMAIL_API_KEY_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.CUSTOM_EMAIL_API_KEY_MASKED}</span>}<input type="password" value={values.CUSTOM_EMAIL_API_KEY || ''} onChange={(e) => set('CUSTOM_EMAIL_API_KEY', e.target.value)} placeholder={values.CUSTOM_EMAIL_API_KEY_SET === 'true' ? 'Leave blank to keep current key' : ''} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-custom-email-key" /></label>
              <label className="text-xs font-bold">Header name <span className="font-normal text-muted-foreground">(default: Authorization)</span><input value={values.CUSTOM_EMAIL_API_KEY_HEADER || ''} onChange={(e) => set('CUSTOM_EMAIL_API_KEY_HEADER', e.target.value)} placeholder="Authorization" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-custom-email-header" /></label>
              <label className="text-xs font-bold sm:col-span-2">Header prefix <span className="font-normal text-muted-foreground">(default: "Bearer " — clear this for providers that want the raw key, e.g. an "api-key" header)</span><input value={values.CUSTOM_EMAIL_API_KEY_PREFIX ?? ''} onChange={(e) => set('CUSTOM_EMAIL_API_KEY_PREFIX', e.target.value)} placeholder="Bearer " className="mt-2 h-10 w-full max-w-xs rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-custom-email-prefix" /></label>
            </div>
          </div>}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-bold">Send a test email</h3>
          <p className="mt-1 text-xs text-muted-foreground">Save your settings first, then send a real test email to confirm the provider above actually works — not just that the fields aren't blank.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input type="email" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} placeholder="you@example.com" className="h-10 w-64 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-test-email-to" />
            <button type="button" onClick={() => testEmail.mutate(testEmailTo)} disabled={testEmail.isPending || !testEmailTo} className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold disabled:opacity-50" data-testid="button-test-email">{testEmail.isPending ? 'Sending…' : 'Send test email'}</button>
            {testEmail.data && (testEmail.data.ok ? <Badge tone="green">Sent</Badge> : <Badge tone="red">Failed</Badge>)}
          </div>
          {testEmail.data && !testEmail.data.ok && <p className="mt-2 rounded-xl bg-[#fff5f0] p-3 text-[11px] text-[#9e4c39]" data-testid="text-email-test-error">{testEmail.data.error}</p>}
        </div>
      </>}

      {tab === 'storage' && <>
        {storageIssue && <div className="rounded-2xl border border-[#efc7bc] bg-[#fff5f0] p-5 text-xs text-[#9e4c39]" data-testid="banner-storage-warning"><div className="flex items-center gap-2 font-bold"><CircleHelp size={15} /> No file storage is configured</div><p className="mt-1.5 leading-5 text-[#a96a5b]">Every upload (favicon, payment QR code, payment proofs, team photos, MCQ images, books, resources) goes through Cloudinary — there's no fallback, so uploads will fail until it's configured below.</p></div>}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">The green "Saved" badge below only means credentials were entered — it doesn't confirm the connection actually works. Save your settings first, then test.</p>
          <button type="button" onClick={() => testStorage.mutate()} disabled={testStorage.isPending} className="ml-4 shrink-0 rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold disabled:opacity-50" data-testid="button-test-storage">{testStorage.isPending ? 'Testing…' : 'Test connection'}</button>
        </div>
        <p className="text-[11px] text-muted-foreground">Supabase is used for this platform's database only — file storage runs on Cloudinary.</p>
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="flex items-center gap-2 font-bold">Cloudinary {values.CLOUDINARY_CONFIGURED === 'true' && <Badge tone="green">Saved</Badge>}
            {testStorage.data && (testStorage.data.cloudinary.ok
              ? <Badge tone="green">Connected</Badge>
              : <Badge tone="red">Not working</Badge>)}
          </h3><p className="mt-1 text-xs text-muted-foreground">Used for large files — book PDFs, resource files, and anything over ~5MB regardless of type.</p>
          {testStorage.data && !testStorage.data.cloudinary.ok && <p className="mt-2 rounded-xl bg-[#fff5f0] p-3 text-[11px] text-[#9e4c39]" data-testid="text-cloudinary-test-error">{testStorage.data.cloudinary.error}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">Cloud name<input value={values.CLOUDINARY_CLOUD_NAME || ''} onChange={(e) => set('CLOUDINARY_CLOUD_NAME', e.target.value)} placeholder="my-cloud-name" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-cloud-name" /></label>
            <label className="text-xs font-bold">API key<input value={values.CLOUDINARY_API_KEY || ''} onChange={(e) => set('CLOUDINARY_API_KEY', e.target.value)} placeholder="123456789012345" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-api-key" /></label>
            <label className="text-xs font-bold sm:col-span-2">API secret{values.CLOUDINARY_API_SECRET_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.CLOUDINARY_API_SECRET_MASKED}</span>}<input type="password" value={values.CLOUDINARY_API_SECRET || ''} onChange={(e) => set('CLOUDINARY_API_SECRET', e.target.value)} placeholder={values.CLOUDINARY_API_SECRET_SET === 'true' ? 'Leave blank to keep current key' : 'abc123...'} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-api-secret" /></label>
          </div>
        </div>

        {/* Backup slot — same "extra numbered slot, tried automatically on
            failure" idea as the AI tab's backup providers, just one slot
            instead of five (a second Cloudinary account is heavier to set
            up than an extra API key, and one backup covers "the primary
            plan filled up" — the actual ask — without over-building this). */}
        <div className="rounded-2xl border border-border bg-card p-6"><h3 className="flex items-center gap-2 font-bold">Backup Cloudinary account <span className="font-normal normal-case text-muted-foreground/80 text-[11px]">(optional)</span>
            {values.CLOUDINARY_BACKUP_CONFIGURED === 'true' && <Badge tone="green">Saved</Badge>}
            {testStorage.data && (testStorage.data.cloudinaryBackup.ok
              ? <Badge tone="green">Connected</Badge>
              : values.CLOUDINARY_BACKUP_CONFIGURED === 'true' && <Badge tone="red">Not working</Badge>)}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">A second Cloudinary account, tried automatically whenever the primary one's upload fails for any reason — full on its plan quota, a bad/expired key, a temporary outage. Every upload still tries the primary account first; this only kicks in on failure, so leaving it blank behaves exactly as before. Existing files aren't moved — this only affects new uploads made after the primary account starts failing.</p>
          {testStorage.data && values.CLOUDINARY_BACKUP_CONFIGURED === 'true' && !testStorage.data.cloudinaryBackup.ok && <p className="mt-2 rounded-xl bg-[#fff5f0] p-3 text-[11px] text-[#9e4c39]" data-testid="text-cloudinary-backup-test-error">{testStorage.data.cloudinaryBackup.error}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">Cloud name<input value={values.CLOUDINARY_CLOUD_NAME_2 || ''} onChange={(e) => set('CLOUDINARY_CLOUD_NAME_2', e.target.value)} placeholder="my-backup-cloud-name" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-backup-cloud-name" /></label>
            <label className="text-xs font-bold">API key<input value={values.CLOUDINARY_API_KEY_2 || ''} onChange={(e) => set('CLOUDINARY_API_KEY_2', e.target.value)} placeholder="123456789012345" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-backup-api-key" /></label>
            <label className="text-xs font-bold sm:col-span-2">API secret{values.CLOUDINARY_API_SECRET_2_SET === 'true' && <span className="ml-2 font-normal text-muted-foreground">Currently set · {values.CLOUDINARY_API_SECRET_2_MASKED}</span>}<input type="password" value={values.CLOUDINARY_API_SECRET_2 || ''} onChange={(e) => set('CLOUDINARY_API_SECRET_2', e.target.value)} placeholder={values.CLOUDINARY_API_SECRET_2_SET === 'true' ? 'Leave blank to keep current key' : 'abc123...'} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-cloudinary-backup-api-secret" /></label>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Save settings below, then re-upload anything affected by a past storage issue — old files aren't retroactively moved.</p>
      </>}

      {tab === 'security' && <div className="rounded-2xl border border-primary/30 bg-[#eef7f1] p-6"><h3 className="font-bold">Admin sign-up invite code</h3><p className="mt-1 text-xs text-muted-foreground">Share this code with anyone who should be able to create an admin account at <code className="rounded bg-card px-1 py-0.5">/admin-signup/1</code>. Rotate it any time to revoke access for anyone who has the old code.</p><div className="mt-4 flex flex-wrap items-center gap-3"><input value={values.ADMIN_SIGNUP_CODE || ''} onChange={(e) => set('ADMIN_SIGNUP_CODE', e.target.value)} className="h-10 w-56 rounded-xl border border-border bg-card px-3 text-xs font-mono-app tracking-wider" data-testid="input-admin-signup-code" /><button type="button" onClick={() => rotate.mutate()} disabled={rotate.isPending} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-rotate-admin-code">{rotate.isPending ? 'Rotating…' : 'Generate new code'}</button></div>
        {values.ADMIN_SIGNUP_CODE && <div className="mt-3 flex flex-wrap items-center gap-2"><input readOnly value={`${window.location.origin}/admin-signup/1?code=${encodeURIComponent(values.ADMIN_SIGNUP_CODE)}`} className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[11px] text-muted-foreground" data-testid="input-admin-invite-link" onFocus={(e) => e.currentTarget.select()} /><button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/admin-signup/1?code=${encodeURIComponent(values.ADMIN_SIGNUP_CODE || '')}`); toast({ title: 'Invite link copied' }); }} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground" data-testid="button-copy-admin-invite-link"><Copy size={12} /> Copy link</button></div>}
      </div>}

      {tab === 'notifications' && <NotificationBroadcastPanel />}
    </div>

    {tab !== 'notifications' && <button onClick={() => save.mutate(values)} disabled={save.isPending} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-settings">{save.isPending ? 'Saving…' : save.isSuccess && !form ? 'Settings saved' : 'Save settings'}</button>}
    <AdminAccountSection />
  </div>;
}

// Send a one-off notification to students, optionally narrowed to a
// program (MBBS/BDS) and/or academic year — a separate "Send" action
// rather than a settings field, since it fires immediately instead of
// being saved for later like the rest of this page.

export default AdminSettings;

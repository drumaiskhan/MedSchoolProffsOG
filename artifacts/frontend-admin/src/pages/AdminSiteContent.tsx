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
import { AdminImageUpload, ColorField, SectionHeader, cn } from '@/lib/shared';

function AdminSiteContent() {
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? settingsQuery.data ?? {};
  const save = useMutation({ mutationFn: settingsApi.update, onSuccess: (data) => { setForm(null); queryClient.setQueryData(['admin-settings'], data); queryClient.invalidateQueries({ queryKey: ['site-content'] }); } });
  const set = (key: string, value: string) => setForm({ ...values, [key]: value });

  let features: string[] = [];
  try { features = JSON.parse(values.FEATURES_LIST || '[]'); } catch { features = []; }
  const [newFeature, setNewFeature] = useState('');
  const setFeatures = (list: string[]) => set('FEATURES_LIST', JSON.stringify(list));

  let quickLinks: Array<{ label: string; url: string }> = [];
  try { quickLinks = JSON.parse(values.QUICK_LINKS || '[]'); } catch { quickLinks = []; }
  const setQuickLinks = (list: Array<{ label: string; url: string }>) => set('QUICK_LINKS', JSON.stringify(list));

  const theme = {
    primary: values.THEME_PRIMARY || DEFAULT_THEME.THEME_PRIMARY,
    secondary: values.THEME_SECONDARY || DEFAULT_THEME.THEME_SECONDARY,
    accent: values.THEME_ACCENT || DEFAULT_THEME.THEME_ACCENT,
    background: values.THEME_BACKGROUND || DEFAULT_THEME.THEME_BACKGROUND,
    card: values.THEME_CARD || DEFAULT_THEME.THEME_CARD,
    text: values.THEME_TEXT || DEFAULT_THEME.THEME_TEXT,
    mode: values.THEME_MODE || DEFAULT_THEME.THEME_MODE,
  };

  return <div className="max-w-3xl"><SectionHeader eyebrow="Site content" title="Footer & public content" action={<span className="text-[10px] text-muted-foreground">Shown across the sign-in pages and student profile</span>} />
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Design &amp; branding</h3><span className="text-[10px] text-muted-foreground">Applies across the student and admin apps, including sign-in pages</span></div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField label="Primary" value={theme.primary} onChange={(v) => set('THEME_PRIMARY', v)} testId="theme-primary" />
              <ColorField label="Secondary" value={theme.secondary} onChange={(v) => set('THEME_SECONDARY', v)} testId="theme-secondary" />
              <ColorField label="Accent" value={theme.accent} onChange={(v) => set('THEME_ACCENT', v)} testId="theme-accent" />
              <ColorField label="Background" value={theme.background} onChange={(v) => set('THEME_BACKGROUND', v)} testId="theme-background" />
              <ColorField label="Card" value={theme.card} onChange={(v) => set('THEME_CARD', v)} testId="theme-card" />
              <ColorField label="Text" value={theme.text} onChange={(v) => set('THEME_TEXT', v)} testId="theme-text" />
            </div>
            <div className="mt-5">
              <div className="text-xs font-bold">Theme mode</div>
              <div className="mt-2 inline-flex rounded-xl border border-border bg-background p-1">
                <button type="button" onClick={() => set('THEME_MODE', 'light')} className={cn('flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-colors', theme.mode === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid="button-theme-mode-light">Light</button>
                <button type="button" onClick={() => set('THEME_MODE', 'dark')} className={cn('flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-colors', theme.mode === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid="button-theme-mode-dark">Dark</button>
              </div>
            </div>
            <div className="mt-5">
              <div className="text-xs font-bold">Dashboard greeting photo</div>
              <div className="mt-2"><AdminImageUpload currentUrl={values.DASHBOARD_HERO_IMAGE_URL || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional — shown behind the student Dashboard's greeting card (e.g. a stethoscope photo). PNG, JPEG, or WEBP. Falls back to a plain pattern when unset." testId="input-dashboard-hero-upload" onUploaded={(storagePath) => set('DASHBOARD_HERO_IMAGE_PATH', storagePath)} /></div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Theme preview</div>
            <div className="mt-2 overflow-hidden rounded-xl border border-border" style={{ backgroundColor: theme.background }} data-testid="panel-theme-preview">
              <div className="m-3 overflow-hidden rounded-lg shadow-sm" style={{ backgroundColor: theme.card }}>
                <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: theme.primary }}>
                  <span className="grid size-5 place-items-center rounded-md" style={{ backgroundColor: theme.accent }}><Stethoscope size={11} color="#fff" /></span>
                  <span className="text-[10px] font-extrabold" style={{ color: readableForegroundHsl(theme.primary) === '0 0% 100%' ? '#fff' : theme.text }}>Dashboard</span>
                </div>
                <div className="space-y-2 p-3">
                  <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: theme.secondary, opacity: 0.4 }} />
                  <div className="h-2 w-1/2 rounded-full" style={{ backgroundColor: theme.secondary, opacity: 0.25 }} />
                  <button type="button" className="mt-2 rounded-md px-3 py-1.5 text-[10px] font-extrabold text-white" style={{ backgroundColor: theme.primary }}>Continue</button>
                  <span className="ml-2 inline-block rounded-md px-3 py-1.5 text-[10px] font-extrabold" style={{ backgroundColor: theme.accent, color: '#fff' }}>68%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">About</h3><label className="mt-4 block text-xs font-bold">Platform description<textarea value={values.PLATFORM_DESCRIPTION || ''} onChange={(e) => set('PLATFORM_DESCRIPTION', e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-xs" data-testid="input-platform-description" /></label></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Social links</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Facebook<input value={values.SOCIAL_FACEBOOK || ''} onChange={(e) => set('SOCIAL_FACEBOOK', e.target.value)} placeholder="https://facebook.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-facebook" /></label>
        <label className="text-xs font-bold">YouTube<input value={values.SOCIAL_YOUTUBE || ''} onChange={(e) => set('SOCIAL_YOUTUBE', e.target.value)} placeholder="https://youtube.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-youtube" /></label>
        <label className="text-xs font-bold">LinkedIn<input value={values.SOCIAL_LINKEDIN || ''} onChange={(e) => set('SOCIAL_LINKEDIN', e.target.value)} placeholder="https://linkedin.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-linkedin" /></label>
        <label className="text-xs font-bold">Instagram<input value={values.SOCIAL_INSTAGRAM || ''} onChange={(e) => set('SOCIAL_INSTAGRAM', e.target.value)} placeholder="https://instagram.com/…" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-social-instagram" /></label>
      </div></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Contact info</h3><div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold">Email<input value={values.CONTACT_EMAIL || ''} onChange={(e) => set('CONTACT_EMAIL', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-contact-email" /></label>
        <label className="text-xs font-bold">Location<input value={values.CONTACT_LOCATION || ''} onChange={(e) => set('CONTACT_LOCATION', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-contact-location" /></label>
        <label className="text-xs font-bold">Support hours<input value={values.SUPPORT_HOURS || ''} onChange={(e) => set('SUPPORT_HOURS', e.target.value)} placeholder="24/7 Available" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-support-hours" /></label>
      </div></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Feature highlights</h3><div className="mt-3 flex flex-wrap gap-2">{features.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{f}<button onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-feature-${i}`}><X size={12} /></button></span>)}</div><div className="mt-3 flex gap-2"><input value={newFeature} onChange={(e) => setNewFeature(e.target.value)} placeholder="e.g. 30,000+ MCQs" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-new-feature" /><button type="button" onClick={() => { if (newFeature.trim()) { setFeatures([...features, newFeature.trim()]); setNewFeature(''); } }} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" data-testid="button-add-feature">Add</button></div></div>

      <div className="rounded-2xl border border-border bg-card p-6"><h3 className="font-bold">Quick links</h3><div className="mt-3 space-y-2">{quickLinks.map((l, i) => <div key={i} className="flex items-center gap-2"><input value={l.label} onChange={(e) => setQuickLinks(quickLinks.map((q, idx) => idx === i ? { ...q, label: e.target.value } : q))} className="h-9 w-32 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-quicklink-label-${i}`} /><input value={l.url} onChange={(e) => setQuickLinks(quickLinks.map((q, idx) => idx === i ? { ...q, url: e.target.value } : q))} className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-quicklink-url-${i}`} /><button onClick={() => setQuickLinks(quickLinks.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-quicklink-${i}`}><Trash2 size={14} /></button></div>)}<button type="button" onClick={() => setQuickLinks([...quickLinks, { label: '', url: '/' }])} className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-primary" data-testid="button-add-quicklink"><Plus size={13} /> Add link</button></div></div>

      <label className="block text-xs font-bold">Copyright notice<input value={values.COPYRIGHT_NOTICE || ''} onChange={(e) => set('COPYRIGHT_NOTICE', e.target.value)} placeholder="All rights reserved." className="mt-2 h-10 w-full max-w-sm rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-copyright-notice" /></label>
      <button onClick={() => save.mutate(values)} disabled={save.isPending} className="rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-site-content">{save.isPending ? 'Saving…' : save.isSuccess && !form ? 'Saved' : 'Save site content'}</button>
    </div>
  </div>;
}

export default AdminSiteContent;

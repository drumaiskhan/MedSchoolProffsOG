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
import { authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, analyticsApi, mcqImportApi, flashcardImportApi, mcqBackupApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, subjectAdminApi, topicAdminApi, flashcardsAdminApi, flashcardsAiApi, booksAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blockAdminApi, examsAdminApi, examsApi, explanationsApi, auditApi, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type FlashcardCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type TeamCategory, type AdminModule, type AdminBlock, type AdminSubject, type AdminTopic, type AdminFlashcard, type GeneratedFlashcard, type AdminMcqRow, type AdminBook, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type BankAccount, type PaymentMethodConfig, aiVisualizerAdminApi, type AiVisualizerLogEntry, type AuditLogEntry } from '@/lib/api';

// Round 3, item 10 (performance) — same over-fetching fix as the student
// app (see its App.tsx for the full rationale): `new QueryClient()` with no
// options refetched on every mount and every window refocus. Admin
// mutations already call invalidateQueries on the specific keys they
// change, so edits still show up immediately — this only avoids redundant
// background refetches of data nothing has touched.
import { AuthLayout, BrandSpinner } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

function AdminSignup() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const codeFromUrl = new URLSearchParams(search).get('code') || '';
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const register = useMutation({
    mutationFn: authApi.adminRegister,
    onSuccess: () => { queryClient.invalidateQueries(); setLocation('/admin'); },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.'),
  });
  return <AuthLayout><div className="w-full"><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Restricted</div><h1 className="mt-3 font-display text-4xl tracking-[-.04em]">Create an admin account.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">You'll need the invite code from an existing admin (Admin → Platform settings).</p><form onSubmit={(e) => { e.preventDefault(); setError(null); const f = new FormData(e.currentTarget); register.mutate({ name: String(f.get('name')), email: String(f.get('email')), password: String(f.get('password')), inviteCode: String(f.get('inviteCode')) }); }} className="mt-7 space-y-3">
    <label className="block text-xs font-bold">Full name<div className="relative mt-2"><UserIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="name" className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-name" /></div></label>
    <label className="block text-xs font-bold">Email<div className="relative mt-2"><Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required type="email" name="email" className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-email" /></div></label>
    <label className="block text-xs font-bold">Password<div className="relative mt-2"><LockKeyhole size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required minLength={10} type={showPassword ? 'text' : 'password'} name="password" className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-11 text-sm outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-password" /><button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground" data-testid="button-toggle-admin-signup-password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
    <label className="block text-xs font-bold">Invite code<div className="relative mt-2"><ShieldCheck size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input required name="inviteCode" defaultValue={codeFromUrl} className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm font-mono-app tracking-wider outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/20" data-testid="input-admin-signup-code" /></div></label>
    {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" data-testid="text-admin-signup-error">{error}</div>}
    <button disabled={register.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm" data-testid="button-admin-signup-submit">{register.isPending && <BrandSpinner size={14} />}{register.isPending ? 'Creating account…' : 'Create admin account'}</button>
  </form></div></AuthLayout>;
}

export default AdminSignup;

// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useSearch, useParams, Router as WouterRouter } from 'wouter';
import {ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, ChevronUp, ChevronDown, CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen, LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus, ReceiptText, Search, Settings, ShieldCheck, Sparkles, Star, Stethoscope, Target, Trash2, TrendingUp, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark, Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash, GraduationCap, CalendarDays, Eye, EyeOff, Smartphone, UploadCloud, ImageOff, RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Activity, Layers, BarChart3, ToggleLeft, Download, Database, Loader2} from 'lucide-react';
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
import { EmptyState, FeedbackThread, SectionHeader, cn } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

function AdminFeedback() {
  const feedback = useQuery({ queryKey: ['admin-feedback'], queryFn: feedbackApi.listAll });
  const updateStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: 'open' | 'replied' | 'reviewed' }) => feedbackApi.updateStatus(id, status), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }) });
  // Toggles whether a 5-star entry shows as a public testimonial on the
  // marketing homepage (GET /feedback/featured on the student site reads
  // this flag — see student-tools.ts). Server also enforces rating === 5,
  // this button just never offers the toggle on anything else.
  const setFeatured = useMutation({
    mutationFn: ({ id, featured }: { id: number; featured: boolean }) => feedbackApi.setFeatured(id, featured),
    onSuccess: (_data, vars) => { queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }); toast({ title: vars.featured ? 'Now showing on homepage' : 'Removed from homepage' }); },
    onError: (err: unknown) => toast({ title: 'Could not update', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const removeFeedback = useMutation({
    mutationFn: (id: number) => feedbackApi.remove(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }); toast({ title: 'Feedback removed' }); },
    onError: (err: unknown) => toast({ title: 'Could not remove feedback', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const statusTone = (status: string) => status === 'open' ? 'bg-accent/20 text-accent-text' : status === 'replied' ? 'bg-info/15 text-info' : 'bg-primary/15 text-primary';
  return <div><SectionHeader eyebrow="Community" title="Feedback inbox" /><div className="space-y-3">{(feedback.data || []).map((item: FeedbackEntry) => <div key={item.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-feedback-${item.id}`}><div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">{item.category}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', statusTone(item.status))}>{item.status}</span>{!!item.rating && <span className="flex items-center gap-0.5" data-testid={`text-feedback-rating-${item.id}`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} className={item.rating! >= n ? 'fill-accent text-accent' : 'text-muted-foreground'} />)}</span>}{item.featured && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">On homepage</span>}</div><p className="mt-2 text-sm leading-6">{item.message}</p><div className="mt-2 text-[10px] text-muted-foreground">{item.user?.name || 'Unknown'} · {item.user?.email || '—'} · {new Date(item.createdAt).toLocaleString()}</div></div><div className="flex shrink-0 items-center gap-2"><button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-toggle-thread-${item.id}`}>{expandedId === item.id ? 'Hide thread' : 'Reply'}</button>{item.status !== 'reviewed' && <button onClick={() => updateStatus.mutate({ id: item.id, status: 'reviewed' })} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold" data-testid={`button-resolve-feedback-${item.id}`}>Mark reviewed</button>}{item.rating === 5 && <button onClick={() => setFeatured.mutate({ id: item.id, featured: !item.featured })} disabled={setFeatured.isPending} className={cn('rounded-lg border px-3 py-1.5 text-[11px] font-bold disabled:opacity-50', item.featured ? 'border-primary bg-primary/10 text-primary' : 'border-border')} data-testid={`button-feature-feedback-${item.id}`}>{item.featured ? 'On homepage' : 'Show on homepage'}</button>}<button onClick={() => { if (confirm('Remove this feedback? This cannot be undone.')) removeFeedback.mutate(item.id); }} disabled={removeFeedback.isPending} className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50" aria-label="Remove feedback" data-testid={`button-remove-feedback-${item.id}`}><Trash2 size={14} /></button></div></div>{expandedId === item.id && <FeedbackThread feedbackId={item.id} />}</div>)}{!feedback.data?.length && <EmptyState icon={MessageSquare} title="No feedback yet" body="Student feedback will show up here as it comes in." />}</div></div>;
}

export default AdminFeedback;

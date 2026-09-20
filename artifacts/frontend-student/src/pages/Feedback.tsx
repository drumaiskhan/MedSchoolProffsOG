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
import { MyFeedbackThread, SectionHeader } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function Feedback() {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const mine = useQuery({ queryKey: ['my-feedback'], queryFn: feedbackApi.mine });
  const submit = useMutation({ mutationFn: feedbackApi.create, onSuccess: () => { setMessage(''); setRating(0); queryClient.invalidateQueries({ queryKey: ['my-feedback'] }); } });
  const site = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60 * 1000 });
  const whatsapp = site.data?.SUPPORT_WHATSAPP?.trim();
  return <div className="max-w-xl"><SectionHeader eyebrow="Community" title="Feedback" description="Tell us what is working, what is broken, or what you would like to see next." />
    {whatsapp && <a href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="mb-5 flex items-center gap-3 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 p-4 transition hover:border-[#25D366]/60" data-testid="link-whatsapp-contact">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white"><MessageSquare size={20} /></div>
      <div className="flex-1"><div className="text-sm font-bold text-[#146c43]">Chat with us on WhatsApp</div><div className="mt-0.5 text-xs text-muted-foreground">Faster than a ticket for quick questions — opens a chat with the academic team.</div></div>
      <ArrowRight size={16} className="text-[#25D366]" />
    </a>}
    <div className="rounded-2xl border border-border bg-card p-6"><form onSubmit={(e) => { e.preventDefault(); if (message.trim()) submit.mutate({ category, message: message.trim(), ...(rating > 0 ? { rating } : {}) }); }} className="space-y-3">
      <label className="block text-xs font-bold">Rate your experience<div className="mt-2 flex items-center gap-1" data-testid="input-feedback-rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)} className="p-0.5" aria-label={`${n} star${n === 1 ? '' : 's'}`} data-testid={`button-rating-star-${n}`}><Star size={22} className={(hoverRating || rating) >= n ? 'fill-[#e8c34a] text-[#e8c34a]' : 'text-muted-foreground'} /></button>)}{rating > 0 && <span className="ml-2 text-[11px] font-bold text-muted-foreground">{rating}/5</span>}</div></label>
      {/* Radix Select (same component the Flashcards filters use), not a
          native <select> — see PastPapers.tsx/Register.tsx for the same swap. */}
      <label className="block text-xs font-bold">Category<div className="mt-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-10 w-full rounded-xl border-border bg-background px-3 text-xs transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid="select-feedback-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="bug">Bug report</SelectItem>
            <SelectItem value="content">Content issue</SelectItem>
            <SelectItem value="feature">Feature request</SelectItem>
          </SelectContent>
        </Select>
      </div></label>
      <label className="block text-xs font-bold">Message<textarea required value={message} onChange={(e) => setMessage(e.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" data-testid="input-feedback-message" /></label>
      <button disabled={submit.isPending} className="rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-submit-feedback">{submit.isPending ? 'Sending…' : 'Send feedback'}</button>
    </form></div>
    {!!mine.data?.length && <div className="mt-6"><h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Your feedback history</h3><div className="space-y-3">{mine.data.map((item) => <MyFeedbackThread key={item.id} item={item} />)}</div></div>}
  </div>;
}

export default Feedback;

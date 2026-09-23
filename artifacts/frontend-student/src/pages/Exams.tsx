// Auto-extracted route page — code-split via React.lazy() in App.tsx.
// v44 — same "real 3D" tilt language as Subjects / OSPE-OSCE / Past Papers
// (.cu-* in fx.css + lib/tilt.tsx). See lib/fx.ts for the 3D rules. The
// local ExamCard below replaces lib/shared.tsx's plain ExamCard (that one
// stays as-is; it isn't used anywhere else) with a tilt card.
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
import { SectionHeader, EmptyState, StatTile } from '@/lib/shared';
import { TiltDiv, hueFromKey, vars } from '@/lib/tilt';

function ExamCard({ exam, index, onStart }: { exam: StudentExam; index: number; onStart: () => void }) {
  const scopeLabel = `${exam.programTargetKind || 'All Programs'} · ${exam.yearTargetNumber ? `${exam.yearTargetNumber}${['th', 'st', 'nd', 'rd'][exam.yearTargetNumber % 10 > 3 ? 0 : exam.yearTargetNumber % 10]} Year` : 'All Years'}`;
  const tone = exam.windowStatus === 'open' ? 'green' : exam.windowStatus === 'upcoming' ? 'blue' : 'neutral';
  const hue = hueFromKey(exam.title || String(exam.id));
  return <TiltDiv className="cu-ospe-card" testId={`card-exam-${exam.id}`} style={vars({ '--h': hue, '--i': Math.min(index, 11), '--tilt': 6 })}>
    <span className="cu-ospe-card__glow" aria-hidden="true" />
    <span className="cu-ospe-card__top">
      <span className="cu-ospe-card__icon"><ClipboardCheck size={20} /></span>
      <span className="cu-ospe-card__badge" data-tone={tone}>{exam.windowStatus}</span>
    </span>
    <h3 className="cu-ospe-card__title">{exam.title}</h3>
    {exam.description && <p className="cu-ospe-card__desc">{exam.description}</p>}
    <span className="cu-ospe-card__meta">
      <span className="cu-ospe-chip"><Clock3 size={11} /> {exam.durationMinutes} min</span>
      <span className="cu-ospe-chip">{scopeLabel}</span>
      <span className="cu-ospe-chip"><Target size={11} /> {exam.attemptsUsed}/{exam.maxAttempts} attempts</span>
      {exam.negativeMarkingEnabled && <span className="cu-ospe-chip" style={{ color: 'hsl(4 70% 58%)' }}><AlertTriangle size={11} /> -{exam.negativeMarkPerWrong} per wrong</span>}
    </span>
    <span className="cu-ospe-card__foot">
      {exam.inProgressAttemptId
        ? <Link href={`/exams/take/${exam.inProgressAttemptId}`} className="cu-ospe-cta no-3d" data-testid={`button-resume-exam-${exam.id}`}>Resume exam <ArrowRight size={13} /></Link>
        : exam.canStart
          ? <button onClick={onStart} className="cu-ospe-cta no-3d" data-testid={`button-start-exam-${exam.id}`}><ClipboardCheck size={14} /> Start exam</button>
          : <span className="cu-ospe-note">{exam.windowStatus === 'upcoming' ? `Opens ${new Date(exam.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : exam.windowStatus === 'closed' ? 'Window closed' : 'No attempts remaining'}</span>}
    </span>
  </TiltDiv>;
}

function Exams() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['exams'], queryFn: examsApi.list });
  const start = useMutation({
    mutationFn: examsApi.start,
    onSuccess: (res) => setLocation(`/exams/take/${res.attemptId}`),
    onError: (err: unknown) => {
      // Previously this failed completely silently — clicking "Start
      // exam" would just do nothing if the server rejected it (no
      // questions attached, window closed between page-load and click,
      // attempts exhausted, etc.). Now the real reason actually reaches
      // the student instead of looking like a dead button.
      toast({ title: 'Could not start this exam', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.', variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
  const exams = q.data || [];
  const openCount = exams.filter((e) => e.windowStatus === 'open').length;
  return <div className="cu-page">
    <SectionHeader eyebrow="Assessment" title="Pre-Proffs Exams" description="Timed exams. Results are released according to your admin's settings." />
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <StatTile icon={ClipboardCheck} bg="bg-[#dceaf1]" fg="text-[#2c6a8f]" label="Total exams" value={exams.length} />
      <StatTile icon={Flame} bg="bg-[#d7eee4]" fg="text-[#1f7a5c]" label="Open now" value={openCount} />
      <StatTile icon={Clock3} bg="bg-[#fdf0d9]" fg="text-[#8a5a12]" label="Total minutes" value={exams.reduce((s, e) => s + e.durationMinutes, 0)} />
    </div>
    <div className="cu-ospe-grid">{exams.map((exam, i) => <ExamCard key={exam.id} exam={exam} index={i} onStart={() => start.mutate(exam.id)} />)}{!exams.length && <EmptyState icon={ClipboardCheck} title="No exams scheduled" body="Your admin hasn't published an exam for your program and year yet." />}</div>
  </div>;
}

export default Exams;

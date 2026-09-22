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
import { AI_VISUALIZER_EXAMPLES, BrandSpinner, EmptyState, SectionHeader, SkeletonPage } from '@/lib/shared';

function AiVisualizer() {
  const [prompt, setPrompt] = useState('');
  const [spec, setSpec] = useState<VisualizationSpec | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Same AI_VISUALIZER_ENABLED check SideNav uses — this covers someone
  // navigating here directly by URL while the sidebar link is hidden, or a
  // tab that was already open on this page when an admin turned it off.
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const aiVisualizerEnabled = siteContentQ.data?.AI_VISUALIZER_ENABLED !== 'false';

  const generate = useMutation({
    mutationFn: (p: string) => aiVisualizerApi.generate(p),
    onSuccess: (data) => { setSpec(data.visualization); setStepIndex(0); },
  });

  const stepBased = spec ? isStepBased(spec) : false;
  const stepCount = spec && isStepBased(spec) ? spec.steps.length : 0;
  const loop = spec && isStepBased(spec) ? (spec.type === 'cycle' || !!spec.loop) : false;

  const submit = () => { if (prompt.trim().length >= 3) generate.mutate(prompt.trim()); };
  const startOver = () => { setSpec(null); generate.reset(); };

  if (!siteContentQ.isLoading && !aiVisualizerEnabled) return <EmptyState icon={Wand2} title="AI Visualizer is turned off" body="This feature isn't available right now — check back later." />;

  return <div className="mx-auto max-w-3xl">
    <SectionHeader eyebrow="Study tools" title="AI Visualizer" description="Describe a process, cycle, equation, or comparison and see it come to life." />

    {!spec && (
      <div className="rounded-2xl border border-border bg-card p-5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Create an interactive step-by-step visualization of skeletal muscle contraction…"
          className="min-h-32 w-full resize-none rounded-xl border border-border bg-background p-3 text-xs leading-6 outline-none focus:ring-2 focus:ring-primary/20"
          data-testid="textarea-visualizer-prompt"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {AI_VISUALIZER_EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex)} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-visualizer-example-${i}`}>{ex.length > 60 ? `${ex.slice(0, 57)}…` : ex}</button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={generate.isPending || prompt.trim().length < 3}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          data-testid="button-generate-visualization"
        >
          {generate.isPending ? <BrandSpinner size={14} /> : <Wand2 size={14} />}
          {generate.isPending ? 'Generating…' : 'Generate Visualization'}
        </button>

        {generate.isPending && <div className="mt-5"><SkeletonPage /></div>}
        {generate.isError && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive" data-testid="text-visualizer-error">
            {generate.error instanceof ApiRequestError ? generate.error.message : "Couldn't generate a visualization right now."}
            <button onClick={submit} className="ml-3 font-bold underline" data-testid="button-visualizer-regenerate-error">Regenerate</button>
          </div>
        )}
      </div>
    )}

    {spec && (
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-extrabold" data-testid="text-visualizer-title">{spec.title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{spec.description}</p></div>
        </div>

        <VisualizationRenderer spec={spec} stepIndex={stepIndex} />
        {stepBased && <StepControls stepCount={stepCount} stepIndex={stepIndex} onStepChange={setStepIndex} loop={loop} />}
        <ExplanationPanel spec={spec} stepIndex={stepIndex} />

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button onClick={() => generate.mutate(prompt)} disabled={generate.isPending} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid="button-visualizer-regenerate">{generate.isPending ? <BrandSpinner size={13} /> : <RotateCcw size={13} />} Regenerate</button>
          <button onClick={startOver} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover:bg-muted" data-testid="button-visualizer-new">New visualization</button>
        </div>
      </div>
    )}
  </div>;
}

export default AiVisualizer;

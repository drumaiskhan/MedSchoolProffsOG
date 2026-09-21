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
import { EmptyState, SkeletonPage, useModulesGrouping, usePageTitle } from '@/lib/shared';
import { CurriculumBanner, ModulePoster, weightedProgress } from '@/components/blocks/BlockCards';

function BlockDetail() {
  const params = useParams<{ id: string }>();
  const { isLoading, blocks, modulesByBlock, unassigned } = useModulesGrouping();
  const isOther = params.id === 'other';
  const block = !isOther ? blocks.find((b) => b.id === Number(params.id)) : undefined;
  const list = isOther ? unassigned : (block ? modulesByBlock.get(block.id) ?? [] : []);
  // Friendly header breadcrumb ("Blocks / Foundation I") instead of the raw
  // numeric route id ("Blocks / 4") that the default path-derived title falls
  // back to — see usePageTitle / PageTitleContext above.
  usePageTitle(isOther ? 'Blocks / Other modules' : (block ? `Blocks / ${block.name}` : (isLoading ? undefined : 'Blocks')));
  if (isLoading) return <SkeletonPage />;
  const title = isOther ? 'Other modules' : (block?.name ?? 'Block');
  const questions = list.reduce((n, m) => n + m.mcqCount, 0);
  return <div className="bk-page" data-testid="page-block-detail">
    <CurriculumBanner eyebrow="Curriculum map" title={title} description={block?.subtitle || undefined} coverUrl={block?.iconUrl} progress={weightedProgress(list)}
      back={{ href: '/blocks', label: 'Blocks', testId: 'link-back-blocks' }}
      stats={[{ label: list.length === 1 ? 'Module' : 'Modules', value: list.length }, { label: 'Subjects', value: list.reduce((n, m) => n + m.subjectCount, 0) }, { label: 'Questions', value: questions }]} />
    <div className="bk-grid bk-grid--modules">
      {list.map((m, i) => <ModulePoster key={m.id} index={i} id={m.id} name={m.name} subtitle={m.subtitle} iconUrl={(m as typeof m & { iconUrl?: string | null }).iconUrl} subjectCount={m.subjectCount} mcqCount={m.mcqCount} progress={m.progress} />)}
    </div>
    {!list.length && <EmptyState icon={BookOpen} title="No modules yet" body="Your academic team hasn't published any modules in this block yet." />}
  </div>;
}

// Kept working as a redirect (item 6: "keep /modules working as a redirect
// or alias so nothing else that links to it breaks") rather than removed —
// old bookmarks/links to /modules land on the new Blocks landing page
// instead of a stale or missing page.

export default BlockDetail;

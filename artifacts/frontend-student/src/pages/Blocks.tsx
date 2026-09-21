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
import { EmptyState, ModuleCard, SectionHeader, SkeletonPage, useModulesGrouping } from '@/lib/shared';
import { BlockPoster, CurriculumBanner, weightedProgress } from '@/components/blocks/BlockCards';

function Blocks() {
  const { isLoading, modules, blocks, filtered, modulesByBlock, unassigned, search, setSearch } = useModulesGrouping();
  const hasBlocks = blocks.length > 0;
  // No blocks configured at all yet — fall back to the plain modules grid, so a
  // deployment that hasn't set up Blocks isn't left with an empty landing page.
  if (!isLoading && !hasBlocks) return <div><SectionHeader eyebrow="Curriculum map" title="Learning modules" action={<div className="relative"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a module" className="h-9 w-40 rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-search-modules" /></div>} />
    <div className="bk-grid">{filtered.map((m, i) => <ModuleCard key={m.id} m={m} i={i} />)}</div>
    {!filtered.length && <EmptyState icon={BookOpen} title="No modules yet" body="Your academic team hasn't published any modules yet." />}
  </div>;
  if (isLoading) return <SkeletonPage />;
  const totalQuestions = modules.reduce((sum, m) => sum + m.mcqCount, 0);
  const blockCount = blocks.length + (unassigned.length > 0 ? 1 : 0);
  return <div className="bk-page" data-testid="page-blocks">
    <CurriculumBanner eyebrow="Curriculum map" title="Blocks" description="Pick a block to see its modules, subjects and practice questions."
      stats={[{ label: blockCount === 1 ? 'Block' : 'Blocks', value: blockCount }, { label: modules.length === 1 ? 'Module' : 'Modules', value: modules.length }, { label: 'Questions', value: totalQuestions }]} />
    <div className="bk-grid">
      {blocks.map((b, i) => {
        const list = modulesByBlock.get(b.id) ?? [];
        return <BlockPoster key={b.id} index={i} href={`/blocks/${b.id}`} name={b.name} iconUrl={b.iconUrl} subtitle={b.subtitle || undefined}
          moduleCount={list.length} subjectCount={list.reduce((n, m) => n + m.subjectCount, 0)} questionCount={list.reduce((n, m) => n + m.mcqCount, 0)} progress={weightedProgress(list)} />;
      })}
      {unassigned.length > 0 && <BlockPoster index={blocks.length} href="/blocks/other" name="Other modules" muted moduleCount={unassigned.length}
        subjectCount={unassigned.reduce((n, m) => n + m.subjectCount, 0)} questionCount={unassigned.reduce((n, m) => n + m.mcqCount, 0)} progress={weightedProgress(unassigned)} />}
    </div>
    {!blocks.length && !unassigned.length && <EmptyState icon={Library} title="No blocks yet" body="Your academic team hasn't published any blocks yet." />}
  </div>;
}

export default Blocks;

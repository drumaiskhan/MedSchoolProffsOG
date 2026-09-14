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
import { EmptyState, SectionHeader, cn, usePageTitle } from '@/lib/shared';

function Subjects({ topics = false }: { topics?: boolean }) {
  const params = useParams<{ id?: string }>();
  // On /subjects/:id the :id in the URL is a subject id (topics view); on
  // /modules/:id it's a module id (subjects view). Same component, two roles.
  const routeId = Number(params.id) || undefined;
  const moduleId = !topics ? routeId : undefined;
  const subjectId = topics ? routeId : undefined;
  const subjectQ = useListSubjects(moduleId ? { moduleId } : undefined);
  const topicQ = useListTopics(subjectId ? { subjectId } : undefined);
  const subjects: Subject[] = subjectQ.data ?? [];
  const topicsList: Topic[] = topicQ.data ?? [];
  // Friendly header breadcrumbs ("Modules / Foundation I", "Subjects / Anatomy")
  // instead of the raw numeric route id ("Modules / 13", "Subjects / 7") that
  // the default path-derived title falls back to. The module/subject name
  // isn't in the topics/subjects response we already have for this route, so
  // fetch the unfiltered list (shares its cache with other pages) and look
  // the name up by id — see usePageTitle / PageTitleContext above.
  const modulesQ = useListModules(undefined, { query: { enabled: !topics && moduleId != null } });
  const moduleName = !topics ? modulesQ.data?.find((m) => m.id === moduleId)?.name : undefined;
  const allSubjectsQ = useListSubjects(undefined, { query: { enabled: topics && subjectId != null } });
  const subjectName = topics ? allSubjectsQ.data?.find((s) => s.id === subjectId)?.name : undefined;
  usePageTitle(topics
    ? (subjectId != null ? `Subjects / ${subjectName ?? '…'}` : undefined)
    : (moduleId != null ? `Modules / ${moduleName ?? '…'}` : undefined));
  if (topics) return <div><SectionHeader eyebrow="Choose a topic" title="Topics" action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-back-modules"><ArrowLeft size={13} className="mr-1 inline" /> Blocks</Link>} /><div className="space-y-3">{topicsList.map((t) => <Link href={`/practice?topic=${t.id}`} key={t.id} className="card-lift flex items-center gap-4 rounded-2xl border border-border bg-card p-4" data-testid={`row-topic-${t.id}`}><div className={cn('grid size-10 place-items-center rounded-xl', t.completed ? 'bg-[#d7eee4] text-[#287058]' : 'bg-muted text-muted-foreground')}>{t.completed ? <Check size={17} /> : <Target size={17} />}</div><div className="flex-1"><div className="text-sm font-bold">{t.name}</div><div className="mt-1 text-xs text-muted-foreground">{t.questionCount} practice questions</div></div><span className="text-xs font-bold text-primary">{t.completed ? 'Review' : 'Start'} <ArrowRight size={13} className="ml-1 inline" /></span></Link>)}{!topicsList.length && <EmptyState icon={Target} title="No topics yet" body="Your academic team hasn't published topics for this subject yet." />}</div></div>;
  return <div><SectionHeader eyebrow="Curriculum map" title="Subjects" action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-subjects-back"><ArrowLeft size={13} className="mr-1 inline" /> Blocks</Link>} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{subjects.map((s, i) => <Link href={`/subjects/${s.id}`} key={s.id} className="card-lift rounded-2xl border border-border bg-card p-5" data-testid={`card-subject-${s.id}`}><div className="flex items-center justify-between">{s.iconUrl ? <img src={s.iconUrl} alt="" loading="lazy" decoding="async" className="size-9 rounded-xl object-cover" /> : <span className="font-mono-app text-[10px] text-muted-foreground">0{i + 1}</span>}<ChevronRight size={16} className="text-muted-foreground" /></div><h3 className="mt-8 font-display text-2xl">{s.name}</h3><p className="mt-1 text-xs text-muted-foreground">{s.topicCount} topics to explore</p></Link>)}{!subjects.length && <EmptyState icon={BookOpen} title="No subjects yet" body="Your academic team hasn't published subjects for this module yet." />}</div></div>;
}

export default Subjects;

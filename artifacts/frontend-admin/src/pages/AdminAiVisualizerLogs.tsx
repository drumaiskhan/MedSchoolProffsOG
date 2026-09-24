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
import { EmptyState, SectionHeader, Stat, cn } from '@/lib/shared';

function AdminAiVisualizerLogs() {
  const logs = useQuery({ queryKey: ['admin-ai-visualizer-logs'], queryFn: () => aiVisualizerAdminApi.list() });
  const successCount = (logs.data ?? []).filter((l) => l.status === 'success').length;
  const errorCount = (logs.data ?? []).filter((l) => l.status === 'error').length;
  return <div>
    <SectionHeader eyebrow="Community" title="AI Visualizer activity" />
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
      <Stat label="Generations shown" value={logs.data?.length ?? 0} />
      <Stat label="Succeeded" value={successCount} />
      <Stat label="Failed" value={errorCount} />
    </div>
    <div className="space-y-3">
      {(logs.data || []).map((log: AiVisualizerLogEntry) => (
        <div key={log.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-ai-visualizer-log-${log.id}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', log.status === 'success' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive')}>{log.status}</span>
                {log.visualizationType && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">{log.visualizationType}</span>}
              </div>
              <p className="mt-2 text-sm leading-6">{log.prompt}</p>
              {log.errorMessage && <p className="mt-1 text-xs text-destructive">{log.errorMessage}</p>}
              {log.rawResponse && <details className="mt-1"><summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">Raw AI response</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-[10px]">{log.rawResponse}</pre></details>}
              <div className="mt-2 text-[10px] text-muted-foreground">{log.student.name} · {log.student.email} · {new Date(log.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
      ))}
      {!logs.data?.length && <EmptyState icon={Wand2} title="No activity yet" body="Student AI Visualizer prompts will show up here as they come in." />}
    </div>
  </div>;
}

// Native <input type="color"> layered under a visible hex swatch/text pair —
// keeps the picker fully accessible (real OS color UI) while matching the
// reference design's "swatch + hex code" look.

export default AdminAiVisualizerLogs;

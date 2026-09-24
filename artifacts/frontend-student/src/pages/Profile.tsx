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
import { ProfileHero, MembershipPass } from '@/components/profile/ProfileVisuals';
import { Badge, ErrorState, Footer, IconField, SectionHeader, SkeletonPage, TeamSection, initials } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

function Profile() {
  // Bug fix: this used to read `useGetCurrentUser()` from the generated
  // api-client-react hooks, which types /auth/me's response as the
  // codegen `User` shape (id/name/email/role/status/institution/program
  // only — see lib/api-zod/src/generated/types/user.ts). That's a
  // type-level ceiling, not a server one: /auth/me itself now also
  // resolves and returns the student's real MBBS/BDS programKind,
  // academicYear label/yearNumber, and profile picture (see userPublicView
  // in auth.ts) — those fields were just invisible here because this
  // page's `q.data` was typed too narrowly to see them. Switched to the
  // richer local `AuthUser` type via `authApi.me`, reusing the exact same
  // query key (`getGetCurrentUserQueryKey()`) so this stays the same cache
  // entry the rest of the app already invalidates on login/update — no
  // other page needs to change.
  const q = useQuery({ queryKey: getGetCurrentUserQueryKey(), queryFn: authApi.me });
  // Bug fix (React error #310, "Rendered more hooks than during the
  // previous render"): useState/useMutation/useGetStudentDashboard used to
  // be declared after the `if (q.isLoading) return ...` / `if (!q.data)
  // return ...` early returns above. Those branches only fire on some
  // renders (e.g. the very first one, before the query resolves), so the
  // hooks after them ran a different number of times render-to-render —
  // which crashed this page with #310 as soon as the current-user query
  // finished loading. All hooks now run unconditionally, before any early
  // return.
  const [editing, setEditing] = useState(false);
  // Profile picture — deliberately its own bit of state and its own
  // upload step, separate from the name/phone form fields: the picture
  // itself is optional (a student can save their name/phone without ever
  // touching it), and it uploads immediately on file choice via the
  // existing POST /uploads/profile-picture (same endpoint AdminTeam.tsx's
  // photo picker already uses for team members) rather than waiting for
  // the whole form's "Save changes".
  const [pendingPicture, setPendingPicture] = useState<{ storagePath: string; previewUrl: string } | null>(null);
  const [pictureUploading, setPictureUploading] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const update = useMutation({ mutationFn: authApi.updateMe, onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); setEditing(false); setPendingPicture(null); } });
  const dashboard = useGetStudentDashboard();
  if (q.isLoading) return <SkeletonPage />;
  if (!q.data) return <ErrorState retry={() => q.refetch()} />;
  const u = q.data;
  const daysRemaining = dashboard.data?.membershipExpiry ? Math.max(0, Math.ceil((new Date(dashboard.data.membershipExpiry).getTime() - Date.now()) / 86400000)) : null;
  // "MBBS · 3rd Year" when both are known; falls back gracefully for any
  // account that (still) has neither set.
  const programYearLabel = [u.programKind, u.academicYear].filter(Boolean).join(' · ') || u.program || 'Medical student';
  const avatarUrl = pendingPicture?.previewUrl ?? resolveUploadUrl(u.profilePictureUrl ?? u.profilePicturePath);

  const handlePictureChange = async (file: File | undefined | null) => {
    if (!file) return;
    setPictureUploading(true); setPictureError(null);
    try {
      const res = await uploadFile(file, 'profile-picture');
      setPendingPicture({ storagePath: res.storagePath, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      setPictureError(err instanceof ApiRequestError ? err.message : 'Could not upload that photo. Try a smaller image.');
    } finally {
      setPictureUploading(false);
    }
  };

  return <div className="max-w-4xl"><SectionHeader eyebrow="Your account" title="Profile & access" description="Your details, password and membership status." />
  <div className="grid gap-5 md:grid-cols-2"><ProfileHero name={u.name} programYear={programYearLabel} avatarUrl={avatarUrl} isActive={dashboard.data?.membershipStatus === 'ACTIVE'} streak={dashboard.data?.streak ?? 0} progress={dashboard.data?.progress ?? 0} days={daysRemaining} /><MembershipPass name={u.name} manageHref="/payments" /></div>
  <div className="mt-5 grid gap-5">
    <div className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><h3 className="font-bold">Personal details</h3><button onClick={() => { setEditing((v) => !v); setPendingPicture(null); setPictureError(null); }} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:opacity-80" data-testid="button-edit-profile"><Pencil size={13} /> {editing ? 'Cancel' : 'Edit'}</button></div>
      {editing ? <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); update.mutate({ name: String(f.get('name')), phone: String(f.get('phone') || ''), ...(pendingPicture ? { profilePicturePath: pendingPicture.storagePath } : {}) }); }} className="pf-edit mt-6 grid gap-4 sm:grid-cols-2">
        {/* Optional — a student can save name/phone changes without ever picking a photo. */}
        <label className="text-xs font-bold sm:col-span-2">Profile picture <span className="font-normal text-muted-foreground">(optional)</span>
          <div className="mt-2 flex items-center gap-3">
            {avatarUrl ? <img src={avatarUrl} alt="" className="size-12 rounded-xl border border-border object-cover" /> : <div className="grid size-12 place-items-center rounded-xl bg-[#d7eee4] text-sm font-extrabold text-[#164b4b]">{initials(u.name)}</div>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handlePictureChange(e.target.files?.[0])} className="flex-1 rounded-xl border border-dashed border-border bg-card px-3 py-2 text-xs" data-testid="input-profile-picture" />
          </div>
          {pictureUploading && <p className="mt-1 text-[11px] text-muted-foreground">Uploading…</p>}
          {pictureError && <p className="mt-1 text-[11px] text-destructive">{pictureError}</p>}
        </label>
        <label className="text-xs font-bold sm:col-span-2">Full name<div className="mt-2"><IconField icon={UserIcon} required name="name" defaultValue={u.name} data-testid="input-edit-name" /></div></label>
        <label className="text-xs font-bold">Phone<div className="mt-2"><IconField icon={Phone} name="phone" defaultValue={(u as { phone?: string }).phone ?? ''} data-testid="input-edit-phone" /></div></label>
        <div className="flex items-end sm:col-span-2"><button disabled={update.isPending || pictureUploading} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-profile">{update.isPending ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      : <div className="mt-6 grid gap-5 sm:grid-cols-2">{[['Full name', u.name], ['Email address', u.email], ['Institution', u.institution || 'Not added'], ['Programme', u.programKind || u.program || 'Not added'], ['Academic year', u.academicYear || 'Not added']].map(([label, value]) => <div key={label} className="pf-row"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-2 text-sm font-semibold">{value}</div></div>)}</div>}
    </div></div>
  <TeamSection />
  <Footer variant="full" />
  </div>;
}

export default Profile;

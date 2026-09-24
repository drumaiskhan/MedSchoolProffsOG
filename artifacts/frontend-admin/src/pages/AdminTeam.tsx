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
import { ConfirmDialog, EmptyState, SectionHeader, TeamPhoto, cn } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';

function AdminTeam() {
  const q = useQuery({ queryKey: ['admin-team'], queryFn: teamApi.listAll });
  const create = useMutation({ mutationFn: teamApi.create, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<TeamMember> }) => teamApi.update(id, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); } });
  const remove = useMutation({ mutationFn: teamApi.remove, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not hide member', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const removePermanent = useMutation({ mutationFn: teamApi.removePermanent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['site-content'] }); setPermaDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not permanently delete member', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }) });
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoPath, setPhotoPath] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [permaDeletingId, setPermaDeletingId] = useState<number | null>(null);
  const formOpen = open || !!editingMember;
  const closeForm = () => { setOpen(false); setEditingMember(null); setPhotoPath(''); };
  const allMembers = q.data || [];
  const hiddenCount = allMembers.filter((m) => !m.active).length;
  const members = allMembers.filter((m) => (showArchived ? true : m.active));

  return <div><SectionHeader eyebrow="Site content" title="Academic team" action={<div className="flex items-center gap-2"><button onClick={() => setShowArchived((v) => !v)} className={cn('rounded-xl border border-border px-3 py-2.5 text-xs font-bold', showArchived ? 'bg-muted' : 'bg-card')} data-testid="button-toggle-hidden-team">{showArchived ? 'Hide hidden' : `Show hidden${hiddenCount ? ` (${hiddenCount})` : ''}`}</button><button onClick={() => { if (formOpen) { closeForm(); } else { setOpen(true); } }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-add-team-member"><Plus size={15} /> Add member</button></div>} />
    {formOpen && <form key={editingMember?.id ?? 'new'} onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const body = { name: String(f.get('name')), role: String(f.get('role')), category: f.get('category') as TeamCategory, bio: String(f.get('bio') || ''), achievementBadge: String(f.get('achievementBadge') || ''), linkedinUrl: String(f.get('linkedinUrl') || ''), instagramUrl: String(f.get('instagramUrl') || ''), email: String(f.get('email') || ''), photoPath: photoPath || editingMember?.photoPath || undefined };
      if (editingMember) update.mutate({ id: editingMember.id, body }, { onSuccess: closeForm });
      else create.mutate({ ...body, active: true }, { onSuccess: closeForm });
    }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
      {editingMember && <p className="text-[11px] font-bold text-primary">Editing {editingMember.name}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><input required name="name" defaultValue={editingMember?.name} placeholder="Full name" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-name" /><input required name="role" defaultValue={editingMember?.role} placeholder="Role, e.g. Founder & CEO" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-role" /></div>
      <label className="block text-xs font-bold">Category<select name="category" defaultValue={editingMember?.category ?? 'reviewer'} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-team-category">{TEAM_CATEGORIES.map((cat) => <option key={cat} value={cat}>{TEAM_CATEGORY_LABELS[cat]}</option>)}</select></label>
      <input name="achievementBadge" defaultValue={editingMember?.achievementBadge ?? ''} placeholder="Achievement badge, e.g. 1st Position (All over KMU)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-badge" />
      <textarea name="bio" defaultValue={editingMember?.bio ?? ''} placeholder="Short bio" className="min-h-16 w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="input-team-bio" />
      <div className="grid gap-3 sm:grid-cols-3"><input name="linkedinUrl" defaultValue={editingMember?.linkedinUrl ?? ''} placeholder="LinkedIn URL" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-linkedin" /><input name="instagramUrl" defaultValue={editingMember?.instagramUrl ?? ''} placeholder="Instagram URL" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-instagram" /><input name="email" defaultValue={editingMember?.email ?? ''} placeholder="Email" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-team-email" /></div>
      <label className="block text-xs font-bold">Photo{editingMember?.photoPath && !photoPath && <span className="ml-2 font-normal text-muted-foreground">(current photo kept unless you choose a new one)</span>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const res = await uploadFile(file, 'profile-picture'); setPhotoPath(res.storagePath); } catch (err) { toast({ title: 'Could not upload photo', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }); } finally { setUploading(false); } }} className="mt-2 w-full rounded-xl border border-dashed border-border bg-card px-3 py-2 text-xs" data-testid="input-team-photo" />{uploading && <p className="mt-1 text-[11px] text-muted-foreground">Uploading…</p>}{photoPath && <img src={resolveUploadUrl(photoPath) ?? undefined} alt="" className="mt-2 size-14 rounded-full border border-border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}</label>
      <div className="flex gap-2"><button disabled={create.isPending || update.isPending} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-team-member">{editingMember ? 'Save changes' : 'Save'}</button><button type="button" onClick={closeForm} className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold" data-testid="button-cancel-team-member">Cancel</button></div>
    </form>}
    <div className="space-y-6">{TEAM_CATEGORIES.map((cat) => { const inCat = members.filter((m) => (m.category ?? 'reviewer') === cat); return <div key={cat}><div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{TEAM_CATEGORY_LABELS[cat]}</div><div className="grid gap-3 sm:grid-cols-2">{inCat.map((m) => <div key={m.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-admin-team-${m.id}`}><div className="flex items-center justify-between"><div className="flex items-center gap-3"><TeamPhoto member={m} />{" "}<div><div className="text-sm font-bold">{m.name}</div><div className="text-xs text-muted-foreground">{m.role}</div></div></div>{m.active ? <button onClick={() => update.mutate({ id: m.id, body: { active: false } })} className="rounded-lg bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary" data-testid={`button-toggle-team-${m.id}`}>Visible</button> : <button onClick={() => update.mutate({ id: m.id, body: { active: true } })} className="rounded-lg bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground" data-testid={`button-toggle-team-${m.id}`}>Hidden</button>}</div>{m.bio && <p className="mt-3 text-xs text-muted-foreground">{m.bio}</p>}<div className="mt-3 flex items-center gap-3"><button onClick={() => { setEditingMember(m); setOpen(false); setPhotoPath(''); }} className="text-[11px] font-bold text-primary" data-testid={`button-edit-team-${m.id}`}>Edit</button>{m.active ? <button onClick={() => setDeletingId(m.id)} className="text-[11px] font-bold text-destructive" data-testid={`button-delete-team-${m.id}`}>Hide</button> : <><button onClick={() => update.mutate({ id: m.id, body: { active: true } })} className="text-[11px] font-bold text-primary" data-testid={`button-restore-team-${m.id}`}>Restore</button><button onClick={() => setPermaDeletingId(m.id)} className="text-[11px] font-bold text-destructive" data-testid={`button-permanent-delete-team-${m.id}`}>Delete permanently</button></>}</div></div>)}{!inCat.length && <p className="text-xs text-muted-foreground">No one here yet.</p>}</div></div>; })}{!members.length && <EmptyState icon={Users} title={showArchived ? 'No hidden members' : 'No team members yet'} body={showArchived ? 'Members you hide will show up here so you can restore or permanently delete them.' : 'Add reviewers, question setters, or ownership to show on the student profile page.'} />}</div>
    {deletingId !== null && <ConfirmDialog title="Hide this team member?" body={'They\'ll disappear from the public profile page. You can restore or permanently delete them later from "Show hidden."'} confirmLabel="Hide" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
    {permaDeletingId !== null && <ConfirmDialog title="Permanently delete this team member?" body="This erases their profile for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setPermaDeletingId(null)} onConfirm={() => removePermanent.mutate(permaDeletingId)} pending={removePermanent.isPending} />}
  </div>;
}

// Same broken-image failure mode as the favicon/QR uploaders: an upload can
// succeed and still 404 a moment later if this server's local disk doesn't
// persist (see the storage note on the Settings page). Falls back to the
// initials avatar instead of a broken image icon when that happens.

export default AdminTeam;

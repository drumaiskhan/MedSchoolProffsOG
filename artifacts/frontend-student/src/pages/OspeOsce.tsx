// Auto-extracted route page — code-split via React.lazy() in App.tsx.
// v44 — OSPE/OSCE cards ported onto the same "real 3D" tilt language as the
// Subjects page (.cu-* / fx-tilt in fx.css + lib/fx.ts). See lib/fx.ts for
// the 3D rules (small-angle tilt on one hovered card, no preserve-3d).
import { type ReactNode, type ComponentProps, type TouchEvent, type CSSProperties, useState, useEffect, useRef, useLayoutEffect, createContext, useContext } from 'react';
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
  LayoutGrid, Presentation, Wand2, Crown, Globe, Star, Activity, Paperclip, ClipboardList,
} from 'lucide-react';
import { applyThemeVars } from '@/lib/theme';
import {
  authApi, academicApi, settingsApi, uploadFile, resolveUploadUrl, ApiRequestError, publicApi, pastPapersApi, notebookApi, savedSessionsApi, flaggedMcqsApi, feedbackApi, type MyFeedbackEntry, analyticsApi, type ProgressTrend, mcqImportApi, studentsAdminApi, paymentsAdminApi, membershipPlansAdminApi, mcqAdminApi, notificationsApi, siteContentApi, teamApi, moduleAdminApi, blocksApi, type Block, examsAdminApi, examsApi, explanationsApi, booksApi, type AdminBookStudent, DEFAULT_IMPORT_PATTERNS, STUDENT_STATUSES, type Institution, type Program, type AcademicYear, type Batch, type PastPaper, type NotebookEntry, type SavedSession, type FlaggedMcq, type FeedbackEntry, type McqCandidate, type StudentDetail, type SiteContent, type TeamMember, TEAM_CATEGORIES, TEAM_CATEGORY_LABELS, type AdminModule, type AdminExam, type StudentExam, type ExamAttemptRow, type ExamStartResponse, type ExamResult, type Exam, type ExplanationStatus, type PaymentDetails, type PaymentMethodConfig, aiVisualizerApi, type VisualizationSpec, LeaderboardRow,
  ospeApi, type OspeExamType, type OspeStudentExam, type OspeLearningMaterial,
} from '@/lib/api';
import { SectionHeader, EmptyState, Badge, cn } from '@/lib/shared';
import { toast } from '@/hooks/use-toast';
import { TiltDiv, SegToggle, vars } from '@/lib/tilt';

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
const EXAM_TYPE_HUE: Record<OspeExamType, number> = { OSPE: 200, OSCE: 268 };

function OspeExamCard({ exam, examType, index, onStart, starting }: { exam: OspeStudentExam; examType: OspeExamType; index: number; onStart: () => void; starting: boolean }) {
  const scopeLabel = `${exam.programTargetKind || 'All Programs'} · ${exam.yearTargetNumber ? `${exam.yearTargetNumber}${['th', 'st', 'nd', 'rd'][exam.yearTargetNumber % 10 > 3 ? 0 : exam.yearTargetNumber % 10]} Year` : 'All Years'}`;
  const tone = exam.windowStatus === 'open' ? 'green' : exam.windowStatus === 'upcoming' ? 'blue' : 'neutral';
  return <TiltDiv className="cu-ospe-card" testId={`card-ospe-exam-${exam.id}`} style={vars({ '--h': EXAM_TYPE_HUE[examType], '--i': Math.min(index, 11), '--tilt': 6 })}>
    <span className="cu-ospe-card__glow" aria-hidden="true" />
    <span className="cu-ospe-card__top">
      <span className="cu-ospe-card__icon"><Stethoscope size={20} /></span>
      <span className="cu-ospe-card__badge" data-tone={tone}>{exam.windowStatus}</span>
    </span>
    <h3 className="cu-ospe-card__title">{exam.title}</h3>
    {exam.description && <p className="cu-ospe-card__desc">{exam.description}</p>}
    <span className="cu-ospe-card__meta">
      <span className="cu-ospe-chip"><Clock3 size={11} /> {exam.durationMinutes} min</span>
      <span className="cu-ospe-chip"><ClipboardList size={11} /> {scopeLabel}</span>
      <span className="cu-ospe-chip"><Target size={11} /> {exam.attemptsUsed}/{exam.maxAttempts} attempts</span>
    </span>
    <span className="cu-ospe-card__foot">
      {exam.inProgressAttemptId
        ? <Link href={`/ospe-osce/take/${exam.inProgressAttemptId}`} className="cu-ospe-cta no-3d" data-testid={`button-resume-ospe-exam-${exam.id}`}>Resume <ArrowRight size={13} /></Link>
        : exam.canStart
          ? <button onClick={onStart} disabled={starting} className="cu-ospe-cta no-3d" data-testid={`button-start-ospe-exam-${exam.id}`}><Stethoscope size={14} /> {starting ? 'Starting…' : 'Start exam'}</button>
          : <span className="cu-ospe-note">{exam.windowStatus === 'upcoming' ? `Opens ${new Date(exam.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : exam.windowStatus === 'closed' ? 'Window closed' : 'No attempts remaining'}</span>}
    </span>
  </TiltDiv>;
}

function LearningMaterialCard({ material, examType, index }: { material: OspeLearningMaterial; examType: OspeExamType; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const img = material.imagePath ? resolveUploadUrl(material.imagePath) ?? undefined : undefined;
  return <TiltDiv className="cu-ospe-card" testId={`card-ospe-material-${material.id}`} style={vars({ '--h': EXAM_TYPE_HUE[examType], '--i': Math.min(index, 11), '--tilt': 6 })}>
    <span className="cu-ospe-card__glow" aria-hidden="true" />
    {img
      ? <span className="cu-ospe-thumb"><img src={img} alt="" loading="lazy" /></span>
      : <span className="cu-ospe-card__top"><span className="cu-ospe-card__icon"><BookOpen size={20} /></span></span>}
    <h3 className="cu-ospe-card__title">{material.title}</h3>
    {material.description && <p className="cu-ospe-card__desc">{material.description}</p>}
    {material.bodyText && (expanded
      ? <p className="cu-ospe-card__body">{material.bodyText}</p>
      : <button onClick={() => setExpanded(true)} className="cu-ospe-card__more no-3d" data-testid={`button-expand-material-${material.id}`}>Read more</button>)}
    {(material.attachmentPath || material.externalUrl) && <span className="cu-ospe-card__foot">
      {material.attachmentPath && <a href={resolveUploadUrl(material.attachmentPath)!} target="_blank" rel="noreferrer" className="cu-ospe-cta cu-ospe-cta--ghost no-3d" data-testid={`link-material-attachment-${material.id}`}><Paperclip size={12} /> Attachment</a>}
      {material.externalUrl && <a href={material.externalUrl} target="_blank" rel="noreferrer" className="cu-ospe-link no-3d" data-testid={`link-material-external-${material.id}`}><LinkIcon size={12} /> Open link</a>}
    </span>}
  </TiltDiv>;
}

function CardsSkeleton({ count = 6 }: { count?: number }) {
  return <div className="cu-ospe-grid is-materials" aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton cu-ospe-skel" style={vars({ '--i': i })} />)}
  </div>;
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function OspeHero({ examType, onExamType, materialsCount, examsCount }: { examType: OspeExamType; onExamType: (t: OspeExamType) => void; materialsCount: number; examsCount: number }) {
  return <TiltDiv className="cu-hero cu-hero--compact" testId="banner-ospe" style={vars({ '--h': EXAM_TYPE_HUE[examType], '--tilt': 2 })}>
    <span className="cu-hero__bg" aria-hidden="true"><i className="cu-orb cu-orb--a" /><i className="cu-orb cu-orb--b" /><i className="hero-grid" /></span>
    <span className="cu-hero__text">
      <span className="cu-hero__title font-display">OSPE / OSCE</span>
      <span className="cu-hero__sub">Study the material, then attempt a timed practical exam — written answers are graded by AI.</span>
      <span className="cu-stats">
        <span className="cu-stat"><b>{materialsCount}</b>materials</span>
        <span className="cu-stat"><b>{examsCount}</b>exam{examsCount === 1 ? '' : 's'}</span>
      </span>
    </span>
    <span className="cu-fan no-3d" style={{ paddingRight: 0 }}>
      <SegToggle value={examType} onChange={onExamType} ariaLabel="Exam type" testIdPrefix="button-ospe-exam-type"
        options={[{ value: 'OSPE', label: 'OSPE' }, { value: 'OSCE', label: 'OSCE' }]} />
    </span>
  </TiltDiv>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function OspeOsce() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [examType, setExamType] = useState<OspeExamType>('OSPE');
  const [tab, setTab] = useState<'learn' | 'exam'>('learn');

  const materialsQ = useQuery({ queryKey: ['ospe-materials', examType], queryFn: () => ospeApi.learningMaterials(examType) });
  const examsQ = useQuery({ queryKey: ['ospe-exams', examType], queryFn: () => ospeApi.exams(examType) });

  const start = useMutation({
    mutationFn: ospeApi.start,
    onSuccess: (res) => setLocation(`/ospe-osce/take/${res.attemptId}`),
    onError: (err: unknown) => {
      toast({ title: 'Could not start this exam', description: err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.', variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['ospe-exams'] });
    },
  });

  const materials = materialsQ.data || [];
  const exams = examsQ.data || [];

  return <div className="cu-page">
    <OspeHero examType={examType} onExamType={setExamType} materialsCount={materials.length} examsCount={exams.length} />

    <SegToggle value={tab} onChange={setTab} ariaLabel="Section" testIdPrefix="tab-ospe"
      options={[{ value: 'learn', label: 'Learning material' }, { value: 'exam', label: 'Exams' }]} />

    {tab === 'learn' && (materialsQ.isLoading ? <CardsSkeleton /> : <div className="cu-ospe-grid is-materials">
      {materials.map((m, i) => <LearningMaterialCard key={m.id} material={m} examType={examType} index={i} />)}
      {!materials.length && <div className="sm:col-span-2 lg:col-span-3"><EmptyState icon={BookOpen} title="No learning material yet" body={`Your admin hasn't added any ${examType} learning material for your program and year yet.`} /></div>}
    </div>)}

    {tab === 'exam' && (examsQ.isLoading ? <CardsSkeleton count={4} /> : <div className="cu-ospe-grid">
      {exams.map((exam, i) => <OspeExamCard key={exam.id} exam={exam} examType={examType} index={i} starting={start.isPending} onStart={() => start.mutate(exam.id)} />)}
      {!exams.length && <div className="sm:col-span-2"><EmptyState icon={Stethoscope} title="No exams scheduled" body={`Your admin hasn't published a ${examType} exam for your program and year yet.`} /></div>}
    </div>)}
  </div>;
}

export default OspeOsce;

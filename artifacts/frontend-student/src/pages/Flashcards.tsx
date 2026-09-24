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
  useListMcqs, useListNotifications, useListPayments, useListResources,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
import { gradeCard, nextIntervalLabel } from '@/lib/study';
import { Badge, EmptyState, Progress, SectionHeader, SkeletonPage, TopicBadge, cn, topicAccentStyles, topicColorVar, useModulesGrouping } from '@/lib/shared';

function Flashcards() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlTopicId = Number(new URLSearchParams(search).get('topic')) || undefined;
  // useModulesGrouping() (the same hook the Blocks landing page and Practice
  // use) instead of a standalone useListModules()/blocks fetch here: it
  // keys its blocks query as ['blocks'], so a student who's already visited
  // Blocks or started a Practice session gets this filter's Block dropdown
  // populated straight from cache (30s staleTime, no window-refocus
  // refetch — see the QueryClient config above) rather than waiting on a
  // fresh round trip just to open Flashcards.
  const { modules, blocks, modulesByBlock } = useModulesGrouping();
  const [blockId, setBlockId] = useState('');
  const modulesInBlock = blockId ? (modulesByBlock.get(Number(blockId)) ?? []) : modules;
  const [moduleId, setModuleId] = useState('');
  const subjectsQ = useListSubjects(moduleId ? { moduleId: Number(moduleId) } : undefined);
  // Unfiltered — used only to compute the "Subjects"/"Topics" stat cards
  // across everything the student can see, independent of the cascading
  // module/subject/topic filter below.
  const allSubjectsQ = useListSubjects();
  const allTopicsQ = useListTopics();
  const [subjectId, setSubjectId] = useState('');
  const topicsQ = useListTopics(subjectId ? { subjectId: Number(subjectId) } : undefined);
  const [topicId, setTopicId] = useState(urlTopicId ? String(urlTopicId) : '');
  const activeTopicId = Number(topicId) || undefined;
  const [queryText, setQueryText] = useState('');
  const [view, setView] = useState<'grid' | 'study'>('grid');
  const [flippedIds, setFlippedIds] = useState<Set<number>>(new Set());
  // Streak badge (top-right) — same data source as the dashboard's streak card.
  const streakQ = useQuery({ queryKey: ['analytics', '7d'], queryFn: () => analyticsApi.get('7d') });

  // Program/year scoping already happens server-side via getVisibleModuleIds
  // (same as past papers/exams) — these selects just let the student narrow
  // *within* what they can already see, so they get flashcards relevant to
  // what they're actually studying instead of a random mixed deck.
  const q = useListFlashcards(activeTopicId ? { topicId: activeTopicId } : undefined);
  // Unfiltered — drives the "Total Available" stat regardless of the
  // module/subject/topic filter currently applied to the deck/grid below.
  const allCardsQ = useListFlashcards();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<number, boolean>>({});
  const cards: Flashcard[] = q.data ?? [];
  const visibleCards = queryText.trim() ? cards.filter((c) => c.front.toLowerCase().includes(queryText.trim().toLowerCase()) || c.back.toLowerCase().includes(queryText.trim().toLowerCase())) : cards;
  // Grid view used to mount every visible card's DOM (two flip faces each,
  // with gradients/borders/decorative shapes) in one go. That's fine for
  // a few dozen cards, but the flashcard bank has grown into the
  // hundreds/thousands after bulk imports, and building that much DOM at
  // once is what froze the tab on load. The API has no server-side
  // pagination to lean on here (listFlashcards always returns the full
  // filtered array), so we window the *rendering* client-side instead —
  // same data already in memory, just a bounded slice mounted at a time.
  const GRID_PAGE_SIZE = 30;
  const [gridPage, setGridPage] = useState(0);
  const gridPageCount = Math.max(1, Math.ceil(visibleCards.length / GRID_PAGE_SIZE));
  const clampedGridPage = Math.min(gridPage, gridPageCount - 1);
  const pagedCards = visibleCards.slice(clampedGridPage * GRID_PAGE_SIZE, (clampedGridPage + 1) * GRID_PAGE_SIZE);
  // Jump back to page 1 whenever the underlying set of cards changes —
  // otherwise a narrower filter/search can leave gridPage pointing past
  // the new (shorter) result set.
  useEffect(() => { setGridPage(0); }, [activeTopicId, subjectId, moduleId, blockId, queryText]);
  const card = cards[index % Math.max(cards.length, 1)];
  const knownCount = Object.values(known).filter(Boolean).length;
  const askAi = useMutation({ mutationFn: () => explanationsApi.askAiFlashcard(card!.id) });
  // Admin control (Settings > Features > "Ask AI to explain") — off hides
  // the button below entirely. Same query key SideNav uses for
  // AI_VISUALIZER_ENABLED, so this just reuses that cached fetch instead of
  // triggering a second one.
  const siteContentQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const aiExplainEnabled = siteContentQ.data?.AI_EXPLAIN_ENABLED !== 'false';

  const advance = (isKnown: boolean) => { setKnown((prev) => ({ ...prev, [card.id]: isKnown })); setIndex((i) => i + 1); setFlipped(false); askAi.reset(); };
  const resetDeck = () => { setIndex(0); setKnown({}); setFlipped(false); askAi.reset(); };
  const toggleGridFlip = (id: number) => setFlippedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const header = <SectionHeader eyebrow="Study tools" title="Study Flashcards" description="Master your knowledge with interactive flashcards."
    action={(streakQ.data?.currentStreak ?? 0) > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff0cb] px-3 py-1.5 text-[11px] font-bold text-[#8d6420] ring-1 ring-inset ring-[#8d6420]/15" data-testid="text-flashcard-streak"><Flame size={13} /> {streakQ.data?.currentStreak} day streak</span> : undefined} />;

  const toolbar = <div className="mb-5 flex flex-wrap items-center gap-2">
    <div className="flex overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-2xs)]">
      <button onClick={() => setView('grid')} className={cn('grid size-9 place-items-center transition-colors', view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} title="Grid view" data-testid="button-flashcard-view-grid"><LayoutGrid size={15} /></button>
      <button onClick={() => setView('study')} className={cn('grid size-9 place-items-center border-l border-border transition-colors', view === 'study' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} title="Study mode" data-testid="button-flashcard-view-study"><Presentation size={15} /></button>
    </div>
    <button onClick={() => { resetDeck(); setFlippedIds(new Set()); }} className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-[var(--shadow-2xs)] transition-all hover:-translate-y-0.5 hover:bg-muted hover:shadow-[var(--shadow-xs)]" title="Restart" data-testid="button-flashcard-refresh"><RotateCcw size={15} /></button>
  </div>;

  const statCards = <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[
    { label: 'Total Available', value: allCardsQ.data?.length ?? 0, icon: Zap, bg: 'bg-[#fdf0d9]', fg: 'text-[#8a5a12]' },
    { label: 'Topics', value: allTopicsQ.data?.length ?? 0, icon: Target, bg: 'bg-[#d7eee4]', fg: 'text-[#1f7a5c]' },
    { label: 'Subjects', value: allSubjectsQ.data?.length ?? 0, icon: BookOpen, bg: 'bg-[#dceaf1]', fg: 'text-[#2c6a8f]' },
    { label: 'Modules', value: modules.length, icon: LayoutGrid, bg: 'bg-[#efe8f7]', fg: 'text-[#6a4c93]' },
  ].map(({ label, value, icon: Icon, bg, fg }) => <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center shadow-[var(--shadow-2xs)] transition-shadow hover:shadow-[var(--shadow-xs)]"><div className={cn('mx-auto mb-2 grid size-8 place-items-center rounded-lg', bg, fg)}><Icon size={15} /></div><div className="font-display text-2xl">{value}</div><div className="mt-1 text-[11px] font-semibold text-muted-foreground">{label}</div></div>)}</div>;

  // Radix's Select can't take an empty-string item value (it reserves ""
  // internally to mean "no selection", and throws if an item uses it), so
  // "All Modules/Subjects/Topics" is modeled as the sentinel value "all"
  // here and translated back to '' — the value the rest of the component
  // (moduleId/subjectId/topicId state, the queries keyed off them) already
  // expects — right where each select's value changes.
  const filterBar = <div className="mb-5 space-y-2.5 rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30 p-4 shadow-[var(--shadow-2xs)]">
    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><SlidersHorizontal size={12} /> Filter deck</div>
    {/* Coarsest filter, same level as the Blocks landing page. Optional —
        a deployment with no blocks configured just shows nothing here and
        the Module select below still lists everything, same as before. */}
    {blocks.length > 0 && <Select
      value={blockId || 'all'}
      onValueChange={(v) => { const val = v === 'all' ? '' : v; setBlockId(val); setModuleId(''); setSubjectId(''); setTopicId(''); navigate('/flashcards'); resetDeck(); }}
    >
      <SelectTrigger className="h-10 w-full rounded-xl border-border bg-card px-3 text-xs transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid="select-flashcard-block">
        <SelectValue placeholder="All Blocks" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Blocks</SelectItem>
        {blocks.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
      </SelectContent>
    </Select>}
    <Select
      value={moduleId || 'all'}
      onValueChange={(v) => { const val = v === 'all' ? '' : v; setModuleId(val); setSubjectId(''); setTopicId(''); navigate('/flashcards'); resetDeck(); }}
    >
      <SelectTrigger className="h-10 w-full rounded-xl border-border bg-card px-3 text-xs transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid="select-flashcard-module">
        <SelectValue placeholder={blockId ? 'All Modules in Block' : 'All Modules'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{blockId ? 'All Modules in Block' : 'All Modules'}</SelectItem>
        {modulesInBlock.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
      </SelectContent>
    </Select>
    <Select
      value={subjectId || 'all'}
      onValueChange={(v) => { const val = v === 'all' ? '' : v; setSubjectId(val); setTopicId(''); resetDeck(); }}
      disabled={!moduleId}
    >
      <SelectTrigger className="h-10 w-full rounded-xl border-border bg-card px-3 text-xs transition-transform hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0" data-testid="select-flashcard-subject">
        <SelectValue placeholder="All Subjects" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Subjects</SelectItem>
        {(subjectsQ.data || []).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
    <Select
      value={topicId || 'all'}
      onValueChange={(v) => { const val = v === 'all' ? '' : v; setTopicId(val); resetDeck(); }}
      disabled={!subjectId}
    >
      <SelectTrigger className="h-10 w-full rounded-xl border-border bg-card px-3 text-xs transition-transform hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0" data-testid="select-flashcard-topic">
        <SelectValue placeholder="All Topics" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Topics</SelectItem>
        {(topicsQ.data || []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
      </SelectContent>
    </Select>
    <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Search flashcards..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none transition-shadow focus:ring-2 focus:ring-primary/20" data-testid="input-flashcard-search" /></div>
  </div>;

  if (!q.isLoading && !cards.length) {
    return <div className="mx-auto max-w-3xl">{header}{toolbar}{statCards}{filterBar}<EmptyState icon={Zap} title={activeTopicId ? 'No flashcards here yet' : 'No flashcards yet'} body={activeTopicId ? "Your academic team hasn't published flashcards for this topic yet." : "Your academic team hasn't published any flashcards yet."} /></div>;
  }
  if (q.isLoading || !card) return <div className="mx-auto max-w-3xl">{header}{toolbar}{statCards}{filterBar}<SkeletonPage /></div>;

  if (view === 'grid') {
    return <div className="mx-auto max-w-3xl">{header}{toolbar}{statCards}{filterBar}
      {!visibleCards.length ? <EmptyState icon={Search} title="No matches" body="No flashcards match your search — try a different term." /> : <>
      {visibleCards.length > GRID_PAGE_SIZE && <div className="mb-3 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
        <span>Showing {clampedGridPage * GRID_PAGE_SIZE + 1}–{Math.min((clampedGridPage + 1) * GRID_PAGE_SIZE, visibleCards.length)} of {visibleCards.length}</span>
        <span>Page {clampedGridPage + 1} of {gridPageCount}</span>
      </div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{pagedCards.map((c, pageI) => {
        const i = clampedGridPage * GRID_PAGE_SIZE + pageI;
        const isFlipped = flippedIds.has(c.id);
        const accent = topicAccentStyles(c.topic || c.module);
        return <div key={c.id} className="flip-card" data-testid={`card-flashcard-grid-${c.id}`}>
          <button
            onClick={() => toggleGridFlip(c.id)}
            className={cn('flip-card-inner group block min-h-[240px] rounded-2xl text-left', isFlipped && 'is-flipped')}
            data-testid={`button-flip-flashcard-${c.id}`}
          >
            {/* Front — the question */}
            <div className="flip-card-face card-lift flex flex-col overflow-hidden rounded-2xl border bg-card p-5 shadow-[var(--shadow-2xs)] transition-shadow hover:shadow-[var(--shadow-md)]" style={{ ...accent.border, ...accent.wash }}>
              <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 size-24 rotate-12 rounded-2xl border-[8px] border-current opacity-[0.06]" />
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold">Q{i + 1}</span><TopicBadge label={c.topic} /></div>
              <div className="flex flex-1 min-h-0 items-[safe_center] justify-center overflow-y-auto py-1"><p className="line-clamp-6 text-center text-sm font-bold leading-6">{c.front}</p></div>
              <div className="flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{c.module}</Badge></div>
              <div className="mt-3 flex items-center justify-center gap-1 text-center text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground">Tap to reveal <RotateCcw size={10} /></div>
            </div>
            {/* Back — the answer, distinct tint so flip state is unmistakable */}
            <div className="flip-card-face flip-card-back flex flex-col overflow-hidden rounded-2xl border p-5 shadow-[var(--shadow-md)]" style={{ ...accent.border, background: 'hsl(var(--card))' }}>
              <div aria-hidden className="pointer-events-none absolute -bottom-8 -left-6 size-20 rounded-full border-[8px] border-current opacity-[0.06]" />
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={accent.badge}>A{i + 1}</span><TopicBadge label={c.topic} /></div>
              <div className="flex flex-1 min-h-0 items-[safe_center] justify-center overflow-y-auto py-1"><p className="line-clamp-6 text-center text-sm font-bold leading-6">{c.back}</p></div>
              <div className="flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{c.module}</Badge></div>
              <div className="mt-3 text-center text-[11px] font-semibold text-muted-foreground">Tap to flip back</div>
            </div>
          </button>
        </div>;
      })}</div>
      {gridPageCount > 1 && <div className="mt-6 flex items-center justify-center gap-3">
        <button onClick={() => setGridPage((p) => Math.max(0, p - 1))} disabled={clampedGridPage === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground shadow-[var(--shadow-2xs)] transition-all disabled:opacity-30 disabled:pointer-events-none hover:-translate-y-0.5 hover:bg-muted" data-testid="button-flashcard-grid-page-prev"><ArrowLeft size={13} /> Previous</button>
        <span className="font-mono-app text-[11px] text-muted-foreground">Page {clampedGridPage + 1} of {gridPageCount}</span>
        <button onClick={() => setGridPage((p) => Math.min(gridPageCount - 1, p + 1))} disabled={clampedGridPage >= gridPageCount - 1} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground shadow-[var(--shadow-2xs)] transition-all disabled:opacity-30 disabled:pointer-events-none hover:-translate-y-0.5 hover:bg-muted" data-testid="button-flashcard-grid-page-next">Next <ArrowRight size={13} /></button>
      </div>}
      </>}
    </div>;
  }

  const cardAccent = topicAccentStyles(card.topic || card.module);
  const stillLearningCount = Object.values(known).filter((v) => v === false).length;
  const reviewedCount = Object.keys(known).length;
  const cardNumber = (index % cards.length) + 1;

  const goPrev = () => { setIndex((i) => Math.max(0, i - 1)); setFlipped(false); askAi.reset(); };
  const goNext = () => { setIndex((i) => (i + 1) % cards.length); setFlipped(false); askAi.reset(); };

  // Minimal inline swipe hook — horizontal drag past a 50px threshold
  // triggers Next (swipe left) / Previous (swipe right). No library needed
  // for one gesture; small enough to keep next to the component that uses it.
  const touchStartX = { current: 0 };
  const onTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) goNext(); else goPrev();
  };

  // Slim top strip (back arrow + page name + "x / y" progress) matching
  // the reference design's study-mode header, layered above the existing
  // richer header/toolbar/stat-card block rather than replacing it.
  const studyTopStrip = <div className="mb-4 flex items-center gap-3">
    <Link href="/dashboard" className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted" data-testid="link-flashcards-back" aria-label="Back"><ArrowLeft size={15} /></Link>
    <span className="text-sm font-extrabold">Flashcards</span>
    <div className="ml-auto flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:w-40"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(cardNumber / cards.length) * 100}%` }} /></div><span className="font-mono-app text-[11px] text-muted-foreground">{cardNumber} / {cards.length}</span></div>
  </div>;

  return <div className="mx-auto max-w-3xl">{studyTopStrip}{header}{toolbar}{statCards}{filterBar}
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono-app text-[11px] text-muted-foreground">Card {cardNumber} of {cards.length}</span>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        {knownCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#d7eee4] px-2.5 py-1 text-[#287058]"><ThumbsUp size={11} /> {knownCount} known</span>}
        {stillLearningCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0cb] px-2.5 py-1 text-[#8d6420]"><ThumbsDown size={11} /> {stillLearningCount} learning</span>}
      </div>
    </div>
    <div className="mb-4"><Progress value={(reviewedCount / cards.length) * 100} color="bg-primary" /></div>
    <div className="mb-4 flex justify-center gap-1.5">{cards.map((c, i) => <div key={c.id} className={cn('h-1.5 w-6 rounded-full transition-colors', i === index % cards.length ? 'bg-primary' : known[c.id] === true ? 'bg-[#8bcbb8]' : known[c.id] === false ? 'bg-[#e5a952]' : 'bg-muted')} />)}</div>
    <div className="flex items-center gap-2 sm:gap-4">
      <button onClick={goPrev} disabled={index === 0} className="hidden size-11 shrink-0 rounded-full border border-border bg-card text-muted-foreground disabled:opacity-30 disabled:pointer-events-none hover:bg-muted sm:grid sm:place-items-center" data-testid="button-flashcard-prev" aria-label="Previous card"><ArrowLeft size={16} /></button>
      <div className="flip-card flex-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}><button onClick={() => setFlipped(!flipped)} className={cn('flip-card-inner min-h-[380px] md:min-h-[460px]', flipped && 'is-flipped')} data-testid="button-flashcard">
        {/* Front — same badge row / footer language as the grid card's front face, just at single-card scale, plus 3 low-opacity decorative shapes behind the content so grid and study read as one design language. */}
        <div className="flip-card-face flex flex-col overflow-hidden rounded-3xl border p-9 text-left text-[#eaf2e9] shadow-lg md:p-14" style={{ background: `linear-gradient(155deg, hsl(var(${topicColorVar(card.topic || card.module)}) / 0.92), hsl(208 40% 14%))` }}>
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 size-48 rotate-12 rounded-[2rem] border-[14px] border-white/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-8 size-40 rounded-full border-[10px] border-white/10" />
          <div className="relative flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold">Question {cardNumber}</span><TopicBadge label={card.topic} /></div>
          <div className="relative flex flex-1 min-h-0 items-[safe_center] justify-center overflow-y-auto py-2 text-center"><h2 className="mx-auto max-w-xl font-display text-2xl leading-tight md:text-4xl">{card.front}</h2></div>
          <div className="relative flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{card.module}</Badge></div>
          <div className="relative mt-3 flex justify-center text-xs text-[#eaf2e9]/70">Click to reveal the answer <ArrowRight size={14} className="ml-2" /></div>
        </div>
        {/* Back — same tinted-card language as the grid card's back face */}
        <div className="flip-card-face flip-card-back flex flex-col overflow-hidden rounded-3xl border p-9 text-left shadow-lg md:p-14" style={{ background: `hsl(var(${topicColorVar(card.topic || card.module)}) / 0.1)`, ...cardAccent.border }}>
          <div aria-hidden className="pointer-events-none absolute -right-8 -bottom-12 size-40 rotate-12 rounded-[2rem]" style={{ ...cardAccent.wash }} />
          <div className="relative flex flex-wrap items-center gap-2"><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={cardAccent.badge}>Answer {cardNumber}</span><TopicBadge label={card.topic} /></div>
          <div className="relative flex flex-1 min-h-0 items-[safe_center] justify-center overflow-y-auto py-2 text-center"><h2 className="mx-auto max-w-xl font-display text-xl leading-tight text-[#164b4b] md:text-3xl">{card.back}</h2></div>
          <div className="relative flex flex-wrap items-center justify-center gap-2"><Badge tone="neutral">{card.module}</Badge></div>
          <div className="relative mt-3 text-center text-xs" style={{ color: `hsl(var(${topicColorVar(card.topic || card.module)}))` }}>Click to flip back</div>
        </div>
      </button></div>
      <button onClick={goNext} className="hidden size-11 shrink-0 rounded-full border border-border bg-card text-muted-foreground hover:bg-muted sm:grid sm:place-items-center" data-testid="button-flashcard-next" aria-label="Next card"><ArrowRight size={16} /></button>
    </div>
    {/* Mobile equivalents of the Prev/Next buttons above, hidden on sm+ where the flanking arrows already do the job */}
    <div className="mt-3 flex justify-center gap-3 sm:hidden">
      <button onClick={goPrev} disabled={index === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground disabled:opacity-30" data-testid="button-flashcard-prev-mobile"><ArrowLeft size={13} /> Previous</button>
      <button onClick={goNext} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground" data-testid="button-flashcard-next-mobile">Next <ArrowRight size={13} /></button>
    </div>
    {flipped && aiExplainEnabled && <div className="mt-4 flex justify-center">{!askAi.data ? <button onClick={() => askAi.mutate()} disabled={askAi.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-[#eef7f1] px-3 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50" data-testid="button-ask-ai-flashcard">{askAi.isPending ? 'Thinking…' : <><Sparkles size={11} /> Ask AI to explain differently</>}</button> : <div className="max-w-xl rounded-xl bg-[#eef7f1] p-3 text-xs leading-5"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary"><Sparkles size={10} /> AI explanation</div>{askAi.data.explanation}</div>}{askAi.isError && <p className="mt-2 text-[11px] font-semibold text-destructive">{askAi.error instanceof ApiRequestError ? askAi.error.message : 'Could not reach AI right now.'}</p>}</div>}
    <div className="mt-6 flex justify-center gap-3">{flipped ? <div className="grid w-full max-w-md grid-cols-4 gap-2 pf-edit" role="group" aria-label="How well did you know this?">{([['again', 'Again', 'bg-[#fff1ed] text-[#a34c3e] border-[#f0d3cc]'], ['hard', 'Hard', 'bg-[#fff0cb] text-[#8a5a12] border-[#e5a952]/50'], ['good', 'Good', 'bg-[#dceaf1] text-[#32647b] border-[#32647b]/25'], ['easy', 'Easy', 'bg-[#e6f3ed] text-[#287058] border-[#287058]/25']] as const).map(([g, label, tone]) => <button key={g} onClick={() => { gradeCard(card.id, g); advance(g === 'good' || g === 'easy'); }} className={cn('rounded-xl border px-2 py-2.5 text-center text-xs font-extrabold transition-transform hover:-translate-y-0.5 active:scale-95', tone)} data-testid={`button-grade-${g}`}>{label}<span className="mt-0.5 block text-[9px] font-bold opacity-70">{nextIntervalLabel(card.id, g)}</span></button>)}</div> : <button onClick={() => setFlipped(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-bold text-primary-foreground hover:opacity-90" data-testid="button-reveal-card">Show Answer <ChevronRight size={14} /></button>}</div>
    <div className="mt-2 flex justify-center text-[11px] text-muted-foreground">Tap the card to flip</div>
    <div className="mt-3 flex justify-center"><button onClick={resetDeck} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground" data-testid="button-restart-deck"><RotateCcw size={12} /> Restart deck</button></div>
  </div>;
}

export default Flashcards;

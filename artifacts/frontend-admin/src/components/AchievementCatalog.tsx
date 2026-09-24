// v64 — Achievement catalog: 100 exam/streak/membership badges plus the friend-challenge
// badges below, all computed entirely from
// data the drawer already loads (this student's exam attempts, streak
// fields, payments, feedback, flags) — still no new backend model. Split
// out of Student360.tsx because the catalog + the animated gallery that
// renders it are sizeable on their own.
//
// The "3D animated flow": each card tilts toward the pointer (framer-motion
// spring-smoothed rotateX/rotateY) via Pointer Events, so mouse *and* pen
// get the tilt; touch gets a quick tap-scale instead (dragging a finger to
// "tilt" would fight page scroll, so we don't try). The grid uses
// AnimatePresence + layout animations instead of a hard remount, so
// filtering/searching reflows existing cards rather than replaying the
// whole entrance every keystroke. Everything respects prefers-reduced-motion.
// Colors use the app's accent/muted tokens (not hardcoded hex) so this
// renders correctly in both light and dark theme.
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import {
  Award, CalendarDays, CheckCheck, CreditCard, Crown, Flag, Flame, GraduationCap,
  Layers, Lock, Medal, MessageSquare, Moon, Repeat, Search, Sparkles, Star, Sunrise, Swords, Target, Trophy, Users, Zap,
} from 'lucide-react';
import type { ExamAttemptRow, PaymentRow, StudentChallengeRow, StudentDetail } from '@/lib/api';
import { cn } from '@/lib/shared';

export type Achievement = {
  id: string; label: string; hint: string; icon: typeof Trophy; category: string;
  earned: boolean; progress: number; // 0..1, used for the locked-card progress bar
};

type Attempt = ExamAttemptRow & { examTitle: string };

// One "family" (e.g. "exams completed") expands into one card per threshold
// — bronze/silver/gold-style tiers sharing an icon and category but with
// their own label, target and earned/progress state.
function tierFamily(opts: { idPrefix: string; category: string; icon: typeof Trophy; current: number; thresholds: number[]; label: (t: number) => string; hint?: (t: number, current: number) => string }): Achievement[] {
  return opts.thresholds.map((t) => ({
    id: `${opts.idPrefix}-${t}`,
    label: opts.label(t),
    hint: opts.hint ? opts.hint(t, opts.current) : `${Math.min(opts.current, t)}/${t}`,
    icon: opts.icon,
    category: opts.category,
    earned: opts.current >= t,
    progress: t === 0 ? 1 : Math.min(1, opts.current / t),
  }));
}

/** Builds the full (up to 100-entry) achievement list for one student, purely from data already fetched by Student 360°. */
export function computeAchievements(s: StudentDetail, mine: Attempt[], avg: number | null, passedCount: number, paid: PaymentRow[], feedbackCount: number, flagsCount: number, tenureDays: number, challenges?: { sent: StudentChallengeRow[]; received: StudentChallengeRow[] }): Achievement[] {
  const totalCorrect = mine.reduce((a, m) => a + (m.correctCount || 0), 0);
  const perfectCount = mine.filter((m) => m.totalQuestions > 0 && m.correctCount === m.totalQuestions).length;
  const noSkipCount = mine.filter((m) => m.totalQuestions > 0 && m.unansweredCount === 0).length;
  const hourOf = (iso: string | null) => (iso ? new Date(iso).getHours() : null);
  const dayOf = (iso: string | null) => (iso ? new Date(iso).getDay() : null);
  const earlyBirdCount = mine.filter((m) => { const h = hourOf(m.submittedAt); return h !== null && h < 8; }).length;
  const nightOwlCount = mine.filter((m) => { const h = hourOf(m.submittedAt); return h !== null && h >= 22; }).length;
  const weekendCount = mine.filter((m) => { const d = dayOf(m.submittedAt); return d === 0 || d === 6; }).length;
  const marathonCount = mine.filter((m) => m.totalQuestions >= 100).length;
  let winStreak = 0, curRun = 0;
  for (const m of mine) { if (m.passed) { curRun++; winStreak = Math.max(winStreak, curRun); } else curRun = 0; }

  // Family sizes are chosen to add up to exactly 100 (10+10+6+6+6+5+10+7+3+5+4+4+4 + 4×5 = 100),
  // so the slice(0, 100) below is a safety cap rather than something that
  // silently truncates any one family.
  const families: Achievement[][] = [
    tierFamily({ idPrefix: 'exams', category: 'Exams', icon: GraduationCap, current: mine.length, thresholds: [1, 3, 5, 10, 15, 25, 40, 60, 80, 100], label: (t) => `${t} exam${t > 1 ? 's' : ''} completed` }),
    tierFamily({ idPrefix: 'passed', category: 'Exams', icon: Trophy, current: passedCount, thresholds: [1, 3, 5, 10, 15, 25, 40, 60, 80, 100], label: (t) => `${t} exam${t > 1 ? 's' : ''} passed` }),
    tierFamily({ idPrefix: 'correct', category: 'Exams', icon: CheckCheck, current: totalCorrect, thresholds: [25, 50, 100, 200, 300, 500], label: (t) => `${t.toLocaleString()} correct answers` }),
    tierFamily({ idPrefix: 'perfect', category: 'Scores', icon: Crown, current: perfectCount, thresholds: [1, 2, 3, 5, 10, 15], label: (t) => `${t} perfect score${t > 1 ? 's' : ''}` }),
    tierFamily({ idPrefix: 'avg', category: 'Scores', icon: Star, current: avg ?? 0, thresholds: [50, 65, 75, 85, 95, 100], label: (t) => `${t}% average reached`, hint: (t, c) => `${Math.min(Math.round(c), t)}%/${t}%` }),
    tierFamily({ idPrefix: 'noskip', category: 'Scores', icon: Target, current: noSkipCount, thresholds: [1, 5, 10, 20, 30], label: (t) => `${t} exam${t > 1 ? 's' : ''} with no skips` }),
    tierFamily({ idPrefix: 'longstreak', category: 'Streaks', icon: Flame, current: s.longestStreak, thresholds: [3, 5, 7, 10, 14, 21, 30, 45, 60, 90], label: (t) => `${t}-day streak reached` }),
    tierFamily({ idPrefix: 'curstreak', category: 'Streaks', icon: Zap, current: s.currentStreak, thresholds: [3, 5, 7, 10, 14, 21, 30], label: (t) => `${t}-day streak active now` }),
    tierFamily({ idPrefix: 'winstreak', category: 'Streaks', icon: Sparkles, current: winStreak, thresholds: [3, 5, 10], label: (t) => `${t} exams passed in a row` }),
    tierFamily({ idPrefix: 'paid', category: 'Membership', icon: CreditCard, current: paid.length, thresholds: [1, 2, 3, 5, 10], label: (t) => `${t} payment${t > 1 ? 's' : ''} approved` }),
    tierFamily({ idPrefix: 'tenure', category: 'Membership', icon: Award, current: tenureDays, thresholds: [7, 30, 90, 180], label: (t) => t < 30 ? `${t} days on the platform` : `${Math.round(t / 30)} month${t >= 60 ? 's' : ''} on the platform` }),
    tierFamily({ idPrefix: 'feedback', category: 'Community', icon: MessageSquare, current: feedbackCount, thresholds: [1, 3, 5, 10], label: (t) => `${t} feedback message${t > 1 ? 's' : ''} sent` }),
    tierFamily({ idPrefix: 'flags', category: 'Community', icon: Flag, current: flagsCount, thresholds: [1, 3, 5, 10], label: (t) => `${t} question${t > 1 ? 's' : ''} flagged` }),
    tierFamily({ idPrefix: 'early', category: 'Special', icon: Sunrise, current: earlyBirdCount, thresholds: [1, 3, 5, 10, 20], label: (t) => `Early bird ×${t}`, hint: () => 'Submitted before 8am' }),
    tierFamily({ idPrefix: 'night', category: 'Special', icon: Moon, current: nightOwlCount, thresholds: [1, 3, 5, 10, 20], label: (t) => `Night owl ×${t}`, hint: () => 'Submitted after 10pm' }),
    tierFamily({ idPrefix: 'weekend', category: 'Special', icon: CalendarDays, current: weekendCount, thresholds: [1, 3, 5, 10, 20], label: (t) => `Weekend warrior ×${t}`, hint: () => 'Submitted on a weekend' }),
    tierFamily({ idPrefix: 'marathon', category: 'Special', icon: Layers, current: marathonCount, thresholds: [1, 3, 5, 10, 20], label: (t) => `Marathon exam ×${t}`, hint: () => '100+ questions in one sitting' }),
  ];
  // The core catalog stays capped at 100; friend-challenge badges are appended after it.
  return [...families.flat().slice(0, 100), ...(challenges ? computeChallengeAchievements(challenges.sent, challenges.received) : [])];
}

/** Friend-challenge badges. Mirrors the student app's challenge achievements (same thresholds), scored from the student's own challenge history. A win needs BOTH players finished; ties are not wins. */
export function computeChallengeAchievements(sent: StudentChallengeRow[], received: StudentChallengeRow[]): Achievement[] {
  const all = [...sent, ...received];
  const played = all.filter((c) => c.iHavePlayed && c.myScorePercent != null);
  const done = all
    .filter((c) => c.status === 'COMPLETED' && c.myScorePercent != null && c.opponentScorePercent != null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let wins = 0, run = 0, bestStreak = 0, bestMargin = 0;
  for (const c of done) {
    const diff = (c.myScorePercent as number) - (c.opponentScorePercent as number);
    if (diff > 0) { wins++; run++; bestStreak = Math.max(bestStreak, run); bestMargin = Math.max(bestMargin, diff); } else run = 0;
  }
  const perRival = new Map<number, number>();
  for (const c of done) if (c.opponent) perRival.set(c.opponent.id, (perRival.get(c.opponent.id) ?? 0) + 1);
  const rivals = new Set(played.map((c) => c.opponent?.id).filter((x): x is number => typeof x === 'number')).size;
  const perfect = played.filter((c) => (c.myScorePercent as number) >= 100).length;
  const sharp = played.filter((c) => (c.myScorePercent as number) >= 90).length;
  const questions = played.reduce((a, c) => a + (c.totalQuestions || 0), 0);
  const plural = (t: number, one: string, many: string) => (t === 1 ? one : many);
  return [
    tierFamily({ idPrefix: 'ch-sent', category: 'Challenges', icon: Swords, current: sent.length, thresholds: [1, 5, 10, 25], label: (t) => plural(t, 'First challenge sent', `${t} challenges sent`) }),
    tierFamily({ idPrefix: 'ch-played', category: 'Challenges', icon: Swords, current: played.length, thresholds: [1, 5, 10, 25, 50], label: (t) => plural(t, 'First duel played', `${t} duels played`) }),
    tierFamily({ idPrefix: 'ch-wins', category: 'Challenges', icon: Trophy, current: wins, thresholds: [1, 3, 5, 10, 25], label: (t) => plural(t, 'First victory over a friend', `${t} victories over friends`) }),
    tierFamily({ idPrefix: 'ch-streak', category: 'Challenges', icon: Flame, current: bestStreak, thresholds: [2, 3, 5, 10], label: (t) => `${t}-win challenge streak` }),
    tierFamily({ idPrefix: 'ch-margin', category: 'Challenges', icon: Zap, current: Math.floor(bestMargin), thresholds: [20, 40, 60], label: (t) => `Won a challenge by ${t}+ points` }),
    tierFamily({ idPrefix: 'ch-perfect', category: 'Challenges', icon: Crown, current: perfect, thresholds: [1, 3, 5], label: (t) => plural(t, 'Flawless duel', `${t} flawless duels`) }),
    tierFamily({ idPrefix: 'ch-sharp', category: 'Challenges', icon: Star, current: sharp, thresholds: [1, 5, 10], label: (t) => `${t} duel score${t > 1 ? 's' : ''} of 90%+` }),
    tierFamily({ idPrefix: 'ch-questions', category: 'Challenges', icon: Target, current: questions, thresholds: [50, 200, 500], label: (t) => `${t} duel questions answered` }),
    tierFamily({ idPrefix: 'ch-rivals', category: 'Challenges', icon: Users, current: rivals, thresholds: [2, 5, 10], label: (t) => `Faced ${t} different classmates` }),
    tierFamily({ idPrefix: 'ch-rematch', category: 'Challenges', icon: Repeat, current: Math.max(0, ...perRival.values()), thresholds: [2, 3, 5], label: (t) => `${t} matches vs the same rival` }),
    tierFamily({ idPrefix: 'ch-accepted', category: 'Challenges', icon: Medal, current: received.filter((c) => c.iHavePlayed).length, thresholds: [1, 5, 10], label: (t) => `${t} friend challenge${t > 1 ? 's' : ''} accepted` }),
  ].flat();
}

export const ACHIEVEMENT_CATEGORIES = ['All', 'Exams', 'Scores', 'Streaks', 'Challenges', 'Membership', 'Community', 'Special'] as const;

// Per-card pointer-follow tilt. Kept as its own tiny component so each card
// owns its own motion values — 100 siblings each animating independently
// without fighting over shared state.
//
// Pointer Events (not separate mouse/touch handlers) so mouse and pen get
// the tilt for free; touch pointers skip the tilt math entirely (dragging a
// finger to "tilt" would fight the page's vertical scroll) and instead get
// a snappy whileTap scale, so touch users still get feedback on tap.
// The bounding rect is captured once on pointerenter and reused for every
// pointermove, instead of calling getBoundingClientRect() on every move.
function TiltCard({ children, className, index, reduceMotion }: { children: React.ReactNode; className?: string; index: number; reduceMotion: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 280, damping: 22, mass: 0.6 });
  const rotateY = useSpring(rawY, { stiffness: 280, damping: 22, mass: 0.6 });

  const onPointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    rectRef.current = ref.current?.getBoundingClientRect() ?? null;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || (e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;
    const rect = rectRef.current;
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rawY.set(px * 16);
    rawX.set(-py * 16);
  };
  const onPointerLeave = () => { rawX.set(0); rawY.set(0); };

  return <motion.div
    layout="position"
    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotateX: -20 }}
    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, rotateX: 0 }}
    exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
    transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 24, delay: Math.min(index * 0.014, 0.5) }}
    style={{ perspective: 700 }}
  >
    <motion.div
      ref={ref}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      whileTap={{ scale: 0.94 }}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className={className}
    >
      {children}
    </motion.div>
  </motion.div>;
}

export function AchievementGallery({ achievements }: { achievements: Achievement[] }) {
  const [cat, setCat] = useState<(typeof ACHIEVEMENT_CATEGORIES)[number]>('All');
  const [q, setQ] = useState('');
  const reduceMotion = useReducedMotion();
  const earnedCount = achievements.filter((a) => a.earned).length;
  const pct = (earnedCount / Math.max(1, achievements.length)) * 100;
  const filtered = useMemo(() => achievements
    .filter((a) => cat === 'All' || a.category === cat)
    .filter((a) => !q.trim() || a.label.toLowerCase().includes(q.trim().toLowerCase())), [achievements, cat, q]);

  return <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Achievements</div>
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-accent" aria-live="polite"><Award size={11} aria-hidden="true" />{earnedCount}/{achievements.length} unlocked</div>
    </div>

    {/* Overall progress bar — a single glanceable "how far through the whole catalog" strip. */}
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Achievements unlocked" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="h-full rounded-full bg-accent" initial={reduceMotion ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 90, damping: 20 }} />
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by category">{ACHIEVEMENT_CATEGORIES.map((c) => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className="relative rounded-full px-2.5 py-1 text-[10px] font-extrabold" data-testid={`button-achievement-cat-${c.toLowerCase()}`}>
        {cat === c && <motion.span layoutId="achievement-cat-pill" className="absolute inset-0 rounded-full bg-primary" transition={reduceMotion ? { duration: 0.1 } : { type: 'spring', stiffness: 400, damping: 32 }} />}
        <span className={cn('relative z-10', cat === c ? 'text-primary-foreground' : 'text-muted-foreground')}>{c}</span>
      </button>)}</div>
      <div className="relative ml-auto w-full max-w-[160px]">
        <Search className="absolute left-2.5 top-1.5 text-muted-foreground" size={11} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search achievements" className="h-7 w-full rounded-full border border-border bg-background pl-7 pr-2 text-[10px] outline-none" data-testid="input-search-achievements" />
      </div>
    </div>

    {!filtered.length ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-[11px] text-muted-foreground">No achievements match.</div>
      : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {filtered.map((a, i) => <TiltCard key={a.id} index={i} reduceMotion={!!reduceMotion} className={cn('rounded-xl border p-2.5', a.earned ? 'border-accent/40 bg-gradient-to-br from-accent/15 to-accent/5 shadow-sm shadow-accent/20' : 'border-border bg-background opacity-70')}>
            <div className="flex items-center justify-between">
              <div className={cn('grid size-7 place-items-center rounded-full', a.earned ? 'bg-accent/25 text-accent' : 'bg-muted text-muted-foreground')}><a.icon size={13} aria-hidden="true" /></div>
              {!a.earned && <Lock size={11} className="text-muted-foreground" role="img" aria-label="Locked" />}
            </div>
            <div className={cn('mt-1.5 text-[11px] font-extrabold leading-tight', !a.earned && 'text-muted-foreground')}>{a.label}</div>
            <div className="text-[10px] text-muted-foreground">{a.hint}</div>
            {!a.earned && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Progress toward ${a.label}`} aria-valuenow={Math.round(a.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary/60" style={{ width: `${a.progress * 100}%` }} /></div>}
          </TiltCard>)}
        </AnimatePresence>
      </div>}
  </div>;
}

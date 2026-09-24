// Achievements for friend challenges: a tiered gallery (bronze → platinum)
// with a "next up" highlight. Each card tilts toward the pointer with a
// spring (mouse + pen; touch gets a tap-scale instead so it never fights page
// scroll). Everything respects prefers-reduced-motion, and colors come from
// the app tokens (metal tiers are HSL values that read on light and dark).
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { Lock, Sparkles, Trophy } from 'lucide-react';
import type { ChallengeSummary } from '@/lib/api';
import { cn } from '@/lib/shared';
import { computeChallengeAchievements, type ChallengeAchievement, type ChallengeCategory } from '@/lib/challengeAchievements';

const TIERS = [
  { name: 'Bronze', from: 'hsl(28 62% 58%)', to: 'hsl(24 55% 38%)' },
  { name: 'Silver', from: 'hsl(210 14% 80%)', to: 'hsl(212 10% 52%)' },
  { name: 'Gold', from: 'hsl(44 92% 66%)', to: 'hsl(34 78% 44%)' },
  { name: 'Platinum', from: 'hsl(164 55% 68%)', to: 'hsl(190 45% 40%)' },
  { name: 'Legend', from: 'hsl(271 60% 72%)', to: 'hsl(258 50% 45%)' },
];

const FILTERS: Array<'All' | 'Unlocked' | 'In progress' | ChallengeCategory> = ['All', 'Unlocked', 'In progress', 'Winning', 'Skill', 'Social', 'Starter'];

function Medal3D({ a, size = 44 }: { a: ChallengeAchievement; size?: number }) {
  const t = TIERS[Math.min(a.tier, TIERS.length - 1)];
  const Icon = a.icon;
  return <span
    className={cn('relative grid shrink-0 place-items-center rounded-full', !a.earned && 'grayscale')}
    style={{
      width: size, height: size,
      background: a.earned ? `radial-gradient(circle at 30% 25%, ${t.from}, ${t.to})` : 'hsl(var(--muted))',
      boxShadow: a.earned
        ? `0 6px 14px -4px ${t.to}, inset 0 2px 2px hsl(0 0% 100% / .55), inset 0 -3px 5px hsl(0 0% 0% / .25)`
        : 'inset 0 2px 4px hsl(0 0% 0% / .12)',
    }}>
    {a.earned
      ? <Icon size={size * 0.46} strokeWidth={2.2} className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,.35)]" />
      : <Lock size={size * 0.38} className="text-muted-foreground" />}
  </span>;
}

function TiltCard({ a, isNext }: { a: ChallengeAchievement; isNext: boolean }) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 18 }), sry = useSpring(ry, { stiffness: 220, damping: 18 });
  const t = TIERS[Math.min(a.tier, TIERS.length - 1)];

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 14);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 14);
  };
  const reset = () => { rx.set(0); ry.set(0); };

  return <motion.div
    layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, scale: 0.96 }}
    transition={{ duration: 0.28 }}
    style={reduce ? undefined : { rotateX: srx, rotateY: sry, transformPerspective: 700 }}
    onPointerMove={onMove} onPointerLeave={reset} whileTap={reduce ? undefined : { scale: 0.97 }}
    className={cn('relative overflow-hidden rounded-2xl border bg-card p-3.5 shadow-sm', a.earned ? 'border-primary/30' : 'border-border', isNext && 'ring-2 ring-accent/60')}
    data-testid={`achievement-${a.id}`}>
    {a.earned && <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-25 blur-2xl" style={{ background: t.from }} />}
    <div className="relative flex items-start gap-3">
      <Medal3D a={a} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn('truncate text-xs font-extrabold', !a.earned && 'text-muted-foreground')}>{a.label}</p>
          {isNext && <span className="shrink-0 rounded-full bg-accent/25 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-accent-foreground">Next up</span>}
        </div>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{a.hint}</p>
        {a.earned
          ? <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-primary"><Sparkles size={11} /> {t.name} · unlocked</p>
          : <div className="mt-2"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70 transition-[width] duration-500" style={{ width: `${Math.round(a.progress * 100)}%` }} /></div><p className="mt-1 text-[10px] font-bold tabular-nums text-muted-foreground">{a.current}/{a.target}</p></div>}
      </div>
    </div>
  </motion.div>;
}

export function ChallengeAchievements({ sent, received }: { sent: ChallengeSummary[]; received: ChallengeSummary[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const all = useMemo(() => computeChallengeAchievements(sent, received), [sent, received]);
  const earned = all.filter((a) => a.earned).length;
  const next = useMemo(() => all.filter((a) => !a.earned).sort((x, y) => y.progress - x.progress)[0], [all]);

  const shown = all.filter((a) => filter === 'All' ? true : filter === 'Unlocked' ? a.earned : filter === 'In progress' ? !a.earned && a.progress > 0 : a.category === filter);

  return <section className="rounded-3xl border border-border bg-card p-5 sm:p-6" data-testid="section-challenge-achievements">
    <div className="flex flex-wrap items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-accent/25 text-accent-foreground"><Trophy size={18} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg leading-tight">Challenge achievements</h3>
        <p className="text-[11px] text-muted-foreground">{earned} of {all.length} unlocked · earned by playing and beating friends</p>
      </div>
      <div className="w-full sm:w-40"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.round((earned / all.length) * 100)}%` }} /></div></div>
    </div>

    <div className="mt-4 flex flex-wrap gap-1.5">
      {FILTERS.map((f) => <button key={f} type="button" onClick={() => setFilter(f)}
        className={cn('rounded-full border px-3 py-1 text-[11px] font-bold transition-colors', filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}
        data-testid={`filter-achievements-${f.toLowerCase().replace(/\s+/g, '-')}`}>{f}</button>)}
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" style={{ perspective: 1000 }}>
      <AnimatePresence mode="popLayout">
        {shown.map((a) => <TiltCard key={a.id} a={a} isNext={next?.id === a.id} />)}
      </AnimatePresence>
    </div>
    {!shown.length && <p className="py-8 text-center text-xs text-muted-foreground">Nothing here yet — play a challenge to start unlocking badges.</p>}
  </section>;
}

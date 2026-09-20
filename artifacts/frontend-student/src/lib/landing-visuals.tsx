// Visual building blocks for the public landing page and the sign-in panel:
// animated aurora background, glossy icon tiles, the floating "app preview"
// stage, and the subject marquee. Depth comes from gradients, layered shadows
// and 2D translate only (see index.css for why).
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { Check, Flame, Sparkles } from 'lucide-react';
import { SubjectIcon, SUBJECT_SHOWCASE, tileStyle } from '@/lib/subject-icons';
import { depth, useParallax } from '@/lib/motion';

export function Aurora() {
  return <>
    <div className="hero-grid" />
    <div className="orb -left-24 top-8 size-[380px] bg-sidebar-primary/55" />
    <div className="orb -right-24 top-36 size-[340px] bg-[#7c5cff]/35" style={{ animationDelay: '-6s' }} />
    <div className="orb -bottom-28 left-1/3 size-[360px] bg-accent/35" style={{ animationDelay: '-12s' }} />
  </>;
}

// Glossy coloured tile for any lucide icon (feature cards etc.).
export function GlossIcon({ icon: Icon, hue, size = 46 }: { icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; hue: number; size?: number }) {
  return <span className="subject-tile" style={{ width: size, height: size, ...tileStyle(hue) }}>
    <span className="subject-tile__gloss" />
    <Icon size={Math.round(size * 0.48)} strokeWidth={2.1} className="subject-tile__icon" />
  </span>;
}

function Floating({ style, x, y, delay = 0, anim = 'float-med', children }: { style: CSSProperties; x: number; y?: number; delay?: number; anim?: string; children: ReactNode }) {
  // Outer layer = pointer parallax, inner layer = looping float, so the two
  // transforms never fight over the same element.
  return <div className="absolute" style={{ ...style, ...depth(x, y) }}><div className={`${anim} max-sm:origin-center max-sm:scale-[.78]`} style={{ animationDelay: `${delay}s` }}>{children}</div></div>;
}

const OPTIONS: Array<{ letter: string; text: string; correct?: boolean }> = [
  { letter: 'A', text: 'Radial nerve' },
  { letter: 'B', text: 'Axillary nerve', correct: true },
  { letter: 'C', text: 'Musculocutaneous nerve' },
  { letter: 'D', text: 'Ulnar nerve' },
];

function McqPreviewCard() {
  return <div className="glass-card rounded-3xl p-4 text-left text-sidebar-foreground">
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-[10px] font-bold"><SubjectIcon name="Anatomy" size="xs" /> Anatomy · Upper limb</span>
      <span className="font-mono-app text-[10px] text-sidebar-foreground/60">Q 12 / 40</span>
    </div>
    <p className="mt-3 text-[13px] font-bold leading-5">Which nerve is most at risk in a fracture of the surgical neck of the humerus?</p>
    <div className="mt-3 space-y-1.5">
      {OPTIONS.map((o) => <div key={o.letter} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[12px] font-semibold ${o.correct ? 'border-sidebar-primary/60 bg-sidebar-primary/20' : 'border-white/10 bg-white/5 text-sidebar-foreground/85'}`}>
        <span className={`grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-extrabold ${o.correct ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-white/10'}`}>{o.correct ? <Check size={12} strokeWidth={3} /> : o.letter}</span>
        {o.text}
      </div>)}
    </div>
    <div className="mt-3 rounded-xl bg-black/20 p-3 text-[11px] leading-4 text-sidebar-foreground/85"><span className="font-extrabold text-sidebar-primary">Explanation · </span>The axillary nerve winds around the surgical neck of the humerus, so it is the nerve at risk.</div>
  </div>;
}

export function HeroStage() {
  const ref = useParallax<HTMLDivElement>();
  return <div ref={ref} className="relative mx-auto h-[430px] w-full max-w-[520px] sm:h-[500px]" aria-hidden="true">
    <div className="absolute left-1/2 top-1/2 size-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sidebar-primary/25 blur-3xl" />
    <div className="absolute inset-x-[7%] top-[11%]" style={depth(7, 5)}><div className="pop-in"><McqPreviewCard /></div></div>

    <Floating style={{ left: '-6%', top: '-3%' }} x={26} y={20} anim="float-slow"><SubjectIcon name="Anatomy" size="xl" /></Floating>
    <Floating style={{ right: '0%', top: '-2%' }} x={30} y={22} delay={-2} anim="float-fast"><SubjectIcon name="Biochemistry" size="lg" /></Floating>
    <Floating style={{ left: '-5%', top: '47%' }} x={34} y={26} delay={-1} anim="float-med"><SubjectIcon name="Physiology" size="lg" /></Floating>
    <Floating style={{ right: '-3%', top: '45%' }} x={22} y={18} delay={-3} anim="float-slow"><SubjectIcon name="Pharmacology" size="md" /></Floating>
    <Floating style={{ left: '44%', bottom: '-8%' }} x={18} y={14} delay={-4} anim="float-fast"><SubjectIcon name="Pathology" size="md" /></Floating>

    <Floating style={{ left: '-2%', bottom: '-4%' }} x={16} y={12} delay={-2} anim="float-med">
      <div className="glass-card flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sidebar-foreground">
        <span className="subject-tile" style={{ width: 36, height: 36, ...tileStyle(28) }}><span className="subject-tile__gloss" /><Flame size={18} strokeWidth={2.2} className="subject-tile__icon" /></span>
        <div><div className="text-[12px] font-extrabold leading-4">7-day streak</div><div className="text-[10px] text-sidebar-foreground/65">Keep it going</div></div>
      </div>
    </Floating>
    <Floating style={{ right: '-2%', bottom: '-3%' }} x={20} y={14} delay={-5} anim="float-slow">
      <div className="glass-card flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sidebar-foreground">
        <svg width="40" height="40" viewBox="0 0 44 44" className="-rotate-90"><circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="5" /><circle cx="22" cy="22" r="17" fill="none" className="text-sidebar-primary" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="107" style={{ ['--ring-full' as string]: 107, ['--ring-to' as string]: 26, animation: 'ringDraw 2.2s cubic-bezier(.3,.7,.2,1) .4s both' }} /></svg>
        <div><div className="text-[12px] font-extrabold leading-4">Accuracy</div><div className="text-[10px] text-sidebar-foreground/65">Tracked per topic</div></div>
      </div>
    </Floating>
  </div>;
}

export function SubjectMarquee({ names = SUBJECT_SHOWCASE }: { names?: string[] }) {
  const row = [...names, ...names];
  return <div className="marquee-fade overflow-hidden py-1">
    <div className="marquee-track flex w-max" style={{ animation: `marquee ${names.length * 3.4}s linear infinite` }}>
      {row.map((n, i) => <span key={`${n}-${i}`} aria-hidden={i >= names.length} className="group mr-3 inline-flex items-center gap-2.5 rounded-2xl border border-border bg-card py-2 pl-2 pr-4 text-xs font-bold shadow-sm"><SubjectIcon name={n} size="sm" />{n}</span>)}
    </div>
  </div>;
}

// Right-hand panel content for the sign-in / register screens.
export function AuthShowcase() {
  const ref = useParallax<HTMLDivElement>();
  return <div ref={ref} className="relative mx-auto my-6 h-60 w-full max-w-md" aria-hidden="true">
    <div className="absolute left-1/2 top-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sidebar-primary/25 blur-3xl" />
    <div className="absolute inset-x-[10%] top-[16%]" style={depth(6, 4)}>
      <div className="glass-card rounded-2xl p-4 text-sidebar-foreground">
        <div className="flex items-center gap-2 text-[11px] font-extrabold text-sidebar-primary"><Sparkles size={13} /> Instant explanation</div>
        <p className="mt-2 text-[12px] leading-5 text-sidebar-foreground/85">Every question comes with a worked explanation, so you learn why an option is right, not just which one.</p>
      </div>
    </div>
    <Floating style={{ left: '0%', top: '0%' }} x={24} y={18} anim="float-slow"><SubjectIcon name="Anatomy" size="lg" /></Floating>
    <Floating style={{ right: '2%', top: '-2%' }} x={26} y={20} delay={-2} anim="float-fast"><SubjectIcon name="Biochemistry" size="md" /></Floating>
    <Floating style={{ left: '8%', bottom: '-4%' }} x={20} y={14} delay={-1} anim="float-med"><SubjectIcon name="Physiology" size="md" /></Floating>
    <Floating style={{ right: '4%', bottom: '-6%' }} x={28} y={20} delay={-3} anim="float-slow"><SubjectIcon name="Pharmacology" size="lg" /></Floating>
  </div>;
}

// Blocks + Modules presentation. Each card is a "poster + plate": the cover
// image sits untouched on top (the covers have their own baked-in titles, which
// used to collide with the overlaid card title) and the name / counts / progress
// live on a raised plate that overlaps the image's lower edge. Depth comes from
// layered shadows, an overlapping plate, a glare that follows the pointer and a
// slow image drift — all 2D (translate/scale/opacity). No perspective /
// rotateX/Y / preserve-3d: see the v34 note in index.css.
import { useEffect, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, BookOpen, Check, Layers, Play } from 'lucide-react';
import { Count, prefersReducedMotion } from '@/lib/fx3d';
import { SubjectIcon } from '@/lib/subject-icons';

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ');
const clampPct = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
/** Stable hue (0-359) from a name, so a cover-less card keeps the same colour every visit. */
export function hueFromName(name: string): number { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return h % 360; }
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Pointer-follow glare: sets --mx/--my (percent) on the card. Mouse only — touch has no hover. */
function onGlareMove(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}

function Ring({ value, size = 54 }: { value: number; size?: number }) {
  const pct = clampPct(value);
  const stroke = 5; const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(prefersReducedMotion() ? pct : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setDrawn(pct); return; }
    const id = requestAnimationFrame(() => setDrawn(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return <span className={cx('bk-ring', pct >= 100 && 'is-done')} style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct)}% complete`}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle className="bk-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle className="bk-ring__arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - drawn / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    <span className="bk-ring__num"><Count value={pct} suffix="%" /></span>
  </span>;
}

function Meter({ value }: { value: number }) {
  const pct = clampPct(value);
  const [w, setW] = useState(prefersReducedMotion() ? pct : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setW(pct); return; }
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return <span className="bk-meter" aria-hidden="true"><span style={{ width: `${w}%` }} /></span>;
}

interface PosterShellProps { href: string; index: number; testId: string; media: ReactNode; corner?: ReactNode; chip?: ReactNode; ring?: ReactNode; plate: ReactNode; muted?: boolean; hue?: number }

function PosterShell({ href, index, testId, media, corner, chip, ring, plate, muted, hue }: PosterShellProps) {
  const style = { ['--i' as string]: Math.min(index, 10), ['--h' as string]: hue ?? 200 } as CSSProperties;
  return <Link href={href} onPointerMove={onGlareMove} className={cx('bk-card card-lift group', muted && 'bk-card--muted')} style={style} data-testid={testId}>
    <span className="bk-media">
      {media}
      <span className="bk-scrim" aria-hidden="true" />
      <span className="bk-glare" aria-hidden="true" />
      <span className="bk-sheen" aria-hidden="true" />
      {corner && <span className="bk-corner">{corner}</span>}
      {chip && <span className="bk-chip">{chip}</span>}
    </span>
    {ring && <span className="bk-ringwrap">{ring}</span>}
    <span className="bk-plate">{plate}</span>
  </Link>;
}

/* ------------------------------------------------------------------ blocks */

export interface BlockPosterProps { href: string; name: string; iconUrl?: string | null; moduleCount: number; subjectCount?: number; questionCount?: number; progress?: number | null; index?: number; muted?: boolean; subtitle?: string }

export function BlockPoster({ href, name, iconUrl, moduleCount, subjectCount, questionCount, progress, index = 0, muted, subtitle }: BlockPosterProps) {
  const hue = hueFromName(name);
  const facts = [plural(moduleCount, 'module'), subjectCount ? plural(subjectCount, 'subject') : null, questionCount ? plural(questionCount, 'question') : null].filter(Boolean).join(' · ');
  return <PosterShell href={href} index={index} hue={hue} muted={muted} testId={`card-block-${href.split('/').pop()}`}
    media={iconUrl
      ? <img src={iconUrl} alt="" loading="lazy" decoding="async" className="bk-img" />
      : <span className="bk-fallback" style={{ ['--h' as string]: hue }}><Layers size={54} strokeWidth={1.4} /></span>}
    corner={<>{pad2(index + 1)}</>}
    chip={<><BookOpen size={11} /> {plural(moduleCount, 'module')}</>}
    ring={progress != null ? <Ring value={progress} /> : undefined}
    plate={<>
      <span className="bk-plate__text"><h3>{name}</h3><p>{subtitle || facts}</p></span>
      <span className="bk-go" aria-hidden="true"><ArrowRight size={17} /></span>
      {progress != null && <Meter value={progress} />}
    </>} />;
}

/* ----------------------------------------------------------------- modules */

export interface ModulePosterProps { id: number; name: string; subtitle?: string; iconUrl?: string | null; subjectCount: number; mcqCount: number; progress: number; index?: number }

export function ModulePoster({ id, name, subtitle, iconUrl, subjectCount, mcqCount, progress, index = 0 }: ModulePosterProps) {
  const hue = hueFromName(name);
  const state = progress >= 100 ? 'done' : progress > 0 ? 'going' : 'new';
  const label = state === 'done' ? 'Completed' : state === 'going' ? 'Continue' : 'Start';
  return <PosterShell href={`/modules/${id}`} index={index} hue={hue} testId={`card-module-${id}`}
    media={iconUrl
      ? <img src={iconUrl} alt="" loading="lazy" decoding="async" className="bk-img" />
      : <span className="bk-fallback" style={{ ['--h' as string]: hue }}><SubjectIcon name={name} size="xl" /></span>}
    corner={<>{pad2(index + 1)}</>}
    chip={<>{state === 'done' ? <Check size={11} strokeWidth={3} /> : state === 'going' ? <Play size={10} fill="currentColor" /> : <Layers size={11} />} {label}</>}
    ring={<Ring value={progress} />}
    plate={<>
      <span className="bk-plate__text"><h3>{name}</h3><p>{[plural(subjectCount, 'subject'), plural(mcqCount, 'question')].join(' · ')}</p>{subtitle && <p className="bk-plate__sub">{subtitle}</p>}</span>
      <span className="bk-go" aria-hidden="true"><ArrowRight size={17} /></span>
      <Meter value={progress} />
    </>} />;
}

/* --------------------------------------------------------- page hero/banner */

export interface Stat { label: string; value: number; suffix?: string }

/** Header for the Blocks landing and a single block: cover image blurred behind, animated stats, optional back link and progress ring. */
export function CurriculumBanner({ eyebrow, title, description, coverUrl, stats, back, progress }: { eyebrow: string; title: string; description?: string; coverUrl?: string | null; stats: Stat[]; back?: { href: string; label: string; testId?: string }; progress?: number | null }) {
  return <header className={cx('dash-hero bk-banner', coverUrl && 'bk-banner--cover')} style={coverUrl ? ({ ['--cover' as string]: `url(${coverUrl})` } as CSSProperties) : undefined}>
    <span className="dash-hero__orb dash-hero__orb--a float-slow" aria-hidden="true" />
    <span className="dash-hero__orb dash-hero__orb--b float-med" aria-hidden="true" />
    <div className="hero-grid" aria-hidden="true" />
    <div className="bk-banner__body">
      <div className="bk-banner__top">
        <span className="dash-eyebrow dash-eyebrow--glass">{eyebrow}</span>
        {back && <Link href={back.href} className="bk-back" data-testid={back.testId}><ArrowLeft size={13} /> {back.label}</Link>}
      </div>
      <div className="bk-banner__row">
        <div className="bk-banner__text">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {progress != null && <div className="bk-banner__ring"><Ring value={progress} size={68} /><small>overall</small></div>}
      </div>
      <dl className="bk-stats">{stats.map((s, i) => <div key={s.label} style={{ ['--i' as string]: i }}><dd><Count value={s.value} suffix={s.suffix} /></dd><dt>{s.label}</dt></div>)}</dl>
    </div>
  </header>;
}

/** Weighted average of module progress (weighted by question count) — a block with one huge module isn't "50%" because a tiny one is done. */
export function weightedProgress(modules: Array<{ progress: number; mcqCount: number }>): number | null {
  const total = modules.reduce((sum, m) => sum + m.mcqCount, 0);
  if (!total) return modules.length ? Math.round(modules.reduce((s, m) => s + m.progress, 0) / modules.length) : null;
  return Math.round(modules.reduce((sum, m) => sum + m.progress * m.mcqCount, 0) / total);
}

// v43 — building blocks for the Subjects and Topics pages.
//
//  SubjectCard  – a tilting card per subject: glowing hue, floating icon with
//                 a contact shadow, parallax watermark, pointer glare.
//  TopicRow     – a plate on a "learning path": a spine with status nodes
//                 (done / up next / to do) joined by segments that fill in
//                 as topics are completed.
//  SubjectsHero / TopicsHero – the stage at the top of each page.
//  FilterBar, ProgressRing, skeletons.
//
// 3D rules live in lib/fx.ts (small-angle tilt, one element at a time, no
// preserve-3d). Everything here is presentational; data stays in pages/Subjects.
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, ChevronRight, Play, Search, X } from 'lucide-react';
import { useTilt } from '@/lib/fx';
import { Count, SegTabs } from '@/lib/fx3d';
import { SubjectIcon, resolveSubjectIcon } from '@/lib/subject-icons';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;

export interface SubjectRow { id: number; name: string; topicCount: number; iconUrl?: string | null }
export interface TopicItem { id: number; name: string; questionCount: number; completed: boolean }

// ---------------------------------------------------------------------------
// Tilt primitives. The OUTER element receives the pointer and never moves; the
// inner `.fx-tilt__body` is what tilts (see lib/fx.ts for why).
// ---------------------------------------------------------------------------
function Glare() { return <span className="fx-glare" aria-hidden="true"><i /></span>; }

function TiltLink({ href, className, style, testId, children }: { href: string; className?: string; style?: CSSProperties; testId?: string; children: ReactNode }) {
  const ref = useTilt<HTMLAnchorElement>();
  return <Link href={href} ref={ref} draggable={false} className={cx('fx-tilt', className)} style={style} data-testid={testId}>
    <span className="fx-tilt__body">{children}<Glare /></span>
  </Link>;
}

function TiltBox({ className, style, testId, children }: { className?: string; style?: CSSProperties; testId?: string; children: ReactNode }) {
  const ref = useTilt<HTMLDivElement>();
  return <div ref={ref} className={cx('fx-tilt', className)} style={style} data-testid={testId}>
    <div className="fx-tilt__body">{children}<Glare /></div>
  </div>;
}

// ---------------------------------------------------------------------------
// Subject card
// ---------------------------------------------------------------------------
export function SubjectCard({ subject, index }: { subject: SubjectRow; index: number }) {
  const { icon: Mark, hue } = resolveSubjectIcon(subject.name);
  return <TiltLink href={`/subjects/${subject.id}`} testId={`card-subject-${subject.id}`} className="cu-subject"
    style={vars({ '--h': hue, '--i': Math.min(index, 11), '--tilt': 7 })}>
    <span className="cu-glow" aria-hidden="true" />
    <span className="cu-mark" aria-hidden="true"><Mark size={132} strokeWidth={1.3} /></span>
    <span className="cu-subject__top">
      <span className="cu-float"><SubjectIcon name={subject.name} iconUrl={subject.iconUrl} size="lg" /></span>
      <span className="cu-chev" aria-hidden="true"><ChevronRight size={16} /></span>
    </span>
    <span className="cu-subject__name font-display">{subject.name}</span>
    <span className="cu-subject__meta">{subject.topicCount} topic{subject.topicCount === 1 ? '' : 's'} to explore</span>
  </TiltLink>;
}

// ---------------------------------------------------------------------------
// Topic row on the learning path
// ---------------------------------------------------------------------------
export function TopicRow({ topic, index, isNext }: { topic: TopicItem; index: number; isNext: boolean }) {
  const done = topic.completed;
  return <li className={cx('cu-topic', done && 'is-done', isNext && 'is-next')} style={vars({ '--i': Math.min(index, 14) })}>
    <span className="cu-node" aria-hidden="true">
      {done ? <Check size={14} strokeWidth={3.2} /> : isNext ? <Play size={11} fill="currentColor" strokeWidth={0} /> : <i />}
    </span>
    <TiltLink href={`/practice?topic=${topic.id}`} testId={`row-topic-${topic.id}`} className="cu-plate" style={vars({ '--tilt': 2.4 })}>
      <span className="cu-plate__text">
        <span className="cu-plate__name">{topic.name}</span>
        <span className="cu-plate__meta">{topic.questionCount} practice questions</span>
      </span>
      {isNext && <span className="cu-chip">Up next</span>}
      <span className="cu-go">{done ? 'Review' : 'Start'}<ArrowRight size={13} /></span>
    </TiltLink>
  </li>;
}

// ---------------------------------------------------------------------------
// Progress ring (stroke draws in after mount; paint-only, tiny SVG)
// ---------------------------------------------------------------------------
export function ProgressRing({ pct, size = 104 }: { pct: number; size?: number }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true))); return () => cancelAnimationFrame(id); }, []);
  const r = 42; const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return <span className="cu-ring" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(clamped)}% of topics complete`}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs><linearGradient id={`rg${gid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'hsl(var(--h) 90% 72%)' }} /><stop offset="1" style={{ stopColor: 'hsl(var(--sidebar-primary))' }} /></linearGradient></defs>
      <circle cx="50" cy="50" r={r} className="cu-ring__track" />
      <circle cx="50" cy="50" r={r} className="cu-ring__bar" style={{ stroke: `url(#rg${gid})` }} strokeDasharray={c} strokeDashoffset={on ? c * (1 - clamped / 100) : c} transform="rotate(-90 50 50)" />
    </svg>
    <span className="cu-ring__label"><b><Count value={clamped} suffix="%" duration={1000} /></b><small>done</small></span>
  </span>;
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------
function HeroBackdrop() {
  return <span className="cu-hero__bg" aria-hidden="true"><i className="cu-orb cu-orb--a" /><i className="cu-orb cu-orb--b" /><i className="hero-grid" /></span>;
}

export function TopicsHero({ name, iconUrl, total, done, questions, next }: {
  name: string; iconUrl?: string | null; total: number; done: number; questions: number; next: TopicItem | null;
}) {
  const { hue } = resolveSubjectIcon(name);
  const pct = total ? (done / total) * 100 : 0;
  return <TiltBox className="cu-hero" testId="banner-subject" style={vars({ '--h': hue, '--tilt': 2.2 })}>
    <HeroBackdrop />
    <span className="cu-hero__object" aria-hidden="true">
      <svg className="cu-orbit" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" /><circle cx="60" cy="60" r="44" className="cu-orbit__inner" /></svg>
      <span className="cu-bob"><span className="cu-float"><SubjectIcon name={name} iconUrl={iconUrl} size="xl" /></span></span>
      <span className="cu-contact" />
    </span>
    <span className="cu-hero__text">
      <span className="cu-hero__title font-display">{name}</span>
      <span className="cu-hero__sub">{total ? `${done} of ${total} topic${total === 1 ? '' : 's'} complete` : 'Topics are on their way'}</span>
      <span className="cu-stats">
        <span className="cu-stat"><b><Count value={total} /></b>topics</span>
        <span className="cu-stat"><b><Count value={done} /></b>done</span>
        <span className="cu-stat"><b><Count value={questions} /></b>questions</span>
      </span>
      {next && <Link href={`/practice?topic=${next.id}`} className="cu-start no-3d" data-testid="link-continue-topic">
        {done > 0 ? 'Continue' : 'Start'}: <span className="cu-start__name">{next.name}</span><ArrowRight size={14} />
      </Link>}
    </span>
    {total > 0 && <span className="cu-hero__ring"><ProgressRing pct={pct} /></span>}
  </TiltBox>;
}

export function SubjectsHero({ title, subjects, totalTopics }: { title: string; subjects: SubjectRow[]; totalTopics: number }) {
  const shown = subjects.slice(0, 4);
  const hue = shown[0] ? resolveSubjectIcon(shown[0].name).hue : 190;
  return <TiltBox className="cu-hero cu-hero--compact" style={vars({ '--h': hue, '--tilt': 2 })} testId="banner-module">
    <HeroBackdrop />
    <span className="cu-hero__text">
      <span className="cu-hero__title font-display">{title}</span>
      <span className="cu-hero__sub">Pick a subject to see its topics</span>
      <span className="cu-stats">
        <span className="cu-stat"><b><Count value={subjects.length} /></b>subject{subjects.length === 1 ? '' : 's'}</span>
        <span className="cu-stat"><b><Count value={totalTopics} /></b>topics</span>
      </span>
    </span>
    <span className="cu-fan" aria-hidden="true">
      {shown.map((s, i) => <span key={s.id} className="cu-fan__item" style={vars({ '--n': i, '--d': 1 + i * 0.55 })}><SubjectIcon name={s.name} iconUrl={s.iconUrl} size="lg" /></span>)}
    </span>
  </TiltBox>;
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------
export function FilterBar({ query, onQuery, placeholder, children }: { query: string; onQuery: (v: string) => void; placeholder: string; children?: ReactNode }) {
  return <div className="cu-filter">
    <label className="cu-search">
      <Search size={15} aria-hidden="true" />
      <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} inputMode="search" autoComplete="off" spellCheck={false} data-testid="input-curriculum-filter" />
      {query && <button type="button" className="no-3d" onClick={() => onQuery('')} aria-label="Clear search"><X size={14} /></button>}
    </label>
    {children}
  </div>;
}

export type TopicFilter = 'all' | 'todo' | 'done';
export function TopicSeg({ value, onChange, counts }: { value: TopicFilter; onChange: (v: TopicFilter) => void; counts: Record<TopicFilter, number> }) {
  return <SegTabs<TopicFilter> ariaLabel="Filter topics" className="cu-seg" value={value} onChange={onChange}
    options={[
      { value: 'all', label: `All ${counts.all}`, testId: 'tab-topics-all' },
      { value: 'todo', label: `To do ${counts.todo}`, testId: 'tab-topics-todo' },
      { value: 'done', label: `Done ${counts.done}`, testId: 'tab-topics-done' },
    ]} />;
}

// ---------------------------------------------------------------------------
// Loading placeholders (the old page flashed "No subjects yet" while loading)
// ---------------------------------------------------------------------------
export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return <div className="cu-grid-cards" aria-busy="true" aria-label="Loading subjects">
    {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton cu-skel-card" style={vars({ '--i': i })} />)}
  </div>;
}
export function RowsSkeleton({ count = 5 }: { count?: number }) {
  return <div className="cu-skel-rows" aria-busy="true" aria-label="Loading topics">
    {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton cu-skel-row" style={vars({ '--i': i })} />)}
  </div>;
}

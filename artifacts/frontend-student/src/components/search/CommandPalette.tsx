// Header search palette. Replaces the old QuickJump dropdown, which only
// filtered the sidebar's page names (despite a placeholder promising modules,
// topics and MCQs), had no results for actual content, showed dark tiles with
// barely-visible icons, and drew a browser focus box around the input.
//
//  * searches pages instantly (client-side) and real content via
//    GET /student/search (blocks, modules, subjects, topics, exams, past papers
//    — only what this student may open; MCQ text is intentionally not searched)
//  * empty state: resume where you left off, recent searches, jump-to pages
//  * keyboard: ↑ ↓ Enter Esc; phone: full-height sheet that follows the on-screen
//    keyboard (visualViewport), 16px input so iOS doesn't zoom, "go" key opens
//  * rendered in a portal — the header has backdrop-filter, which would otherwise
//    become the containing block for a position:fixed panel
// Motion is 2D only (opacity/translate/scale); see the v34 note in index.css.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardCheck, Compass, CornerDownLeft, FileStack, FolderOpen, History, Layers, Loader2, Lock, Play, Search, SearchX, Target, X, BookOpen } from 'lucide-react';
import { analyticsApi, searchApi, type SearchResults } from '@/lib/api';
import { tileStyle } from '@/lib/subject-icons';

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;
export interface PalettePage { href: string; label: string; icon: IconType; hue: number; locked: boolean }
export interface CommandPaletteProps { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void; pages: PalettePage[] }

const MIN_CHARS = 2;
const DEBOUNCE_MS = 220;
const CLOSE_ANIM_MS = 200;
const RECENT_KEY = 'msp:recent-searches';
const RECENT_MAX = 5;
const STALE_MS = 60_000;

type Scope = 'all' | 'pages' | 'content' | 'exams';
const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'pages', label: 'Pages' }, { id: 'content', label: 'Learning' }, { id: 'exams', label: 'Exams' },
];

/** Type -> icon + hue + label. One place, so the tiles are consistent everywhere. */
const KIND = {
  page: { icon: Compass, hue: 214, label: 'Page' },
  block: { icon: Layers, hue: 205, label: 'Block' },
  module: { icon: BookOpen, hue: 158, label: 'Module' },
  subject: { icon: FolderOpen, hue: 268, label: 'Subject' },
  topic: { icon: Target, hue: 38, label: 'Topic' },
  exam: { icon: ClipboardCheck, hue: 4, label: 'Exam' },
  paper: { icon: FileStack, hue: 22, label: 'Past paper' },
  recent: { icon: History, hue: 220, label: 'Recent' },
  resume: { icon: Play, hue: 152, label: 'Resume' },
} as const;
type Kind = keyof typeof KIND;

interface Row { key: string; kind: Kind; group: string; title: string; subtitle?: string; icon?: IconType; hue?: number; locked?: boolean; run: () => void; badge?: string }

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ');
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q.length < MIN_CHARS) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  return <>{parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>))}</>;
}

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : []; } catch { return []; }
}
function writeRecent(list: string[]) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* private mode / quota: recents are a nicety */ } }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(id); }, [value, ms]);
  return v;
}

/** Height/offset of what is actually visible (above the on-screen keyboard). */
function useVisibleViewport(active: boolean) {
  const [box, setBox] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) { setBox(null); return; }
    const update = () => setBox({ h: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    update();
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [active]);
  return box;
}

export function CommandPalette({ open, value, onChange, onClose, pages }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const viewport = useVisibleViewport(mounted && !closing);

  // Mount immediately on open; on close play the exit animation, then unmount.
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); setScope('all'); setActive(0); setRecent(readRecent()); return; }
    if (!mounted) return;
    setClosing(true);
    const id = window.setTimeout(() => { setMounted(false); setClosing(false); }, CLOSE_ANIM_MS);
    return () => window.clearTimeout(id);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted || closing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => { document.body.style.overflow = previous; cancelAnimationFrame(id); };
  }, [mounted, closing]);

  const query = value.trim();
  const debounced = useDebounced(query, DEBOUNCE_MS);
  const searching = debounced.length >= MIN_CHARS;
  const results = useQuery({
    queryKey: ['student-search', debounced.toLowerCase()],
    queryFn: () => searchApi.query(debounced),
    enabled: mounted && searching, staleTime: STALE_MS, retry: false,
    placeholderData: (previous: SearchResults | undefined) => previous,
  });
  const resume = useQuery({ queryKey: ['continue-learning'], queryFn: analyticsApi.continueLearning, enabled: mounted && !query, staleTime: STALE_MS });
  const busy = query.length >= MIN_CHARS && (query !== debounced || results.isFetching);

  const go = useCallback((href: string, remember?: boolean) => {
    if (remember && query.length >= MIN_CHARS) { const next = [query, ...readRecent().filter((r) => r.toLowerCase() !== query.toLowerCase())]; writeRecent(next); }
    onClose();
    setLocation(href);
  }, [onClose, query, setLocation]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const pageRow = (p: PalettePage, group: string): Row => ({ key: `page:${p.href}`, kind: 'page', group, title: p.label, icon: p.icon, hue: p.hue, locked: p.locked, run: () => go(p.locked ? '/payments' : p.href, true) });
    if (!query) {
      const r = resume.data?.resume;
      if (r) {
        const topic = r.topic;
        out.push({ key: 'resume', kind: 'resume', group: 'Pick up', title: r.name, subtitle: [r.subject?.name, topic?.name].filter(Boolean).join(' › ') || 'Continue this module', badge: 'Resume', run: () => go(topic ? `/practice?topic=${topic.id}` : `/modules/${r.id}`) });
      }
      for (const term of recent) out.push({ key: `recent:${term}`, kind: 'recent', group: 'Recent searches', title: term, run: () => onChange(term) });
      for (const p of pages) out.push(pageRow(p, 'Jump to'));
      return out;
    }
    const q = query.toLowerCase();
    if (scope === 'all' || scope === 'pages') for (const p of pages.filter((x) => x.label.toLowerCase().includes(q))) out.push(pageRow(p, 'Pages'));
    const data = results.data;
    if (data && searching) {
      if (scope === 'all' || scope === 'content') {
        for (const b of data.blocks) out.push({ key: `block:${b.id}`, kind: 'block', group: 'Blocks', title: b.title, subtitle: b.subtitle, run: () => go(`/blocks/${b.id}`, true) });
        for (const m of data.modules) out.push({ key: `module:${m.id}`, kind: 'module', group: 'Modules', title: m.title, subtitle: m.subtitle, run: () => go(`/modules/${m.id}`, true) });
        for (const s of data.subjects) out.push({ key: `subject:${s.id}`, kind: 'subject', group: 'Subjects', title: s.title, subtitle: s.subtitle, run: () => go(`/subjects/${s.id}`, true) });
        for (const t of data.topics) out.push({ key: `topic:${t.id}`, kind: 'topic', group: 'Topics', title: t.title, subtitle: t.subtitle, badge: 'Practice', run: () => go(`/practice?topic=${t.id}`, true) });
      }
      if (scope === 'all' || scope === 'exams') {
        for (const e of data.exams) out.push({ key: `exam:${e.id}`, kind: 'exam', group: 'Exams', title: e.title, run: () => go('/exams', true) });
        for (const p of data.pastPapers) out.push({ key: `paper:${p.id}`, kind: 'paper', group: 'Past papers', title: p.title, run: () => go('/past-papers', true) });
      }
    }
    return out;
  }, [query, scope, pages, recent, resume.data, results.data, searching, go, onChange]);

  const counts = useMemo(() => {
    const d = results.data; const q = query.toLowerCase();
    return {
      pages: pages.filter((x) => x.label.toLowerCase().includes(q)).length,
      content: d ? d.blocks.length + d.modules.length + d.subjects.length + d.topics.length : 0,
      exams: d ? d.exams.length + d.pastPapers.length : 0,
    };
  }, [pages, query, results.data]);

  useEffect(() => { setActive(0); }, [query, scope]);
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, rows.length - 1))); }, [rows.length]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!mounted) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (rows.length ? (a + 1) % rows.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[active]?.run(); }
  };

  const groups: Array<{ name: string; items: Array<{ row: Row; index: number }> }> = [];
  rows.forEach((row, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === row.group) last.items.push({ row, index }); else groups.push({ name: row.group, items: [{ row, index }] });
  });

  const noResults = !!query && !busy && rows.length === 0;
  const showSkeleton = !!query && searching && !results.data && rows.length === 0;
  const style = viewport ? ({ ['--cp-vh' as string]: `${viewport.h}px`, ['--cp-top' as string]: `${viewport.top}px` }) : undefined;

  return createPortal(
    <div className={cx('cp-root', closing && 'is-closing')} onKeyDown={onKeyDown} data-testid="panel-quick-jump">
      <div className="cp-scrim" onClick={onClose} aria-hidden="true" />
      <div className="cp-panel" role="dialog" aria-modal="true" aria-label="Search" style={style}>
        <div className="cp-head">
          <label className={cx('cp-field', busy && 'is-busy')}>
            <span className="cp-field__icon" aria-hidden="true">{busy ? <Loader2 size={17} className="cp-spin" /> : <Search size={17} />}</span>
            <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} type="search" inputMode="search" enterKeyHint="go" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              placeholder="Search modules & topics…" role="combobox" aria-expanded="true" aria-controls="cp-list" aria-activedescendant={rows[active] ? `cp-opt-${active}` : undefined} aria-label="Search" className="cp-input" data-testid="input-quick-jump" />
            {value && <button type="button" className="cp-clear" onClick={() => { onChange(''); inputRef.current?.focus(); }} aria-label="Clear search"><X size={14} /></button>}
          </label>
          <button type="button" className="cp-cancel" onClick={onClose} data-testid="button-close-quick-jump">Cancel</button>
        </div>

        {query.length >= MIN_CHARS && <div className="cp-chips" role="tablist" aria-label="Filter results">
          {SCOPES.map((s) => {
            const n = s.id === 'pages' ? counts.pages : s.id === 'content' ? counts.content : s.id === 'exams' ? counts.exams : counts.pages + counts.content + counts.exams;
            return <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} className={cx('cp-chip', scope === s.id && 'is-on')} onClick={() => setScope(s.id)}>{s.label}<span>{n}</span></button>;
          })}
        </div>}

        <div className="cp-body" id="cp-list" role="listbox" ref={listRef}>
          {query.length === 1 && <p className="cp-hint">Type at least {MIN_CHARS} letters to search your content.</p>}
          {showSkeleton && <div className="cp-skels" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="cp-skel" style={{ ['--i' as string]: i }}><span className="skeleton" /><span className="skeleton" /></div>)}</div>}
          {groups.map((g) => <section key={g.name} className="cp-group" aria-label={g.name}>
            <header className="cp-group__head"><span>{g.name}</span>{g.name === 'Recent searches' && <button type="button" onClick={() => { writeRecent([]); setRecent([]); }}>Clear</button>}</header>
            <div className={cx('cp-group__rows', g.name === 'Jump to' && 'is-grid')}>
              {g.items.map(({ row, index }, n) => {
                const meta = KIND[row.kind]; const Icon = row.icon ?? meta.icon; const on = index === active;
                return <button key={row.key} id={`cp-opt-${index}`} type="button" role="option" aria-selected={on} data-active={on} className={cx('cp-row', on && 'is-active')} style={{ ['--i' as string]: Math.min(n, 8) }} onMouseMove={() => { if (!on) setActive(index); }} onClick={row.run}>
                  <span className="cp-ico" style={tileStyle(row.hue ?? meta.hue)}><Icon size={16} strokeWidth={2.2} /></span>
                  <span className="cp-row__text"><strong><Highlight text={row.title} query={query} /></strong>{row.subtitle && <small>{row.subtitle}</small>}</span>
                  {row.locked ? <span className="cp-badge cp-badge--lock"><Lock size={10} /> Locked</span> : <span className="cp-badge">{row.badge ?? (g.name === 'Jump to' || g.name === 'Recent searches' ? '' : meta.label)}</span>}
                  <ChevronRight size={15} className="cp-row__chev" />
                </button>;
              })}
            </div>
          </section>)}

          {noResults && <div className="cp-empty" data-testid="text-quick-jump-empty">
            <span className="cp-empty__orb"><SearchX size={26} /></span>
            <strong>No results for “{query}”</strong>
            <p>{query.length < MIN_CHARS ? `Type at least ${MIN_CHARS} letters.` : 'Try fewer letters, or search a module, subject or topic name.'}</p>
            <button type="button" className="cp-empty__btn" onClick={() => onChange('')}>Clear search</button>
          </div>}
          {results.isError && !!query && <p className="cp-hint cp-hint--warn">Content search is unavailable right now — page results still work.</p>}
        </div>

        <footer className="cp-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd><CornerDownLeft size={11} /></kbd> open</span><span><kbd>esc</kbd> close</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

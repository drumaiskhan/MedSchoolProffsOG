// Small building blocks for the "3D" student UI (leaderboard, streaks,
// segmented controls). Presentational only — no data fetching.
//
// Everything here is GPU-safe on purpose: depth comes from gradients, layered
// shadows and plain 2D translate/scale/skew (see the v37 note in index.css and
// the flip-card note above it — real perspective/rotateX/rotateY transforms
// corrupted the compositor on one machine). Motion respects
// prefers-reduced-motion.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Eases a number toward `value` (starts from 0 on first paint). Snaps when the
 * user prefers reduced motion. Returns the in-flight (fractional) value. */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion() || duration <= 0 || !Number.isFinite(value)) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = start + (value - start) * eased;
      from.current = current; // an interrupted run resumes from where it was
      setShown(current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}

/** A number that counts up to `value`. */
export function Count({ value, decimals = 0, suffix = '', duration }: { value: number; decimals?: number; suffix?: string; duration?: number }) {
  const v = useCountUp(value, duration);
  return <>{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}

/** Animated streak flame. `lit={false}` renders a cold, grey one for a streak of 0. */
export function FlameIcon({ size = 48, lit = true, className }: { size?: number; lit?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return <svg viewBox="0 0 64 80" width={size} height={Math.round(size * 1.25)} className={cx('flame', !lit && 'flame--out', className)} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`fo${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffc24a" /><stop offset=".5" stopColor="#ff7a1f" /><stop offset="1" stopColor="#e8391a" />
      </linearGradient>
      <linearGradient id={`fi${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff6c2" /><stop offset="1" stopColor="#ffb52e" />
      </linearGradient>
    </defs>
    <path d="M33 2c1 13 17 20 17 42 0 17-8 32-18 32S14 61 14 45c0-8 3-14 8-19 0 6 2 9 6 11C26 27 28 13 33 2z" fill={`url(#fo${uid})`} />
    <path className="flame-core" d="M32 36c1 8 12 12 12 24 0 9-5 16-12 16s-12-7-12-16c0-6 3-9 6-13 0 4 2 6 4 7-1-7-1-12 2-18z" fill={`url(#fi${uid})`} />
  </svg>;
}

/** Glossy avatar disc with initials. `ring` wraps it in a metallic ring. */
export function Avatar3D({ text, size = 44, ring, className }: { text: string; size?: number; ring?: 'gold' | 'silver' | 'bronze'; className?: string }) {
  const disc = <span className={cx('avatar-3d', className)} style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}>{text}</span>;
  if (!ring) return disc;
  return <span className={cx('avatar-ring', `avatar-ring--${ring}`, 'inline-block')}>{disc}</span>;
}

/** Glossy round badge (rank numbers, place medals). */
export function Medal({ tone, size = 32, children, className }: { tone: 'gold' | 'silver' | 'bronze' | 'plain' | 'you'; size?: number; children: ReactNode; className?: string }) {
  return <span className={cx('medal', `medal--${tone}`, className)} style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}>{children}</span>;
}

/** Segmented control in a recessed track with a raised thumb that slides to the
 * active option (2D translateX only). Options keep their own data-testid. */
export function SegTabs<T extends string>({ options, value, onChange, ariaLabel, className, scroll }: {
  options: Array<{ value: T; label: ReactNode; testId?: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  /** Let the control scroll sideways instead of squeezing (many options on a phone). */
  scroll?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>('[data-active="true"]');
      if (active) setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);
  return <div ref={wrap} role="tablist" aria-label={ariaLabel} className={cx('d3-well relative flex gap-1 rounded-2xl p-1', scroll && 'overflow-x-auto', className)}>
    {thumb && <span className="seg-thumb" aria-hidden="true" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
    {options.map((o) => {
      const active = o.value === value;
      return <button key={o.value} type="button" role="tab" aria-selected={active} data-active={active} onClick={() => onChange(o.value)} data-testid={o.testId}
        className={cx('no-3d relative z-10 flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-extrabold transition-colors', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
        {o.label}
      </button>;
    })}
  </div>;
}

/** True while ANY of the elements with the given ids is (partly) on screen.
 * Re-observes whenever `deps` change — pass whatever makes those elements appear,
 * move or disappear (data loaded, filters changed…). Reports `true` when
 * IntersectionObserver isn't available so nothing that depends on it is hidden. */
export function useAnyVisible(ids: string[], deps: ReadonlyArray<unknown>): boolean {
  const [visible, setVisible] = useState(true);
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const els = key.split('|').map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) { setVisible(false); return; }
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
      setVisible([...seen.values()].some(Boolean));
    }, { threshold: 0.05 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
  return visible;
}

// v44 — shared "real 3D" card primitives, factored out of
// components/curriculum/Curriculum.tsx so the same tilt language (fx-tilt +
// fx.css .cu-* rules) can be reused on any card grid: Subjects, OSPE/OSCE,
// Past Papers, Pre-Proffs Exams. See lib/fx.ts for the 3D rules this all
// sits on top of (small-angle tilt on one hovered card, no preserve-3d).
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useTilt } from '@/lib/fx';
import { cn } from '@/lib/shared';

export const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;

/** Stable hash → 0..360 hue, for cards whose color isn't otherwise meaningful
 *  (a college code, an exam title) but should still feel distinct card to card. */
export function hueFromKey(key: string, hues: number[] = [200, 268, 152, 28, 340, 172, 232]): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

export function Glare() { return <span className="fx-glare" aria-hidden="true"><i /></span>; }

export function TiltDiv({ className, style, testId, children }: { className?: string; style?: CSSProperties; testId?: string; children: ReactNode }) {
  const ref = useTilt<HTMLDivElement>();
  return <div ref={ref} className={cn('fx-tilt', className)} style={style} data-testid={testId}>
    <div className="fx-tilt__body">{children}<Glare /></div>
  </div>;
}

export function TiltAnchor({ href, className, style, testId, children }: { href: string; className?: string; style?: CSSProperties; testId?: string; children: ReactNode }) {
  const ref = useTilt<HTMLAnchorElement>();
  return <Link href={href} ref={ref} draggable={false} className={cn('fx-tilt', className)} style={style} data-testid={testId}>
    <span className="fx-tilt__body">{children}<Glare /></span>
  </Link>;
}

/** Animated sliding-pill segmented control (.cu-ospe-toggle in fx.css). */
export function SegToggle<T extends string>({ value, onChange, options, ariaLabel, testIdPrefix }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string; testIdPrefix: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ px: number; pw: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const active = wrap.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    setRect({ px: active.offsetLeft, pw: active.offsetWidth });
  }, [value, options.length]);

  return <div ref={wrapRef} className="cu-ospe-toggle" role="tablist" aria-label={ariaLabel} style={vars(rect ? { '--px': `${rect.px}px`, '--pw': `${rect.pw}px` } : { '--pw': '0px' })}>
    {rect && <span className="cu-ospe-toggle__pill" aria-hidden="true" />}
    {options.map((opt) => <button key={opt.value} type="button" role="tab" aria-selected={value === opt.value} data-active={value === opt.value} onClick={() => onChange(opt.value)} data-testid={`${testIdPrefix}-${opt.value}`}>{opt.label}</button>)}
  </div>;
}

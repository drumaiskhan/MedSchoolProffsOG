// Small motion helpers for the public pages (landing + sign-in). Everything
// respects prefers-reduced-motion and touch devices, and only ever uses 2D
// transforms (see the note in index.css about 3D transforms).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Fades + lifts its children in the first time they scroll into view.
export function Reveal({ children, delay = 0, className = '', style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${shown ? 'is-visible' : ''} ${className}`} style={{ ['--reveal-delay' as string]: `${delay}ms`, ...style }}>{children}</div>;
}

// Writes --px / --py (each -1..1, eased) on the element as the pointer moves
// over it. Children read them with e.g.
//   transform: translate(calc(var(--px, 0) * 14px), calc(var(--py, 0) * 10px))
// Does nothing on touch devices or with reduced motion.
export function useParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || window.matchMedia?.('(pointer: coarse)').matches) return;
    let raf = 0; let tx = 0; let ty = 0; let cx = 0; let cy = 0;
    const step = () => {
      raf = 0;
      cx += (tx - cx) * 0.09; cy += (ty - cy) * 0.09;
      el.style.setProperty('--px', cx.toFixed(3));
      el.style.setProperty('--py', cy.toFixed(3));
      if (Math.abs(tx - cx) > 0.003 || Math.abs(ty - cy) > 0.003) raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      kick();
    };
    const onLeave = () => { tx = 0; ty = 0; kick(); };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

// Card whose highlight follows the pointer (see .spot-card in index.css).
export function SpotlightCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`spot-card ${className}`} onPointerMove={(e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  }}>{children}</div>;
}

// Layer offset used inside a useParallax() container.
export const depth = (x: number, y = x): CSSProperties => ({ transform: `translate(calc(var(--px, 0) * ${x}px), calc(var(--py, 0) * ${y}px))` });

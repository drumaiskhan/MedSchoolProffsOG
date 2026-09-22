// v43 — shared motion engine for the "real 3D" pieces of the student UI
// (sidebar + Subjects / Topics). Read this before adding 3D anywhere else.
//
// WHY THIS IS SAFE (v34/v37 banned 3D transforms after a full-card rotateY
// flip + preserve-3d + backface-visibility corrupted the whole paint on one
// GPU/driver). The rules this file enforces so that does not come back:
//   1. 3D is ONLY a small-angle pointer tilt (a few degrees). No flips, no
//      preserve-3d, no backface-visibility, no translateZ anywhere.
//   2. The 3D transform is applied to ONE element at a time — the one under a
//      mouse — and only while it is hovered (`.is-tilting`). At rest an
//      element has no transform at all, so a page of 50 cards has zero 3D
//      layers.
//   3. Depth between layers inside a card is faked with 2D translate driven
//      by the same pointer values (parallax), never with a 3D context.
//   4. Touch devices, `prefers-reduced-motion`, and "lite" mode get none of
//      the tilt (they keep gradients, shadows and 2D motion).
//
// KILL SWITCH: `?fx=lite` in the URL (remembered), or in the console
// `localStorage.setItem('msp-fx', 'lite')`, switches every effect in this
// file off. `?fx=full` re-enables. Weak devices (<=2 cores / <=2 GB / data
// saver) start in lite automatically.
import { useEffect, useRef, type RefObject } from 'react';

export type FxLevel = 'full' | 'lite';
const STORAGE_KEY = 'msp-fx';

function safeStorage(op: 'get' | 'set', value?: FxLevel): string | null {
  try {
    if (op === 'set' && value) { localStorage.setItem(STORAGE_KEY, value); return value; }
    return localStorage.getItem(STORAGE_KEY);
  } catch { return null; }
}

function detectLevel(): FxLevel {
  if (typeof window === 'undefined') return 'lite';
  try {
    const q = new URLSearchParams(window.location.search).get('fx');
    if (q === 'lite' || q === 'full') { safeStorage('set', q); return q; }
  } catch { /* ignore */ }
  const saved = safeStorage('get');
  if (saved === 'lite' || saved === 'full') return saved;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return 'lite';
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return 'lite';
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return 'lite';
  return 'full';
}

/** Call once at start-up (main.tsx). Stamps <html data-fx="full|lite"> for the CSS. */
export function initFx(): FxLevel {
  const level = detectLevel();
  if (typeof document !== 'undefined') document.documentElement.dataset.fx = level;
  return level;
}

export function setFxLevel(level: FxLevel): void {
  safeStorage('set', level);
  if (typeof document !== 'undefined') document.documentElement.dataset.fx = level;
}

/** True when pointer-driven 3D is allowed right now (checked at hover time, so it reacts to setting changes). */
export function tiltAllowed(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (document.documentElement.dataset.fx === 'lite') return false;
  const mq = window.matchMedia?.bind(window);
  if (!mq) return false;
  if (mq('(prefers-reduced-motion: reduce)').matches) return false;
  return mq('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Pointer tilt. Attach the returned ref to the OUTER hit-target element (it is
 * never transformed, so its edges do not move away from the cursor and cause
 * enter/leave flicker); the CSS transforms an inner element from these vars:
 *   --tx / --ty  pointer position, eased, -1..1
 *   --hv         hover amount, eased, 0..1
 * Nothing re-renders — only two/three custom properties are written per frame,
 * and the loop stops as soon as the element has settled.
 */
export function useTilt<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    let rect: DOMRect | null = null;
    let hovering = false;
    let tx = 0, ty = 0, th = 0; // targets
    let cx = 0, cy = 0, ch = 0; // current (eased)

    const write = () => {
      el.style.setProperty('--tx', cx.toFixed(3));
      el.style.setProperty('--ty', cy.toFixed(3));
      el.style.setProperty('--hv', ch.toFixed(3));
    };
    const settle = () => {
      el.classList.remove('is-tilting');
      el.style.removeProperty('--tx'); el.style.removeProperty('--ty'); el.style.removeProperty('--hv');
    };
    const step = (now: number) => {
      raf = 0;
      // Frame-rate independent easing (same feel at 60 and 120 Hz).
      const dt = Math.min(48, now - (last || now - 16.7)); last = now;
      const k = 1 - Math.pow(1 - 0.16, dt / 16.7);
      cx += (tx - cx) * k; cy += (ty - cy) * k; ch += (th - ch) * (k * 0.9);
      const moving = Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002 || Math.abs(th - ch) > 0.002;
      if (moving) { write(); raf = requestAnimationFrame(step); return; }
      // Arrived. Snap to the target and STOP — a still pointer costs nothing;
      // the next pointermove restarts the loop.
      cx = tx; cy = ty; ch = th; last = 0;
      if (hovering) write(); else settle();
    };
    const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(step); } };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !tiltAllowed()) return;
      rect = el.getBoundingClientRect();
      hovering = true; th = 1;
      el.classList.add('is-tilting');
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (!hovering) return;
      if (!rect) rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / Math.max(1, rect.width);
      const py = (e.clientY - rect.top) / Math.max(1, rect.height);
      tx = Math.max(-1, Math.min(1, (px - 0.5) * 2));
      ty = Math.max(-1, Math.min(1, (py - 0.5) * 2));
      kick();
    };
    const onLeave = () => {
      if (!hovering) return;
      hovering = false; tx = 0; ty = 0; th = 0; rect = null;
      kick();
    };
    const onScroll = () => { rect = null; };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (raf) cancelAnimationFrame(raf);
      settle();
    };
  }, []);
  return ref;
}

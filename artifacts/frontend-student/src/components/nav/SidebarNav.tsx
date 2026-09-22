// v43 — student sidebar body: the nav list and the profile card.
//
// What is different from the old flat list:
//  * one "puck" glides between items (transform only) instead of each item
//    swapping its own background, so moving between pages feels continuous;
//  * a fainter "ghost" puck follows the mouse from item to item;
//  * a soft spotlight follows the pointer across the whole nav;
//  * every icon is a keycap that tints with the page's hue when active/hovered
//    and physically presses down when clicked;
//  * the profile card tilts toward the pointer (see lib/fx.ts for the rules).
//
// Performance: pointer work is done with refs + requestAnimationFrame and only
// ever writes a transform — no React state per pointer move, no layout reads
// in the move handler. State changes only when the hovered ITEM changes.
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type ComponentType, type CSSProperties,
} from 'react';
import { Link } from 'wouter';
import { LockKeyhole, LogOut } from 'lucide-react';
import { useTilt } from '@/lib/fx';

type IconType = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;

export interface SidebarLink {
  href: string;
  label: string;
  icon: IconType;
  hue: number;
  locked: boolean;
  active: boolean;
  slug: string;
  badge?: number;
}
export interface SidebarGroup { label: string; items: SidebarLink[] }

const cssVars = (v: Record<string, string | number>) => v as unknown as CSSProperties;

// Yellow/lime hues look much lighter than blues/purples, so their keycap is
// darkened a little to keep the white glyph readable (same idea as
// tileStyle() in lib/subject-icons.tsx).
function keyLightness(hue: number): [number, number] {
  return hue >= 36 && hue <= 130 ? [44, 32] : [60, 44];
}

const fxOn = () => typeof document !== 'undefined' && document.documentElement.dataset.fx !== 'lite';
const finePointer = (e: { pointerType: string }) => e.pointerType === 'mouse' || e.pointerType === 'pen';

export function SidebarNav({ groups, onNavigate }: { groups: SidebarGroup[]; onNavigate: () => void }) {
  const navRef = useRef<HTMLElement>(null);
  const spotRef = useRef<HTMLSpanElement>(null);
  const spotRaf = useRef(0);
  const spotPos = useRef({ x: 0, y: 0 });

  const active = groups.flatMap((g) => g.items).find((i) => i.active) ?? null;
  const activeHref = active?.href ?? null;

  // ---- selection puck -------------------------------------------------------
  // The puck remembers its last position/hue when no item is active (e.g. on
  // /subjects/5) and only fades out — otherwise it would slide to the top.
  const [puck, setPuck] = useState({ y: 0, h: 40, hue: 164, on: false });
  const [ready, setReady] = useState(false); // first placement must not animate from 0
  const measure = useCallback(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el) { setPuck((p) => (p.on ? { ...p, on: false } : p)); return; }
    const next = { y: el.offsetTop, h: el.offsetHeight, hue: Number(el.dataset.hue) || 164, on: true };
    setPuck((p) => (p.y === next.y && p.h === next.h && p.hue === next.hue && p.on ? p : next));
  }, []);
  useLayoutEffect(measure, [activeHref, groups.length, measure]);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(nav); }
    // Web fonts change line heights after first paint.
    document.fonts?.ready.then(measure).catch(() => undefined);
    const id = requestAnimationFrame(() => setReady(true));
    return () => { ro?.disconnect(); cancelAnimationFrame(id); };
  }, [measure]);

  // ---- hover ghost + spotlight ---------------------------------------------
  // `jump` = first item of a hover visit: place it instantly instead of sliding in from the last visit.
  const [ghost, setGhost] = useState({ y: 0, h: 40, hue: 200, jump: true, on: false });

  const onPointerOver = (e: React.PointerEvent<HTMLElement>) => {
    if (!finePointer(e) || !fxOn()) return;
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-sb-item]');
    if (!item) return;
    const hue = Number(item.dataset.hue) || 200;
    const y = item.offsetTop; const h = item.offsetHeight;
    setGhost((g) => (g.on && g.y === y && g.h === h ? g : { y, h, hue, jump: !g.on, on: true }));
  };
  const onPointerLeave = () => {
    setGhost((g) => (g.on ? { ...g, on: false } : g));
    if (spotRef.current) spotRef.current.style.opacity = '0';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!finePointer(e) || !fxOn()) return;
    const nav = navRef.current; const spot = spotRef.current;
    if (!nav || !spot) return;
    const r = nav.getBoundingClientRect(); // nav is never transformed, so this is stable
    spotPos.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (spotRaf.current) return;
    spotRaf.current = requestAnimationFrame(() => {
      spotRaf.current = 0;
      const { x, y } = spotPos.current;
      spot.style.opacity = '1';
      spot.style.transform = `translate(${(x - 130).toFixed(1)}px, ${(y - 130).toFixed(1)}px)`;
    });
  };
  useEffect(() => () => { if (spotRaf.current) cancelAnimationFrame(spotRaf.current); }, []);

  const showGhost = ghost.on && !(puck.on && ghost.y === puck.y);
  let n = 0; // running index for the entrance stagger

  return <nav ref={navRef} className="sb-nav" aria-label="Student navigation" data-ready={ready ? 'true' : 'false'}
    onPointerOver={onPointerOver} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
    <span ref={spotRef} className="sb-spot" aria-hidden="true" />
    <span className="sb-ghost" aria-hidden="true" data-jump={ghost.jump ? 'true' : 'false'} data-on={showGhost ? 'true' : 'false'}
      style={cssVars({ '--y': `${ghost.y}px`, '--ph': `${ghost.h}px`, '--k-h': ghost.hue })} />
    <span className="sb-puck" aria-hidden="true" data-on={puck.on ? 'true' : 'false'}
      style={cssVars({ '--y': `${puck.y}px`, '--ph': `${puck.h}px`, '--k-h': puck.hue })} />

    {groups.map((group) => <div key={group.label} className="sb-group">
      <div className="sb-group__label">{group.label}</div>
      <div className="sb-group__items">
        {group.items.map(({ href, label, icon: Icon, hue, locked, active: isActive, slug, badge }) => {
          const [l1, l2] = keyLightness(hue);
          return <Link key={href} href={locked ? '/payments' : href} onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            title={locked ? `${label} isn't part of the free trial — see Membership` : undefined}
            className="sb-item" data-sb-item="" data-hue={hue} data-locked={locked ? 'true' : undefined}
            style={cssVars({ '--k-h': hue, '--k-l1': `${l1}%`, '--k-l2': `${l2}%`, '--i': n++ })}
            data-testid={`link-nav-${slug}`}>
            <span className="sb-key"><Icon size={16} strokeWidth={isActive ? 2.3 : 1.9} /></span>
            <span className="sb-item__label">{label}</span>
            {locked && <LockKeyhole size={12} className="shrink-0" data-testid={`icon-nav-locked-${slug}`} />}
            {!!badge && badge > 0 && <span className="sb-badge">{badge > 9 ? '9+' : badge}</span>}
          </Link>;
        })}
      </div>
    </div>)}
  </nav>;
}

/** Profile card at the foot of the sidebar. Tilts toward the pointer on desktop. */
export function SidebarProfile({ initials, name, subtitle, onSignOut, signingOut }: {
  initials: string; name: string; subtitle: string; onSignOut: () => void; signingOut: boolean;
}) {
  const ref = useTilt<HTMLDivElement>();
  return <div ref={ref} className="sb-me fx-tilt">
    <div className="sb-me__body fx-tilt__body">
      <span className="sb-me__avatar" aria-hidden="true"><span>{initials}</span></span>
      <span className="min-w-0 flex-1">
        <span className="sb-me__name">{name}</span>
        <span className="sb-me__sub">{subtitle}</span>
      </span>
      <button type="button" onClick={onSignOut} disabled={signingOut} className="sb-out no-3d" data-testid="button-signout" title="Sign out" aria-label="Sign out"><LogOut size={15} /></button>
      <span className="fx-glare" aria-hidden="true"><i /></span>
    </div>
  </div>;
}

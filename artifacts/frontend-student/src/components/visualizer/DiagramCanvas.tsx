import { AnimatePresence, motion } from 'framer-motion';
import type { VizElement } from './schema';

// Never pass an AI-supplied string straight into an SVG color attribute
// without validating it looks like a CSS color — this is a defense against
// CSS-injection-flavored weirdness, not a full sanitizer (SVG text content
// is already safe: React/SVG escapes it automatically).
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/;
const PALETTE = ['#287058', '#32647b', '#94651c', '#a34c3e', '#164b4b', '#8a5a12'];

function hashToIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

function safeColor(color: string | undefined, fallbackSeed: string): string {
  if (color && SAFE_COLOR.test(color)) return color;
  return PALETTE[hashToIndex(fallbackSeed, PALETTE.length)];
}

// Safe id lookups only — an AI-supplied fromId/toId that doesn't match any
// element in the current step is skipped silently rather than crashing.
function findElement(elements: VizElement[], id: string): VizElement | undefined {
  return elements.find((el) => el.id === id);
}

function elementCenter(el: VizElement): { x: number; y: number } {
  return { x: el.x, y: el.y };
}

export function DiagramCanvas({ elements, highlightIds, stepKey, className }: { elements: VizElement[]; highlightIds?: string[]; stepKey?: string | number; className?: string }) {
  const highlighted = new Set(highlightIds ?? []);
  const shapes = elements.filter((el) => el.kind === 'shape');
  const labels = elements.filter((el) => el.kind === 'label');
  const arrows = elements.filter((el) => el.kind === 'arrow');
  const particles = elements.filter((el) => el.kind === 'particle');

  return (
    <svg viewBox="0 0 100 100" className={className ?? 'h-full w-full'} data-testid="svg-visualizer-canvas">
      <defs>
        <marker id="viz-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-primary" />
        </marker>
      </defs>
      <AnimatePresence mode="wait">
        <motion.g key={stepKey ?? 'static'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          {arrows.map((el) => {
            if (el.kind !== 'arrow') return null;
            const from = findElement(elements, el.fromId);
            const to = findElement(elements, el.toId);
            if (!from || !to) return null;
            const a = elementCenter(from);
            const b = elementCenter(to);
            return (
              <g key={el.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-muted-foreground" strokeWidth={0.6} strokeDasharray={el.style === 'dashed' ? '2,1.5' : undefined} markerEnd="url(#viz-arrowhead)" />
                {el.label && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 1.5} textAnchor="middle" fontSize={3} className="fill-muted-foreground">{el.label}</text>}
              </g>
            );
          })}

          {shapes.map((el) => {
            if (el.kind !== 'shape') return null;
            const isActive = highlighted.has(el.id);
            const fill = safeColor(el.color, el.id);
            const stroke = isActive ? 'stroke-primary' : 'stroke-transparent';
            return (
              <g key={el.id}>
                {el.shapeType === 'circle' && <circle cx={el.x} cy={el.y} r={el.radius ?? 4} fill={fill} className={stroke} strokeWidth={isActive ? 0.8 : 0} opacity={isActive || !highlighted.size ? 1 : 0.45} />}
                {el.shapeType === 'rect' && <rect x={el.x - (el.width ?? 8) / 2} y={el.y - (el.height ?? 6) / 2} width={el.width ?? 8} height={el.height ?? 6} rx={1} fill={fill} className={stroke} strokeWidth={isActive ? 0.8 : 0} opacity={isActive || !highlighted.size ? 1 : 0.45} />}
                {el.shapeType === 'ellipse' && <ellipse cx={el.x} cy={el.y} rx={(el.width ?? 10) / 2} ry={(el.height ?? 6) / 2} fill={fill} className={stroke} strokeWidth={isActive ? 0.8 : 0} opacity={isActive || !highlighted.size ? 1 : 0.45} />}
                {el.label && <text x={el.x} y={el.y + (el.radius ?? (el.height ?? 6) / 2) + 4} textAnchor="middle" fontSize={3} className="fill-foreground font-bold">{el.label}</text>}
              </g>
            );
          })}

          {labels.map((el) => el.kind === 'label' && (
            <text key={el.id} x={el.x} y={el.y} textAnchor="middle" fontSize={3.2} className="fill-foreground">{el.text}</text>
          ))}

          {particles.map((el) => {
            if (el.kind !== 'particle') return null;
            const from = findElement(elements, el.fromId);
            const to = findElement(elements, el.toId);
            if (!from || !to) return null;
            const a = elementCenter(from);
            const b = elementCenter(to);
            const fill = safeColor(el.color, el.id);
            return (
              <motion.circle
                key={el.id}
                r={1.6}
                fill={fill}
                initial={{ cx: a.x, cy: a.y, opacity: 0 }}
                animate={{ cx: [a.x, b.x], cy: [a.y, b.y], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.4, ease: 'easeInOut' }}
              />
            );
          })}
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}

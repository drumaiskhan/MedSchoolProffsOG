// Generates src/dark-compat.css.
//
// Many student pages use fixed pale colours as Tailwind arbitrary values
// (bg-[#d7eee4], text-[#287058], border-[#f0d3cc] ...). Those don't change
// with the `.dark` theme, so in dark mode they showed as bright pastel blocks
// with dark text. Instead of hand-editing ~100 colours across every page, this
// script scans the source for those classes and emits `.dark` overrides:
//   - pale backgrounds  -> deep tint of the same hue
//   - dark text colours -> light tint of the same hue
//   - pale borders      -> muted tint of the same hue
//   - mid-tone / already-light colours are left alone
// Where a dark text colour sits on the SAME element as a mid-tone solid
// background (e.g. dark text on amber), the original colour is restored.
//
// Re-run after adding new hard-coded colours:
//   node artifacts/frontend-student/tools/gen-dark-compat.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(name)) files.push(p);
  }
})(root);

function hexToHsl(hex) {
  const n = parseInt(hex, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s, l };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hsl = (h, s, l, a) => `hsl(${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%${a != null ? ` / ${a}` : ''})`;
const esc = (cls) => cls.replace(/([^a-zA-Z0-9_-])/g, '\\$1');

const TOKEN = /((?:[a-z0-9]+:)*)(bg|text|border|from|via|to)-\[#([0-9a-fA-F]{6})\](?:\/(\d+))?/g;
const seen = new Map();
const pairs = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(TOKEN)) seen.set(m[0], { variant: m[1], kind: m[2], hex: m[3].toLowerCase(), alpha: m[4] });
  // Same-element pairs: dark text on a mid-tone solid background.
  for (const lit of src.matchAll(/(["'`])((?:(?!\1)[^\n])*?)\1/g)) {
    const toks = [...lit[2].matchAll(TOKEN)].map((t) => ({ full: t[0], variant: t[1], kind: t[2], hex: t[3].toLowerCase(), alpha: t[4] }));
    const bgs = toks.filter((t) => t.kind === 'bg' && !t.variant && !t.alpha);
    const txts = toks.filter((t) => t.kind === 'text' && !t.variant);
    for (const bg of bgs) for (const tx of txts) pairs.add(`${bg.full}|${tx.full}|${tx.hex}`);
  }
}

const isPaleBg = (c) => c.l >= 0.82 || (c.l >= 0.78 && c.s < 0.6);
const isDarkText = (c) => c.l <= 0.46;

function bgDark(c, alpha) {
  const l = clamp(0.13 + (0.99 - c.l) * 0.9, 0.13, 0.3);
  return hsl(c.h, clamp(c.s, 0, 0.5), l, alpha);
}
const textLight = (c, alpha) => hsl(c.h, clamp(c.s * 1.05, 0.15, 0.7), clamp(0.76 - c.l * 0.12, 0.66, 0.78), alpha);
const borderDark = (c, alpha) => hsl(c.h, clamp(c.s, 0, 0.35), 0.28, alpha);

const rules = [];
for (const [full, t] of [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const c = hexToHsl(t.hex);
  const alpha = t.alpha != null ? (Number(t.alpha) / 100).toString() : undefined;
  let decl = null;
  if ((t.kind === 'bg' || t.kind === 'from' || t.kind === 'via' || t.kind === 'to') && isPaleBg(c)) {
    if (t.kind === 'bg') decl = `background-color: ${bgDark(c, alpha)};`;
    else decl = `--tw-gradient-${t.kind === 'from' ? 'from' : t.kind === 'to' ? 'to' : 'via'}: ${bgDark(c, alpha)};`;
  } else if (t.kind === 'text' && isDarkText(c)) decl = `color: ${textLight(c, alpha)};`;
  else if (t.kind === 'border' && isPaleBg(c)) decl = `border-color: ${borderDark(c, alpha)};`;
  if (!decl) continue;
  const state = t.variant === 'hover:' ? ':hover' : '';
  if (t.variant && t.variant !== 'hover:') continue; // only hover variants are used in this codebase
  rules.push(`.dark .${esc(full)}${state} { ${decl} }`);
}

const restore = [];
for (const key of [...pairs].sort()) {
  const [bgFull, txFull, txHex] = key.split('|');
  const bg = hexToHsl(bgFull.match(/#([0-9a-f]{6})/i)[1]);
  const tx = hexToHsl(txHex);
  if (bg.l > 0.3 && bg.l < 0.82 && isDarkText(tx)) restore.push(`.dark .${esc(bgFull)}.${esc(txFull)} { color: #${txHex}; }`);
}

const extras = `/* Named Tailwind palette classes used by a few pages (not-found, Practice). */
.dark .bg-gray-50 { background-color: hsl(var(--background)); }
.dark .text-gray-900 { color: hsl(var(--foreground)); }
.dark .text-gray-600 { color: hsl(var(--muted-foreground)); }
.dark .bg-blue-50 { background-color: hsl(215 40% 20%); }
.dark .bg-indigo-50 { background-color: hsl(235 30% 20%); }
.dark .border-blue-300 { border-color: hsl(215 45% 34%); }
.dark .text-blue-600 { color: hsl(213 90% 72%); }
.dark .text-indigo-600 { color: hsl(235 90% 78%); }
.dark .hover\\:border-blue-300:hover { border-color: hsl(215 55% 45%); }
.dark .hover\\:text-indigo-600:hover { color: hsl(235 90% 82%); }
/* Translucent white washes that sit on (now dark) tinted panels. */
.dark .bg-white\\/60 { background-color: hsl(var(--card) / .6); }
.dark .bg-white\\/70 { background-color: hsl(var(--card) / .7); }
`;

const out = `/* GENERATED by tools/gen-dark-compat.mjs — do not edit by hand.
   Dark-mode overrides for the fixed pale colours used across the student app.
   Unlayered on purpose so it wins over Tailwind's layered utilities. */
${rules.join('\n')}

/* Dark text on mid-tone solid backgrounds keeps its original colour. */
${restore.join('\n')}

${extras}`;
writeFileSync(join(root, 'dark-compat.css'), out);
console.log(`dark-compat.css: ${rules.length} remaps, ${restore.length} restores`);

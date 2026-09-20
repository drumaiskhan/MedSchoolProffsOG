// Pure geometry for the secure reader's highlighting (kept apart from the page
// component so it can be unit-tested without a browser). Everything is in
// normalised page coordinates: 0..1 of the page's width/height.
import type { WordBox } from '@/lib/api';

export type Rect = { x: number; y: number; w: number; h: number };

/** Merges a run of word boxes into one rectangle per line of text. */
export function lineRects(words: WordBox[], start: number, end: number): Rect[] {
  const out: Rect[] = [];
  for (const [x, y, w, h] of words.slice(start, end + 1)) {
    const last = out[out.length - 1];
    if (last && Math.abs(y - last.y) < h * 0.6) {
      const right = Math.max(last.x + last.w, x + w);
      last.x = Math.min(last.x, x); last.w = right - last.x;
      const bottom = Math.max(last.y + last.h, y + h); last.y = Math.min(last.y, y); last.h = bottom - last.y;
    } else out.push({ x, y, w, h });
  }
  return out;
}

export function hitWord(words: WordBox[], nx: number, ny: number): number | null {
  let best: number | null = null, bestD = 0.03 * 0.03;
  for (let i = 0; i < words.length; i++) {
    const [x, y, w, h] = words[i];
    if (nx >= x - 0.004 && nx <= x + w + 0.004 && ny >= y - 0.004 && ny <= y + h + 0.004) return i;
    const dx = Math.max(x - nx, 0, nx - (x + w)), dy = Math.max(y - ny, 0, ny - (y + h));
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}


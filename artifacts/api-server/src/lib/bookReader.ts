// Server-side rendering for the secure book reader.
//
// The point of this module: a student reading a PAID book never receives the
// PDF. The file is fetched from storage by the SERVER, cached briefly in
// memory, and each page is drawn here to a JPEG with the reader's own identity
// (email + id) baked into the pixels. What the browser gets is one watermarked
// page picture at a time, plus the on-page boxes of each word so it can offer
// highlighting — boxes only, never the words' text, so there is nothing to
// copy. Opening the network tab shows JPEGs, not a file; a screenshot or a
// phone photo of the screen still carries the student's name in it and can't
// be cleaned up with CSS.
//
// Honest limits (also in AI_HANDOFF_NOTE_v30.md): nothing running in a browser
// can stop the operating system from capturing the screen. This makes casual
// copying impractical and every leaked page traceable; it does not make it
// impossible.
import { createRequire } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { resolveFileUrl } from "./storage";
import { logger } from "./logger";

// ---- pdf.js (lazy: only loaded the first time someone opens a book) --------

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

const require_ = createRequire(import.meta.url);
function pdfjsAssetDir(sub: string): string {
  // Trailing slash required by pdf.js. Resolved from the installed package so
  // it works the same in dev, in the bundled dist/ and on the host.
  return path.join(path.dirname(require_.resolve("pdfjs-dist/package.json")), sub) + path.sep;
}

// ---- Watermark font --------------------------------------------------------
// A slim server image often has no system fonts at all, which would silently
// draw the watermark as nothing. DejaVu Sans ships in assets/fonts instead.
let fontReady = false;
const FONT_FAMILY = "MspWatermark";
function ensureFont(): void {
  if (fontReady) return;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../assets/fonts/DejaVuSans.ttf"),
    path.resolve(here, "../../assets/fonts/DejaVuSans.ttf"),
    path.resolve(process.cwd(), "assets/fonts/DejaVuSans.ttf"),
    path.resolve(process.cwd(), "artifacts/api-server/assets/fonts/DejaVuSans.ttf"),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (found) GlobalFonts.registerFromPath(found, FONT_FAMILY);
  else logger.warn({ candidates }, "[book-reader] watermark font not found — watermark text may not render");
  fontReady = true;
}

// ---- Loaded-document cache -------------------------------------------------

export class NotPdfError extends Error { constructor() { super("This book isn't a PDF, so it can't be shown in the secure reader."); } }
export class BookUnavailableError extends Error { constructor(msg: string) { super(msg); } }

interface PageSize { w: number; h: number }
interface LoadedBook {
  key: string;
  pdf: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy;
  bytes: number;
  pageCount: number;
  sizes: PageSize[] | null;
  lastUsed: number;
}

const MAX_CACHE_BYTES = Math.max(50, Number(process.env.BOOK_CACHE_MB) || 200) * 1024 * 1024;
const MAX_BOOK_BYTES = 300 * 1024 * 1024;
const IDLE_MS = 20 * 60 * 1000;
const docs = new Map<string, LoadedBook>();
const inflight = new Map<string, Promise<LoadedBook>>();

async function evictIfNeeded(): Promise<void> {
  const now = Date.now();
  for (const [k, b] of docs) if (now - b.lastUsed > IDLE_MS) { docs.delete(k); void b.pdf.destroy().catch(() => {}); }
  let total = [...docs.values()].reduce((s, b) => s + b.bytes, 0);
  const byAge = [...docs.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (total > MAX_CACHE_BYTES && byAge.length > 1) {
    const [k, b] = byAge.shift()!;
    docs.delete(k); total -= b.bytes; void b.pdf.destroy().catch(() => {});
  }
}

/** A short stable id for "this exact book file", used to tie highlights to the
 * file they were made on (replacing the PDF changes it). Not secret. */
export function fileKeyOf(storagePath: string): string {
  let h = 5381;
  for (let i = 0; i < storagePath.length; i++) h = ((h << 5) + h + storagePath.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function loadBook(storagePath: string): Promise<LoadedBook> {
  const cached = docs.get(storagePath);
  if (cached) { cached.lastUsed = Date.now(); return cached; }
  const pending = inflight.get(storagePath);
  if (pending) return pending;

  const job = (async () => {
    const url = resolveFileUrl(storagePath);
    if (!url) throw new BookUnavailableError("This book's file can't be located right now.");
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) }).catch((err) => { throw new BookUnavailableError(`Could not fetch the book file (${err instanceof Error ? err.message : "network error"}).`); });
    if (!res.ok) throw new BookUnavailableError(`The book file could not be fetched (${res.status}).`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BOOK_BYTES) throw new BookUnavailableError("This book file is too large for the secure reader.");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BOOK_BYTES) throw new BookUnavailableError("This book file is too large for the secure reader.");
    // "%PDF" may follow a few bytes of junk, per the PDF spec.
    const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
    if (!head.includes("%PDF-")) throw new NotPdfError();

    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({
      data: buf,
      standardFontDataUrl: pdfjsAssetDir("standard_fonts"),
      cMapUrl: pdfjsAssetDir("cmaps"),
      cMapPacked: true,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    });
    const pdf = await task.promise.catch(() => { throw new BookUnavailableError("This PDF couldn't be opened (it may be damaged or password-protected)."); });
    const book: LoadedBook = { key: storagePath, pdf, bytes: buf.byteLength, pageCount: pdf.numPages, sizes: null, lastUsed: Date.now() };
    docs.set(storagePath, book);
    await evictIfNeeded();
    return book;
  })().finally(() => inflight.delete(storagePath));
  inflight.set(storagePath, job);
  return job;
}

/** Each page's width/height at scale 1, so the reader can lay out placeholders
 * at the right shape before a single image has loaded. */
export async function getPageSizes(book: LoadedBook): Promise<PageSize[]> {
  if (book.sizes) return book.sizes;
  const sizes: PageSize[] = [];
  for (let i = 1; i <= Math.min(book.pageCount, 3000); i++) {
    const page = await book.pdf.getPage(i);
    const v = page.getViewport({ scale: 1 });
    sizes.push({ w: Math.round(v.width * 100) / 100, h: Math.round(v.height * 100) / 100 });
    page.cleanup();
  }
  book.sizes = sizes;
  return sizes;
}

// ---- Rendering -------------------------------------------------------------

// At most a few pages render at once: rendering is CPU-bound and one student
// scrolling quickly shouldn't starve the API for everyone else.
const MAX_CONCURRENT = 3;
let active = 0;
const waiters: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
  try { return await fn(); } finally { active--; waiters.shift()?.(); }
}

export interface Watermark { primary: string; secondary: string }

function drawWatermark(ctx: import("@napi-rs/canvas").SKRSContext2D, w: number, h: number, wm: Watermark): void {
  ctx.save();
  // Diagonal tiled text across the whole page — covers text AND whitespace, so
  // cropping to "just the good part" still keeps the identity.
  const fontPx = Math.max(13, Math.round(w / 46));
  ctx.font = `${fontPx}px ${FONT_FAMILY}, sans-serif`;
  ctx.fillStyle = "rgba(40, 40, 40, 0.13)";
  ctx.textBaseline = "middle";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const diag = Math.hypot(w, h);
  const stepX = Math.max(fontPx * 16, w * 0.62);
  const stepY = fontPx * 6.5;
  for (let y = -diag / 2, row = 0; y < diag / 2; y += stepY, row++) {
    for (let x = -diag / 2 - (row % 2 ? stepX / 2 : 0); x < diag / 2; x += stepX) ctx.fillText(wm.primary, x, y);
  }
  ctx.restore();

  // Footer line: plain, small and unmistakable.
  ctx.save();
  const small = Math.max(10, Math.round(w / 78));
  ctx.font = `${small}px ${FONT_FAMILY}, sans-serif`;
  ctx.fillStyle = "rgba(60, 60, 60, 0.55)";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(wm.secondary, Math.round(w * 0.03), h - Math.round(small * 0.9));
  ctx.restore();
}

export async function renderPageJpeg(book: LoadedBook, pageNumber: number, targetWidth: number, wm: Watermark): Promise<Buffer> {
  if (pageNumber < 1 || pageNumber > book.pageCount) throw new RangeError("Page out of range");
  ensureFont();
  book.lastUsed = Date.now();
  return withSlot(async () => {
    const page = await book.pdf.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: targetWidth / base.width });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as never, viewport }).promise;
      drawWatermark(ctx, canvas.width, canvas.height, wm);
      return await canvas.encode("jpeg", 82);
    } finally {
      page.cleanup();
    }
  });
}

// ---- Word boxes (for highlighting) ------------------------------------------

/** Rough relative advance width of a character in a typical sans-serif face. */
function charWeight(ch: string): number {
  if (ch === " ") return 0.28;
  if ("iljI.,:;'|!".includes(ch)) return 0.27;
  if ("frt()[]{}-\"`".includes(ch)) return 0.36;
  if ("mwMW@%".includes(ch)) return 0.86;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[0-9]/.test(ch)) return 0.56;
  return 0.53;
}

/** [x, y, w, h] of each word as fractions of the page (0..1), in reading
 * order. The words' TEXT is deliberately not returned. */
export type WordBox = [number, number, number, number];
const wordCache = new Map<string, WordBox[]>();

export async function getPageWords(book: LoadedBook, pageNumber: number): Promise<WordBox[]> {
  if (pageNumber < 1 || pageNumber > book.pageCount) throw new RangeError("Page out of range");
  const cacheKey = `${book.key}#${pageNumber}`;
  const hit = wordCache.get(cacheKey);
  if (hit) return hit;
  const pdfjs = await loadPdfjs();
  const page = await book.pdf.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const out: WordBox[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number; height?: number };
      if (!item.str || !item.transform || !item.str.trim()) continue;
      const t = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontH = Math.hypot(t[2], t[3]) || (item.height ?? 0);
      const itemW = (item.width ?? 0) * Math.hypot(viewport.transform[0], viewport.transform[1]);
      // A text item is usually a whole line, and pdf.js only reports its total
      // width. Splitting that evenly per character drifts badly on proportional
      // fonts ("i" is far narrower than "m"), so characters are weighted by a
      // typical sans-serif width table and the weights scaled to the real width.
      const cum: number[] = [0];
      for (const ch of item.str) cum.push(cum[cum.length - 1] + charWeight(ch));
      const totalWeight = cum[cum.length - 1] || 1;
      for (const m of item.str.matchAll(/\S+/g)) {
        const start = m.index ?? 0;
        const x0 = t[4] + itemW * (cum[start] / totalWeight);
        const x1 = t[4] + itemW * (cum[start + m[0].length] / totalWeight);
        const top = t[5] - fontH * 0.95;
        const r = (n: number) => Math.round(n * 10000) / 10000;
        const box: WordBox = [r(x0 / viewport.width), r(top / viewport.height), r((x1 - x0) / viewport.width), r((fontH * 1.2) / viewport.height)];
        if (box[2] > 0 && box[3] > 0) out.push(box);
      }
    }
    if (wordCache.size > 400) wordCache.delete(wordCache.keys().next().value as string);
    wordCache.set(cacheKey, out);
    return out;
  } finally {
    page.cleanup();
  }
}

// Secure reader for PAID books — code-split via React.lazy() in App.tsx.
//
// What this page does and doesn't have, on purpose:
//  * It never holds the PDF. Each page is a watermarked JPEG rendered by the
//    server (see api-server/src/lib/bookReader.ts), painted onto a <canvas>
//    and not kept as a URL, so there's no file to download, print or "save as".
//  * Highlighting works on word BOXES the server sends (no text), so a
//    highlight is a range of boxes — and there's nothing to copy.
//  * A handful of best-effort browser guards (no context menu, copy, print,
//    common save/print shortcuts; the page is veiled when the tab loses focus
//    or PrintScreen is pressed). These only deter — the real protection is
//    that every page carries the reader's own name baked into its pixels.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import { ArrowLeft, BoxSelect, EyeOff, Highlighter, ListOrdered, LockKeyhole, MousePointer2, ShieldCheck, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ApiRequestError, booksApi, type BookHighlight, type HighlightColor, type NewBookHighlight, type WordBox } from '@/lib/api';
import { BrandSpinner, cn, useFocusMode } from '@/lib/shared';
import { toast } from '@/hooks/use-toast';
import { hitWord, lineRects, type Rect } from '@/lib/reader-geometry';
import { enableScreenshotGuard, disableScreenshotGuard } from '@/lib/nativeScreenshotGuard';

const COLORS: Record<HighlightColor, string> = { yellow: '#ffd93b', green: '#5fd08a', pink: '#ff8fab', blue: '#6fb3ff' };
type Mode = 'read' | 'text' | 'area';
// ---------------------------------------------------------------------------

function useReaderGuards(veil: (ms?: number) => void) {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (k === 'printscreen') { veil(3000); try { void navigator.clipboard?.writeText(' '); } catch { /* clipboard may be unavailable */ } }
      if (mod && ['s', 'p', 'c', 'x', 'a', 'u', 'o'].includes(k)) e.preventDefault();
      if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k))) e.preventDefault();
    };
    const onHide = () => { if (document.visibilityState === 'hidden') veil(); };
    const events: Array<[string, EventListener]> = [['contextmenu', stop], ['copy', stop], ['cut', stop], ['dragstart', stop], ['selectstart', stop], ['beforeprint', () => veil()]];
    events.forEach(([n, f]) => document.addEventListener(n, f));
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    document.addEventListener('visibilitychange', onHide); window.addEventListener('blur', () => veil());
    window.addEventListener('beforeprint', () => veil());
    return () => {
      events.forEach(([n, f]) => document.removeEventListener(n, f));
      document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [veil]);
}

/** Best-effort DevTools-open heuristic: an undocked or docked panel shrinks
 * the viewport relative to the outer window by a wide margin that normal
 * browser chrome (toolbars, mobile address bar) doesn't. Polled rather than
 * event-driven since there's no "devtools opened" event. This exists to stop
 * the easy case — someone opening the console and running
 * `canvas.toDataURL()` to pull a page straight off the rendered bitmap — not
 * to detect every inspector; a determined user can still work around a
 * heuristic. Screen/photo capture of the pixels themselves can never be
 * blocked from inside the page (see bookReader.ts's header comment) — this
 * only raises the bar for the console shortcut, and pairs with a watermark
 * baked into every page so anything that does get out is traceable. */
function useDevtoolsGuard(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const THRESHOLD = 180;
    const id = window.setInterval(() => {
      const wide = window.outerWidth - window.innerWidth > THRESHOLD;
      const tall = window.outerHeight - window.innerHeight > THRESHOLD;
      setOpen(wide || tall);
    }, 800);
    return () => window.clearInterval(id);
  }, []);
  return open;
}

// ---------------------------------------------------------------------------

function PageView({ bookId, pageNo, size, widthPx, highlights, mode, color, onCreate, onOpen, pageRef }: {
  bookId: number; pageNo: number; size: { w: number; h: number }; widthPx: number; highlights: BookHighlight[]; mode: Mode; color: HighlightColor;
  onCreate: (h: NewBookHighlight) => void; onOpen: (h: BookHighlight) => void; pageRef: (el: HTMLDivElement | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [near, setNear] = useState(false);
  const [drawnWidth, setDrawnWidth] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const height = Math.round(widthPx * (size.h / size.w));

  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '1400px 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);

  // Fetch + paint. Re-runs when zoom changes the width bucket. Leaving the
  // "near" zone frees the bitmap so a 900-page book doesn't hold 900 canvases.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    if (!near) { canvas.width = 1; canvas.height = 1; setDrawnWidth(0); return; }
    const want = Math.min(1600, Math.max(600, Math.ceil((widthPx * Math.min(window.devicePixelRatio || 1, 2)) / 100) * 100));
    if (drawnWidth === want) return;
    let cancelled = false;
    (async () => {
      try {
        const bitmap = await createImageBitmap(await booksApi.pageImage(bookId, pageNo, want));
        if (cancelled) { bitmap.close(); return; }
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0); bitmap.close();
        setDrawnWidth(want); setFailed(null);
      } catch (err) { if (!cancelled) setFailed(err instanceof ApiRequestError ? err.message : 'This page could not be loaded.'); }
    })();
    return () => { cancelled = true; };
  }, [near, widthPx, bookId, pageNo, drawnWidth]);

  const needWords = near && (mode === 'text' || highlights.some((h) => h.kind === 'words'));
  const wordsQ = useQuery({ queryKey: ['book-words', bookId, pageNo], queryFn: () => booksApi.pageWords(bookId, pageNo), enabled: needWords, staleTime: Infinity, gcTime: 5 * 60_000 });
  const words = useMemo(() => wordsQ.data?.words ?? [], [wordsQ.data]);

  // ---- selection (text range / area rectangle) ----
  const [sel, setSel] = useState<{ a: number; b: number } | { rect: Rect; x0: number; y0: number } | null>(null);
  const toNorm = (e: React.PointerEvent) => { const r = boxRef.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const down = (e: React.PointerEvent) => {
    if (mode === 'read') return;
    const { x, y } = toNorm(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (mode === 'text') { const i = hitWord(words, x, y); if (i !== null) setSel({ a: i, b: i }); }
    else setSel({ rect: { x, y, w: 0, h: 0 }, x0: x, y0: y });
  };
  const move = (e: React.PointerEvent) => {
    if (!sel) return; const { x, y } = toNorm(e);
    if ('a' in sel) { const i = hitWord(words, x, y); if (i !== null) setSel({ a: sel.a, b: i }); }
    else setSel({ ...sel, rect: { x: Math.min(x, sel.x0), y: Math.min(y, sel.y0), w: Math.abs(x - sel.x0), h: Math.abs(y - sel.y0) } });
    // Auto-scroll while dragging a highlight near the top/bottom edge of the
    // viewport, so a selection that runs off-screen doesn't force the reader
    // to release the drag, scroll manually, then restart it.
    const EDGE = 64;
    if (e.clientY < EDGE) window.scrollBy(0, -(EDGE - e.clientY) * 0.5);
    else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, (e.clientY - (window.innerHeight - EDGE)) * 0.5);
  };
  const up = () => {
    if (!sel) return;
    if ('a' in sel) onCreate({ kind: 'words', page: pageNo, startWord: Math.min(sel.a, sel.b), endWord: Math.max(sel.a, sel.b), color });
    else if (sel.rect.w > 0.01 && sel.rect.h > 0.01) onCreate({ kind: 'area', page: pageNo, rect: { x: sel.rect.x, y: sel.rect.y, w: Math.min(sel.rect.w, 1 - sel.rect.x), h: Math.min(sel.rect.h, 1 - sel.rect.y) }, color });
    setSel(null);
  };

  const pct = (n: number) => `${n * 100}%`;
  const rectStyle = (r: Rect, extra: React.CSSProperties = {}): React.CSSProperties => ({ position: 'absolute', left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h), ...extra });

  return <div ref={(el) => { boxRef.current = el; pageRef(el); }} data-page={pageNo} className="book-page relative mx-auto mb-4 overflow-hidden rounded-sm bg-white shadow-md" style={{ width: widthPx, height }}>
    <canvas ref={canvasRef} className="pointer-events-none block h-full w-full select-none" style={{ WebkitUserSelect: 'none' }} aria-label={`Page ${pageNo}`} />
    {!drawnWidth && !failed && <div className="absolute inset-0 grid place-items-center text-muted-foreground"><BrandSpinner size={22} /></div>}
    {failed && <div className="absolute inset-0 grid place-items-center p-6 text-center text-xs font-semibold text-destructive">{failed}</div>}
    <div className="absolute inset-0" style={{ touchAction: mode === 'read' ? 'auto' : 'none', cursor: mode === 'text' ? 'text' : mode === 'area' ? 'crosshair' : 'default', pointerEvents: mode === 'read' ? 'none' : 'auto' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setSel(null)} data-testid={`layer-page-${pageNo}`}>
      {sel && ('a' in sel ? lineRects(words, Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)).map((r, i) => <div key={i} style={rectStyle(r, { background: 'rgba(80,140,255,.35)' })} />) : <div style={rectStyle(sel.rect, { border: '1.5px dashed #3b82f6', background: 'rgba(80,140,255,.15)' })} />)}
    </div>
    {highlights.map((h) => {
      const rects = h.kind === 'area' ? (h.rect ? [h.rect] : []) : lineRects(words, h.startWord ?? 0, h.endWord ?? 0);
      return rects.map((r, i) => <div key={`${h.id}-${i}`} onClick={() => mode === 'read' && onOpen(h)} style={rectStyle(r, { background: COLORS[h.color], opacity: 0.4, mixBlendMode: 'multiply', pointerEvents: mode === 'read' ? 'auto' : 'none', cursor: 'pointer', borderRadius: 2 })} data-testid={`highlight-${h.id}`} />);
    })}
    <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] font-bold text-black/30">{pageNo}</div>
  </div>;
}

// ---------------------------------------------------------------------------

export default function BookReader() {
  const params = useParams<{ id: string }>();
  const bookId = Number(params.id);
  useFocusMode(true);
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ['book-reader', bookId], queryFn: () => booksApi.readerInfo(bookId), retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false });
  const hlQ = useQuery({ queryKey: ['book-highlights', bookId], queryFn: () => booksApi.highlights(bookId), enabled: !!info.data });
  const highlights = useMemo(() => hlQ.data ?? [], [hlQ.data]);

  const [mode, setMode] = useState<Mode>('read');
  // Remembers the last color picked so returning to any book keeps it,
  // instead of resetting to yellow every time.
  const [color, setColor] = useState<HighlightColor>(() => { try { const v = localStorage.getItem('reader:color'); return v === 'green' || v === 'pink' || v === 'blue' ? v : 'yellow'; } catch { return 'yellow'; } });
  useEffect(() => { try { localStorage.setItem('reader:color', color); } catch { /* private mode / storage blocked */ } }, [color]);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [panel, setPanel] = useState(false);
  const [active, setActive] = useState<BookHighlight | null>(null);
  const [veiled, setVeiled] = useState(false);
  const veilTimer = useRef<number | undefined>(undefined);
  const veil = useCallback((ms?: number) => { setVeiled(true); if (ms) { window.clearTimeout(veilTimer.current); veilTimer.current = window.setTimeout(() => setVeiled(false), ms); } }, []);
  useReaderGuards(veil);
  const devtoolsOpen = useDevtoolsGuard();

  // Native (iOS/Android app) screenshot/recording block — no-ops on web.
  // Scoped to this screen only; see nativeScreenshotGuard.ts for the
  // per-platform caveats.
  useEffect(() => {
    void enableScreenshotGuard();
    return () => void disableScreenshotGuard();
  }, []);

  // Escape backs out of whatever's open, closest-first: the highlight editor
  // sheet, then the highlights list panel — same as tapping outside them.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setActive((a) => { if (a) return null; setPanel((p) => (p ? false : p)); return a; });
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const pageEls = useRef<Array<HTMLDivElement | null>>([]);
  const [viewportW, setViewportW] = useState(() => Math.min(window.innerWidth - 24, 1100));
  useEffect(() => { const f = () => setViewportW(Math.min(window.innerWidth - 24, 1100)); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const widthPx = Math.round(Math.min(viewportW, 900) * zoom);

  // lastSavedRef / pendingRef track what's on screen vs. what's confirmed
  // saved, so a tab-close mid-debounce still gets flushed (see below) instead
  // of silently losing up to 1.2s of reading progress.
  const pendingRef = useRef(1);
  const lastSavedRef = useRef(1);
  const [justSaved, setJustSaved] = useState(false);

  // Jump to the saved page once the layout exists.
  const resumed = useRef(false);
  useEffect(() => {
    if (!info.data || resumed.current) return; resumed.current = true;
    const p = info.data.resumePage; setCurrent(p); pendingRef.current = p; lastSavedRef.current = p;
    requestAnimationFrame(() => pageEls.current[p - 1]?.scrollIntoView({ block: 'start' }));
  }, [info.data]);

  // Track the page nearest the middle of the screen; save it (debounced).
  useEffect(() => {
    if (!info.data) return;
    let raf = 0, saveT: number | undefined;
    const commit = (page: number) => {
      lastSavedRef.current = page;
      void booksApi.saveProgress(bookId, page).then(() => { setJustSaved(true); window.setTimeout(() => setJustSaved(false), 1500); }).catch(() => {});
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = window.innerHeight / 2; let best = 1, bestD = Infinity;
        pageEls.current.forEach((el, i) => { if (!el) return; const r = el.getBoundingClientRect(); const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid)); if (d < bestD) { bestD = d; best = i + 1; } });
        setCurrent(best); pendingRef.current = best;
        window.clearTimeout(saveT); saveT = window.setTimeout(() => commit(best), 1200);
      });
    };
    // Flush immediately (not the 1.2s debounce) the moment the tab is hidden,
    // backgrounded, or closed — `keepalive` lets the request outlive the page.
    const flushNow = () => { if (pendingRef.current !== lastSavedRef.current) { lastSavedRef.current = pendingRef.current; booksApi.saveProgressOnExit(bookId, pendingRef.current); } };
    const onHide = () => { if (document.visibilityState === 'hidden') flushNow(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushNow);
    return () => {
      window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); window.clearTimeout(saveT);
      document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flushNow);
      flushNow();
    };
  }, [info.data, bookId]);

  const add = useMutation({
    mutationFn: (body: NewBookHighlight) => booksApi.addHighlight(bookId, body),
    onSuccess: (h) => { qc.setQueryData<BookHighlight[]>(['book-highlights', bookId], (old) => [...(old ?? []), h]); setActive(h); },
    onError: (err: unknown) => toast({ title: 'Could not save highlight', description: err instanceof ApiRequestError ? err.message : 'Try again.', variant: 'destructive' }),
  });
  const update = useMutation({
    mutationFn: (v: { id: number; color?: HighlightColor; note?: string | null }) => booksApi.updateHighlight(bookId, v.id, { color: v.color, note: v.note }),
    onSuccess: (h) => { qc.setQueryData<BookHighlight[]>(['book-highlights', bookId], (old) => (old ?? []).map((x) => (x.id === h.id ? h : x))); setActive((a) => (a && a.id === h.id ? h : a)); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => booksApi.deleteHighlight(bookId, id),
    onSuccess: (_r, id) => { qc.setQueryData<BookHighlight[]>(['book-highlights', bookId], (old) => (old ?? []).filter((x) => x.id !== id)); setActive(null); },
  });
  const [noteDraft, setNoteDraft] = useState('');
  useEffect(() => { setNoteDraft(active?.note ?? ''); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = (p: number) => { const n = Math.min(Math.max(1, p), info.data?.pageCount ?? 1); pageEls.current[n - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const byPage = useMemo(() => { const m = new Map<number, BookHighlight[]>(); for (const h of highlights) m.set(h.page, [...(m.get(h.page) ?? []), h]); return m; }, [highlights]);

  if (info.isLoading) return <div className="grid min-h-[60vh] place-items-center text-primary"><div className="flex items-center gap-3 text-sm font-bold"><BrandSpinner size={22} /> Opening your book securely…</div></div>;
  if (info.isError || !info.data) {
    const err = info.error instanceof ApiRequestError ? info.error : null;
    return <div className="mx-auto grid min-h-[50vh] max-w-md place-items-center text-center"><div>
      <LockKeyhole className="mx-auto text-muted-foreground" size={28} />
      <h2 className="mt-3 text-lg font-extrabold">{err?.status === 403 ? 'This book is locked' : "Couldn't open this book"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{err?.message ?? 'Something went wrong.'}</p>
      <Link href="/books" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">Back to books</Link>
    </div></div>;
  }
  const d = info.data;

  return <div className="book-reader-root select-none" data-veil={veiled || devtoolsOpen} style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}>
    {/* Veiling hides the whole page box — canvas, highlight overlays, page
       number — not just the canvas, so a blurred/backgrounded/devtools-open
       window doesn't still leak highlight positions or layout through the
       overlay layers sitting on top of it. */}
    <style>{`@media print{.book-reader-root{display:none!important}} .book-reader-root[data-veil="true"] .book-page{visibility:hidden}`}</style>
    <div className="sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
      <Link href="/books" className="grid size-9 place-items-center rounded-xl border border-border bg-card" aria-label="Back to books" data-testid="link-reader-back"><ArrowLeft size={16} /></Link>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold">{d.title}</div><div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><ShieldCheck size={11} /> Protected reading · highlights are saved to your account{justSaved && <span className="text-primary"> · Progress saved</span>}</div></div>
      <label className="flex items-center gap-1 text-xs font-bold">Page <input type="number" min={1} max={d.pageCount} value={current} onChange={(e) => jump(Number(e.target.value))} className="h-8 w-14 rounded-lg border border-border bg-card px-2 text-center" data-testid="input-reader-page" /> / {d.pageCount}</label>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
        {([['read', MousePointer2, 'Read'], ['text', Highlighter, 'Highlight text'], ['area', BoxSelect, 'Highlight area']] as const).map(([m, Icon, label]) =>
          <button key={m} type="button" onClick={() => setMode(m)} title={label} aria-pressed={mode === m} className={cn('grid size-8 place-items-center rounded-lg', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} data-testid={`button-mode-${m}`}><Icon size={15} /></button>)}
      </div>
      {mode !== 'read' && <div className="flex items-center gap-1.5">{(Object.keys(COLORS) as HighlightColor[]).map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`${c} highlighter`} className={cn('size-6 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')} style={{ background: COLORS[c] }} data-testid={`button-color-${c}`} />)}</div>}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} className="grid size-8 place-items-center rounded-lg border border-border bg-card" aria-label="Zoom out"><ZoomOut size={14} /></button>
        <button type="button" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.2).toFixed(1)))} className="grid size-8 place-items-center rounded-lg border border-border bg-card" aria-label="Zoom in"><ZoomIn size={14} /></button>
        <button type="button" onClick={() => setPanel((v) => !v)} className={cn('relative grid size-8 place-items-center rounded-lg border border-border', panel ? 'bg-primary text-primary-foreground' : 'bg-card')} aria-label="My highlights" data-testid="button-reader-highlights"><ListOrdered size={14} />{highlights.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[#e5a952] px-1 text-[9px] font-black text-[#183844]">{highlights.length}</span>}</button>
      </div>
    </div>

    <div className="pb-24">
      {d.pages.map((size, i) => <PageView key={i} bookId={bookId} pageNo={i + 1} size={size} widthPx={widthPx} highlights={byPage.get(i + 1) ?? []} mode={mode} color={color}
        onCreate={(h) => add.mutate(h)} onOpen={setActive} pageRef={(el) => { pageEls.current[i] = el; }} />)}
    </div>

    {active && <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:bottom-4 sm:rounded-2xl" data-testid="sheet-highlight">
      <div className="flex items-center gap-2"><span className="text-xs font-extrabold">Highlight · page {active.page}</span>
        <div className="ml-2 flex gap-1.5">{(Object.keys(COLORS) as HighlightColor[]).map((c) => <button key={c} type="button" onClick={() => update.mutate({ id: active.id, color: c })} aria-label={`Make ${c}`} className={cn('size-6 rounded-full border-2', active.color === c ? 'border-foreground' : 'border-transparent')} style={{ background: COLORS[c] }} />)}</div>
        <button type="button" onClick={() => setActive(null)} className="ml-auto grid size-7 place-items-center rounded-lg hover:bg-muted" aria-label="Close"><X size={15} /></button></div>
      <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onBlur={() => noteDraft !== (active.note ?? '') && update.mutate({ id: active.id, note: noteDraft.trim() || null })} placeholder="Add a note (optional)" maxLength={1000} rows={2} className="mt-3 w-full select-text rounded-xl border border-border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-highlight-note" />
      <button type="button" onClick={() => remove.mutate(active.id)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-destructive" data-testid="button-delete-highlight"><Trash2 size={13} /> Remove highlight</button>
    </div>}

    {panel && <aside className="fixed inset-y-0 right-0 z-40 w-80 max-w-[90vw] overflow-y-auto border-l border-border bg-card p-4 shadow-2xl" data-testid="panel-highlights">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold">My highlights</h3><button type="button" onClick={() => setPanel(false)} className="grid size-7 place-items-center rounded-lg hover:bg-muted" aria-label="Close"><X size={15} /></button></div>
      {highlights.length === 0 ? <p className="text-xs text-muted-foreground">Nothing yet. Choose the highlighter, then drag across text — or draw a box around a figure.</p> :
        <ul className="space-y-2">{[...highlights].sort((a, b) => a.page - b.page || a.id - b.id).map((h) => <li key={h.id}><button type="button" onClick={() => { jump(h.page); setActive(h); }} className="flex w-full items-start gap-2 rounded-xl border border-border p-3 text-left hover:bg-muted/60"><span className="mt-0.5 size-3 shrink-0 rounded-full" style={{ background: COLORS[h.color] }} /><span className="min-w-0 text-xs"><span className="font-bold">Page {h.page}</span> <span className="text-muted-foreground">· {h.kind === 'area' ? 'area' : 'text'}</span>{h.note && <span className="mt-1 block truncate text-muted-foreground">{h.note}</span>}</span></button></li>)}</ul>}
    </aside>}

    {(veiled || devtoolsOpen) && <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 backdrop-blur-2xl" onClick={() => !devtoolsOpen && setVeiled(false)} data-testid="veil-reader">
      <div className="text-center">
        <EyeOff className="mx-auto text-muted-foreground" size={26} />
        <div className="mt-3 text-sm font-extrabold">{devtoolsOpen ? 'Developer tools detected' : 'Reader paused'}</div>
        <p className="mt-1 text-xs text-muted-foreground">{devtoolsOpen ? "Pages are hidden while developer tools are open. Close them to keep reading." : "Pages are hidden while this window isn't in focus."}</p>
        {!devtoolsOpen && <button type="button" onClick={() => setVeiled(false)} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">Resume reading</button>}
      </div>
    </div>}
  </div>;
}

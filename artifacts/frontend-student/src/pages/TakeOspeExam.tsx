// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import { ArrowRight, Clock3, Stethoscope, Image as ImageIcon, PenLine, RotateCcw, ZoomIn } from 'lucide-react';
import { ospeApi, type OspeExamStartResponse } from '@/lib/api';
import { Badge, SkeletonPage, cn, useExamLock, useFocusMode, usePageTitle } from '@/lib/shared';
import { resolveUploadUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Zoomable / pannable image viewer — a station's photo can be far bigger
// than a phone screen can show at readable detail (a labelled specimen,
// a full X-ray), so this lets a student pinch-zoom (touch), scroll-zoom
// (mouse), or double-tap to zoom in on the exact area they need, then drag
// to pan around while zoomed. Numbered identification pins (for LABELING
// stations) are rendered as children of the same transformed box so they
// track the underlying image pixel-for-pixel at any zoom level.
// ---------------------------------------------------------------------------
function ZoomableImage({ src, pins, testId }: { src: string; pins?: Array<{ id: string; x: number; y: number }>; testId?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastDist = useRef<number | null>(null);
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const isGesturing = pointers.current.size > 0;

  const clampScale = (s: number) => Math.min(4, Math.max(1, s));
  const reset = () => { setScale(1); setTx(0); setTy(0); };
  const dist = () => {
    const pts = Array.from(pointers.current.values());
    if (pts.length < 2) return null;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
    if (pointers.current.size === 2) lastDist.current = dist();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const d = dist();
      if (d && lastDist.current) setScale((s) => clampScale(s * (d / lastDist.current!)));
      lastDist.current = d;
    } else if (pointers.current.size === 1 && dragStart.current && scale > 1) {
      setTx(dragStart.current.tx + (e.clientX - dragStart.current.x));
      setTy(dragStart.current.ty + (e.clientY - dragStart.current.y));
    }
  };
  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) lastDist.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
  };
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => { e.preventDefault(); setScale((s) => clampScale(s - e.deltaY * 0.0015 * s)); };
  const onDoubleClick = () => (scale > 1 ? reset() : setScale(2.5));

  return <div className="relative touch-none overflow-hidden rounded-2xl border border-border bg-muted" style={{ maxHeight: '62vh' }}>
    {scale === 1 ? <div className="pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-bold text-white"><ZoomIn size={11} /> Pinch or scroll to zoom</div>
      : <button onClick={reset} className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-bold text-white" data-testid="button-reset-zoom"><RotateCcw size={11} /> Reset zoom</button>}
    <div
      ref={boxRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
      className={cn('relative w-full select-none', scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
      style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: 'center center', transition: isGesturing ? 'none' : 'transform 0.15s ease-out' }}
      data-testid={testId}
    >
      <img src={src} alt="" className="block w-full" draggable={false} />
      {pins?.map((p, i) => <div key={p.id} style={{ left: `${p.x}%`, top: `${p.y}%` }} className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground shadow-md ring-2 ring-white" data-testid={`pin-marker-${i}`}>{i + 1}</div>)}
    </div>
  </div>;
}

function TakeOspeExam() {
  const params = useParams();
  const attemptId = Number(params.attemptId);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<OspeExamStartResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<number, string | null>>({});
  const [written, setWritten] = useState<Record<number, string>>({});
  const [labelAnswers, setLabelAnswers] = useState<Record<number, Record<string, string>>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Which slide is showing for the current station: the image (with any
  // identification pins), or the answer form. Stations with no image skip
  // straight to 'answer' — there's nothing to flip back to.
  const [view, setView] = useState<'image' | 'answer'>('image');
  useFocusMode(true, true);
  useExamLock(true);

  const submit = useMutation({ mutationFn: () => ospeApi.submit(attemptId), onSuccess: () => setLocation(`/ospe-osce/result/${attemptId}`) });
  const saveAnswer = useMutation({ mutationFn: ({ stationId, selectedAnswer, writtenAnswer, labelAnswers: la }: { stationId: number; selectedAnswer: string | null; writtenAnswer: string | null; labelAnswers?: Record<string, string> | null }) => ospeApi.answer(attemptId, stationId, selectedAnswer, writtenAnswer, la ?? null) });

  // Same re-entrancy pattern as TakeExam: the attempt was already created
  // via OspeOsce's start mutation — re-calling start here is safe, the
  // backend just returns the same in-progress attempt's stations.
  const load = useQuery({ queryKey: ['ospe-exam-session', attemptId], queryFn: async () => { const exams = await ospeApi.exams(); const exam = exams.find((e) => e.inProgressAttemptId === attemptId); if (!exam) throw new Error('Attempt not found'); const started = await ospeApi.start(exam.id); return { ...started, examTitle: exam.title }; } });
  usePageTitle(load.data ? load.data.examTitle : 'OSPE/OSCE Exam');

  useEffect(() => {
    if (load.data && !session) {
      setSession(load.data);
      setSecondsLeft(Math.max(0, load.data.durationMinutes * 60 - Math.floor((Date.now() - new Date(load.data.startedAt).getTime()) / 1000)));
    }
  }, [load.data, session]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setSecondsLeft((s) => {
      if (s === null) return s;
      if (s <= 1) { clearInterval(timer); submit.mutate(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const current = session?.stations[index];
  // Reset to the image slide whenever the student moves to a different
  // station that has one — otherwise a station without an image always
  // opens straight on its answer form.
  useEffect(() => { setView(current?.imagePath ? 'image' : 'answer'); }, [current?.id]);

  if (load.isLoading || !session || !current) return <SkeletonPage />;
  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const seconds = secondsLeft !== null ? secondsLeft % 60 : 0;
  const isAnswered = (s: typeof current) => {
    if (s.answerType === 'MCQ') return selected[s.id] != null;
    if (s.answerType === 'LABELING') return (s.labelPoints || []).every((p) => !!labelAnswers[s.id]?.[p.id]?.trim());
    return !!written[s.id]?.trim();
  };
  const answeredCount = session.stations.filter(isAnswered).length;

  const selectOption = (opt: string) => { setSelected((prev) => ({ ...prev, [current.id]: opt })); saveAnswer.mutate({ stationId: current.id, selectedAnswer: opt, writtenAnswer: null }); };
  const saveWritten = () => { saveAnswer.mutate({ stationId: current.id, selectedAnswer: null, writtenAnswer: written[current.id] ?? '' }); };
  const saveLabelAnswers = (next: Record<string, string>) => { saveAnswer.mutate({ stationId: current.id, selectedAnswer: null, writtenAnswer: null, labelAnswers: next }); };
  const setLabelAnswer = (pointId: string, text: string) => {
    setLabelAnswers((prev) => {
      const next = { ...(prev[current.id] || {}), [pointId]: text };
      return { ...prev, [current.id]: next };
    });
  };

  const imgUrl = current.imagePath ? resolveUploadUrl(current.imagePath) : null;

  return <div className="mx-auto max-w-4xl px-1 sm:px-0">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 sm:px-5">
      <div className="min-w-0"><div className="truncate text-xs font-extrabold" data-testid="text-ospe-exam-title">{session.examTitle}</div><div className="text-[11px] text-muted-foreground">Station {index + 1} / {session.stations.length} · {answeredCount} answered</div></div>
      <div className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold', secondsLeft !== null && secondsLeft < 60 ? 'bg-destructive/10 text-destructive' : 'bg-muted')}><Clock3 size={13} /> {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div>
    </div>

    <div className="rounded-3xl border border-border bg-card p-6 md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Badge tone="blue">{current.answerType === 'MCQ' ? 'Select the correct answer' : current.answerType === 'LABELING' ? 'Identify each labelled point' : 'Written answer · AI graded'}</Badge>
          {current.marks != null && <span className="ml-2 text-[11px] font-bold text-muted-foreground">{current.marks} mark{current.marks === 1 ? '' : 's'}{current.timeLimitSeconds ? ` · suggested ${Math.round(current.timeLimitSeconds / 60)} min` : ''}</span>}
        </div>
        {imgUrl && <div className="inline-flex rounded-xl border border-border bg-background p-1" data-testid="toggle-station-view">
          <button onClick={() => setView('image')} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-extrabold transition-colors', view === 'image' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')} data-testid="button-view-image"><ImageIcon size={13} /> Image</button>
          <button onClick={() => { if (current.answerType === 'WRITTEN') saveWritten(); setView('answer'); }} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-extrabold transition-colors', view === 'answer' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')} data-testid="button-view-answer"><PenLine size={13} /> Answer</button>
        </div>}
      </div>

      <h2 className="mt-5 text-lg font-extrabold leading-7">{current.title}</h2>

      {view === 'image' ? <>
        {imgUrl && <div className="mt-4"><ZoomableImage src={imgUrl} pins={current.answerType === 'LABELING' ? (current.labelPoints || []) : undefined} testId={`img-station-${current.id}`} /></div>}
        {current.instructions && <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{current.instructions}</p>}
        {current.attachmentPath && <a href={resolveUploadUrl(current.attachmentPath)!} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-bold text-primary" data-testid={`link-station-attachment-${current.id}`}>Open attached file</a>}
        {imgUrl && <button onClick={() => { if (current.answerType === 'WRITTEN') saveWritten(); setView('answer'); }} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-go-to-answer">Answer the question{ current.answerType === 'LABELING' && (current.labelPoints || []).length > 1 ? 's' : ''} <ArrowRight size={14} /></button>}
      </> : <>
        {!imgUrl && current.instructions && <p className="mb-5 whitespace-pre-wrap text-sm text-muted-foreground">{current.instructions}</p>}
        {imgUrl && <button onClick={() => setView('image')} className="mb-5 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-back-to-image"><ImageIcon size={13} /> Look at the image again</button>}

        {current.answerType === 'MCQ' ? <div className="space-y-3">{(current.options || []).map((opt, i) => <button key={opt} onClick={() => selectOption(opt)} className={cn('flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm transition-colors', selected[current.id] === opt ? 'border-primary bg-[#e6f3ed]' : 'border-border hover:bg-muted')} data-testid={`button-station-answer-${i}`}><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted font-mono-app text-[11px]">{String.fromCharCode(65 + i)}</span>{opt}</button>)}</div>

          : current.answerType === 'LABELING' ? <div className="space-y-3">
            {(current.labelPoints || []).map((p, i) => <div key={p.id} className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">{i + 1}</span>
              <input
                value={labelAnswers[current.id]?.[p.id] ?? ''}
                onChange={(e) => setLabelAnswer(p.id, e.target.value)}
                onBlur={() => saveLabelAnswers(labelAnswers[current.id] || {})}
                placeholder={`What is labelled ${i + 1}?`}
                className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm"
                data-testid={`input-label-answer-${i}`}
              />
            </div>)}
            <p className="text-[11px] text-muted-foreground">Saved automatically as you move on. Numbers match the pins on the image.</p>
          </div>

          : <div><textarea value={written[current.id] ?? ''} onChange={(e) => setWritten((prev) => ({ ...prev, [current.id]: e.target.value }))} onBlur={saveWritten} rows={7} placeholder="Write your answer here…" className="w-full rounded-2xl border border-border bg-background p-4 text-sm" data-testid={`textarea-station-answer-${current.id}`} /><p className="mt-2 text-[11px] text-muted-foreground">Saved automatically as you move on — your answer will be graded by AI once you submit.</p></div>}
      </>}
    </div>

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">
        <button disabled={index === 0} onClick={() => { if (current.answerType === 'WRITTEN') saveWritten(); else if (current.answerType === 'LABELING') saveLabelAnswers(labelAnswers[current.id] || {}); setIndex((i) => i - 1); }} className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold disabled:opacity-40" data-testid="button-station-prev">Previous</button>
        <button disabled={index === session.stations.length - 1} onClick={() => { if (current.answerType === 'WRITTEN') saveWritten(); else if (current.answerType === 'LABELING') saveLabelAnswers(labelAnswers[current.id] || {}); setIndex((i) => i + 1); }} className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold disabled:opacity-40" data-testid="button-station-next">Next</button>
      </div>
      <button onClick={() => { if (current.answerType === 'WRITTEN') saveWritten(); else if (current.answerType === 'LABELING') saveLabelAnswers(labelAnswers[current.id] || {}); setConfirming(true); }} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-station-finish">Submit exam</button>
    </div>
    <div className="mt-4 flex flex-wrap gap-1.5">{session.stations.map((s, i) => <button key={s.id} onClick={() => setIndex(i)} className={cn('grid size-8 place-items-center rounded-lg text-[11px] font-bold', i === index ? 'bg-primary text-primary-foreground' : isAnswered(s) ? 'bg-[#d7eee4] text-[#164b4b]' : 'bg-muted text-muted-foreground')} data-testid={`button-station-nav-${i}`}>{i + 1}</button>)}</div>

    {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-2xl bg-card p-6"><h3 className="font-bold">Submit this exam?</h3><p className="mt-2 text-xs text-muted-foreground">You've answered {answeredCount} of {session.stations.length} stations. Written answers get graded by AI right after you submit. This can't be undone.</p><div className="mt-5 flex gap-2"><button onClick={() => setConfirming(false)} className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold" data-testid="button-cancel-station-submit">Keep going</button><button onClick={() => submit.mutate()} disabled={submit.isPending} className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-confirm-station-submit">{submit.isPending ? 'Submitting…' : 'Submit'}</button></div></div></div>}
  </div>;
}

export default TakeOspeExam;

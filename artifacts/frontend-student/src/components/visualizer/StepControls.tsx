import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StepControls({ stepCount, stepIndex, onStepChange, loop }: { stepCount: number; stepIndex: number; onStepChange: (i: number) => void; loop?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // setInterval closes over stale stepIndex, so track the latest value in a
  // ref rather than resetting the interval on every step change.
  const prevIndexRef = useRef(stepIndex);
  useEffect(() => { prevIndexRef.current = stepIndex; }, [stepIndex]);

  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      onStepChange((prevIndexRef.current + 1) % stepCount);
    }, 2200);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stepCount]);


  const atStart = stepIndex === 0;
  const atEnd = stepIndex === stepCount - 1;
  const canPrev = loop || !atStart;
  const canNext = loop || !atEnd;

  const goPrev = () => onStepChange(loop && atStart ? stepCount - 1 : Math.max(0, stepIndex - 1));
  const goNext = () => onStepChange(loop && atEnd ? 0 : Math.min(stepCount - 1, stepIndex + 1));

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button onClick={goPrev} disabled={!canPrev} className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40" data-testid="button-visualizer-prev-step"><ChevronLeft size={16} /></button>
      <div className="flex items-center gap-1.5 px-1" data-testid="row-step-controls-dots">
        {Array.from({ length: stepCount }).map((_, i) => (
          <button key={i} onClick={() => onStepChange(i)} className={cn('size-2 rounded-full transition-all', i === stepIndex ? 'w-4 bg-primary' : 'bg-muted')} data-testid={`button-step-dot-${i}`} aria-label={`Go to step ${i + 1}`} />
        ))}
      </div>
      <button onClick={goNext} disabled={!canNext} className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40" data-testid="button-visualizer-next-step"><ChevronRight size={16} /></button>
      <button onClick={() => setPlaying((p) => !p)} className="ml-2 grid size-9 place-items-center rounded-xl border border-border bg-card text-primary hover:bg-muted" data-testid="button-visualizer-play-pause">{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button onClick={() => { setPlaying(false); onStepChange(0); }} className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted" title="Restart" data-testid="button-visualizer-restart-steps"><RotateCcw size={15} /></button>
    </div>
  );
}

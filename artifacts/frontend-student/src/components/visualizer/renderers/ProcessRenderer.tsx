import { DiagramCanvas } from '../DiagramCanvas';
import type { VisualizationSpec } from '../schema';
import { RotateCw } from 'lucide-react';

export function ProcessRenderer({ spec, stepIndex }: { spec: Extract<VisualizationSpec, { type: 'process' | 'cycle' }>; stepIndex: number }) {
  const step = spec.steps[Math.min(stepIndex, spec.steps.length - 1)];
  const isCycle = spec.type === 'cycle' || spec.loop;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="aspect-[4/3] w-full">
        <DiagramCanvas elements={step.elements} highlightIds={step.highlightIds} stepKey={stepIndex} />
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5" data-testid="row-visualizer-step-dots">
        {spec.steps.map((_, i) => (
          <span key={i} className={i === stepIndex ? 'h-1.5 w-4 rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full bg-muted'} />
        ))}
        {isCycle && <RotateCw size={12} className="ml-1 text-muted-foreground" aria-label="Loops back to the first step" />}
      </div>
    </div>
  );
}

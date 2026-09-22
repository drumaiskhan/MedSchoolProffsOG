import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Lightbulb, Loader2 } from 'lucide-react';
import { aiVisualizerApi } from '@/lib/api';
import type { VisualizationSpec } from './schema';
import { isStepBased } from './VisualizationRenderer';

export function ExplanationPanel({ spec, stepIndex }: { spec: VisualizationSpec; stepIndex: number }) {
  const stepBased = isStepBased(spec);
  const step = stepBased ? spec.steps[Math.min(stepIndex, spec.steps.length - 1)] : null;
  const title = step?.title ?? spec.title;
  const description = step?.description ?? spec.description;

  const explain = useMutation({
    mutationFn: () => aiVisualizerApi.explainStep(spec.title, title, description),
  });

  // Reset the "Explain this step" result when the active step changes, so
  // the button reappears instead of showing the previous step's answer.
  useEffect(() => { explain.reset(); }, [stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-extrabold" data-testid="text-visualizer-step-title">{title}</h3>
      <p className="mt-2 text-xs leading-6 text-muted-foreground" data-testid="text-visualizer-step-description">{description}</p>

      {stepBased && (
        <div className="mt-3">
          {!explain.data && (
            <button
              onClick={() => explain.mutate()}
              disabled={explain.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-muted disabled:opacity-60"
              data-testid="button-explain-step"
            >
              {explain.isPending ? <Loader2 size={13} className="animate-spin" /> : <Lightbulb size={13} />}
              {explain.isPending ? 'Explaining…' : 'Explain this step'}
            </button>
          )}
          {explain.data && (
            <p className="mt-2 rounded-xl bg-muted p-3 text-xs leading-6" data-testid="text-explain-step-result">{explain.data.explanation}</p>
          )}
          {explain.isError && <p className="mt-2 text-xs text-destructive">Couldn't generate an explanation right now.</p>}
        </div>
      )}
    </div>
  );
}

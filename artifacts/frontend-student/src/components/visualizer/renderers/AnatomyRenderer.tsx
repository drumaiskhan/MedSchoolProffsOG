import { DiagramCanvas } from '../DiagramCanvas';
import type { VisualizationSpec } from '../schema';

export function AnatomyRenderer({ spec }: { spec: Extract<VisualizationSpec, { type: 'anatomy' }> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="aspect-[4/3] w-full">
        <DiagramCanvas elements={spec.elements} />
      </div>
    </div>
  );
}

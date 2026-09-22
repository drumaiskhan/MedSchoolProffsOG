import { DiagramCanvas } from '../DiagramCanvas';
import type { VisualizationSpec, VizElement } from '../schema';

// Flowcharts aren't step-based per the brief — render every node/edge at
// once. Convert nodes/edges into the same VizElement shapes DiagramCanvas
// already knows how to draw (shape + arrow), so there's no second render
// engine to maintain.
export function FlowchartRenderer({ spec }: { spec: Extract<VisualizationSpec, { type: 'flowchart' }> }) {
  const elements: VizElement[] = [
    ...spec.nodes.map((n): VizElement => ({ kind: 'shape', id: n.id, shapeType: 'rect', x: n.x, y: n.y, width: 18, height: 8, label: n.label })),
    ...spec.edges.map((e, i): VizElement => ({ kind: 'arrow', id: `edge-${i}`, fromId: e.fromId, toId: e.toId, label: e.label })),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="aspect-[4/3] w-full">
        <DiagramCanvas elements={elements} />
      </div>
    </div>
  );
}

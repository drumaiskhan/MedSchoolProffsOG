import type { VisualizationSpec } from './schema';
import { ProcessRenderer } from './renderers/ProcessRenderer';
import { FlowchartRenderer } from './renderers/FlowchartRenderer';
import { TimelineRenderer } from './renderers/TimelineRenderer';
import { EquationRenderer } from './renderers/EquationRenderer';
import { ComparisonRenderer } from './renderers/ComparisonRenderer';
import { GraphRenderer } from './renderers/GraphRenderer';
import { AnatomyRenderer } from './renderers/AnatomyRenderer';

export function VisualizationRenderer({ spec, stepIndex }: { spec: VisualizationSpec; stepIndex: number }) {
  switch (spec.type) {
    case 'process':
    case 'cycle':
      return <ProcessRenderer spec={spec} stepIndex={stepIndex} />;
    case 'flowchart':
      return <FlowchartRenderer spec={spec} />;
    case 'timeline':
      return <TimelineRenderer spec={spec} />;
    case 'equation':
      return <EquationRenderer spec={spec} />;
    case 'comparison':
      return <ComparisonRenderer spec={spec} />;
    case 'graph':
      return <GraphRenderer spec={spec} />;
    case 'anatomy':
      return <AnatomyRenderer spec={spec} />;
  }
}

// Only process/cycle visualizations are step-based — used by the parent
// page to decide whether to show StepControls at all.
export function isStepBased(spec: VisualizationSpec): spec is Extract<VisualizationSpec, { type: 'process' | 'cycle' }> {
  return spec.type === 'process' || spec.type === 'cycle';
}

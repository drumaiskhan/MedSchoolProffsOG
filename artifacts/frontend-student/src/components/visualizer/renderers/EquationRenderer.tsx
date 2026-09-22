import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import type { VisualizationSpec, FormulaNode } from '../schema';

// Pure arithmetic interpreter — NOT eval / new Function. Walks the small
// operation tree the backend validated (add/subtract/multiply/divide of
// named variables and constants only).
function evalFormula(node: FormulaNode, scope: Record<string, number>): number {
  if ('const' in node) return node.const;
  if ('var' in node) return scope[node.var] ?? 0;
  const l = evalFormula(node.left, scope);
  const r = evalFormula(node.right, scope);
  switch (node.op) {
    case 'add': return l + r;
    case 'subtract': return l - r;
    case 'multiply': return l * r;
    case 'divide': return r === 0 ? 0 : l / r;
  }
}

export function EquationRenderer({ spec }: { spec: Extract<VisualizationSpec, { type: 'equation' }> }) {
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(spec.variables.map((v) => [v.name, v.default])));
  const result = evalFormula(spec.formula, values);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-center font-mono-app text-sm font-bold text-primary">{spec.displayFormula}</div>
      <div className="mt-5 space-y-5">
        {spec.variables.map((v) => (
          <div key={v.name}>
            <div className="flex items-center justify-between text-xs font-bold"><span>{v.label}</span><span className="font-mono-app text-muted-foreground">{values[v.name]}{v.unit ? ` ${v.unit}` : ''}</span></div>
            <Slider
              className="mt-2"
              min={v.min}
              max={v.max}
              step={v.step ?? 1}
              value={[values[v.name]]}
              onValueChange={([val]) => setValues((prev) => ({ ...prev, [v.name]: val }))}
              data-testid={`slider-equation-${v.name}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl bg-muted p-4 text-center">
        <div className="text-[11px] font-bold text-muted-foreground">{spec.resultLabel}</div>
        <div className="mt-1 font-display text-3xl" data-testid="text-equation-result">{Number.isFinite(result) ? Math.round(result * 100) / 100 : '—'}{spec.resultUnit ? ` ${spec.resultUnit}` : ''}</div>
      </div>
    </div>
  );
}

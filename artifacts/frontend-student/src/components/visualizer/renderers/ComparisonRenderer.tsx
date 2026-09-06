import type { VisualizationSpec } from '../schema';

export function ComparisonRenderer({ spec }: { spec: Extract<VisualizationSpec, { type: 'comparison' }> }) {
  const allLabels = [...new Set(spec.items.flatMap((item) => item.attributes.map((a) => a.label)))];

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead className="bg-muted text-[10px] uppercase tracking-[.1em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3"></th>
            {spec.items.map((item, i) => <th key={i} className="px-4 py-3 font-bold text-foreground" data-testid={`col-comparison-${i}`}>{item.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {allLabels.map((label, i) => (
            <tr key={label} className="border-t border-border">
              <td className="px-4 py-3 font-bold text-muted-foreground">{label}</td>
              {spec.items.map((item, j) => {
                const attr = item.attributes.find((a) => a.label === label);
                return <td key={j} className="px-4 py-3 leading-5">{attr?.value ?? '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

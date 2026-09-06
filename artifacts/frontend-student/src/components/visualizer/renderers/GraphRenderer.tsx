import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { VisualizationSpec } from '../schema';

const LINE_COLORS = ['var(--color-primary, #287058)', '#32647b', '#94651c', '#a34c3e', '#164b4b', '#8a5a12'];

export function GraphRenderer({ spec }: { spec: Extract<VisualizationSpec, { type: 'graph' }> }) {
  // Merge all series into one array of rows keyed by x, so recharts can
  // plot multiple series against a shared x-axis.
  const xValues = [...new Set(spec.series.flatMap((s) => s.points.map((p) => p.x)))];
  const rows = xValues.map((x) => {
    const row: Record<string, string | number> = { x };
    for (const s of spec.series) {
      const point = s.points.find((p) => p.x === x);
      if (point) row[s.name] = point.y;
    }
    return row;
  });

  const config: ChartConfig = Object.fromEntries(spec.series.map((s, i) => [s.name, { label: s.name, color: LINE_COLORS[i % LINE_COLORS.length] }]));
  const Chart = spec.chartType === 'bar' ? BarChart : LineChart;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <ChartContainer config={config} className="aspect-[16/9]">
        <Chart data={rows} data-testid="chart-visualizer-graph">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" tickLine={false} axisLine={false} label={{ value: spec.xLabel, position: 'insideBottom', offset: -5, fontSize: 10 }} />
          <YAxis tickLine={false} axisLine={false} label={{ value: spec.yLabel, angle: -90, position: 'insideLeft', fontSize: 10 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {spec.series.map((s, i) => (
            spec.chartType === 'bar'
              ? <Bar key={s.name} dataKey={s.name} fill={LINE_COLORS[i % LINE_COLORS.length]} radius={4} />
              : <Line key={s.name} type="monotone" dataKey={s.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </Chart>
      </ChartContainer>
    </div>
  );
}

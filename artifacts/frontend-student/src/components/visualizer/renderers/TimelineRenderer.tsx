import type { VisualizationSpec } from '../schema';

export function TimelineRenderer({ spec }: { spec: Extract<VisualizationSpec, { type: 'timeline' }> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="relative space-y-5 border-l-2 border-border pl-5">
        {spec.events.map((event, i) => (
          <div key={i} className="relative" data-testid={`row-timeline-event-${i}`}>
            <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-primary bg-card" />
            <div className="font-mono-app text-[10px] uppercase tracking-[.1em] text-primary">{event.time}</div>
            <div className="mt-1 text-sm font-bold">{event.label}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

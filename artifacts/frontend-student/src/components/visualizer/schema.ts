// Frontend copy of the discriminated-union types matching the backend Zod
// schema in artifacts/api-server/src/lib/aiVisualizer.ts. Kept as plain
// types, not a second Zod schema — validation only needs to happen once,
// server-side. Re-exported from lib/api.ts (single source of truth) so
// these components and api.ts never drift.
export type {
  VizPoint,
  VizElement,
  VizStep,
  FormulaNode,
  VisualizationSpec,
} from '@/lib/api';

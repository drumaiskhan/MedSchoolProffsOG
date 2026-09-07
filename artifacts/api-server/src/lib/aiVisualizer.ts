/**
 * AI Visualizer: turns a student's plain-language prompt about a medical
 * process/relationship into a structured, typed JSON spec (never
 * executable code) that the frontend renders with hand-written React
 * components. Mirrors the shape of aiExplain.ts — same provider
 * abstraction (runPrompt), same "strip fences, parse, validate" pattern.
 *
 * Security posture (do not weaken):
 * - The AI only ever produces JSON matching VisualizationSpec below.
 * - Every string/array field has a `.max()` bound so an oversized or
 *   malformed response is rejected outright, never forwarded to the
 *   frontend.
 * - No `eval`/`new Function` anywhere — formulas are a small AST
 *   (FormulaNode) interpreted client-side, never a string to evaluate.
 */

import { z } from "zod";
import { runPrompt, AiNotConfiguredError } from "./aiExplain";

export { AiNotConfiguredError };

// ---------------------------------------------------------------------------
// Schema — the AI may ONLY produce this. Anything else is rejected.
// ---------------------------------------------------------------------------

// A point on a normalized 0-100 x 0-100 canvas so the SVG viewBox is always
// "0 0 100 100" regardless of screen size (responsive by construction).
const VizElement = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shape"), id: z.string().max(40), shapeType: z.enum(["circle", "rect", "ellipse"]), x: z.number().min(0).max(100), y: z.number().min(0).max(100), width: z.number().min(0).max(100).optional(), height: z.number().min(0).max(100).optional(), radius: z.number().min(0).max(50).optional(), color: z.string().max(30).optional(), label: z.string().max(80).optional() }),
  z.object({ kind: z.literal("label"), id: z.string().max(40), text: z.string().max(120), x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("arrow"), id: z.string().max(40), fromId: z.string().max(40), toId: z.string().max(40), label: z.string().max(60).optional(), style: z.enum(["solid", "dashed"]).optional() }),
  // A "particle" is how something visually moves between two structures
  // across the step (e.g. Ca2+ moving SR -> troponin). The renderer
  // animates it with a CSS/SVG transition — no AI-authored motion code.
  z.object({ kind: z.literal("particle"), id: z.string().max(40), text: z.string().max(20).optional(), color: z.string().max(30).optional(), fromId: z.string().max(40), toId: z.string().max(40) }),
]);

const Step = z.object({
  title: z.string().max(120),
  description: z.string().max(600),
  elements: z.array(VizElement).max(40),
  highlightIds: z.array(z.string().max(40)).max(20).optional(),
});

const ProcessSpec = z.object({
  type: z.enum(["process", "cycle"]),
  title: z.string().max(160),
  description: z.string().max(500),
  loop: z.boolean().optional(), // true for "cycle" (last step connects back to first)
  steps: z.array(Step).min(1).max(20),
});

const FlowchartSpec = z.object({
  type: z.literal("flowchart"),
  title: z.string().max(160),
  description: z.string().max(500),
  nodes: z.array(z.object({ id: z.string().max(40), label: z.string().max(100), x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).min(2).max(30),
  edges: z.array(z.object({ fromId: z.string().max(40), toId: z.string().max(40), label: z.string().max(60).optional() })).max(60),
});

const TimelineSpec = z.object({
  type: z.literal("timeline"),
  title: z.string().max(160),
  description: z.string().max(500),
  events: z.array(z.object({ label: z.string().max(80), time: z.string().max(40), description: z.string().max(300) })).min(2).max(30),
});

// Formulas are a small AST, never a string to eval(). Interpreter in
// EquationRenderer.tsx (frontend) walks this recursively — add/sub/mul/div/var/const only.
const FormulaNode: z.ZodType<unknown> = z.lazy(() => z.union([
  z.object({ op: z.enum(["add", "subtract", "multiply", "divide"]), left: FormulaNode, right: FormulaNode }),
  z.object({ var: z.string().max(20) }),
  z.object({ const: z.number() }),
]));

const EquationSpec = z.object({
  type: z.literal("equation"),
  title: z.string().max(160),
  description: z.string().max(500),
  displayFormula: z.string().max(80), // human-readable, e.g. "CO = HR x SV" — display only, never evaluated
  variables: z.array(z.object({ name: z.string().max(20), label: z.string().max(60), unit: z.string().max(20).optional(), min: z.number(), max: z.number(), default: z.number(), step: z.number().optional() })).min(1).max(6),
  resultLabel: z.string().max(40),
  resultUnit: z.string().max(20).optional(),
  formula: FormulaNode,
});

const ComparisonSpec = z.object({
  type: z.literal("comparison"),
  title: z.string().max(160),
  description: z.string().max(500),
  items: z.array(z.object({ name: z.string().max(60), attributes: z.array(z.object({ label: z.string().max(40), value: z.string().max(120) })).max(10) })).min(2).max(4),
});

const GraphSpec = z.object({
  type: z.literal("graph"),
  title: z.string().max(160),
  description: z.string().max(500),
  chartType: z.enum(["line", "bar"]),
  xLabel: z.string().max(40),
  yLabel: z.string().max(40),
  series: z.array(z.object({ name: z.string().max(40), points: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })).max(100) })).min(1).max(6),
});

const AnatomySpec = z.object({
  type: z.literal("anatomy"),
  title: z.string().max(160),
  description: z.string().max(500),
  elements: z.array(VizElement).max(60),
});

// "cycle" shares ProcessSpec's shape via the `type` enum on ProcessSpec
// itself (z.enum(["process", "cycle"])) — a discriminatedUnion can't have
// two branches sharing one literal, so cycle is just process with
// type: "cycle" and loop: true, handled by the same branch below.
export const VisualizationSpec = z.discriminatedUnion("type", [
  ProcessSpec, FlowchartSpec, TimelineSpec, EquationSpec, ComparisonSpec, GraphSpec, AnatomySpec,
]);
export type VisualizationSpecT = z.infer<typeof VisualizationSpec>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTIONS = `You are a medical education visualization generator for MedschoolProffs, an MBBS/BDS exam-prep platform. A student will describe a physiological, anatomical, pharmacological, or biochemical process or relationship in plain language. You must respond with ONLY a single valid JSON object — no prose, no markdown code fences, no explanation before or after — matching EXACTLY one of the JSON shapes below, chosen by which best fits the concept. Use the field names shown below verbatim — do not rename, add, or omit fields, and do not invent your own structure for any type.

MEDICAL ACCURACY RULES (do not violate these):
- Use standard, textbook medical physiology/anatomy/pharmacology only.
- Do not invent mechanisms, structures, or sequences that are not established science.
- Preserve the correct physiological sequence of events exactly.
- Use correct, standard medical terminology (the audience is medical students, not laypeople).
- If a detail is genuinely uncertain or debated, say so briefly in the relevant description field rather than presenting it as settled fact.
- Prefer several short, concrete steps over one dense block of text. Each "description" field should be 1-4 sentences, exam-focused, not a textbook paragraph.

CHOOSE ONE TYPE AND FOLLOW ITS EXACT JSON SHAPE:

1. "process" or "cycle" — a multi-step mechanism (cycle loops back to step 1; process has a clear end):
{"type":"process","title":"...","description":"...","loop":false,"steps":[{"title":"...","description":"...","elements":[{"kind":"shape","id":"sr","shapeType":"circle","x":30,"y":40,"radius":8,"color":"#3b82f6","label":"SR"},{"kind":"label","id":"lbl1","text":"Ca2+","x":30,"y":30},{"kind":"arrow","id":"a1","fromId":"sr","toId":"troponin","label":"release","style":"solid"},{"kind":"particle","id":"p1","text":"Ca2+","color":"#f59e0b","fromId":"sr","toId":"troponin"}],"highlightIds":["sr","p1"]}]}
- Use "cycle" (same shape, "type":"cycle","loop":true) when the mechanism loops back to its start (e.g. cardiac cycle, citric acid cycle, cross-bridge cycling).
- Every element needs a unique "id" referenced consistently across steps (an element present in multiple steps should reuse the same id, not a new one each time) and a normalized position (x, y each 0-100).
- "particle" elements show something moving between two existing element ids across a step — this is how motion/animation is expressed; never describe motion only in the text.
- "highlightIds" on a step lists which element ids are the focus of that step.
- Keep each step focused on ONE event, not the whole mechanism at once. 1-20 steps.

2. "flowchart" — branching cause-and-effect, not strictly linear:
{"type":"flowchart","title":"...","description":"...","nodes":[{"id":"n1","label":"...","x":20,"y":10},{"id":"n2","label":"...","x":50,"y":40}],"edges":[{"fromId":"n1","toId":"n2","label":"..."}]}
- 2-30 nodes, up to 60 edges, all x/y normalized 0-100.

3. "timeline" — events anchored to real time points:
{"type":"timeline","title":"...","description":"...","events":[{"label":"...","time":"Day 1","description":"..."},{"label":"...","time":"Day 3","description":"..."}]}
- 2-30 events.

4. "equation" — a quantitative relationship between named variables (e.g. CO = HR x SV). The formula is a small operation tree, NEVER a string to evaluate:
{"type":"equation","title":"...","description":"...","displayFormula":"CO = HR x SV","variables":[{"name":"HR","label":"Heart Rate","unit":"bpm","min":40,"max":180,"default":70,"step":1},{"name":"SV","label":"Stroke Volume","unit":"mL","min":30,"max":150,"default":70,"step":1}],"resultLabel":"Cardiac Output","resultUnit":"L/min","formula":{"op":"multiply","left":{"var":"HR"},"right":{"var":"SV"}}}
- "formula" nodes are ONLY ever one of these three exact shapes, nested as needed: {"op":"add"|"subtract"|"multiply"|"divide","left":<node>,"right":<node>}, or {"var":"HR"} (must match a name in "variables"), or {"const":1000} (a literal number, e.g. for a unit-conversion divisor).
- 1-6 variables, each with realistic physiological min/max/default.

5. "comparison" — 2-4 named things compared attribute-by-attribute:
{"type":"comparison","title":"...","description":"...","items":[{"name":"Type 1 DM","attributes":[{"label":"Onset","value":"Childhood/adolescence"},{"label":"Mechanism","value":"Autoimmune beta-cell destruction"}]},{"name":"Type 2 DM","attributes":[{"label":"Onset","value":"Adulthood"},{"label":"Mechanism","value":"Insulin resistance"}]}]}
- Every item should list the same attribute labels, in the same order, so they line up side by side.

6. "graph" — a quantitative relationship as a line/bar chart:
{"type":"graph","title":"...","description":"...","chartType":"line","xLabel":"Preload (mmHg)","yLabel":"Stroke Volume (mL)","series":[{"name":"Normal","points":[{"x":0,"y":40},{"x":10,"y":90},{"x":20,"y":110}]}]}
- 1-6 series, up to 100 points each; "x" may be a number or a short category string.

7. "anatomy" — one labeled diagram, no step progression:
{"type":"anatomy","title":"...","description":"...","elements":[{"kind":"shape","id":"a1","shapeType":"ellipse","x":50,"y":30,"width":20,"height":12,"color":"#ef4444","label":"Right Atrium"},{"kind":"label","id":"l1","text":"RA","x":50,"y":20}]}
- Same element "kind"s as process/cycle above (shape/label/arrow/particle), 1-60 elements.

Respond with ONLY the JSON object matching the shape for your chosen type. No markdown fences, no leading/trailing text, no fields beyond what's shown above.`;

function buildPrompt(userPrompt: string): string {
  return `${SYSTEM_INSTRUCTIONS}\n\nStudent's request: "${userPrompt}"\n\nRespond with ONLY the JSON object described above.`;
}

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

export class InvalidVisualizationError extends Error {
  // `raw` carries the offending text (truncated/invalid JSON) so callers
  // can log it for admin diagnosis — see routes/ai-visualizer.ts, which
  // writes this into aiVisualizerLogsTable.rawResponse. Optional because
  // some call sites (e.g. "prompt was empty") have no AI response to attach.
  constructor(public issues: string, public raw?: string) { super(`AI returned an invalid visualization: ${issues}`); this.name = "InvalidVisualizationError"; }
}

const MAX_PROMPT_LENGTH = 500;
// Visualization JSON for a multi-step process (e.g. skeletal muscle
// contraction's ~16 steps, each with several elements/particles) is much
// bigger than the 400-token default used by explanations/flashcards/MCQs.
// 4000 was too low in practice — a genuinely multi-step "cycle" prompt
// like muscle contraction routinely got cut off mid-array, which broke
// JSON parsing and surfaced as a 502 ("The AI produced an unusable
// visualization"). Sized generously enough for a full 20-step
// process/cycle (the schema's own max) plus per-step elements/highlightIds.
const VISUALIZATION_MAX_TOKENS = 8000;
// If a first attempt still truncates (rare once the cap above is
// generous, but not impossible for an unusually dense prompt), retry once
// with an even higher budget and an explicit instruction to economize on
// steps — rather than immediately failing the student's request.
const VISUALIZATION_RETRY_MAX_TOKENS = 12000;

/** A cut-off response never closes its outermost brace — a real "not JSON
 * at all" response (extra prose, wrong shape) usually still closes it.
 * This is a heuristic, not a guarantee, but it's enough to tell "raise the
 * budget and retry" apart from "the model produced garbage, retrying
 * won't help." */
function looksTruncated(cleaned: string): boolean {
  const trimmedEnd = cleaned.trimEnd();
  return trimmedEnd.length > 0 && !trimmedEnd.endsWith("}");
}

function tryParse(cleaned: string): unknown | undefined {
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try { return JSON.parse(match[0]); } catch { return undefined; }
  }
}

async function attemptGeneration(prompt: string, maxTokens: number): Promise<{ raw: string; spec?: VisualizationSpecT; truncated: boolean; issues?: string }> {
  const raw = await runPrompt(prompt, maxTokens, "object");
  const cleaned = stripFences(raw);
  const parsedJson = tryParse(cleaned);

  if (parsedJson === undefined) {
    return { raw, truncated: looksTruncated(cleaned), issues: "Response was not valid JSON" };
  }
  const result = VisualizationSpec.safeParse(parsedJson);
  if (!result.success) {
    // A validation failure on an array field that's suspiciously at (or
    // past) its max length, combined with a response that never closed
    // its brace, is also consistent with truncation — e.g. a "steps"
    // array whose last element is missing required fields because it got
    // cut mid-object.
    return { raw, truncated: looksTruncated(cleaned), issues: result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { raw, spec: result.data, truncated: false };
}

export async function generateVisualization(userPrompt: string): Promise<VisualizationSpecT> {
  const trimmed = userPrompt.trim().slice(0, MAX_PROMPT_LENGTH);
  if (!trimmed) throw new InvalidVisualizationError("Prompt was empty");

  const first = await attemptGeneration(buildPrompt(trimmed), VISUALIZATION_MAX_TOKENS);
  if (first.spec) return first.spec;

  // Only retry when truncation is the likely cause — a non-truncated
  // invalid response (e.g. the model ignored the schema entirely) won't
  // be fixed by a bigger token budget, so don't spend a second AI call on it.
  if (!first.truncated) {
    throw new InvalidVisualizationError(first.issues ?? "Response was not valid JSON", first.raw);
  }

  const retryPrompt = `${buildPrompt(trimmed)}\n\nIMPORTANT: Your previous response was too long and got cut off before it was valid JSON. This time, keep it to at most 10 steps (or fewer elements per step) and be more concise in every "description" field, while still producing complete, valid JSON that fully closes every object and array.`;
  const second = await attemptGeneration(retryPrompt, VISUALIZATION_RETRY_MAX_TOKENS);
  if (second.spec) return second.spec;
  throw new InvalidVisualizationError(second.issues ?? "Response was not valid JSON", second.raw);
}

// Used by the optional "Explain this step" button — a short, ungated,
// ephemeral text explanation (same pattern as generateExplanation), not a
// new visualization. Not schema-validated: it returns plain text, rendered
// as plain text, same trust level as the existing ask-ai endpoints.
export async function explainStep(stepTitle: string, stepDescription: string, overallTitle: string): Promise<string> {
  const prompt = [
    `You are helping a medical student understand one step of a visualization titled "${overallTitle}".`,
    `The step is: "${stepTitle}" — ${stepDescription}`,
    "Explain this specific step in more depth, in under 120 words, at MBBS/BDS level. Use correct medical terminology. Do not use markdown headers.",
  ].join("\n");
  return runPrompt(prompt, 400);
}

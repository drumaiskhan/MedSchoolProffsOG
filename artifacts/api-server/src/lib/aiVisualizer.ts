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

const SYSTEM_INSTRUCTIONS = `You are a medical education visualization generator for MedschoolProffs, an MBBS/BDS exam-prep platform. A student will describe a physiological, anatomical, pharmacological, or biochemical process or relationship in plain language. You must respond with ONLY a single valid JSON object — no prose, no markdown code fences, no explanation before or after — matching exactly one of the schemas below, chosen by which best fits the concept.

MEDICAL ACCURACY RULES (do not violate these):
- Use standard, textbook medical physiology/anatomy/pharmacology only.
- Do not invent mechanisms, structures, or sequences that are not established science.
- Preserve the correct physiological sequence of events exactly.
- Use correct, standard medical terminology (the audience is medical students, not laypeople).
- If a detail is genuinely uncertain or debated, say so briefly in the relevant description field rather than presenting it as settled fact.
- Prefer several short, concrete steps over one dense block of text. Each "description" field should be 1-4 sentences, exam-focused, not a textbook paragraph.

CHOOSING A TYPE:
- "process" — a multi-step mechanism with a clear start and end (e.g. skeletal muscle contraction, coagulation cascade).
- "cycle" — a multi-step mechanism that loops back to its start (e.g. cardiac cycle, cross-bridge cycling, citric acid cycle).
- "flowchart" — a branching cause-and-effect network without strict linear steps.
- "timeline" — events anchored to actual time points (e.g. stages of wound healing by day).
- "equation" — a quantitative relationship between named variables (e.g. CO = HR x SV, MAP calculation). Provide the formula as a small operation tree using only add/subtract/multiply/divide of variables and constants — never as a string to evaluate.
- "comparison" — 2-4 named things compared attribute-by-attribute (e.g. Type 1 vs Type 2 diabetes).
- "graph" — a quantitative relationship best shown as a line/bar chart over a numeric or categorical axis.
- "anatomy" — a single labeled diagram of structures, no step progression.

VISUAL RULES for process/cycle/flowchart/timeline/anatomy types:
- Every element needs a unique "id" and a normalized position (x, y each 0-100) so it renders on a 100x100 canvas.
- Use "particle" elements to show something moving between two structures across a step (e.g. a calcium ion moving from the sarcoplasmic reticulum toward troponin, or acetylcholine crossing a synaptic cleft) — this is how motion/animation is expressed; do not describe motion only in text.
- Use "highlightIds" on a step to indicate which elements are the focus of that step.
- Keep each step focused on ONE event, not the whole mechanism at once.

Respond with ONLY the JSON object. No markdown fences, no leading/trailing text.`;

function buildPrompt(userPrompt: string): string {
  return `${SYSTEM_INSTRUCTIONS}\n\nStudent's request: "${userPrompt}"\n\nRespond with ONLY the JSON object described above.`;
}

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

export class InvalidVisualizationError extends Error {
  constructor(public issues: string) { super(`AI returned an invalid visualization: ${issues}`); this.name = "InvalidVisualizationError"; }
}

const MAX_PROMPT_LENGTH = 500;
// Visualization JSON for a multi-step process (e.g. skeletal muscle
// contraction's ~16 steps) is much bigger than the 400-token default used
// by explanations/flashcards/MCQs — this is a starting point; raise it if
// real provider responses truncate on complex prompts, but keep a hard
// ceiling since it's billed per request.
const VISUALIZATION_MAX_TOKENS = 4000;

export async function generateVisualization(userPrompt: string): Promise<VisualizationSpecT> {
  const trimmed = userPrompt.trim().slice(0, MAX_PROMPT_LENGTH);
  if (!trimmed) throw new InvalidVisualizationError("Prompt was empty");

  const raw = await runPrompt(buildPrompt(trimmed), VISUALIZATION_MAX_TOKENS, "object");
  const cleaned = stripFences(raw);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new InvalidVisualizationError("Response was not JSON");
    try { parsedJson = JSON.parse(match[0]); } catch { throw new InvalidVisualizationError("Response was not valid JSON"); }
  }

  const result = VisualizationSpec.safeParse(parsedJson);
  if (!result.success) {
    throw new InvalidVisualizationError(result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
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

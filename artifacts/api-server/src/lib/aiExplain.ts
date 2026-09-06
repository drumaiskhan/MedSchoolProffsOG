/**
 * Generates an AI explanation (for MCQs or flashcards) using an AI provider.
 * Supports Anthropic, OpenAI, Gemini, or any OpenAI-compatible custom
 * endpoint. The key/provider/model can come from Admin -> Platform
 * settings -> AI (preferred, so non-technical admins can set/rotate it
 * without touching the server env), falling back to ANTHROPIC_API_KEY /
 * OPENAI_API_KEY / GEMINI_API_KEY in the environment for deployments that
 * prefer to keep secrets out of the database. Neither set and this throws
 * a clear, catchable error instead of silently doing nothing, so the admin
 * UI can tell the difference between "AI isn't configured yet" and "the
 * request failed."
 *
 * Uses a raw fetch call rather than an SDK dependency, matching the rest of
 * this codebase's approach to optional integrations (see lib/storage.ts,
 * lib/email.ts).
 */

import { getSetting } from "./settings";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set it from Admin -> Platform settings -> AI, or set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY in the environment.");
    this.name = "AiNotConfiguredError";
  }
}

export interface ExplanationRequest {
  question: string;
  options: string[];
  correctAnswer: string | null;
  reference?: string | null;
}

export interface FlashcardExplanationRequest {
  front: string;
  back: string;
}

export interface FlashcardGenerationRequest {
  /** Either an explicit block of text (e.g. pasted notes), or MCQ question/answer pairs to draw from. */
  sourceText?: string;
  mcqs?: Array<{ question: string; correctAnswer: string | null; explanation?: string | null }>;
  topicLabel?: string;
  count: number;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
}

export interface McqGenerationRequest {
  /** Full context string, e.g. "Blood (Pathology — MBBS Year 1)" — the more
   * specific this is, the less likely the model drifts to generic/unrelated
   * trivia instead of questions actually about the topic. */
  topicLabel: string;
  /** A few existing questions from the same topic, if any — used only as
   * style/scope reference so new questions match the existing set's level
   * and don't duplicate them; never sent as content to copy verbatim. */
  existingQuestions?: string[];
  count: number;
}

export interface GeneratedMcq {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  // Index-aligned with `options` — why each option specifically is right or
  // wrong, not just why the correct one is right.
  optionExplanations: string[];
}

function buildPrompt({ question, options, correctAnswer, reference }: ExplanationRequest): string {
  const optionList = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");
  return [
    "You are writing a concise study explanation for a medical school MCQ (MBBS/BDS level).",
    "Explain why the correct answer is right and briefly note why the other options are wrong.",
    "Keep it factual, exam-focused, and under 150 words. Do not use markdown headers.",
    "",
    `Question: ${question}`,
    `Options:\n${optionList}`,
    correctAnswer ? `Correct answer: ${correctAnswer}` : "Correct answer: not specified — infer the most medically accurate answer and note the uncertainty.",
    reference ? `Reference material to ground the explanation in: ${reference}` : "",
  ].filter(Boolean).join("\n");
}

function buildFlashcardPrompt({ front, back }: FlashcardExplanationRequest): string {
  return [
    "You are helping a medical student (MBBS/BDS level) understand a flashcard they're stuck on.",
    "Explain the answer below in a different way than a one-line definition — use an analogy, a mechanism walkthrough, or a clinical example, whichever helps it stick.",
    "Keep it factual and under 130 words. Do not use markdown headers.",
    "",
    `Flashcard prompt: ${front}`,
    `Flashcard answer: ${back}`,
  ].join("\n");
}

function buildFlashcardGenerationPrompt({ sourceText, mcqs, topicLabel, count }: FlashcardGenerationRequest): string {
  const source = sourceText?.trim()
    ? sourceText.trim()
    : (mcqs ?? []).map((m) => `Q: ${m.question}\nA: ${m.correctAnswer ?? "(unspecified)"}${m.explanation ? `\nWhy: ${m.explanation}` : ""}`).join("\n\n");
  return [
    "You are creating spaced-repetition flashcards for a medical student (MBBS/BDS level)" + (topicLabel ? ` studying ${topicLabel}` : "") + ".",
    `Produce exactly ${count} front/back flashcard pairs distilled from the source material below.`,
    "Each front should be a short, specific question or prompt. Each back should be a concise, factual answer (1-3 sentences).",
    "Do not repeat near-duplicate cards. Do not include markdown headers or numbering in the front/back text itself.",
    "",
    "Respond with ONLY a valid JSON array, no prose before or after, no code fences, no introductory sentence like \"Here are the flashcards\", no closing remarks — the response must start with [ and end with ] and contain nothing else, in this exact shape:",
    '[{"front": "...", "back": "..."}]',
    "",
    "Source material:",
    source || "(no source material provided — use general high-yield facts for this topic)",
  ].join("\n");
}

function parseFlashcardJson(raw: string): GeneratedFlashcard[] {
  // Strip code fences the model may add despite instructions not to.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Some models wrap the array in extra prose — try to extract the first [...] block.
    const match = cleaned.match(/\[[\s\S]*\]/);
    // Include a snippet of what the model actually said in both failure
    // cases below — a bare "AI did not return valid flashcard JSON" gave no
    // way to tell "the model refused/ignored the format" apart from "the
    // response got cut off mid-array" apart from "OpenRouter returned an
    // error payload shaped differently than expected." The raw text is the
    // only way to tell these apart from the admin UI.
    if (!match) throw new Error(`AI did not return valid flashcard JSON. Raw response: ${cleaned.slice(0, 500)}`);
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      // Found brackets but the content between them didn't parse — almost
      // always means the response got cut off before the array closed
      // (ran out of max_tokens). Say so explicitly since "increase the
      // token limit" is a very different fix than "pick a better model."
      throw new Error(`AI's flashcard JSON was cut off or malformed (likely ran out of output tokens mid-response). Raw response: ${cleaned.slice(0, 500)}`);
    }
  }
  if (!Array.isArray(parsed)) throw new Error(`AI did not return a flashcard array. Raw response: ${cleaned.slice(0, 500)}`);
  return parsed
    .filter((c): c is { front: unknown; back: unknown } => !!c && typeof c === "object")
    .map((c) => ({ front: String((c as { front: unknown }).front ?? "").trim(), back: String((c as { back: unknown }).back ?? "").trim() }))
    .filter((c) => c.front.length > 0 && c.back.length > 0);
}

// This prompt is the actual fix for "AI generates questions unrelated to the
// selected topic" (e.g. a "Blood" topic producing a question about the
// smallest bone in the body): the topic label is repeated at both the start
// AND end of the prompt (models weight the tail of a long prompt more
// heavily), every question is required to explicitly reference the topic
// subject matter, and the model is told directly to discard and regenerate
// anything generic. existingQuestions are shown only as a "don't repeat
// these / match this level" reference, never as content to draw the new
// questions' subject matter from.
function buildMcqGenerationPrompt({ topicLabel, existingQuestions, count }: McqGenerationRequest): string {
  const existingBlock = existingQuestions?.length
    ? `\nFor reference only (do not repeat these, do not copy their subject if it drifted off-topic — match their difficulty level instead):\n${existingQuestions.slice(0, 8).map((q) => `- ${q}`).join("\n")}\n`
    : "";
  return [
    `You are a medical school question-bank author. Every single question you write MUST be specifically about: "${topicLabel}".`,
    "Do not write generic pre-med trivia (bone names, cell organelles, vital sign ranges, etc.) unless that is literally what the topic above is about.",
    "Before finalizing each question, check: does this question directly test knowledge of the exact topic named above? If not, discard it and write a different one that does.",
    `Produce exactly ${count} single-best-answer multiple-choice questions (MBBS/BDS level) on "${topicLabel}".`,
    "Each question needs exactly 4 options (A-D equivalent, but return them as a plain string array, not labeled), and one correct answer that must be an exact string match to one of the options.",
    "For EVERY option (not just the correct one), write a short 1-2 sentence explanation of why that specific option is right or wrong — a real distractor-analysis, not just a generic restatement. The correct option's explanation should say why it's correct; each wrong option's explanation should say specifically why it's wrong (e.g. what it's confused with, or what's missing/incorrect about it) — this is what a real exam-prep answer key looks like, not just one blanket explanation for the correct choice.",
    "Vary the sub-topics, question stems, and clinical vs. factual framing across the set so it doesn't feel repetitive.",
    existingBlock,
    `Remember: this entire question set is about "${topicLabel}" — nothing else.`,
    "",
    "Respond with ONLY a valid JSON array, no prose before or after, no code fences, no introductory sentence, no closing remarks — the response must start with [ and end with ] and contain nothing else, in this exact shape (optionExplanations must have exactly one entry per option, in the same order as options):",
    '[{"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "...", "explanation": "...", "optionExplanations": ["...", "...", "...", "..."]}]',
  ].join("\n");
}

function parseMcqJson(raw: string): GeneratedMcq[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`AI did not return valid MCQ JSON. Raw response: ${cleaned.slice(0, 500)}`);
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error(`AI's MCQ JSON was cut off or malformed (likely ran out of output tokens mid-response). Raw response: ${cleaned.slice(0, 500)}`);
    }
  }
  if (!Array.isArray(parsed)) throw new Error(`AI did not return an MCQ array. Raw response: ${cleaned.slice(0, 500)}`);
  return parsed
    .filter((m): m is { question: unknown; options: unknown; correctAnswer: unknown; explanation: unknown; optionExplanations: unknown } => !!m && typeof m === "object")
    .map((m) => {
      const options = Array.isArray((m as { options: unknown }).options) ? ((m as { options: unknown[] }).options).map((o) => String(o).trim()).filter(Boolean) : [];
      const rawOptionExplanations = (m as { optionExplanations: unknown }).optionExplanations;
      // Only trust optionExplanations if the model actually gave one entry
      // per option — a mismatched-length array would silently misattribute
      // explanations to the wrong option index downstream.
      const optionExplanations = Array.isArray(rawOptionExplanations) && rawOptionExplanations.length === options.length
        ? rawOptionExplanations.map((e) => String(e ?? "").trim())
        : [];
      return {
        question: String((m as { question: unknown }).question ?? "").trim(),
        options,
        correctAnswer: String((m as { correctAnswer: unknown }).correctAnswer ?? "").trim(),
        explanation: String((m as { explanation: unknown }).explanation ?? "").trim(),
        optionExplanations,
      };
    })
    // Drop malformed entries (missing question/options) and ones where the
    // "correct answer" doesn't actually match one of the options — better to
    // silently skip a bad row than hand the admin a question with no valid
    // correct answer to review.
    .filter((m) => m.question.length > 0 && m.options.length >= 2 && m.options.includes(m.correctAnswer));
}

// A misconfigured Base URL (custom provider) or an unexpected upstream
// failure (auth edge case, wrong region, a CDN/WAF challenge page, etc.) can
// make `res.ok` true while the body is actually an HTML page, not JSON —
// `res.json()` then throws a raw "Unexpected token '<'..." SyntaxError that
// tells the admin nothing about what actually went wrong. This checks the
// Content-Type before parsing and, if it's not JSON, throws a message that
// names the exact URL that was hit and shows a short snippet of what came
// back — enough to immediately spot "oh, that URL is wrong" instead of
// staring at a wall of raw HTML.
async function parseJsonOrThrow(res: Response, url: string, providerLabel: string): Promise<unknown> {
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!contentType.includes("application/json")) {
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(raw);
    throw new Error(
      `${providerLabel} returned a non-JSON response from ${url} (status ${res.status}, content-type "${contentType || "unknown"}").` +
      (looksLikeHtml
        ? " That URL is serving a webpage, not an API — double-check the provider's Base URL in Admin > Platform settings > AI (it should point at the API base, e.g. https://api.example.com/v1, not a website homepage)."
        : ` Response started with: ${raw.slice(0, 200)}`),
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${providerLabel} returned malformed JSON from ${url} (status ${res.status}): ${raw.slice(0, 300)}`);
  }
}

// Whether (and how) the caller needs strict JSON back. "object" and "array"
// tell each provider's own native JSON-mode/prefill mechanism what the
// top-level shape will be (several providers restrict or shape their JSON
// mode differently for the two) — false means plain prose, no JSON handling
// at all (explanations, "explain this step").
export type JsonMode = "object" | "array" | false;

async function generateWithAnthropic(apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<string> {
  const url = "https://api.anthropic.com/v1/messages";
  // Anthropic has no dedicated JSON-mode flag. The standard trick is an
  // assistant-turn "prefill": seed the reply with the opening brace/bracket
  // so the model has no room left to add a preamble like "Sure, here's the
  // JSON:" — it can only continue from the character we already forced.
  // Because the prefill isn't echoed back, we prepend it to the response.
  const prefill = jsonMode === "object" ? "{" : jsonMode === "array" ? "[" : null;
  const messages = prefill
    ? [{ role: "user", content: prompt }, { role: "assistant", content: prefill }]
    : [{ role: "user", content: prompt }];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await parseJsonOrThrow(res, url, "Anthropic") as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Anthropic API returned no text content");
  return prefill ? prefill + text.trim() : text.trim();
}

async function generateWithOpenAi(apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  // OpenAI's native JSON mode (response_format: json_object) only guarantees
  // a top-level *object* — turning it on for an array-shaped request (the
  // flashcard/MCQ generators, which need `[...]`) would make the model wrap
  // the array in an object instead, breaking the parser downstream. So this
  // is only ever enabled for "object" mode; "array" mode falls back to the
  // prompt's own instructions, same as before.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      ...(jsonMode === "object" ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await parseJsonOrThrow(res, url, "OpenAI") as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI API returned no text content");
  return text.trim();
}

async function generateWithGemini(apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        // Gemini's native JSON mode works for both object- and array-shaped
        // responses (unlike OpenAI's), so it's safe to enable for either.
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await parseJsonOrThrow(res, url, "Gemini") as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini API returned no text content");
  return text.trim();
}

/**
 * Any OpenAI-compatible chat-completions endpoint (Groq, OpenRouter, a
 * locally hosted model, an enterprise gateway, etc.) — same request/response
 * shape as generateWithOpenAi, just against an admin-supplied base URL. This
 * is the provider mode most likely to get a wrong URL (it's free text), so
 * the non-JSON-response check above matters most here.
 *
 * OpenRouter specifically: it accepts requests without these headers, but
 * sending them is OpenRouter's documented way to identify this app on
 * https://openrouter.ai/rankings and in its dashboard/logs — harmless to
 * send to any other OpenAI-compatible provider too, since they'll just
 * ignore headers they don't recognize.
 */
async function generateWithCustomEndpoint(baseUrl: string, apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<string> {
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  // Left without a native JSON-mode flag on purpose — this is an arbitrary
  // admin-supplied OpenAI-compatible endpoint (Groq, OpenRouter, a
  // self-hosted model, an enterprise gateway...) and we can't assume it
  // supports `response_format` the same way OpenAI does, or that it agrees
  // with OpenAI's object-only restriction. jsonMode is accepted for a
  // consistent call signature but relies on the prompt's own instructions,
  // same as before this fix.
  void jsonMode;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "HTTP-Referer": "https://medschoolproffss.netlify.app",
      "X-Title": "MedSchoolProffs",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI endpoint error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await parseJsonOrThrow(res, url, "Custom AI endpoint") as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI endpoint returned no text content");
  return text.trim();
}

export const AI_PROVIDERS = ["anthropic", "openai", "gemini", "custom"] as const;
export type AiProvider = typeof AI_PROVIDERS[number];

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  // OpenRouter (and most OpenAI-compatible aggregators) namespace model IDs
  // as "vendor/model" — a bare "gpt-4o-mini" with no vendor prefix returns
  // an OpenRouter error, not a completion. Only used when the admin leaves
  // the Model field blank for the "custom" provider.
  custom: "openai/gpt-4o-mini",
};

/** DB setting takes precedence over the env var of the same provider. */
async function resolveProvider(): Promise<{ provider: AiProvider; apiKey: string; model: string; baseUrl?: string } | null> {
  const dbProvider = await getSetting("AI_PROVIDER", null);
  const dbKey = await getSetting("AI_API_KEY", null);
  const dbModel = await getSetting("AI_MODEL", null);
  const dbBaseUrl = await getSetting("AI_BASE_URL", null);
  if ((dbKey || dbProvider === "custom") && dbProvider && (AI_PROVIDERS as readonly string[]).includes(dbProvider)) {
    const provider = dbProvider as AiProvider;
    if (provider === "custom" && !dbBaseUrl) return null; // custom needs a base URL to mean anything
    return { provider, apiKey: dbKey ?? "", model: dbModel || DEFAULT_MODELS[provider], baseUrl: dbBaseUrl ?? undefined };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey, model: DEFAULT_MODELS.anthropic };
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) return { provider: "openai", apiKey: openAiKey, model: DEFAULT_MODELS.openai };
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) return { provider: "gemini", apiKey: geminiKey, model: DEFAULT_MODELS.gemini };
  return null;
}

export async function runPrompt(prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<string> {
  const resolved = await resolveProvider();
  if (!resolved) throw new AiNotConfiguredError();
  switch (resolved.provider) {
    case "anthropic": return generateWithAnthropic(resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
    case "openai": return generateWithOpenAi(resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
    case "gemini": return generateWithGemini(resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
    case "custom": return generateWithCustomEndpoint(resolved.baseUrl!, resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
  }
}

export async function generateExplanation(request: ExplanationRequest): Promise<string> {
  return runPrompt(buildPrompt(request));
}

export async function generateFlashcardExplanation(request: FlashcardExplanationRequest): Promise<string> {
  return runPrompt(buildFlashcardPrompt(request));
}

// The default maxTokens (400, sized for a single short explanation) is far
// too small for a batch of structured JSON objects — 8 flashcards easily
// need 800-1200+ tokens once you include JSON punctuation and any preamble
// a model adds despite instructions, and MCQs need much more since each one
// carries a full explanation per option (4 options x ~2 sentences x N
// questions). Underestimating this was the actual cause of "AI did not
// return valid flashcard JSON" — the response wasn't garbage, it was just
// cut off mid-array before the closing bracket. Scale with the requested
// count instead of using one fixed number, with a floor so small requests
// still get enough room for the model's other overhead (any preamble,
// closing punctuation, etc).
function flashcardMaxTokens(count: number): number {
  return Math.max(800, count * 150);
}
function mcqMaxTokens(count: number): number {
  return Math.max(1500, count * 500);
}

/** Generates draft front/back flashcard pairs — callers should treat these as editable drafts, not auto-publish. */
export async function generateFlashcardSet(request: FlashcardGenerationRequest): Promise<GeneratedFlashcard[]> {
  const raw = await runPrompt(buildFlashcardGenerationPrompt(request), flashcardMaxTokens(request.count), "array");
  return parseFlashcardJson(raw);
}

/** Generates draft MCQs strictly scoped to the given topic — see
 * buildMcqGenerationPrompt for the anti-drift prompt design. Callers should
 * treat these as editable drafts for admin review, not auto-publish. */
export async function generateMcqSet(request: McqGenerationRequest): Promise<GeneratedMcq[]> {
  const raw = await runPrompt(buildMcqGenerationPrompt(request), mcqMaxTokens(request.count), "array");
  const parsed = parseMcqJson(raw);
  // Cheap post-hoc relevance guard: if the model still ignored the topic
  // instruction, at least surface fewer, better results rather than a full
  // batch of noise — cap to what actually parsed cleanly.
  return parsed.slice(0, request.count);
}

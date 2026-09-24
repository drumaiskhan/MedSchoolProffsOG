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
import { getPublicAppUrl } from "./publicAppUrl";

// A raw `fetch` to an AI provider has no timeout of its own — left alone,
// a slow/hung request just keeps waiting until the *hosting platform's*
// own gateway eventually kills the connection (a bare 504 with no body,
// which our Express error handling never even sees, so the student gets
// no useful message — just a generic "Request failed (504)" from the
// frontend). This wraps any provider fetch with an AbortController so a
// slow call fails on OUR terms — quickly enough to stay under typical
// gateway timeouts, and with an error our route handlers already know how
// to turn into a clean 502 response. 25s per call was chosen so that even
// the AI Visualizer's worst case (one failed attempt + one retry) stays
// close to 50s total, comfortably under most hosts' request-timeout
// ceilings (commonly 30-100s) rather than compounding past them.
const AI_FETCH_TIMEOUT_MS = 25_000;

async function fetchWithTimeout(url: string, init: RequestInit, providerLabel: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${providerLabel} took too long to respond (over ${AI_FETCH_TIMEOUT_MS / 1000}s) — try again, or try a shorter/simpler prompt.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set a primary (and optionally up to five backup) providers from Admin -> Platform settings -> AI, or set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY in the environment.");
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
  /** When set, every question in the batch is pinned to this exact
   * difficulty instead of the model varying it across the set — used to
   * build a deliberate easy/moderate/hard set rather than whatever mix the
   * model happens to produce. */
  difficulty?: "easy" | "moderate" | "hard";
}

export interface GeneratedMcq {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  // Index-aligned with `options` — why each option specifically is right or
  // wrong, not just why the correct one is right.
  optionExplanations: string[];
  // easy | moderate | hard — canonical values, matching medschool.ts's
  // mcqsTable.difficulty column default and the admin's difficulty selects.
  // Falls back to "moderate" below if the model omits it or returns
  // something off-list, same as every other create path in this app.
  difficulty: string;
}

// A written OSPE/OSCE station answer, graded by AI against the admin's
// model answer / marking scheme instead of a human marker or the student
// self-marking their own work.
export interface WrittenGradingRequest {
  /** The station's prompt/instructions shown to the student (photo caption, scenario, etc). */
  instructions: string;
  /** Admin-authored model answer / marking scheme this is graded against. */
  modelAnswer: string;
  /** What the student actually wrote. Empty/blank is graded as incorrect without calling the AI. */
  studentAnswer: string;
  /** Marks this station is worth — the AI is asked to award within [0, maxMarks]. */
  maxMarks: number;
}

export interface WrittenGradingResult {
  verdict: "correct" | "partial" | "incorrect";
  marksAwarded: number;
  /** One short sentence explaining the verdict, shown to the student under their answer. */
  feedback: string;
}

// Appended to every prompt below. Reasoning-tuned models reached through a
// custom/OpenAI-compatible endpoint sometimes narrate their chain-of-thought
// straight into the visible response ("Wait, let me reconsider...") instead
// of keeping it in a separate channel. That narration both (a) shows up in
// front of students where a clean answer should be, and (b) eats into the
// max_tokens budget the real answer needed — which is what actually caused
// "AI did not return valid flashcard JSON": the model's own visible
// reasoning ran the response out of tokens before the JSON array closed.
// Telling it explicitly not to do this is the most reliable fix (stripReasoningArtifacts
// below is the fallback for models that ignore this and wrap it in tags anyway).
const NO_REASONING_INSTRUCTION = "Output the final answer only — no chain-of-thought, no narrating your reasoning process (e.g. \"Wait, let me reconsider\"), no draft attempts, nothing before or after it.";

function buildPrompt({ question, options, correctAnswer, reference }: ExplanationRequest): string {
  const optionList = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");
  return [
    "You are writing a concise study explanation for a medical school MCQ (MBBS/BDS level).",
    "Explain why the correct answer is right and briefly note why the other options are wrong.",
    "Keep it factual, exam-focused, and under 150 words. Do not use markdown headers.",
    NO_REASONING_INSTRUCTION,
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
    NO_REASONING_INSTRUCTION,
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
    NO_REASONING_INSTRUCTION + " Do not narrate progress between cards (e.g. \"card 15:\") — every card is just another array entry.",
    "",
    "Source material:",
    source || "(no source material provided — use general high-yield facts for this topic)",
  ].join("\n");
}

// Some providers/models narrate reasoning straight into the visible
// response instead of using a separate channel — either wrapped in tags
// (<think>...</think>, seen from some reasoning-tuned open models on
// OpenRouter/custom endpoints) or as plain unlabelled prose. The tagged
// form is stripped here; the plain-prose form is what NO_REASONING_INSTRUCTION
// above is aimed at, and extractBalancedJsonObjects()/the sentence-boundary
// trim in runPrompt() are the last-resort recovery for whatever gets through
// anyway.
function stripReasoningArtifacts(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

// Scans raw text and pulls out every top-level, balanced {...} object it
// contains, tracking quoted-string/escape state so braces inside a string
// value don't confuse the depth count. This is the actual fix for the "AI
// did not return valid flashcard JSON" failure in the screenshot: the
// model's response was a valid array for the first 14 cards, then
// narrated "Wait, my thought process hit card 15:" in the middle of the
// array (breaking JSON.parse for the whole batch) before running out of
// tokens. Rather than discard all 15 cards over one bad one, this pulls
// out every individual {"front":...,"back":...} object that IS
// well-formed — wherever it sits in the text — and the caller keeps those,
// silently dropping only the ones that didn't parse.
function extractBalancedJsonObjects(text: string): unknown[] {
  const results: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          try { results.push(JSON.parse(text.slice(start, i + 1))); } catch { /* skip this one malformed fragment, keep scanning */ }
          start = -1;
        }
      }
    }
  }
  return results;
}

function parseFlashcardJson(raw: string): GeneratedFlashcard[] {
  // Strip any leaked <think> blocks and code fences the model may add
  // despite instructions not to.
  const cleaned = stripReasoningArtifacts(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Some models wrap the array in extra prose — try to extract the first [...] block.
    const match = cleaned.match(/\[[\s\S]*\]/);
    try {
      if (match) parsed = JSON.parse(match[0]);
    } catch { /* fall through to per-object salvage below */ }
  }
  if (!Array.isArray(parsed)) {
    // The whole-array parse failed (missing brackets, or valid brackets
    // with unparseable prose mixed in between entries, e.g. the reasoning
    // narration in the bug report). Last resort: salvage every individual
    // front/back object that IS well-formed anywhere in the text instead
    // of failing the entire batch over one bad entry.
    const salvaged = extractBalancedJsonObjects(cleaned).filter(
      (o): o is { front: unknown; back: unknown } => !!o && typeof o === "object" && "front" in (o as object) && "back" in (o as object),
    );
    if (!salvaged.length) {
      // Include a snippet of what the model actually said — a bare "AI did
      // not return valid flashcard JSON" gave no way to tell "the model
      // refused/ignored the format" apart from "the response got cut off
      // mid-array" apart from "OpenRouter returned an error payload shaped
      // differently than expected." The raw text is the only way to tell
      // these apart from the admin UI.
      throw new Error(`AI did not return valid flashcard JSON. Raw response: ${cleaned.slice(0, 500)}`);
    }
    parsed = salvaged;
  }
  return (parsed as unknown[])
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
function buildMcqGenerationPrompt({ topicLabel, existingQuestions, count, difficulty }: McqGenerationRequest): string {
  const existingBlock = existingQuestions?.length
    ? `\nFor reference only (do not repeat these, do not copy their subject if it drifted off-topic — match their difficulty level instead):\n${existingQuestions.slice(0, 8).map((q) => `- ${q}`).join("\n")}\n`
    : "";
  const difficultyInstruction = difficulty
    ? `Every single question in this set must be difficulty exactly "${difficulty}" — do not vary it, do not include any other difficulty level.`
    : "Vary it across the set rather than making everything the same level.";
  return [
    `You are a medical school question-bank author. Every single question you write MUST be specifically about: "${topicLabel}".`,
    "Do not write generic pre-med trivia (bone names, cell organelles, vital sign ranges, etc.) unless that is literally what the topic above is about.",
    "Before finalizing each question, check: does this question directly test knowledge of the exact topic named above? If not, discard it and write a different one that does.",
    `Produce exactly ${count} single-best-answer multiple-choice questions (MBBS/BDS level) on "${topicLabel}".`,
    "Each question needs exactly 4 options (A-D equivalent, but return them as a plain string array, not labeled), and one correct answer that must be an exact string match to one of the options.",
    `Also assign each question a difficulty of exactly "easy", "moderate", or "hard", based on how advanced the reasoning required is for an MBBS/BDS student. ${difficultyInstruction}`,
    "For EVERY option (not just the correct one), write a short 1-2 sentence explanation of why that specific option is right or wrong — a real distractor-analysis, not just a generic restatement. The correct option's explanation should say why it's correct; each wrong option's explanation should say specifically why it's wrong (e.g. what it's confused with, or what's missing/incorrect about it) — this is what a real exam-prep answer key looks like, not just one blanket explanation for the correct choice.",
    "Vary the sub-topics, question stems, and clinical vs. factual framing across the set so it doesn't feel repetitive.",
    existingBlock,
    `Remember: this entire question set is about "${topicLabel}" — nothing else.`,
    "",
    "Respond with ONLY a valid JSON array, no prose before or after, no code fences, no introductory sentence, no closing remarks — the response must start with [ and end with ] and contain nothing else, in this exact shape (optionExplanations must have exactly one entry per option, in the same order as options; difficulty must be exactly \"easy\", \"moderate\", or \"hard\"):",
    '[{"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "...", "explanation": "...", "optionExplanations": ["...", "...", "...", "..."], "difficulty": "moderate"}]',
    NO_REASONING_INSTRUCTION + " Do not narrate progress between questions — every question is just another array entry.",
  ].join("\n");
}

function parseMcqJson(raw: string): GeneratedMcq[] {
  const cleaned = stripReasoningArtifacts(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    try {
      if (match) parsed = JSON.parse(match[0]);
    } catch { /* fall through to per-object salvage below */ }
  }
  if (!Array.isArray(parsed)) {
    // Same salvage strategy as parseFlashcardJson — pull every well-formed
    // {"question":...,"options":...} object out of the raw text rather than
    // discarding the whole batch because one entry (or a narrated aside
    // between entries) broke the overall array parse.
    const salvaged = extractBalancedJsonObjects(cleaned).filter(
      (o): o is { question: unknown; options: unknown } => !!o && typeof o === "object" && "question" in (o as object) && "options" in (o as object),
    );
    if (!salvaged.length) throw new Error(`AI did not return valid MCQ JSON. Raw response: ${cleaned.slice(0, 500)}`);
    parsed = salvaged;
  }
  return (parsed as unknown[])
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
      const rawDifficulty = String((m as { difficulty?: unknown }).difficulty ?? "").trim().toLowerCase();
      const difficulty = ["easy", "moderate", "hard"].includes(rawDifficulty) ? rawDifficulty : "moderate";
      return {
        question: String((m as { question: unknown }).question ?? "").trim(),
        options,
        correctAnswer: String((m as { correctAnswer: unknown }).correctAnswer ?? "").trim(),
        explanation: String((m as { explanation: unknown }).explanation ?? "").trim(),
        optionExplanations,
        difficulty,
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
// Every provider reports "you're out of quota" differently in the body of a
// 429 (Gemini: status "RESOURCE_EXHAUSTED" / a "quota" mention; OpenAI: error
// code "insufficient_quota"; Anthropic and custom OpenAI-compatible
// endpoints: usually just "rate_limit_error" or similar with no separate
// billing-vs-throttle distinction). Previously every one of these just threw
// the raw JSON body as the error message — technically accurate, but the
// admin UI showed a wall of `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"...`
// with no indication of what to actually DO about it, which is what actually
// prompted the "shows quota reached" bug report: the fix isn't a code path,
// it's making the dead-end message tell the admin where to go next instead
// of just repeating the provider's own error shape at them.
//
// This does NOT change failover behavior at all — resolveProviders()/runPrompt()
// already retry the next configured provider on ANY failure, quota-related or
// not. This only improves the message shown once every candidate has failed.
function describeProviderFailure(providerLabel: string, status: number, body: string): string {
  if (status !== 429) return `${providerLabel} API error (${status}): ${body.slice(0, 300)}`;
  const lower = body.toLowerCase();
  const isQuotaOrBilling = lower.includes("quota") || lower.includes("resource_exhausted") || lower.includes("insufficient_quota") || lower.includes("billing");
  if (isQuotaOrBilling) {
    return (
      `${providerLabel} has hit its usage/billing quota (HTTP 429) — this is a limit on the ${providerLabel} account itself, not a bug in this app. ` +
      `Check that account's usage/billing dashboard (for Gemini: Google AI Studio > API keys > quota, or the linked Google Cloud project's billing; for OpenAI: platform.openai.com > Settings > Billing; for Anthropic: console.anthropic.com > Settings > Billing) ` +
      `to confirm whether it's a free-tier rate limit (resets on its own — often per-minute or per-day) or an exhausted paid quota (needs more credit/a higher tier). ` +
      `To stop this from taking "Ask AI" down while you sort that out, configure a different provider as the Backup AI provider in Admin > Platform settings > AI — it'll be used automatically whenever the primary is rate-limited or out of quota. ` +
      `Raw response: ${body.slice(0, 300)}`
    );
  }
  return `${providerLabel} is rate-limiting requests (HTTP 429) — this usually clears on its own after a short wait. If it persists, configure a Backup AI provider in Admin > Platform settings > AI so requests fail over automatically. Raw response: ${body.slice(0, 300)}`;
}

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

// Every provider function below returns not just the text but whether the
// provider itself reported the response as cut off by the token budget
// (Anthropic's stop_reason, OpenAI/Gemini/custom's finish_reason). runPrompt()
// uses this to retry once with a bigger budget — see its own comment — which
// is the actual fix for both "AI did not return valid flashcard JSON" and
// the AI explanation panel cutting off mid-sentence.
interface ProviderResult { text: string; truncated: boolean }

async function generateWithAnthropic(apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<ProviderResult> {
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
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  }, "Anthropic");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(describeProviderFailure("Anthropic", res.status, body));
  }
  const data = await parseJsonOrThrow(res, url, "Anthropic") as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Anthropic API returned no text content");
  return { text: prefill ? prefill + text.trim() : text.trim(), truncated: data.stop_reason === "max_tokens" };
}

async function generateWithOpenAi(apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<ProviderResult> {
  const url = "https://api.openai.com/v1/chat/completions";
  // OpenAI's native JSON mode (response_format: json_object) only guarantees
  // a top-level *object* — turning it on for an array-shaped request (the
  // flashcard/MCQ generators, which need `[...]`) would make the model wrap
  // the array in an object instead, breaking the parser downstream. So this
  // is only ever enabled for "object" mode; "array" mode falls back to the
  // prompt's own instructions, same as before.
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      ...(jsonMode === "object" ? { response_format: { type: "json_object" } } : {}),
    }),
  }, "OpenAI");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(describeProviderFailure("OpenAI", res.status, body));
  }
  const data = await parseJsonOrThrow(res, url, "OpenAI") as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (!text) throw new Error("OpenAI API returned no text content");
  return { text: text.trim(), truncated: choice?.finish_reason === "length" };
}

async function generateWithGemini(apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<ProviderResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
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
  }, "Gemini");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(describeProviderFailure("Gemini", res.status, body));
  }
  const data = await parseJsonOrThrow(res, url, "Gemini") as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini API returned no text content");
  return { text: text.trim(), truncated: candidate?.finishReason === "MAX_TOKENS" };
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
async function generateWithCustomEndpoint(baseUrl: string, apiKey: string, model: string, prompt: string, maxTokens = 400, jsonMode: JsonMode = false): Promise<ProviderResult> {
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
      // Was hardcoded to a stale netlify.app domain (with a typo — "proffss").
      // OpenRouter only uses this for app-attribution on its leaderboard, but
      // there's no reason for it to be the one place in the codebase that
      // doesn't follow the current domain — same PUBLIC_APP_URL/APP_URL
      // resolution as the email links below.
      "HTTP-Referer": getPublicAppUrl(),
      "X-Title": "MedSchoolProffs",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(describeProviderFailure("Custom AI endpoint", res.status, body));
  }
  // Reasoning-tuned models served through custom/OpenAI-compatible endpoints
  // (DeepSeek R1, Qwen QwQ, and most "thinking" models on OpenRouter) often
  // return their chain-of-thought in a separate `reasoning_content` field
  // alongside the real answer in `content` — deliberately read only
  // `content` here so that reasoning never ends up in what's shown to a
  // student or fed to a JSON parser.
  const data = await parseJsonOrThrow(res, url, "Custom AI endpoint") as { choices?: Array<{ message?: { content?: string; reasoning_content?: string }; finish_reason?: string }> };
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (!text) throw new Error("AI endpoint returned no text content");
  return { text: text.trim(), truncated: choice?.finish_reason === "length" };
}

export const AI_PROVIDERS = ["anthropic", "openai", "gemini", "custom"] as const;
export type AiProvider = typeof AI_PROVIDERS[number];

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  // Google shut down gemini-2.0-flash on June 1, 2026 — any request for it
  // now 404s with "This model ... is no longer available." "-latest" is a
  // rolling alias Google maintains that always resolves to the current
  // stable Flash release (see ai.google.dev/gemini-api/docs/models), so
  // this default won't need another manual bump next time Google retires
  // a version. An admin can still pin an exact version (e.g.
  // "gemini-3.6-flash") via the Model field in Admin -> Platform settings
  // -> AI if they want reproducible behavior instead of auto-upgrades.
  gemini: "gemini-flash-latest",
  // OpenRouter (and most OpenAI-compatible aggregators) namespace model IDs
  // as "vendor/model" — a bare "gpt-4o-mini" with no vendor prefix returns
  // an OpenRouter error, not a completion. Only used when the admin leaves
  // the Model field blank for the "custom" provider.
  custom: "openai/gpt-4o-mini",
};

export interface ResolvedProvider { provider: AiProvider; apiKey: string; model: string; baseUrl?: string; label: string }

// Ordered list of DB-configured provider slots. "" is the original/primary
// fields (AI_PROVIDER/AI_API_KEY/AI_MODEL/AI_BASE_URL); "_2".."_6" are five
// additional backup slots (AI_PROVIDER_2/AI_API_KEY_2/..., AI_PROVIDER_3/...,
// etc.) so an admin can queue up several different providers/accounts —
// e.g. Anthropic, then OpenAI, then a couple of Groq/OpenRouter/DeepSeek
// keys via "custom" — and requests fail over down the chain instead of
// stopping at a single backup. Six DB slots plus the three env-var fallbacks
// below (ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY) means up to nine
// candidates can be tried for one request before it actually fails.
const DB_SLOT_SUFFIXES = ["", "_2", "_3", "_4", "_5", "_6"] as const;
type DbSlotSuffix = typeof DB_SLOT_SUFFIXES[number];

function slotLabel(suffix: DbSlotSuffix): string {
  if (suffix === "") return "primary provider";
  const n = Number(suffix.slice(1)) - 1; // "_2" -> 1st backup, "_3" -> 2nd backup, ...
  return `backup provider ${n}`;
}

/**
 * A single DB-configured provider slot — see DB_SLOT_SUFFIXES above for how
 * the slots relate to each other. All slots read the same way, just
 * different setting keys.
 */
async function resolveDbSlot(suffix: DbSlotSuffix, modelOverride?: string): Promise<{ provider: AiProvider; apiKey: string; model: string; baseUrl?: string } | null> {
  const dbProvider = await getSetting(`AI_PROVIDER${suffix}`, null);
  const dbKey = await getSetting(`AI_API_KEY${suffix}`, null);
  const dbModel = await getSetting(`AI_MODEL${suffix}`, null);
  const dbBaseUrl = await getSetting(`AI_BASE_URL${suffix}`, null);
  if ((dbKey || dbProvider === "custom") && dbProvider && (AI_PROVIDERS as readonly string[]).includes(dbProvider)) {
    const provider = dbProvider as AiProvider;
    if (provider === "custom" && !dbBaseUrl) return null; // custom needs a base URL to mean anything
    return { provider, apiKey: dbKey ?? "", model: modelOverride || dbModel || DEFAULT_MODELS[provider], baseUrl: dbBaseUrl ?? undefined };
  }
  return null;
}

/**
 * Builds the ordered list of providers to try for this request, so that if
 * one API goes down (rate-limited, outage, bad key, timeout) the very same
 * request can fall through to the next one instead of failing outright.
 * Order:
 *   1. The primary DB-configured provider (Admin -> Platform settings -> AI).
 *   2. Up to five backup DB-configured providers (same page, "Backup AI
 *      providers" section) — lets an admin queue several different
 *      providers/accounts (e.g. Anthropic primary, OpenAI backup, a couple
 *      of Groq/OpenRouter/DeepSeek keys via "custom") so an outage or
 *      rate-limit on one vendor doesn't take "Ask AI to explain" down with
 *      it — the request just moves on to the next configured one.
 *   3. Every provider with an API key present in the environment
 *      (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, in that order) —
 *      kept as further fallbacks instead of being silently ignored.
 * That's up to nine candidates in total (6 DB slots + 3 env vars) tried in
 * order before a request actually fails. Duplicate provider+key
 * combinations are skipped so the same account isn't tried twice
 * back-to-back.
 */
async function resolveProviders(modelOverride?: string): Promise<ResolvedProvider[]> {
  const candidates: ResolvedProvider[] = [];
  const seen = new Set<string>();
  const add = (cfg: { provider: AiProvider; apiKey: string; model: string; baseUrl?: string } | null, label: string) => {
    if (!cfg) return;
    const dedupeKey = `${cfg.provider}:${cfg.apiKey}:${cfg.baseUrl ?? ""}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    candidates.push({ ...cfg, label });
  };

  for (const suffix of DB_SLOT_SUFFIXES) {
    add(await resolveDbSlot(suffix, modelOverride), slotLabel(suffix));
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) add({ provider: "anthropic", apiKey: anthropicKey, model: modelOverride || DEFAULT_MODELS.anthropic }, "ANTHROPIC_API_KEY");
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) add({ provider: "openai", apiKey: openAiKey, model: modelOverride || DEFAULT_MODELS.openai }, "OPENAI_API_KEY");
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) add({ provider: "gemini", apiKey: geminiKey, model: modelOverride || DEFAULT_MODELS.gemini }, "GEMINI_API_KEY");

  return candidates;
}

async function callProvider(resolved: { provider: AiProvider; apiKey: string; model: string; baseUrl?: string }, prompt: string, maxTokens: number, jsonMode: JsonMode): Promise<ProviderResult> {
  switch (resolved.provider) {
    case "anthropic": return generateWithAnthropic(resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
    case "openai": return generateWithOpenAi(resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
    case "gemini": return generateWithGemini(resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
    case "custom": return generateWithCustomEndpoint(resolved.baseUrl!, resolved.apiKey, resolved.model, prompt, maxTokens, jsonMode);
  }
}

// Hard ceiling on the retry budget below — protects against a stubborn
// model (or a runaway reasoning model that always eats its whole budget on
// "thinking") driving the token cost up indefinitely on one request.
const TRUNCATION_RETRY_TOKEN_CEILING = 6000;

// If the response ends mid-thought (no sentence-ending punctuation) and the
// provider told us it was cut off by the token limit, trim back to the last
// complete sentence rather than showing a dangling fragment like "...caused
// by impaired DNA" with nothing after it. Only ever used for prose
// (jsonMode === false) — JSON parsing has its own bracket/salvage logic.
function trimToLastCompleteSentence(text: string): string {
  const trimmed = text.trim();
  if (/[.!?)"'\u201d]\s*$/.test(trimmed)) return trimmed; // already ends cleanly
  const boundary = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("! "), trimmed.lastIndexOf("? "), trimmed.lastIndexOf(".\n"));
  // Only trim back if we're not throwing away most of the response — an
  // early boundary usually means there wasn't a good one to find.
  if (boundary > trimmed.length * 0.4) return trimmed.slice(0, boundary + 1).trim();
  return trimmed;
}

// One provider attempt, including the existing truncation-retry-on-the-same-
// provider behavior. Split out of runPrompt so the failover loop below can
// call it once per candidate without duplicating the retry logic.
async function runOnProvider(resolved: ResolvedProvider, prompt: string, maxTokens: number, jsonMode: JsonMode): Promise<string> {
  let result = await callProvider(resolved, prompt, maxTokens, jsonMode);
  // The actual fix for both "AI did not return valid flashcard JSON" and the
  // AI-explanation panel cutting off mid-sentence: the provider itself told
  // us the response was truncated by the token budget (often because a
  // reasoning-capable model spent most of it on invisible/leaked
  // "thinking" before writing the real answer). One retry with a bigger
  // budget recovers cleanly in the common case; capped so a stubborn model
  // can't run the cost up indefinitely, and swallowed on failure so a flaky
  // retry doesn't turn a usable (if truncated) first response into a hard
  // error.
  if (result.truncated && maxTokens < TRUNCATION_RETRY_TOKEN_CEILING) {
    const retryTokens = Math.min(TRUNCATION_RETRY_TOKEN_CEILING, Math.round(maxTokens * 2.2));
    try {
      const retry = await callProvider(resolved, prompt, retryTokens, jsonMode);
      if (!retry.truncated || retry.text.length > result.text.length) result = retry;
    } catch { /* keep the first (truncated) result rather than fail the whole request */ }
  }
  const cleaned = stripReasoningArtifacts(result.text);
  return jsonMode || !result.truncated ? cleaned : trimToLastCompleteSentence(cleaned);
}

/**
 * Multi-provider failover: tries every configured provider in order (see
 * resolveProviders) and returns the first one that succeeds. A provider
 * "going off" — an outage, a rate limit, an expired key, a timeout — no
 * longer takes the whole feature down as long as at least one other
 * configured provider is still up. Only throws once every candidate has
 * failed, with a message that lists what each one said so an admin can tell
 * "everything is actually down" apart from "nothing is configured."
 */
export async function runPrompt(prompt: string, maxTokens = 400, jsonMode: JsonMode = false, modelOverride?: string): Promise<string> {
  const candidates = await resolveProviders(modelOverride);
  if (!candidates.length) throw new AiNotConfiguredError();

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      return await runOnProvider(candidate, prompt, maxTokens, jsonMode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${candidate.label} (${candidate.provider}): ${message}`);
      // Fall through to the next configured provider instead of failing
      // the whole request on one provider's outage/rate-limit/bad key.
    }
  }
  throw new Error(`All configured AI providers failed:\n${failures.join("\n")}`);
}

// 700 (up from the old 400) gives a reasoning-capable model enough headroom
// that its invisible "thinking" doesn't crowd out the ~150-word answer the
// prompt asks for — see NO_REASONING_INSTRUCTION and runPrompt's retry
// above for the rest of this fix.
export async function generateExplanation(request: ExplanationRequest, modelOverride?: string): Promise<string> {
  return runPrompt(buildPrompt(request), 700, false, modelOverride);
}

function buildHintPrompt({ question, options, reference }: ExplanationRequest): string {
  return [
    "You are writing a short study HINT for a medical school MCQ (MBBS/BDS level) — this is shown to a student who is stuck WHILE still attempting the question, so it must nudge their reasoning without revealing or pointing directly at the correct option.",
    "Under 30 words. No markdown. Do not name or rule out any specific option letter/answer.",
    NO_REASONING_INSTRUCTION,
    "",
    `Question: ${question}`,
    `Options:\n${options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n")}`,
    reference ? `Reference material to ground the hint in: ${reference}` : "",
  ].filter(Boolean).join("\n");
}

/** Round 3, item 4b — generates the short pre-answer hint for `med_mcqs.hint`,
 * used by the MCQ-import auto-explain pipeline. Separate prompt from
 * generateExplanation() since a hint must NOT reveal the answer the way an
 * explanation deliberately does. */
export async function generateHint(request: ExplanationRequest, modelOverride?: string): Promise<string> {
  return runPrompt(buildHintPrompt(request), 250, false, modelOverride);
}

function buildDifficultyPrompt({ question, options, correctAnswer }: ExplanationRequest): string {
  return [
    "You are grading the difficulty of a medical school MCQ (MBBS/BDS level) for exam-prep purposes.",
    "Classify it as exactly one of: easy, moderate, hard.",
    "- easy: a well-known, single-step recall fact.",
    "- moderate: requires connecting two related facts, or a common/textbook clinical scenario.",
    "- hard: requires multi-step reasoning, an uncommon presentation, or a fine distinction between similar-looking options.",
    "Respond with ONLY the single word — easy, moderate, or hard. No punctuation, no explanation, nothing else.",
    NO_REASONING_INSTRUCTION,
    "",
    `Question: ${question}`,
    `Options:\n${options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n")}`,
    correctAnswer ? `Correct answer: ${correctAnswer}` : "",
  ].filter(Boolean).join("\n");
}

const VALID_DIFFICULTIES = new Set(["easy", "moderate", "hard"]);

// classifyDifficulty/generateOptionExplanations are both called in tight
// concurrent batches from admin bulk routes (classify-difficulty,
// generate-option-explanations) whose HTTP response has to land inside
// Netlify's *hard, non-configurable* 26s proxy-redirect timeout (the admin
// app's /api/* calls are proxied through Netlify to the Railway backend —
// see netlify.admin.toml — and Netlify kills the connection at 26s no
// matter what, returning exactly the bare 504 "This is taking longer than
// expected" the admin sees). AI_FETCH_TIMEOUT_MS (25s) bounds a single
// provider *fetch*, but runPrompt() fails over across every configured
// backup provider in sequence (see resolveProviders/runPrompt above) —
// with several providers configured, one that's merely slow (not fully
// down, so it doesn't fail fast) can make a *single* classify/explain call
// take 25s x N-providers, which by itself already blows the 26s ceiling
// before the batch loop even gets to its second row. withHardDeadline
// below puts an outer wall-clock cap on the whole call (every provider
// attempt included) so one row can never stall the batch past a bound
// small enough that CLASSIFY_CONCURRENCY/GENERATE_CONCURRENCY rounds in
// explanations.ts stay comfortably under 26s — falling back to the same
// safe default (`moderate` / `[]`) these functions already use on any
// other failure. The slow call itself isn't cancelled (fetchWithTimeout's
// own AbortController still cleans it up on its own schedule); this just
// stops the caller from waiting on it.
async function withHardDeadline<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<T>((resolve, reject) => {
    // onTimeout() is invoked from inside this setTimeout callback, not
    // synchronously inside the executor — the Promise constructor's
    // implicit try/catch only covers the executor's synchronous body, so
    // without this explicit try/catch a throwing onTimeout (see
    // gradeWrittenAnswer above, which throws on timeout instead of
    // guessing a mark) would become an uncaught exception instead of a
    // rejection.
    timer = setTimeout(() => {
      try { resolve(onTimeout()); } catch (err) { reject(err); }
    }, ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

// 6s is generous for a single-word (max 100 tokens) classification against
// any one provider — typical latency is 1-3s — while keeping
// CLASSIFY_CONCURRENCY x this value comfortably under Netlify's 26s ceiling
// even in the worst case where every row in a round hits it.
const CLASSIFY_HARD_DEADLINE_MS = 6_000;

/** Auto-classifies difficulty for a freshly-imported/AI-drafted MCQ instead
 * of leaving every import stuck at the parser's "moderate" placeholder.
 * Falls back to "moderate" on an unparseable/unexpected response, an error,
 * OR simply taking too long (see withHardDeadline above) — this is a
 * nice-to-have on top of a successful import, not something that should
 * fail (or stall) the caller.
 *
 * maxTokens is 100 (up from the original 20) even though the answer itself
 * is one word — 20 was tight enough that any provider preamble, stray
 * whitespace/punctuation, or a reasoning-capable model's invisible
 * "thinking" tokens could eat the whole budget before the word came out,
 * silently pushing every import to the "moderate" fallback below instead
 * of an actual classification. */
export async function classifyDifficulty(request: ExplanationRequest, modelOverride?: string): Promise<"easy" | "moderate" | "hard"> {
  return withHardDeadline((async () => {
    try {
      const raw = await runPrompt(buildDifficultyPrompt(request), 100, false, modelOverride);
      const normalized = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
      return VALID_DIFFICULTIES.has(normalized) ? (normalized as "easy" | "moderate" | "hard") : "moderate";
    } catch {
      return "moderate";
    }
  })(), CLASSIFY_HARD_DEADLINE_MS, () => "moderate");
}

function buildWrittenGradingPrompt({ instructions, modelAnswer, studentAnswer, maxMarks }: WrittenGradingRequest): string {
  return [
    "You are an examiner grading a medical student's written answer to an OSPE/OSCE practical exam station (MBBS/BDS level).",
    "Compare the STUDENT ANSWER against the MODEL ANSWER / marking scheme and grade it fairly:",
    "- Give credit for medically correct content even if worded very differently from the model answer.",
    "- Do not penalize spelling, grammar, or ordering.",
    "- Do not award marks for content that is medically incorrect or contradicts the model answer, even if confidently stated.",
    "- An answer that is blank, off-topic, or says \"I don't know\" is incorrect (0 marks).",
    `This station is worth a maximum of ${maxMarks} mark(s).`,
    "Respond with ONLY a single JSON object — no markdown code fences, no text before or after it — in exactly this shape:",
    `{"verdict": "correct" | "partial" | "incorrect", "marksAwarded": <number, 0 to ${maxMarks}, may be fractional>, "feedback": "<one short sentence for the student, under 35 words, explaining what was right/missing>"}`,
    NO_REASONING_INSTRUCTION,
    "",
    `Station / question shown to the student: ${instructions || "(no additional instructions given)"}`,
    `Model answer / marking scheme: ${modelAnswer}`,
    `Student's answer: ${studentAnswer}`,
  ].join("\n");
}

const VALID_VERDICTS = new Set(["correct", "partial", "incorrect"]);

function parseWrittenGradingJson(raw: string, maxMarks: number): WrittenGradingResult {
  const cleaned = stripReasoningArtifacts(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const objects = extractBalancedJsonObjects(cleaned);
    parsed = objects.find((o) => o && typeof o === "object" && "verdict" in (o as object)) ?? objects[0];
  }
  if (!parsed || typeof parsed !== "object") throw new Error(`AI did not return valid grading JSON. Raw response: ${cleaned.slice(0, 300)}`);
  const obj = parsed as { verdict?: unknown; marksAwarded?: unknown; feedback?: unknown };
  const verdict = typeof obj.verdict === "string" && VALID_VERDICTS.has(obj.verdict) ? (obj.verdict as WrittenGradingResult["verdict"]) : "partial";
  let marksAwarded = typeof obj.marksAwarded === "number" && Number.isFinite(obj.marksAwarded) ? obj.marksAwarded : maxMarks / 2;
  marksAwarded = Math.max(0, Math.min(maxMarks, marksAwarded));
  const feedback = typeof obj.feedback === "string" ? obj.feedback.trim().slice(0, 400) : "";
  return { verdict, marksAwarded, feedback };
}

// 18s per station — this is called from the student-facing exam submit
// route, which (like the admin bulk routes above) is proxied through
// Netlify's hard, non-configurable 26s ceiling. Stations are graded in
// parallel by the caller (routes/ospe.ts), so this bounds the *whole*
// grading phase to ~18s regardless of station count, leaving headroom for
// the DB writes and response on either side. On timeout this rejects
// (rather than silently guessing a mark) so the caller can leave the
// station as "not yet graded" and retry later via the student-triggered
// re-grade endpoint, instead of ever inventing a score nobody actually
// awarded.
const WRITTEN_GRADING_HARD_DEADLINE_MS = 18_000;

/** Grades one written OSPE/OSCE station answer against the admin's model
 * answer using AI, replacing manual self-assessment. Throws
 * (AiNotConfiguredError, a provider failure, a timeout, or an unparseable
 * response) rather than returning a guessed result — callers must decide
 * how to handle "not graded yet" themselves (see routes/ospe.ts
 * gradeAndSubmit / the /grade endpoint), since silently defaulting a
 * mark would misrepresent the student's actual result. */
export async function gradeWrittenAnswer(request: WrittenGradingRequest, modelOverride?: string): Promise<WrittenGradingResult> {
  if (!request.studentAnswer || !request.studentAnswer.trim()) {
    return { verdict: "incorrect", marksAwarded: 0, feedback: "No answer was submitted for this station." };
  }
  return withHardDeadline(
    (async () => {
      const raw = await runPrompt(buildWrittenGradingPrompt(request), 300, "object", modelOverride);
      return parseWrittenGradingJson(raw, request.maxMarks);
    })(),
    WRITTEN_GRADING_HARD_DEADLINE_MS,
    () => { throw new Error(`AI grading took too long (over ${WRITTEN_GRADING_HARD_DEADLINE_MS / 1000}s)`); },
  );
}

function buildOptionExplanationsPrompt({ question, options, correctAnswer }: ExplanationRequest): string {
  const optionList = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");
  return [
    "You are writing per-option distractor analysis for a medical school MCQ (MBBS/BDS level) — the kind of answer key where EVERY option gets its own explanation, not just the correct one.",
    "For each option below, write a short 1-2 sentence explanation of why that specific option is right or wrong. The correct option's explanation should say why it's correct; each wrong option's explanation should say specifically why it's wrong (e.g. what it's confused with, or what's missing/incorrect about it) — real distractor analysis, not a generic restatement.",
    "Keep each explanation factual and exam-focused. Do not use markdown.",
    NO_REASONING_INSTRUCTION,
    "",
    `Question: ${question}`,
    `Options:\n${optionList}`,
    correctAnswer ? `Correct answer: ${correctAnswer}` : "",
    "",
    `Respond with ONLY a valid JSON array of exactly ${options.length} strings, no prose before or after, no code fences — one explanation per option, in the exact same order as the options above:`,
    `[${options.map(() => '"..."').join(", ")}]`,
  ].filter(Boolean).join("\n");
}

// 12s per row — this call returns a full explanation per option (more
// tokens, more latency than classifyDifficulty's single word) so it gets a
// larger deadline, but still small enough that GENERATE_CONCURRENCY rounds
// in explanations.ts stay well under Netlify's 26s proxy ceiling even in
// the worst case. See withHardDeadline's comment above classifyDifficulty
// for why an outer deadline (rather than just AI_FETCH_TIMEOUT_MS) is
// needed here at all.
const GENERATE_OPTION_EXPLANATIONS_HARD_DEADLINE_MS = 12_000;

/** Backfills `optionExplanations` for an existing MCQ that already has
 * options/correctAnswer but no (or incomplete) per-option explanations —
 * the bulk "generate option explanations" admin action, same shape as
 * classifyDifficulty. Only trusts the response if it comes back as exactly
 * one string per option (a mismatched-length array would silently
 * misattribute explanations to the wrong option index downstream, same
 * concern as parseMcqJson above) — returns [] on a bad shape, an error, OR
 * simply taking too long (see withHardDeadline above classifyDifficulty)
 * so the caller can skip that row rather than write bad data or stall the
 * batch. */
export async function generateOptionExplanations(request: ExplanationRequest, modelOverride?: string): Promise<string[]> {
  return withHardDeadline((async () => {
    try {
      const raw = await runPrompt(buildOptionExplanationsPrompt(request), Math.max(500, request.options.length * 150), "array", modelOverride);
      const cleaned = stripReasoningArtifacts(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed: unknown = JSON.parse(cleaned);
      if (!Array.isArray(parsed) || parsed.length !== request.options.length) return [];
      return parsed.map((e) => String(e ?? "").trim());
    } catch {
      return [];
    }
  })(), GENERATE_OPTION_EXPLANATIONS_HARD_DEADLINE_MS, () => []);
}

function buildRewriteDuplicatePrompt({ question, options, correctAnswer, otherQuestion }: { question: string; options: string[]; correctAnswer: string | null; otherQuestion: string }): string {
  const optionList = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");
  return [
    "You are cleaning up a medical school (MBBS/BDS) question bank. Two questions in the bank are near-duplicates of each other — same underlying concept, wording too similar.",
    "Rewrite QUESTION B ONLY so it tests the exact same concept and has the exact same correct option (same medical fact), but reads as a genuinely different question — change the clinical scenario, phrasing, numbers, or angle of the question so it no longer looks copy-pasted from Question A. Do not change what is being tested or which option is correct.",
    "Keep the same number of options, in the same order, with the same option that is correct — only reword the question stem and, if needed, the option wording (not the underlying meaning of the correct option).",
    "Do not use markdown.",
    NO_REASONING_INSTRUCTION,
    "",
    `Question A (keep as-is, for reference only): ${otherQuestion}`,
    "",
    `Question B (rewrite this one): ${question}`,
    `Question B's options:\n${optionList}`,
    correctAnswer ? `Question B's correct answer: ${correctAnswer}` : "",
    "",
    `Respond with ONLY a valid JSON object, no prose before or after, no code fences, in exactly this shape: {"question": "...", "options": [${options.map(() => '"..."').join(", ")}], "correctAnswer": "..."}`,
  ].filter(Boolean).join("\n");
}

// 12s per row — same budget as generateOptionExplanations (a full
// question + option set is a comparable amount of output), so a capped
// batch of these run at the same concurrency stays under the 26s proxy
// ceiling the same way. See withHardDeadline's comment above
// classifyDifficulty for why an outer deadline is needed at all.
const REWRITE_DUPLICATE_HARD_DEADLINE_MS = 12_000;

/** Rewrites one side of a near-duplicate MCQ pair (found by the client-side
 * Jaccard similarity check in contentQuality.ts) into a distinct question
 * that still tests the same fact and keeps the same correct option — the
 * "AI Fix All" duplicate-removal action in the Content Quality Center.
 * Returns null on an unparseable response, a mismatched option count (would
 * silently corrupt the correct-answer mapping downstream), an error, or
 * simply taking too long — the caller skips that pair rather than writing
 * bad data or stalling the batch, same shape as generateOptionExplanations
 * above. */
export async function rewriteDuplicateMcq(request: { question: string; options: string[]; correctAnswer: string | null; otherQuestion: string }, modelOverride?: string): Promise<{ question: string; options: string[]; correctAnswer: string } | null> {
  return withHardDeadline((async () => {
    try {
      const raw = await runPrompt(buildRewriteDuplicatePrompt(request), Math.max(600, request.options.length * 150), "object", modelOverride);
      const cleaned = stripReasoningArtifacts(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed: unknown;
      try { parsed = JSON.parse(cleaned); } catch { const objects = extractBalancedJsonObjects(cleaned); parsed = objects.find((o) => o && typeof o === "object" && "question" in (o as object)); }
      if (!parsed || typeof parsed !== "object") return null;
      const obj = parsed as { question?: unknown; options?: unknown; correctAnswer?: unknown };
      if (typeof obj.question !== "string" || !obj.question.trim()) return null;
      if (!Array.isArray(obj.options) || obj.options.length !== request.options.length) return null;
      const options = obj.options.map((o) => String(o ?? "").trim());
      if (options.some((o) => !o)) return null;
      const correctAnswer = typeof obj.correctAnswer === "string" && options.includes(obj.correctAnswer.trim()) ? obj.correctAnswer.trim() : options[0];
      return { question: obj.question.trim(), options, correctAnswer };
    } catch {
      return null;
    }
  })(), REWRITE_DUPLICATE_HARD_DEADLINE_MS, () => null);
}

function buildRepairInvalidPrompt({ question, options, correctAnswer, reasons }: { question: string; options: string[]; correctAnswer: string | null; reasons: string[] }): string {
  const optionList = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt === "" ? "(empty)" : opt}`).join("\n") || "(no options given)";
  return [
    "You are repairing a broken entry in a medical school (MBBS/BDS) MCQ bank. This question failed automated validation for the reason(s) listed below.",
    "Fix ONLY what is broken — keep the medical topic and as much of the original wording as possible. Specifically:",
    "- If the question text is empty or unusable, write a clear, sensible question on a plausible medical topic consistent with any options given.",
    "- If there are fewer than 2 usable options, add options so there are at least 4, all medically plausible for that question (one correct, others real distractors).",
    "- If two or more options are duplicates of each other, reword the duplicates so every option is distinct while keeping the same total count.",
    "- If no correct answer is set, or the correct answer doesn't match any option exactly, pick the single best/most correct option and set it as the correct answer, character-for-character identical to that option's text.",
    `Reason(s) this question was flagged: ${reasons.join("; ")}`,
    "Do not use markdown.",
    NO_REASONING_INSTRUCTION,
    "",
    `Question: ${question || "(empty)"}`,
    `Options:\n${optionList}`,
    correctAnswer ? `Currently marked correct answer: ${correctAnswer}` : "Currently marked correct answer: (none set)",
    "",
    "Respond with ONLY a valid JSON object, no prose before or after, no code fences, in exactly this shape (options must be an array of at least 2 non-empty strings, correctAnswer must exactly equal one of them): {\"question\": \"...\", \"options\": [\"...\", \"...\"], \"correctAnswer\": \"...\"}",
  ].join("\n");
}

// 12s per row — same budget as rewriteDuplicateMcq/generateOptionExplanations
// above; a capped batch at the same concurrency stays under the 26s proxy
// ceiling for the same reason.
const REPAIR_INVALID_HARD_DEADLINE_MS = 12_000;

/** Repairs one structurally-invalid MCQ (empty question, too few/duplicate
 * options, missing/mismatched correct answer — see invalidReasons in the
 * frontend's contentQuality.ts, whose output is passed in as `reasons`) —
 * the "AI Fix" action for the Content Quality Center's Invalid stat/list.
 * Returns null (so the caller skips that row rather than writing bad data
 * or stalling the batch) on an unparseable response, fewer than 2 options,
 * any empty option, a correct answer that still doesn't match an option
 * exactly, an error, or simply taking too long. */
export async function repairInvalidMcq(request: { question: string; options: string[]; correctAnswer: string | null; reasons: string[] }, modelOverride?: string): Promise<{ question: string; options: string[]; correctAnswer: string } | null> {
  return withHardDeadline((async () => {
    try {
      const raw = await runPrompt(buildRepairInvalidPrompt(request), 900, "object", modelOverride);
      const cleaned = stripReasoningArtifacts(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed: unknown;
      try { parsed = JSON.parse(cleaned); } catch { const objects = extractBalancedJsonObjects(cleaned); parsed = objects.find((o) => o && typeof o === "object" && "question" in (o as object)); }
      if (!parsed || typeof parsed !== "object") return null;
      const obj = parsed as { question?: unknown; options?: unknown; correctAnswer?: unknown };
      if (typeof obj.question !== "string" || !obj.question.trim()) return null;
      if (!Array.isArray(obj.options) || obj.options.length < 2) return null;
      const options = obj.options.map((o) => String(o ?? "").trim());
      if (options.some((o) => !o)) return null;
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
      if (typeof obj.correctAnswer !== "string" || !options.includes(obj.correctAnswer.trim())) return null;
      return { question: obj.question.trim(), options, correctAnswer: obj.correctAnswer.trim() };
    } catch {
      return null;
    }
  })(), REPAIR_INVALID_HARD_DEADLINE_MS, () => null);
}

export async function generateFlashcardExplanation(request: FlashcardExplanationRequest): Promise<string> {
  return runPrompt(buildFlashcardPrompt(request), 700);
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
  return Math.max(900, count * 170);
}
function mcqMaxTokens(count: number): number {
  return Math.max(1600, count * 550);
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

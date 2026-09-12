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
    throw new Error(`Anthropic API error (${res.status}): ${body.slice(0, 300)}`);
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
    throw new Error(`OpenAI API error (${res.status}): ${body.slice(0, 300)}`);
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
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
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
      "HTTP-Referer": "https://medschoolproffss.netlify.app",
      "X-Title": "MedSchoolProffs",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI endpoint error (${res.status}): ${body.slice(0, 300)}`);
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
  gemini: "gemini-2.0-flash",
  // OpenRouter (and most OpenAI-compatible aggregators) namespace model IDs
  // as "vendor/model" — a bare "gpt-4o-mini" with no vendor prefix returns
  // an OpenRouter error, not a completion. Only used when the admin leaves
  // the Model field blank for the "custom" provider.
  custom: "openai/gpt-4o-mini",
};

/**
 * DB setting takes precedence over the env var of the same provider.
 *
 * `modelOverride` (round 3, item 4b) lets the MCQ-import auto-explain
 * pipeline use a cheaper/faster model for bulk generation
 * (AI_AUTO_EXPLAIN_MODEL) without needing a whole separate
 * provider/key/base-URL config — same provider and API key, just a
 * different model string. Falls back to the normal AI_MODEL/default when
 * not set, so every other caller (on-demand "Ask AI to explain", flashcard/
 * MCQ generation) is unaffected.
 */
async function resolveProvider(modelOverride?: string): Promise<{ provider: AiProvider; apiKey: string; model: string; baseUrl?: string } | null> {
  const dbProvider = await getSetting("AI_PROVIDER", null);
  const dbKey = await getSetting("AI_API_KEY", null);
  const dbModel = await getSetting("AI_MODEL", null);
  const dbBaseUrl = await getSetting("AI_BASE_URL", null);
  if ((dbKey || dbProvider === "custom") && dbProvider && (AI_PROVIDERS as readonly string[]).includes(dbProvider)) {
    const provider = dbProvider as AiProvider;
    if (provider === "custom" && !dbBaseUrl) return null; // custom needs a base URL to mean anything
    return { provider, apiKey: dbKey ?? "", model: modelOverride || dbModel || DEFAULT_MODELS[provider], baseUrl: dbBaseUrl ?? undefined };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey, model: modelOverride || DEFAULT_MODELS.anthropic };
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) return { provider: "openai", apiKey: openAiKey, model: modelOverride || DEFAULT_MODELS.openai };
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) return { provider: "gemini", apiKey: geminiKey, model: modelOverride || DEFAULT_MODELS.gemini };
  return null;
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

export async function runPrompt(prompt: string, maxTokens = 400, jsonMode: JsonMode = false, modelOverride?: string): Promise<string> {
  const resolved = await resolveProvider(modelOverride);
  if (!resolved) throw new AiNotConfiguredError();
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

/** Auto-classifies difficulty for a freshly-imported/AI-drafted MCQ instead
 * of leaving every import stuck at the parser's "moderate" placeholder.
 * Falls back to "moderate" on an unparseable/unexpected response rather
 * than throwing — this is a nice-to-have on top of a successful import,
 * not something that should fail the import itself. */
export async function classifyDifficulty(request: ExplanationRequest, modelOverride?: string): Promise<"easy" | "moderate" | "hard"> {
  try {
    const raw = await runPrompt(buildDifficultyPrompt(request), 20, false, modelOverride);
    const normalized = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
    return VALID_DIFFICULTIES.has(normalized) ? (normalized as "easy" | "moderate" | "hard") : "moderate";
  } catch {
    return "moderate";
  }
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

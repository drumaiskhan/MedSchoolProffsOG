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
    "Respond with ONLY a valid JSON array, no prose before or after, no code fences, in this exact shape:",
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
    if (!match) throw new Error("AI did not return valid flashcard JSON");
    parsed = JSON.parse(match[0]);
  }
  if (!Array.isArray(parsed)) throw new Error("AI did not return a flashcard array");
  return parsed
    .filter((c): c is { front: unknown; back: unknown } => !!c && typeof c === "object")
    .map((c) => ({ front: String((c as { front: unknown }).front ?? "").trim(), back: String((c as { back: unknown }).back ?? "").trim() }))
    .filter((c) => c.front.length > 0 && c.back.length > 0);
}

async function generateWithAnthropic(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Anthropic API returned no text content");
  return text.trim();
}

async function generateWithOpenAi(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI API returned no text content");
  return text.trim();
}

async function generateWithGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini API returned no text content");
  return text.trim();
}

/**
 * Any OpenAI-compatible chat-completions endpoint (Groq, OpenRouter, a
 * locally hosted model, an enterprise gateway, etc.) — same request/response
 * shape as generateWithOpenAi, just against an admin-supplied base URL.
 */
async function generateWithCustomEndpoint(baseUrl: string, apiKey: string, model: string, prompt: string): Promise<string> {
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI endpoint error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
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
  custom: "gpt-4o-mini",
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

async function runPrompt(prompt: string): Promise<string> {
  const resolved = await resolveProvider();
  if (!resolved) throw new AiNotConfiguredError();
  switch (resolved.provider) {
    case "anthropic": return generateWithAnthropic(resolved.apiKey, prompt);
    case "openai": return generateWithOpenAi(resolved.apiKey, prompt);
    case "gemini": return generateWithGemini(resolved.apiKey, resolved.model, prompt);
    case "custom": return generateWithCustomEndpoint(resolved.baseUrl!, resolved.apiKey, resolved.model, prompt);
  }
}

export async function generateExplanation(request: ExplanationRequest): Promise<string> {
  return runPrompt(buildPrompt(request));
}

export async function generateFlashcardExplanation(request: FlashcardExplanationRequest): Promise<string> {
  return runPrompt(buildFlashcardPrompt(request));
}

/** Generates draft front/back flashcard pairs — callers should treat these as editable drafts, not auto-publish. */
export async function generateFlashcardSet(request: FlashcardGenerationRequest): Promise<GeneratedFlashcard[]> {
  const raw = await runPrompt(buildFlashcardGenerationPrompt(request));
  return parseFlashcardJson(raw);
}

/* ============================================================
   AI PROVIDERS
   ============================================================ */

import { getSetting } from "./settings";

export type AIProvider =
  | "openai"
  | "gemini"
  | "anthropic"
  | "groq"
  | "custom";

export const AI_PROVIDERS: readonly AIProvider[] = [
  "openai",
  "gemini",
  "anthropic",
  "groq",
  "custom",
];

/* ============================================================
   ERRORS
   ============================================================ */

export class AiNotConfiguredError extends Error {
  constructor(
    message = "AI is not configured. Configure it from Admin → Platform Settings → AI, or set the appropriate backend environment variables.",
  ) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/* ============================================================
   TYPES
   ============================================================ */

export interface ExplanationRequest {
  question: string;
  options?: string[] | null;
  correctAnswer: string | null | undefined;
  reference?: string | null;
  topicLabel?: string | null;
}

export interface FlashcardExplanationRequest {
  front: string;
  back: string;
  topicLabel?: string | null;
}

export interface FlashcardGenerationMcq {
  question?: string;
  options?: string[] | null;
  answer?: string | null;
  correctAnswer?: string | null;
  explanation?: string | null;
}

export interface FlashcardGenerationRequest {
  /**
   * Either explicit source text or MCQ material.
   */
  sourceText?: string;

  /**
   * MCQs that the AI may use as source material.
   */
  mcqs?: FlashcardGenerationMcq[];

  /**
   * Optional topic to focus the generated cards on.
   */
  topicLabel?: string;

  /**
   * Number of cards requested.
   */
  count: number;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
}

export interface McqGenerationRequest {
  topicLabel: string;
  existingQuestions?: string[];
  count: number;
}

export interface GeneratedMcq {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;

  /**
   * Index-aligned with options.
   *
   * Each entry explains why that specific option is correct
   * or incorrect.
   */
  optionExplanations: string[];
}

interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

/* ============================================================
   LIMITS
   ============================================================ */

const MAX_FLASHCARDS = 100;
const FLASHCARD_BATCH_SIZE = 20;

const MAX_MCQS = 100;
const MCQ_BATCH_SIZE = 20;

const MAX_GENERATION_ATTEMPTS = 4;

/* ============================================================
   DEFAULT MODELS
   ============================================================ */

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  anthropic: "claude-sonnet-4-6",
  groq: "llama-3.3-70b-versatile",
  custom: "gpt-4o-mini",
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function getEnv(name: string): string {
  return normalizeText(process.env[name]);
}

function isProvider(value: string): value is AIProvider {
  return (
    value === "openai" ||
    value === "gemini" ||
    value === "anthropic" ||
    value === "groq" ||
    value === "custom"
  );
}

function getDefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

/* ============================================================
   AI CONFIGURATION
   ============================================================ */

/**
 * Configuration priority:
 *
 * 1. Admin database settings
 * 2. Generic AI_* environment variables
 * 3. Provider-specific environment variables
 *
 * Admin settings therefore allow the AI provider/API key/model
 * to be changed without modifying the server environment.
 *
 * Supported generic env vars:
 *
 * AI_PROVIDER
 * AI_API_KEY
 * AI_MODEL
 * AI_BASE_URL
 *
 * Supported provider-specific fallback keys:
 *
 * OPENAI_API_KEY
 * GEMINI_API_KEY
 * ANTHROPIC_API_KEY
 * GROQ_API_KEY
 */
async function getAIConfig(): Promise<AIConfig> {
  const dbProvider = normalizeText(
    await getSetting("AI_PROVIDER", null),
  ).toLowerCase();

  const dbApiKey = normalizeText(
    await getSetting("AI_API_KEY", null),
  );

  const dbModel = normalizeText(
    await getSetting("AI_MODEL", null),
  );

  const dbBaseUrl = normalizeText(
    await getSetting("AI_BASE_URL", null),
  );

  const envProvider = getEnv("AI_PROVIDER").toLowerCase();
  const envApiKey = getEnv("AI_API_KEY");
  const envModel = getEnv("AI_MODEL");
  const envBaseUrl = getEnv("AI_BASE_URL");

  /*
   * Provider-specific API key fallback.
   */
  const providerSpecificKeys: Record<AIProvider, string> = {
    openai: getEnv("OPENAI_API_KEY"),
    gemini: getEnv("GEMINI_API_KEY"),
    anthropic: getEnv("ANTHROPIC_API_KEY"),
    groq: getEnv("GROQ_API_KEY"),
    custom: "",
  };

  /*
   * Prefer the database provider when configured.
   */
  const providerValue = (
    dbProvider ||
    envProvider
  ).toLowerCase();

  /*
   * If no explicit provider was configured, automatically
   * detect a provider from provider-specific API keys.
   */
  let detectedProvider = providerValue;

  if (!detectedProvider) {
    if (providerSpecificKeys.anthropic) {
      detectedProvider = "anthropic";
    } else if (providerSpecificKeys.openai) {
      detectedProvider = "openai";
    } else if (providerSpecificKeys.gemini) {
      detectedProvider = "gemini";
    } else if (providerSpecificKeys.groq) {
      detectedProvider = "groq";
    }
  }

  if (!detectedProvider) {
    throw new AiNotConfiguredError(
      "No AI provider is configured. Configure AI from Admin → Platform Settings → AI, or set AI_PROVIDER in the backend environment.",
    );
  }

  if (!isProvider(detectedProvider)) {
    throw new AiNotConfiguredError(
      `Unsupported AI provider: ${detectedProvider}`,
    );
  }

  const provider = detectedProvider;

  /*
   * Database API key takes priority over environment variables.
   */
  const apiKey =
    dbApiKey ||
    envApiKey ||
    providerSpecificKeys[provider] ||
    "";

  const model =
    dbModel ||
    envModel ||
    getDefaultModel(provider);

  const baseUrl =
    dbBaseUrl ||
    envBaseUrl ||
    undefined;

  if (!model) {
    throw new AiNotConfiguredError(
      "AI model is missing. Configure AI_MODEL or select a model from Admin → Platform Settings → AI.",
    );
  }

  /*
   * Official providers require API keys.
   *
   * Custom endpoints may operate without a key because
   * locally/self-hosted models may not require authentication.
   */
  if (provider !== "custom" && !apiKey) {
    throw new AiNotConfiguredError(
      `AI API key is missing for ${provider}. Configure it from Admin → Platform Settings → AI or set the appropriate environment variable.`,
    );
  }

  if (provider === "custom" && !baseUrl) {
    throw new AiNotConfiguredError(
      "Custom AI requires AI_BASE_URL. Configure it from Admin → Platform Settings → AI.",
    );
  }

  return {
    provider,
    apiKey: apiKey || undefined,
    model,
    baseUrl,
  };
}

/* ============================================================
   RESPONSE HANDLING
   ============================================================ */

async function parseResponse(
  response: Response,
): Promise<any> {
  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(
        `AI provider returned HTTP ${response.status}: ${text.slice(
          0,
          500,
        )}`,
      );
    }

    throw new Error(
      `AI provider returned an invalid response: ${text.slice(
        0,
        500,
      )}`,
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.type ||
      data?.message ||
      (typeof data?.error === "string"
        ? data.error
        : undefined) ||
      `AI request failed with HTTP ${response.status}`;

    throw new Error(String(message));
  }

  return data;
}

function cleanAIJson(text: string): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(
    /^```json\s*/i,
    "",
  );

  cleaned = cleaned.replace(
    /^```\s*/i,
    "",
  );

  cleaned = cleaned.replace(
    /\s*```$/i,
    "",
  );

  return cleaned.trim();
}

function extractJsonArray(text: string): string {
  const cleaned = cleanAIJson(text);

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    throw new Error(
      "AI did not return a valid JSON array.",
    );
  }

  return cleaned.slice(start, end + 1);
}

/* ============================================================
   PROVIDER: ANTHROPIC
   ============================================================ */

async function callAnthropic(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!config.apiKey) {
    throw new AiNotConfiguredError(
      "Anthropic API key is missing.",
    );
  }

  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    },
  );

  const data = await parseResponse(response);

  const content = data?.content;

  if (!Array.isArray(content)) {
    throw new Error(
      "Anthropic returned an unexpected response.",
    );
  }

  const text = content
    .filter(
      (item: any) =>
        item?.type === "text",
    )
    .map(
      (item: any) =>
        item?.text || "",
    )
    .join("\n")
    .trim();

  if (!text) {
    throw new Error(
      "Anthropic returned no text.",
    );
  }

  return text;
}

/* ============================================================
   PROVIDER: OPENAI / GROQ / CUSTOM
   ============================================================ */

async function callOpenAICompatible(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  let baseUrl = config.baseUrl;

  if (!baseUrl) {
    if (config.provider === "openai") {
      baseUrl =
        "https://api.openai.com/v1";
    } else if (config.provider === "groq") {
      baseUrl =
        "https://api.groq.com/openai/v1";
    } else {
      throw new AiNotConfiguredError(
        "Custom AI requires AI_BASE_URL.",
      );
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  const url = baseUrl.endsWith(
    "/chat/completions",
  )
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization =
      `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.2,
    }),
  });

  const data = await parseResponse(response);

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "OpenAI-compatible provider returned no text.",
    );
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item: any) => {
        if (typeof item === "string") {
          return item;
        }

        return item?.text || "";
      })
      .join("")
      .trim();

    if (!text) {
      throw new Error(
        "OpenAI-compatible provider returned empty content.",
      );
    }

    return text;
  }

  return String(content).trim();
}

/* ============================================================
   PROVIDER: GEMINI
   ============================================================ */

async function callGemini(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!config.apiKey) {
    throw new AiNotConfiguredError(
      "Gemini API key is missing.",
    );
  }

  const model = config.model.replace(
    /^models\//,
    "",
  );

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: userPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  const data = await parseResponse(response);

  const parts =
    data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    throw new Error(
      "Gemini returned an unexpected response.",
    );
  }

  const text = parts
    .map(
      (part: any) =>
        part?.text || "",
    )
    .join("")
    .trim();

  if (!text) {
    throw new Error(
      "Gemini returned no text.",
    );
  }

  return text;
}

/* ============================================================
   CENTRAL AI DISPATCHER
   ============================================================ */

async function generateText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const config = await getAIConfig();

  switch (config.provider) {
    case "gemini":
      return callGemini(
        config,
        systemPrompt,
        userPrompt,
      );

    case "anthropic":
      return callAnthropic(
        config,
        systemPrompt,
        userPrompt,
      );

    case "openai":
    case "groq":
    case "custom":
      return callOpenAICompatible(
        config,
        systemPrompt,
        userPrompt,
      );

    default:
      throw new AiNotConfiguredError(
        `Unsupported AI provider: ${config.provider}`,
      );
  }
}

/* ============================================================
   GENERIC PROMPT
   ============================================================ */

function buildPrompt(
  request: ExplanationRequest,
): string {
  const options = request.options || [];

  const optionList =
    options.length > 0
      ? options
          .map(
            (option, index) =>
              `${String.fromCharCode(
                65 + index,
              )}. ${option}`,
          )
          .join("\n")
      : "Not provided";

  return [
    "You are an expert medical education assistant for MedschoolProffs.",
    "",
    "Write a concise, medically accurate explanation for an MBBS/BDS-level MCQ.",
    "",
    "Explain why the correct answer is correct.",
    "When options are provided, briefly explain why the other options are incorrect.",
    "Do not invent unsupported medical facts.",
    "Use the reference material when provided.",
    "Keep the explanation focused and useful for exam revision.",
    "Do not mention that you are an AI.",
    "",
    request.topicLabel
      ? `Topic: ${request.topicLabel}`
      : "",
    "",
    `Question: ${request.question}`,
    "",
    `Options:\n${optionList}`,
    "",
    `Correct answer: ${
      request.correctAnswer || "Not provided"
    }`,
    "",
    `Reference: ${
      request.reference || "Not provided"
    }`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ============================================================
   MCQ EXPLANATIONS
   ============================================================ */

export async function generateExplanation(
  request: ExplanationRequest,
): Promise<string> {
  const systemPrompt = `
You are an expert medical education assistant for MedschoolProffs.

Your task is to explain medical MCQs accurately for MBBS/BDS students.

Rules:
- Explain why the correct answer is correct.
- Explain why the other options are incorrect when available.
- Use medically accurate reasoning.
- Do not invent facts.
- Use the provided reference when useful.
- Keep the explanation structured and easy to revise.
- Do not mention that you are an AI.
`.trim();

  const userPrompt = buildPrompt(request);

  return generateText(
    systemPrompt,
    userPrompt,
  );
}

/* ============================================================
   FLASHCARD EXPLANATION
   ============================================================ */

function buildFlashcardPrompt(
  request: FlashcardExplanationRequest,
): string {
  return [
    "You are helping a medical student understand a flashcard.",
    "Explain the medical concept behind the answer.",
    "Use a mechanism walkthrough, analogy, or clinical example where useful.",
    "Be medically accurate.",
    "Do not introduce unsupported claims.",
    "Keep the explanation concise and revision-friendly.",
    "Do not use markdown headers.",
    "Do not mention that you are an AI.",
    "",
    request.topicLabel
      ? `Topic: ${request.topicLabel}`
      : "",
    "",
    `Flashcard front: ${request.front}`,
    "",
    `Flashcard back: ${request.back}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateFlashcardExplanation(
  request: FlashcardExplanationRequest,
): Promise<string> {
  const systemPrompt = `
You are a medical education assistant for MedschoolProffs.

Explain the medical concept behind a flashcard.

Rules:
- Be medically accurate.
- Explain the concept clearly.
- Do not introduce unsupported claims.
- Keep it concise enough for revision.
- Use appropriate medical terminology.
- Do not mention that you are an AI.
`.trim();

  const userPrompt =
    buildFlashcardPrompt(request);

  return generateText(
    systemPrompt,
    userPrompt,
  );
}

/* ============================================================
   FLASHCARD SOURCE MATERIAL
   ============================================================ */

function buildSourceMaterial(
  request: FlashcardGenerationRequest,
): string {
  const sections: string[] = [];

  if (request.topicLabel?.trim()) {
    sections.push(
      `Topic: ${request.topicLabel.trim()}`,
    );
  }

  if (request.sourceText?.trim()) {
    sections.push(
      `SOURCE MATERIAL:\n${request.sourceText.trim()}`,
    );
  }

  if (
    request.mcqs &&
    request.mcqs.length > 0
  ) {
    const mcqText = request.mcqs
      .map((mcq, index) => {
        const options =
          mcq.options &&
          mcq.options.length > 0
            ? `\nOptions:\n${mcq.options
                .map(
                  (option, optionIndex) =>
                    `${optionIndex + 1}. ${option}`,
                )
                .join("\n")}`
            : "";

        const answer =
          mcq.correctAnswer ||
          mcq.answer ||
          "";

        return `
MCQ ${index + 1}

Question:
${mcq.question || ""}

${options}

Answer:
${answer}

Explanation:
${mcq.explanation || ""}
`.trim();
      })
      .join("\n\n");

    sections.push(
      `MCQ MATERIAL:\n${mcqText}`,
    );
  }

  return sections.join("\n\n");
}

/* ============================================================
   FLASHCARD PARSER
   ============================================================ */

function parseFlashcards(
  text: string,
): GeneratedFlashcard[] {
  const json = extractJsonArray(text);

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      "AI returned invalid flashcard JSON.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "AI flashcard response must be an array.",
    );
  }

  const cards: GeneratedFlashcard[] = [];

  for (const item of parsed) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      continue;
    }

    const record =
      item as Record<string, unknown>;

    const front = normalizeText(
      record.front,
    );

    const back = normalizeText(
      record.back,
    );

    if (!front || !back) {
      continue;
    }

    cards.push({
      front,
      back,
    });
  }

  return deduplicateFlashcards(cards);
}

function deduplicateFlashcards(
  cards: GeneratedFlashcard[],
): GeneratedFlashcard[] {
  const seen = new Set<string>();
  const result: GeneratedFlashcard[] = [];

  for (const card of cards) {
    const front = normalizeText(
      card.front,
    );

    const back = normalizeText(
      card.back,
    );

    if (!front || !back) {
      continue;
    }

    const key =
      `${front.toLowerCase()}|||${back.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push({
      front,
      back,
    });
  }

  return result;
}

/* ============================================================
   FLASHCARD GENERATION
   ============================================================ */

async function generateFlashcardBatch(
  request: FlashcardGenerationRequest,
  count: number,
): Promise<GeneratedFlashcard[]> {
  const sourceMaterial =
    buildSourceMaterial(request);

  if (!sourceMaterial.trim()) {
    throw new Error(
      "No source material was provided for flashcard generation.",
    );
  }

  const systemPrompt = `
You are an expert medical educator creating high-quality revision flashcards for MedschoolProffs.

Generate exactly ${count} medical flashcards.

Return ONLY valid JSON.

Required format:

[
  {
    "front": "Question or prompt",
    "back": "Accurate answer"
  }
]

Rules:
- Generate exactly ${count} cards.
- No Markdown.
- No code fences.
- No commentary outside JSON.
- Use only information supported by the supplied material.
- Focus on high-yield medical facts.
- Avoid duplicates.
- Make questions specific.
- Make them useful for active recall.
- Keep answers concise but sufficient.
- Do not invent information not supported by the material.
${
  request.topicLabel
    ? `- Keep every card specifically relevant to the topic "${request.topicLabel}".`
    : ""
}
`.trim();

  const userPrompt = `
Create exactly ${count} medical flashcards from the following material.

${
  request.topicLabel
    ? `Selected topic: ${request.topicLabel}\n`
    : ""
}

${sourceMaterial}
`.trim();

  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_GENERATION_ATTEMPTS;
    attempt++
  ) {
    try {
      const response =
        await generateText(
          systemPrompt,
          userPrompt,
        );

      const cards =
        parseFlashcards(response);

      if (cards.length >= 1) {
        return cards.slice(0, count);
      }

      lastError = new Error(
        "AI returned no valid flashcards.",
      );
    } catch (error) {
      lastError = error;

      if (
        attempt ===
        MAX_GENERATION_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error(
          "AI failed to generate valid flashcards.",
        )
  );
}

export async function generateFlashcardSet(
  request: FlashcardGenerationRequest,
): Promise<GeneratedFlashcard[]> {
  const requestedCount = Math.max(
    1,
    Math.min(
      MAX_FLASHCARDS,
      Math.floor(request.count),
    ),
  );

  const allCards: GeneratedFlashcard[] = [];

  let remaining = requestedCount;

  while (remaining > 0) {
    const batchSize = Math.min(
      FLASHCARD_BATCH_SIZE,
      remaining,
    );

    const cards =
      await generateFlashcardBatch(
        request,
        batchSize,
      );

    allCards.push(...cards);

    remaining -= batchSize;

    if (cards.length === 0) {
      break;
    }
  }

  return deduplicateFlashcards(
    allCards,
  ).slice(0, requestedCount);
}

/* ============================================================
   MCQ PARSER
   ============================================================ */

function parseMcqs(
  text: string,
): GeneratedMcq[] {
  const json = extractJsonArray(text);

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      "AI returned invalid MCQ JSON.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "AI MCQ response must be an array.",
    );
  }

  const mcqs: GeneratedMcq[] = [];

  for (const item of parsed) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      continue;
    }

    const record =
      item as Record<string, unknown>;

    const question = normalizeText(
      record.question,
    );

    const explanation = normalizeText(
      record.explanation,
    );

    const options =
      Array.isArray(record.options)
        ? record.options
            .map(normalizeText)
            .filter(Boolean)
        : [];

    const answer = normalizeText(
      record.correctAnswer ||
        record.answer,
    );

    const rawOptionExplanations =
      record.optionExplanations;

    const optionExplanations =
      Array.isArray(
        rawOptionExplanations,
      )
        ? rawOptionExplanations
            .map(normalizeText)
        : [];

    /*
     * Every generated MCQ must have exactly
     * four options.
     */
    if (
      !question ||
      options.length !== 4 ||
      !answer
    ) {
      continue;
    }

    /*
     * Correct answer must exactly match one
     * of the four options, ignoring case.
     */
    const matchingOption =
      options.find(
        (option) =>
          option.toLowerCase() ===
          answer.toLowerCase(),
      );

    if (!matchingOption) {
      continue;
    }

    /*
     * Require one explanation per option.
     * If the AI failed to provide them, create
     * safe empty entries rather than misaligning
     * the explanations.
     */
    const normalizedOptionExplanations =
      optionExplanations.length === 4
        ? optionExplanations
        : ["", "", "", ""];

    mcqs.push({
      question,
      options,
      correctAnswer: matchingOption,
      explanation,
      optionExplanations:
        normalizedOptionExplanations,
    });
  }

  return deduplicateMcqs(mcqs);
}

/* ============================================================
   MCQ DEDUPLICATION
   ============================================================ */

function deduplicateMcqs(
  mcqs: GeneratedMcq[],
): GeneratedMcq[] {
  const seen = new Set<string>();
  const result: GeneratedMcq[] = [];

  for (const mcq of mcqs) {
    const key = mcq.question
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(mcq);
  }

  return result;
}

/* ============================================================
   MCQ GENERATION PROMPT
   ============================================================ */

/**
 * This prompt intentionally locks the AI to the selected topic.
 *
 * This prevents situations such as:
 *
 * Selected topic:
 * "Blood"
 *
 * AI:
 * "What is the smallest bone in the body?"
 *
 * Existing questions are used only to avoid duplicates
 * and match difficulty. They are NOT treated as source
 * material for the subject matter.
 */
function buildMcqGenerationPrompt(
  request: McqGenerationRequest,
  count: number,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const topicLabel =
    normalizeText(
      request.topicLabel,
    );

  const existingQuestions =
    request.existingQuestions
      ?.map(normalizeText)
      .filter(Boolean)
      .slice(0, 100) || [];

  const existingText =
    existingQuestions.length > 0
      ? `
Existing questions already present in this topic.

These are provided ONLY to prevent duplicates.

DO NOT:
- Repeat them.
- Closely paraphrase them.
- Copy their wording.
- Use an unrelated subject from them.

Use them only to understand difficulty level.

${existingQuestions
  .map(
    (question, index) =>
      `${index + 1}. ${question}`,
  )
  .join("\n")}
`
      : `
There are no existing questions to avoid.
`;

  const systemPrompt = `
You are an expert medical MCQ writer for MedschoolProffs.

THE SELECTED TOPIC IS:

"${topicLabel}"

Every single question MUST specifically test knowledge of this exact topic.

Do NOT generate generic medical trivia.

For example, if the selected topic is "Blood", do not generate questions about:
- smallest bone
- cranial nerves
- unrelated anatomy
- unrelated physiology
- unrelated pharmacology
- unrelated pathology

unless that subject is directly part of the selected topic.

Before finalizing EVERY question, perform this test:

"Does this question directly test knowledge of ${topicLabel}?"

If the answer is NO:
DISCARD THE QUESTION AND GENERATE A DIFFERENT ONE.

Generate exactly ${count} high-quality single-best-answer MCQs.

Each question must:
- Be appropriate for MBBS/BDS medical education.
- Be medically accurate.
- Stay strictly within "${topicLabel}".
- Have exactly 4 options.
- Have only one correct answer.
- Have a correctAnswer that exactly matches one option.
- Have a concise explanation.
- Have one explanation for EACH option.
- Avoid duplicates.
- Avoid vague wording.
- Be clinically useful and/or high-yield.
- Vary question stems.
- Vary clinical and factual framing where appropriate.

For optionExplanations:
- There must be exactly 4 entries.
- Entry 1 explains option 1.
- Entry 2 explains option 2.
- Entry 3 explains option 3.
- Entry 4 explains option 4.
- Explain specifically why each option is correct or incorrect.
- Do not simply repeat the general explanation.

Return ONLY valid JSON.

Do not use Markdown.
Do not use code fences.
Do not write commentary before or after the JSON.

Required JSON shape:

[
  {
    "question": "Question text",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "correctAnswer": "Exact correct option text",
    "explanation": "Concise medical explanation",
    "optionExplanations": [
      "Why option A is correct or incorrect",
      "Why option B is correct or incorrect",
      "Why option C is correct or incorrect",
      "Why option D is correct or incorrect"
    ]
  }
]

IMPORTANT:

The entire generated set must remain about:

"${topicLabel}"

Nothing else.
`.trim();

  const userPrompt = `
Selected topic:

"${topicLabel}"

${existingText}

Generate exactly ${count} NEW MCQs specifically about:

"${topicLabel}"

Make every question meaningfully different from the existing questions.

Final check before returning:
Every question MUST directly test "${topicLabel}".
`.trim();

  return {
    systemPrompt,
    userPrompt,
  };
}

/* ============================================================
   MCQ GENERATION BATCH
   ============================================================ */

async function generateMcqBatch(
  request: McqGenerationRequest,
  count: number,
): Promise<GeneratedMcq[]> {
  const topicLabel =
    normalizeText(
      request.topicLabel,
    );

  if (!topicLabel) {
    throw new Error(
      "Topic is required for MCQ generation.",
    );
  }

  const prompts =
    buildMcqGenerationPrompt(
      request,
      count,
    );

  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_GENERATION_ATTEMPTS;
    attempt++
  ) {
    try {
      const response =
        await generateText(
          prompts.systemPrompt,
          prompts.userPrompt,
        );

      const mcqs =
        parseMcqs(response);

      if (mcqs.length > 0) {
        return mcqs.slice(0, count);
      }

      lastError = new Error(
        "AI returned no valid MCQs.",
      );
    } catch (error) {
      lastError = error;

      if (
        attempt ===
        MAX_GENERATION_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error(
          "AI failed to generate valid MCQs.",
        )
  );
}

/* ============================================================
   PUBLIC MCQ GENERATION
   ============================================================ */

export async function generateMcqSet(
  request: McqGenerationRequest,
): Promise<GeneratedMcq[]> {
  const topicLabel =
    normalizeText(
      request.topicLabel,
    );

  if (!topicLabel) {
    throw new Error(
      "Topic is required for MCQ generation.",
    );
  }

  const requestedCount = Math.max(
    1,
    Math.min(
      MAX_MCQS,
      Math.floor(request.count),
    ),
  );

  const allMcqs: GeneratedMcq[] = [];

  let remaining = requestedCount;

  while (remaining > 0) {
    const batchSize = Math.min(
      MCQ_BATCH_SIZE,
      remaining,
    );

    /*
     * Include questions generated in previous
     * batches so later batches don't duplicate them.
     */
    const existingQuestions = [
      ...(request.existingQuestions || []),
      ...allMcqs.map(
        (mcq) => mcq.question,
      ),
    ];

    const batchRequest: McqGenerationRequest = {
      ...request,
      topicLabel,
      existingQuestions,
    };

    const mcqs =
      await generateMcqBatch(
        batchRequest,
        batchSize,
      );

    allMcqs.push(...mcqs);

    /*
     * If the model returned fewer questions than
     * requested, calculate the actual remaining
     * amount rather than blindly subtracting batchSize.
     */
    remaining =
      requestedCount - allMcqs.length;

    /*
     * Prevent an infinite loop if the provider
     * repeatedly returns no valid questions.
     */
    if (mcqs.length === 0) {
      break;
    }
  }

  return deduplicateMcqs(
    allMcqs,
  ).slice(0, requestedCount);
}

/* ============================================================
   SIMPLE GENERIC PROMPT API
   ============================================================ */

/**
 * Public helper for other backend features that simply
 * need to send a prompt through the configured provider.
 */
export async function runPrompt(
  prompt: string,
  maxTokens = 400,
): Promise<string> {
  const config =
    await getAIConfig();

  /*
   * Use a neutral system prompt for generic calls.
   */
  const systemPrompt = `
You are the AI assistant for MedschoolProffs.

Provide accurate, concise, useful responses.

When generating structured data, follow the requested
format exactly.

Do not mention that you are an AI unless explicitly asked.
`.trim();

  /*
   * For the generic helper we use the same central
   * dispatcher. maxTokens is retained for API compatibility.
   *
   * Provider-specific generation functions above use
   * their normal model configuration.
   */
  void maxTokens;

  switch (config.provider) {
    case "gemini":
      return callGemini(
        config,
        systemPrompt,
        prompt,
      );

    case "anthropic":
      return callAnthropic(
        config,
        systemPrompt,
        prompt,
      );

    case "openai":
    case "groq":
    case "custom":
      return callOpenAICompatible(
        config,
        systemPrompt,
        prompt,
      );

    default:
      throw new AiNotConfiguredError(
        `Unsupported AI provider: ${config.provider}`,
      );
  }
}
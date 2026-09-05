/* ============================================================
  AI PROVIDERS
  ============================================================ */

export type AIProvider =
  | "openai"
  | "gemini"
  | "anthropic"
  | "groq"
  | "custom";

/* ============================================================
  ERRORS
  ============================================================ */

export class AiNotConfiguredError extends Error {
  constructor(
    message = "AI is not configured. Please configure the AI environment variables.",
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
  sourceText?: string;
  mcqs?: FlashcardGenerationMcq[];
  topicLabel?: string;
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

function isProvider(value: string): value is AIProvider {
  return (
    value === "openai" ||
    value === "gemini" ||
    value === "anthropic" ||
    value === "groq" ||
    value === "custom"
  );
}

function getEnv(name: string): string {
  return normalizeText(process.env[name]);
}

/* ============================================================
  AI CONFIGURATION
  ============================================================ */

/**
 * AI configuration comes ONLY from backend environment variables.
 *
 * Required:
 *   AI_PROVIDER
 *   AI_API_KEY
 *   AI_MODEL
 *
 * Optional:
 *   AI_BASE_URL
 *
 * Example:
 *
 *   AI_PROVIDER=groq
 *   AI_API_KEY=your_api_key
 *   AI_MODEL=your_model
 *   AI_BASE_URL=
 *
 * The Admin Panel/database is NOT used for AI configuration.
 */

function getAIConfig(): AIConfig {
  const providerValue = getEnv("AI_PROVIDER").toLowerCase();

  if (!providerValue) {
    throw new AiNotConfiguredError(
      "AI provider is not configured. Set AI_PROVIDER in the backend environment variables.",
    );
  }

  if (!isProvider(providerValue)) {
    throw new AiNotConfiguredError(
      `Unsupported AI provider: ${providerValue}`,
    );
  }

  const provider = providerValue;

  const apiKey = getEnv("AI_API_KEY");
  const model = getEnv("AI_MODEL");
  const baseUrl = getEnv("AI_BASE_URL");

  if (!model) {
    throw new AiNotConfiguredError(
      "AI model is missing. Set AI_MODEL in the backend environment variables.",
    );
  }

  /*
   * Official providers require an API key.
   *
   * Custom OpenAI-compatible endpoints may optionally
   * operate without a key, allowing local/self-hosted
   * AI servers.
   */
  if (provider !== "custom" && !apiKey) {
    throw new AiNotConfiguredError(
      "AI API key is missing. Set AI_API_KEY in the backend environment variables.",
    );
  }

  if (provider === "custom" && !baseUrl) {
    throw new AiNotConfiguredError(
      "Custom AI requires AI_BASE_URL in the backend environment variables.",
    );
  }

  return {
    provider,
    apiKey: apiKey || undefined,
    model,
    baseUrl: baseUrl || undefined,
  };
}

/* ============================================================
  RESPONSE HANDLING
  ============================================================ */

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(
        `AI provider returned HTTP ${response.status}: ${text.slice(0, 500)}`,
      );
    }

    throw new Error(
      `AI provider returned an invalid response: ${text.slice(0, 500)}`,
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.type ||
      data?.message ||
      (typeof data?.error === "string" ? data.error : undefined) ||
      `AI request failed with HTTP ${response.status}`;

    throw new Error(String(message));
  }

  return data;
}

function cleanAIJson(text: string): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  return cleaned.trim();
}

function extractJsonArray(text: string): string {
  const cleaned = cleanAIJson(text);

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI did not return a valid JSON array.");
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
      (item: any) => item?.type === "text",
    )
    .map(
      (item: any) => item?.text || "",
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
      baseUrl = "https://api.openai.com/v1";
    } else if (config.provider === "groq") {
      baseUrl = "https://api.groq.com/openai/v1";
    } else {
      throw new AiNotConfiguredError(
        "Custom AI requires AI_BASE_URL in the backend environment variables.",
      );
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  const url = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
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
      (part: any) => part?.text || "",
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
  const config = getAIConfig();

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
  MCQ EXPLANATIONS
  ============================================================ */

export async function generateExplanation(
  request: ExplanationRequest,
): Promise<string> {
  const systemPrompt = `
You are an expert medical education assistant for MedschoolProffs.

Your task is to explain medical MCQs accurately for MBBS students.

Rules:
- Explain why the correct answer is correct.
- Explain why the other options are incorrect when available.
- Use medically accurate reasoning.
- Do not invent facts.
- Use the provided reference when useful.
- Keep the explanation structured and easy to revise.
- Do not mention that you are an AI.
`.trim();

  const optionsText =
    request.options &&
    request.options.length > 0
      ? request.options
          .map(
            (option, index) =>
              `${index + 1}. ${option}`,
          )
          .join("\n")
      : "Not provided";

  const userPrompt = `
${request.topicLabel ? `Topic: ${request.topicLabel}\n` : ""}

Question:
${request.question}

Options:
${optionsText}

Correct Answer:
${request.correctAnswer || "Not provided"}

Reference:
${request.reference || "Not provided"}

Provide a concise but educational explanation.
`.trim();

  return generateText(
    systemPrompt,
    userPrompt,
  );
}

/* ============================================================
  FLASHCARD EXPLANATION
  ============================================================ */

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

  const userPrompt = `
${
  request.topicLabel
    ? `Topic: ${request.topicLabel}\n`
    : ""
}

Flashcard Front:
${request.front}

Flashcard Back:
${request.back}

Provide a concise educational explanation.
`.trim();

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
`.trim();

  const userPrompt = `
Create ${count} medical flashcards from the following material.

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

      if (cards.length > 0) {
        return cards;
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

    const question =
      normalizeText(
        record.question,
      );

    const explanation =
      normalizeText(
        record.explanation,
      );

    const options =
      Array.isArray(record.options)
        ? record.options
            .map((option) =>
              normalizeText(option),
            )
            .filter(Boolean)
        : [];

    const answer =
      normalizeText(
        record.correctAnswer ||
          record.answer,
      );

    /*
     * Require exactly four options.
     */
    if (
      !question ||
      options.length !== 4 ||
      !answer
    ) {
      continue;
    }

    /*
     * Correct answer must exactly match
     * one of the four options.
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

    mcqs.push({
      question,
      options,
      correctAnswer: matchingOption,
      explanation,
    });
  }

  return deduplicateMcqs(mcqs);
}

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

DO NOT repeat or closely paraphrase these:

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

Generate exactly ${count} high-quality medical MCQs.

The questions MUST specifically belong to this topic:

${topicLabel}

Return ONLY valid JSON.

Required format:

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
    "explanation": "Concise medical explanation"
  }
]

Rules:
- Generate exactly ${count} questions.
- Every question must have exactly 4 options.
- Only one option may be correct.
- correctAnswer MUST exactly match one of the options.
- Questions must be medically accurate.
- Questions must be appropriate for MBBS-level medical education.
- Avoid duplicate questions.
- Avoid vague questions.
- Focus on clinically useful and high-yield knowledge.
- Stay strictly within the selected topic.
- Do not drift into unrelated topics.
- Do not mention these instructions.
- Do not output Markdown.
- Do not output code fences.
- Return JSON only.
`.trim();

  const userPrompt = `
Selected topic:

${topicLabel}

${existingText}

Generate ${count} new MCQs specifically for this topic.

Make the questions meaningfully different from the existing questions.
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
        return mcqs;
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
     * batches so later batches do not duplicate them.
     */
    const existingQuestions = [
      ...(request.existingQuestions || []),
      ...allMcqs.map(
        (mcq) => mcq.question,
      ),
    ];

    const batchRequest: McqGenerationRequest = {
      ...request,
      existingQuestions,
    };

    const mcqs =
      await generateMcqBatch(
        batchRequest,
        batchSize,
      );

    allMcqs.push(...mcqs);

    remaining -= batchSize;

    if (mcqs.length === 0) {
      break;
    }
  }

  return deduplicateMcqs(
    allMcqs,
  ).slice(0, requestedCount);
}

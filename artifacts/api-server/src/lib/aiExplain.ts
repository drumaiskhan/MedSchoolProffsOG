```ts
import { getSetting } from "./settings";

export type AIProvider =
  | "openai"
  | "gemini"
  | "anthropic"
  | "groq"
  | "custom";

export class AiNotConfiguredError extends Error {
  constructor(
    message = "AI is not configured. Please configure AI from the Admin Panel.",
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
  correctAnswer: string;
  reference?: string | null;
}

export interface FlashcardExplanationRequest {
  front: string;
  back: string;
  topicLabel?: string;
}

export interface FlashcardGenerationRequest {
  sourceText?: string;
  mcqs?: Array<{
    question?: string;
    options?: string[] | null;
    answer?: string | null;
    correctAnswer?: string | null;
    explanation?: string | null;
  }>;
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
  answer: string;
  explanation: string;
}

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
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
   AI CONFIGURATION
   ============================================================ */

/**
 * IMPORTANT:
 *
 * AI configuration comes from Admin Panel/database settings.
 *
 * Railway does NOT need:
 *
 * OPENAI_API_KEY
 * GEMINI_API_KEY
 * ANTHROPIC_API_KEY
 * GROQ_API_KEY
 *
 * The admin configures:
 *
 * ai_provider
 * ai_api_key
 * ai_model
 * ai_base_url
 *
 * Provider-specific keys are supported as fallbacks.
 */
async function getAIConfig(): Promise<AIConfig> {
  const providerValue = await getSetting("ai_provider");

  if (!providerValue?.trim()) {
    throw new AiNotConfiguredError(
      "AI provider is not configured. Configure AI from the Admin Panel.",
    );
  }

  const provider = providerValue.trim().toLowerCase() as AIProvider;

  if (
    !["openai", "gemini", "anthropic", "groq", "custom"].includes(provider)
  ) {
    throw new AiNotConfiguredError(
      `Unsupported AI provider: ${providerValue}`,
    );
  }

  let apiKey = await getSetting("ai_api_key");
  let model = await getSetting("ai_model");
  let baseUrl = await getSetting("ai_base_url");

  /*
   * Provider-specific fallback settings.
   */

  if (provider === "openai") {
    apiKey =
      apiKey ||
      (await getSetting("ai_openai_key"));

    model =
      model ||
      (await getSetting("ai_openai_model"));

    baseUrl =
      baseUrl ||
      (await getSetting("ai_openai_base_url"));
  }

  if (provider === "gemini") {
    apiKey =
      apiKey ||
      (await getSetting("ai_gemini_key"));

    model =
      model ||
      (await getSetting("ai_gemini_model"));
  }

  if (provider === "anthropic") {
    apiKey =
      apiKey ||
      (await getSetting("ai_anthropic_key"));

    model =
      model ||
      (await getSetting("ai_anthropic_model"));
  }

  if (provider === "groq") {
    apiKey =
      apiKey ||
      (await getSetting("ai_groq_key"));

    model =
      model ||
      (await getSetting("ai_groq_model"));

    baseUrl =
      baseUrl ||
      (await getSetting("ai_groq_base_url"));
  }

  if (provider === "custom") {
    apiKey =
      apiKey ||
      (await getSetting("ai_custom_key"));

    model =
      model ||
      (await getSetting("ai_custom_model"));

    baseUrl =
      baseUrl ||
      (await getSetting("ai_custom_base_url"));
  }

  if (!apiKey?.trim()) {
    throw new AiNotConfiguredError(
      "AI API key is missing. Add it from the Admin Panel.",
    );
  }

  if (!model?.trim()) {
    throw new AiNotConfiguredError(
      "AI model is missing. Add the model name from the Admin Panel.",
    );
  }

  return {
    provider,
    apiKey: apiKey.trim(),
    model: model.trim(),
    baseUrl: baseUrl?.trim() || undefined,
  };
}

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

async function parseResponse(
  response: Response,
): Promise<any> {
  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `AI provider returned an invalid response (${response.status}): ${text.slice(
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
      data?.error ||
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
    throw new Error(
      "AI did not return a valid JSON array.",
    );
  }

  return cleaned.slice(start, end + 1);
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/* ============================================================
   PROVIDER: ANTHROPIC
   ============================================================ */

async function callAnthropic(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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

  return content
    .filter((item: any) => item?.type === "text")
    .map((item: any) => item?.text || "")
    .join("\n")
    .trim();
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
        "Custom AI requires a Base URL configured from the Admin Panel.",
      );
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  const url = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
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
    return content
      .map((item: any) => item?.text || "")
      .join("")
      .trim();
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
    .map((part: any) => part?.text || "")
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
    request.options?.length
      ? request.options
          .map(
            (option, index) =>
              `${index + 1}. ${option}`,
          )
          .join("\n")
      : "Not provided";

  const userPrompt = `
Question:
${request.question}

Options:
${optionsText}

Correct Answer:
${request.correctAnswer}

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
${request.topicLabel ? `Topic: ${request.topicLabel}\n` : ""}

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

  if (request.topicLabel) {
    sections.push(
      `Topic: ${request.topicLabel}`,
    );
  }

  if (request.sourceText?.trim()) {
    sections.push(
      `SOURCE MATERIAL:\n${request.sourceText.trim()}`,
    );
  }

  if (request.mcqs?.length) {
    const mcqText = request.mcqs
      .map((mcq, index) => {
        const options =
          mcq.options?.length
            ? `\nOptions:\n${mcq.options
                .map(
                  (option, i) =>
                    `${i + 1}. ${option}`,
                )
                .join("\n")}`
            : "";

        const answer =
          mcq.answer ||
          mcq.correctAnswer ||
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
You are an expert medical educator creating high-quality
revision flashcards for MedschoolProffs.

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
- No Markdown.
- No code fences.
- No commentary outside JSON.
- Use only information supported by the supplied material.
- Focus on high-yield medical facts.
- Avoid duplicates.
- Make questions specific.
- Make them useful for active recall.
- Keep answers concise but sufficient.
`.trim();

  const userPrompt = `
Create ${count} medical flashcards from the following material.

${sourceMaterial}
`.trim();

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
    } catch (error) {
      if (
        attempt ===
        MAX_GENERATION_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "AI failed to generate valid flashcards.",
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
   MCQ GENERATION
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
      normalizeText(record.question);

    const answer =
      normalizeText(record.answer);

    const explanation =
      normalizeText(record.explanation);

    const options =
      Array.isArray(record.options)
        ? record.options
            .map((option) =>
              normalizeText(option),
            )
            .filter(Boolean)
        : [];

    if (
      !question ||
      options.length < 2 ||
      !answer
    ) {
      continue;
    }

    /*
     * Ensure the answer actually matches
     * one of the generated options.
     *
     * Case-insensitive comparison.
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
      answer: matchingOption,
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

/**
 * Generate MCQs strictly for the selected topic.
 *
 * existingQuestions prevents the AI from repeatedly
 * generating questions already present in the bank.
 */
async function generateMcqBatch(
  request: McqGenerationRequest,
  count: number,
): Promise<GeneratedMcq[]> {
  const topicLabel =
    normalizeText(request.topicLabel);

  if (!topicLabel) {
    throw new Error(
      "Topic is required for MCQ generation.",
    );
  }

  const existingQuestions =
    request.existingQuestions
      ?.map(normalizeText)
      .filter(Boolean)
      .slice(0, 50) || [];

  const existingText =
    existingQuestions.length
      ? `
Existing questions already in this topic.
Do NOT repeat these:

${existingQuestions
  .map(
    (question, index) =>
      `${index + 1}. ${question}`,
  )
  .join("\n")}
`
      : "There are no existing questions to avoid.";

  const systemPrompt = `
You are an expert medical MCQ writer for MedschoolProffs.

Generate exactly ${count} high-quality medical MCQs.

The questions MUST be specifically about:

${topicLabel}

Do not drift into unrelated subjects or topics.

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
    "answer": "Exact correct option text",
    "explanation": "Concise medical explanation"
  }
]

Rules:
- Generate exactly 4 options per question.
- Only one option is correct.
- "answer" MUST exactly match one of the options.
- Questions must be medically accurate.
- Avoid duplicate questions.
- Avoid vague questions.
- Test clinically useful knowledge.
- Use the selected topic as the primary scope.
- Do not create questions from unrelated topics.
- Do not mention these instructions.
- Return JSON only.
`.trim();

  const userPrompt = `
Selected topic:

${topicLabel}

${existingText}

Generate ${count} new MCQs specifically for this topic.
`.trim();

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

      const mcqs =
        parseMcqs(response);

      if (mcqs.length > 0) {
        return mcqs;
      }
    } catch (error) {
      if (
        attempt ===
        MAX_GENERATION_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "AI failed to generate valid MCQs.",
  );
}

/**
 * Public MCQ generation function required by
 * routes/explanations.ts.
 */
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

    const batchRequest: McqGenerationRequest =
      {
        ...request,
        existingQuestions: [
          ...(request.existingQuestions || []),
          ...allMcqs.map(
            (mcq) => mcq.question,
          ),
        ],
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
```

import { getSetting } from "./settings";

export type AIProvider =
  | "openai"
  | "gemini"
  | "anthropic"
  | "groq"
  | "custom";

export class AiNotConfiguredError extends Error {
  constructor(message = "AI is not configured. Please configure AI from the Admin Panel.") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export interface FlashcardGenerationRequest {
  sourceText?: string;
  mcqs?: Array<{
    question?: string;
    options?: string[];
    answer?: string;
    explanation?: string;
  }>;
  topicLabel?: string;
  count: number;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
}

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/**
 * Maximum number of flashcards that can be generated in one request.
 */
const MAX_FLASHCARDS = 100;

/**
 * Generate cards in batches to prevent extremely large AI requests.
 */
const FLASHCARD_BATCH_SIZE = 20;

const MAX_GENERATION_ATTEMPTS = 4;

/**
 * Read AI configuration exclusively from Admin Panel settings.
 *
 * Supported settings:
 *
 * ai_provider
 * ai_api_key
 * ai_model
 * ai_base_url
 *
 * Provider-specific settings are also supported as fallbacks inside
 * the database:
 *
 * ai_openai_key
 * ai_openai_model
 * ai_openai_base_url
 *
 * ai_gemini_key
 * ai_gemini_model
 *
 * ai_anthropic_key
 * ai_anthropic_model
 *
 * ai_groq_key
 * ai_groq_model
 *
 * ai_custom_key
 * ai_custom_model
 * ai_custom_base_url
 */
async function getAIConfig(): Promise<AIConfig> {
  const providerValue = await getSetting("ai_provider");

  if (!providerValue) {
    throw new AiNotConfiguredError(
      "AI provider is not configured. Configure it from the Admin Panel."
    );
  }

  const provider = providerValue.toLowerCase() as AIProvider;

  if (
    !["openai", "gemini", "anthropic", "groq", "custom"].includes(provider)
  ) {
    throw new AiNotConfiguredError(
      `Unsupported AI provider: ${providerValue}`
    );
  }

  /*
   * First try the universal settings.
   */
  let apiKey = await getSetting("ai_api_key");
  let model = await getSetting("ai_model");
  let baseUrl = await getSetting("ai_base_url");

  /*
   * If universal settings are empty, use provider-specific
   * Admin Panel settings.
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

  if (!apiKey) {
    throw new AiNotConfiguredError(
      "AI API key is missing. Add it from the Admin Panel."
    );
  }

  if (!model) {
    throw new AiNotConfiguredError(
      "AI model is missing. Add the model name from the Admin Panel."
    );
  }

  return {
    provider,
    apiKey: apiKey.trim(),
    model: model.trim(),
    baseUrl: baseUrl?.trim() || undefined,
  };
}

/**
 * Safely parse a JSON response from an AI provider.
 */
async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `AI provider returned an invalid response (${response.status}): ${text.slice(
        0,
        500
      )}`
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      `AI request failed with HTTP ${response.status}`;

    throw new Error(String(message));
  }

  return data;
}

/**
 * Remove Markdown code fences from JSON responses.
 */
function cleanAIJson(text: string): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  return cleaned.trim();
}

/**
 * Extract JSON array from an AI response even if the model
 * included some extra text.
 */
function extractJsonArray(text: string): string {
  const cleaned = cleanAIJson(text);

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI did not return a valid JSON array.");
  }

  return cleaned.slice(start, end + 1);
}

/**
 * Normalize generated text.
 */
function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Remove duplicate flashcards.
 */
function deduplicateFlashcards(
  cards: GeneratedFlashcard[]
): GeneratedFlashcard[] {
  const seen = new Set<string>();
  const result: GeneratedFlashcard[] = [];

  for (const card of cards) {
    const front = normalizeText(card.front);
    const back = normalizeText(card.back);

    if (!front || !back) {
      continue;
    }

    const key = `${front.toLowerCase()}|||${back.toLowerCase()}`;

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

/**
 * Call Anthropic.
 */
async function callAnthropic(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "false",
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
    }
  );

  const data = await parseResponse(response);

  const content = data?.content;

  if (!Array.isArray(content)) {
    throw new Error("Anthropic returned an unexpected response.");
  }

  return content
    .filter((item: any) => item?.type === "text")
    .map((item: any) => item.text)
    .join("\n")
    .trim();
}

/**
 * Generic OpenAI-compatible API call.
 *
 * This allows the same implementation to work with:
 *
 * OpenAI
 * Groq
 * OpenRouter
 * DeepSeek
 * Mistral
 * Together
 * xAI
 * Cerebras
 * and many other compatible providers.
 */
async function callOpenAICompatible(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  let baseUrl = config.baseUrl;

  if (!baseUrl) {
    if (config.provider === "openai") {
      baseUrl = "https://api.openai.com/v1";
    } else if (config.provider === "groq") {
      baseUrl = "https://api.groq.com/openai/v1";
    } else {
      throw new AiNotConfiguredError(
        "Custom AI requires a Base URL configured in the Admin Panel."
      );
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  /*
   * If the admin entered the complete endpoint, don't append
   * another /chat/completions.
   */
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

  const text =
    data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error(
      "OpenAI-compatible provider returned no text."
    );
  }

  return String(text).trim();
}

/**
 * Call Google Gemini.
 */
async function callGemini(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const model = config.model.replace(/^models\//, "");

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
      "Gemini returned an unexpected response."
    );
  }

  const text = parts
    .map((part: any) => part?.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned no text.");
  }

  return text;
}

/**
 * Generic AI text generation.
 */
async function generateText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const config = await getAIConfig();

  switch (config.provider) {
    case "gemini":
      return callGemini(
        config,
        systemPrompt,
        userPrompt
      );

    case "anthropic":
      return callAnthropic(
        config,
        systemPrompt,
        userPrompt
      );

    case "openai":
    case "groq":
    case "custom":
      return callOpenAICompatible(
        config,
        systemPrompt,
        userPrompt
      );

    default:
      throw new AiNotConfiguredError(
        `Unsupported AI provider: ${config.provider}`
      );
  }
}

/**
 * Generate an explanation for an MCQ.
 */
export async function generateExplanation(
  question: string,
  answer: string,
  options?: string[],
  topicLabel?: string
): Promise<string> {
  const systemPrompt = `
You are an expert medical education assistant for MedschoolProffs.

Your job is to explain medical MCQs accurately and clearly for MBBS
medical students.

Rules:
- Give medically accurate information.
- Explain why the correct answer is correct.
- Explain why the other options are incorrect when options are provided.
- Do not invent facts.
- Use clinically relevant reasoning.
- Keep the explanation structured and easy to study.
- Do not mention that you are an AI.
`.trim();

  const userPrompt = `
${topicLabel ? `Topic: ${topicLabel}\n` : ""}

Question:
${question}

Options:
${options?.length ? options.map((o, i) => `${i + 1}. ${o}`).join("\n") : "Not provided"}

Correct Answer:
${answer}

Provide a concise but educational explanation.
`.trim();

  return generateText(systemPrompt, userPrompt);
}

/**
 * Generate explanation for a flashcard.
 */
export async function generateFlashcardExplanation(
  front: string,
  back: string,
  topicLabel?: string
): Promise<string> {
  const systemPrompt = `
You are a medical education assistant.

Improve the educational explanation behind a medical flashcard.

Rules:
- Be medically accurate.
- Explain the concept clearly.
- Do not introduce unsupported claims.
- Keep it concise enough for revision.
- Use appropriate medical terminology.
`.trim();

  const userPrompt = `
${topicLabel ? `Topic: ${topicLabel}\n` : ""}

Flashcard Front:
${front}

Flashcard Back:
${back}

Give a concise educational explanation.
`.trim();

  return generateText(systemPrompt, userPrompt);
}

/**
 * Build source material for flashcard generation.
 */
function buildSourceMaterial(
  request: FlashcardGenerationRequest
): string {
  const sections: string[] = [];

  if (request.topicLabel) {
    sections.push(`Topic: ${request.topicLabel}`);
  }

  if (request.sourceText?.trim()) {
    sections.push(
      `SOURCE MATERIAL:\n${request.sourceText.trim()}`
    );
  }

  if (request.mcqs?.length) {
    const mcqText = request.mcqs
      .map((mcq, index) => {
        const options =
          mcq.options?.length
            ? `\nOptions:\n${mcq.options
                .map((option, i) => `${i + 1}. ${option}`)
                .join("\n")}`
            : "";

        return `
MCQ ${index + 1}
Question:
${mcq.question || ""}

${options}

Answer:
${mcq.answer || ""}

Explanation:
${mcq.explanation || ""}
`.trim();
      })
      .join("\n\n");

    sections.push(`MCQ MATERIAL:\n${mcqText}`);
  }

  return sections.join("\n\n");
}

/**
 * Parse AI-generated flashcards.
 */
function parseFlashcards(
  text: string
): GeneratedFlashcard[] {
  const json = extractJsonArray(text);

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      "AI returned invalid flashcard JSON."
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "AI flashcard response must be an array."
    );
  }

  const cards: GeneratedFlashcard[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;

    const front = normalizeText(record.front);
    const back = normalizeText(record.back);

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

/**
 * Generate one flashcard batch.
 */
async function generateFlashcardBatch(
  request: FlashcardGenerationRequest,
  count: number
): Promise<GeneratedFlashcard[]> {
  const sourceMaterial = buildSourceMaterial(request);

  if (!sourceMaterial.trim()) {
    throw new Error(
      "No source material was provided for flashcard generation."
    );
  }

  const systemPrompt = `
You are an expert medical educator creating high-quality revision
flashcards for MedschoolProffs.

Generate exactly ${count} useful medical flashcards.

Return ONLY valid JSON.

The response MUST be a JSON array using exactly this structure:

[
  {
    "front": "Question or prompt",
    "back": "Accurate answer"
  }
]

Rules:
- Do not use Markdown.
- Do not wrap the JSON in code fences.
- Do not add commentary before or after the JSON.
- Use only information supported by the supplied source material.
- Focus on high-yield medical facts.
- Avoid duplicate cards.
- Make cards specific and useful for active recall.
- Do not create vague questions.
- Keep answers concise but sufficient.
- Preserve important medical terminology.
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
      const response = await generateText(
        systemPrompt,
        userPrompt
      );

      const cards = parseFlashcards(response);

      if (cards.length > 0) {
        return cards;
      }
    } catch (error) {
      if (attempt === MAX_GENERATION_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new Error(
    "AI failed to generate valid flashcards."
  );
}

/**
 * Generate a flashcard set.
 *
 * Supports up to 100 cards.
 *
 * Large requests are automatically divided into batches
 * so the AI provider doesn't receive one excessively large prompt.
 */
export async function generateFlashcardSet(
  request: FlashcardGenerationRequest
): Promise<GeneratedFlashcard[]> {
  const requestedCount = Math.max(
    1,
    Math.min(
      MAX_FLASHCARDS,
      Math.floor(request.count)
    )
  );

  const allCards: GeneratedFlashcard[] = [];

  let remaining = requestedCount;

  while (remaining > 0) {
    const batchSize = Math.min(
      FLASHCARD_BATCH_SIZE,
      remaining
    );

    const cards = await generateFlashcardBatch(
      request,
      batchSize
    );

    allCards.push(...cards);

    remaining -= batchSize;

    /*
     * Safety against providers repeatedly returning
     * the same cards or fewer cards than requested.
     */
    if (cards.length === 0) {
      break;
    }
  }

  const uniqueCards =
    deduplicateFlashcards(allCards);

  return uniqueCards.slice(
    0,
    requestedCount
  );
}

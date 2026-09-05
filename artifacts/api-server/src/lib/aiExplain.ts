import { getSetting } from "./settings";

type AIProvider = "anthropic" | "openai" | "gemini" | "groq" | "custom";

export interface FlashcardGenerationRequest {
  sourceText?: string;
  mcqs?: Array<{
    question: string;
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

const MAX_FLASHCARDS = 100;
const FLASHCARD_BATCH_SIZE = 20;
const MAX_GENERATION_ATTEMPTS = 4;

/* -------------------------------------------------------------------------- */
/*                              Configuration                                 */
/* -------------------------------------------------------------------------- */

async function getAIConfig(): Promise<{
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}> {
  const provider =
    ((await getSetting("ai_provider")) ||
      process.env.AI_PROVIDER ||
      "gemini") as AIProvider;

  let apiKey = "";
  let model = "";
  let baseUrl = "";

  switch (provider) {
    case "anthropic":
      apiKey =
        (await getSetting("ai_anthropic_key")) ||
        process.env.ANTHROPIC_API_KEY ||
        "";

      model =
        (await getSetting("ai_anthropic_model")) ||
        process.env.ANTHROPIC_MODEL ||
        "claude-sonnet-4-6";

      break;

    case "openai":
      apiKey =
        (await getSetting("ai_openai_key")) ||
        process.env.OPENAI_API_KEY ||
        "";

      model =
        (await getSetting("ai_openai_model")) ||
        process.env.OPENAI_MODEL ||
        "gpt-5.6-luna";

      break;

    case "gemini":
      apiKey =
        (await getSetting("ai_gemini_key")) ||
        process.env.GEMINI_API_KEY ||
        "";

      model =
        (await getSetting("ai_gemini_model")) ||
        process.env.GEMINI_MODEL ||
        "gemini-3.7-flash";

      break;

    case "groq":
      apiKey =
        (await getSetting("ai_groq_key")) ||
        process.env.GROQ_API_KEY ||
        "";

      model =
        (await getSetting("ai_groq_model")) ||
        process.env.GROQ_MODEL ||
        "llama-3.3-70b-versatile";

      break;

    case "custom":
      apiKey =
        (await getSetting("ai_custom_key")) ||
        process.env.CUSTOM_AI_API_KEY ||
        "";

      model =
        (await getSetting("ai_custom_model")) ||
        process.env.CUSTOM_AI_MODEL ||
        "";

      baseUrl =
        (await getSetting("ai_custom_url")) ||
        process.env.CUSTOM_AI_BASE_URL ||
        "";

      break;

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }

  if (!apiKey) {
    throw new Error(
      `No API key configured for AI provider "${provider}".`
    );
  }

  if (!model) {
    throw new Error(
      `No model configured for AI provider "${provider}".`
    );
  }

  if (provider === "custom" && !baseUrl) {
    throw new Error("Custom AI provider requires a base URL.");
  }

  return {
    provider,
    apiKey,
    model,
    baseUrl: baseUrl || undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*                                HTTP helper                                 */
/* -------------------------------------------------------------------------- */

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      text ||
      `HTTP ${response.status}`;

    throw new Error(`AI request failed: ${message}`);
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*                                Anthropic                                   */
/* -------------------------------------------------------------------------- */

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 5000
): Promise<string> {
  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    }
  );

  const data = await parseResponse(response);

  const text = data?.content
    ?.filter((item: any) => item?.type === "text")
    ?.map((item: any) => item.text)
    ?.join("\n");

  if (!text) {
    throw new Error("Anthropic returned an empty response.");
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                                  OpenAI                                    */
/* -------------------------------------------------------------------------- */

async function generateWithOpenAi(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 5000
): Promise<string> {
  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    }
  );

  const data = await parseResponse(response);

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                                  Gemini                                    */
/* -------------------------------------------------------------------------- */

async function generateWithGemini(
  apiKey: string,
  model: string,
  prompt: string,
  maxOutputTokens = 5000
): Promise<string> {
  const cleanModel = model.startsWith("models/")
    ? model
    : `models/${model}`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens,
        temperature: 0.3,
      },
    }),
  });

  const data = await parseResponse(response);

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text || "")
      ?.join("");

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                                   Groq                                     */
/* -------------------------------------------------------------------------- */

async function generateWithGroq(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 5000
): Promise<string> {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    }
  );

  const data = await parseResponse(response);

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Groq returned an empty response.");
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                          Custom OpenAI-compatible                           */
/* -------------------------------------------------------------------------- */

async function generateWithCustomEndpoint(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 5000
): Promise<string> {
  let url = baseUrl.replace(/\/+$/, "");

  if (!url.endsWith("/chat/completions")) {
    if (url.endsWith("/v1")) {
      url += "/chat/completions";
    } else {
      url += "/v1/chat/completions";
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const data = await parseResponse(response);

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Custom AI provider returned an empty response.");
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                              AI dispatcher                                 */
/* -------------------------------------------------------------------------- */

async function generateText(
  prompt: string,
  maxTokens = 5000
): Promise<string> {
  const config = await getAIConfig();

  switch (config.provider) {
    case "anthropic":
      return generateWithAnthropic(
        config.apiKey,
        config.model,
        prompt,
        maxTokens
      );

    case "openai":
      return generateWithOpenAi(
        config.apiKey,
        config.model,
        prompt,
        maxTokens
      );

    case "gemini":
      return generateWithGemini(
        config.apiKey,
        config.model,
        prompt,
        maxTokens
      );

    case "groq":
      return generateWithGroq(
        config.apiKey,
        config.model,
        prompt,
        maxTokens
      );

    case "custom":
      return generateWithCustomEndpoint(
        config.baseUrl!,
        config.apiKey,
        config.model,
        prompt,
        maxTokens
      );

    default:
      throw new Error(
        `Unsupported AI provider: ${config.provider}`
      );
  }
}

/* -------------------------------------------------------------------------- */
/*                             JSON extraction                                */
/* -------------------------------------------------------------------------- */

function cleanAIJson(text: string): string {
  let cleaned = text.trim();

  // Remove markdown code fences.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  // Find the first JSON array.
  const firstArray = cleaned.indexOf("[");
  const lastArray = cleaned.lastIndexOf("]");

  if (firstArray !== -1 && lastArray !== -1) {
    cleaned = cleaned.slice(firstArray, lastArray + 1);
  }

  return cleaned.trim();
}

function parseFlashcards(text: string): GeneratedFlashcard[] {
  const cleaned = cleanAIJson(text);

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `AI returned invalid flashcard JSON: ${cleaned.slice(0, 500)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI response was not a JSON array.");
  }

  const cards: GeneratedFlashcard[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const front =
      typeof (item as any).front === "string"
        ? (item as any).front.trim()
        : "";

    const back =
      typeof (item as any).back === "string"
        ? (item as any).back.trim()
        : "";

    if (!front || !back) {
      continue;
    }

    cards.push({
      front,
      back,
    });
  }

  if (!cards.length) {
    throw new Error("No valid flashcards were found in AI response.");
  }

  return cards;
}

/* -------------------------------------------------------------------------- */
/*                              Deduplication                                 */
/* -------------------------------------------------------------------------- */

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function deduplicateFlashcards(
  cards: GeneratedFlashcard[]
): GeneratedFlashcard[] {
  const seen = new Set<string>();
  const result: GeneratedFlashcard[] = [];

  for (const card of cards) {
    const key = normalizeText(card.front);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(card);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*                         Source material preparation                         */
/* -------------------------------------------------------------------------- */

function buildSourceMaterial(
  request: FlashcardGenerationRequest
): string {
  const sections: string[] = [];

  if (request.topicLabel) {
    sections.push(`TOPIC:
${request.topicLabel}`);
  }

  if (request.sourceText?.trim()) {
    sections.push(`SOURCE TEXT:
${request.sourceText.trim()}`);
  }

  if (request.mcqs?.length) {
    const mcqText = request.mcqs
      .map((mcq, index) => {
        const options = mcq.options?.length
          ? `Options: ${mcq.options.join(" | ")}`
          : "";

        const answer = mcq.answer
          ? `Answer: ${mcq.answer}`
          : "";

        const explanation = mcq.explanation
          ? `Explanation: ${mcq.explanation}`
          : "";

        return `
MCQ ${index + 1}
Question: ${mcq.question}
${options}
${answer}
${explanation}
        `.trim();
      })
      .join("\n\n");

    sections.push(`MCQ SOURCE:
${mcqText}`);
  }

  return sections.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/*                           Explanation generation                           */
/* -------------------------------------------------------------------------- */

export async function generateExplanation(
  question: string,
  answer: string,
  options?: string[],
  topic?: string
): Promise<string> {
  const prompt = `
You are an expert medical educator helping MBBS students.

Generate a clear, medically accurate explanation for the following MCQ.

Topic:
${topic || "Not specified"}

Question:
${question}

Options:
${options?.join("\n") || "Not provided"}

Correct answer:
${answer}

Requirements:
- Explain why the correct answer is correct.
- Briefly explain why the other options are incorrect when useful.
- Focus on clinically important reasoning.
- Use standard medical terminology.
- Do not invent facts that are not medically established.
- Keep the explanation concise but educational.
- Do not mention that you are an AI.
`;

  return generateText(prompt, 4000);
}

/* -------------------------------------------------------------------------- */
/*                        Flashcard explanation                                */
/* -------------------------------------------------------------------------- */

export async function generateFlashcardExplanation(
  front: string,
  back: string,
  topic?: string
): Promise<string> {
  const prompt = `
You are an expert medical educator.

Improve the educational explanation of this flashcard.

Topic:
${topic || "Not specified"}

Front:
${front}

Current back:
${back}

Requirements:
- Preserve the factual meaning.
- Make it medically accurate.
- Explain the concept clearly.
- Add important high-yield details when appropriate.
- Avoid unnecessary verbosity.
- Do not invent unsupported facts.
- Return only the improved answer text.
`;

  return generateText(prompt, 3000);
}

/* -------------------------------------------------------------------------- */
/*                        Single flashcard batch                               */
/* -------------------------------------------------------------------------- */

async function generateFlashcardBatch(
  sourceMaterial: string,
  topicLabel: string | undefined,
  count: number,
  previousCards: GeneratedFlashcard[]
): Promise<GeneratedFlashcard[]> {
  const previousText = previousCards.length
    ? `
Previously generated flashcards:

${previousCards
  .map(
    (card, index) =>
      `${index + 1}. ${card.front} → ${card.back}`
  )
  .join("\n")}

Do NOT duplicate these cards.
`
    : "";

  const prompt = `
You are an expert medical educator creating high-quality flashcards for MBBS students.

Topic:
${topicLabel || "Medical education"}

SOURCE MATERIAL:
${sourceMaterial}

${previousText}

Generate exactly ${count} NEW flashcards based ONLY on the source material.

Flashcard requirements:
- Test important medical knowledge.
- Prioritize high-yield concepts.
- Avoid trivial questions.
- Avoid duplicate concepts.
- Keep the front concise.
- Make the back clear and educational.
- Use correct medical terminology.
- Do not hallucinate information outside the provided material.
- Do not reference "the source".
- Do not add numbering.
- Do not use Markdown.
- Return ONLY valid JSON.

Required JSON format:

[
  {
    "front": "Question or prompt",
    "back": "Answer"
  }
]
`;

  const response = await generateText(
    prompt,
    Math.max(5000, count * 300)
  );

  return parseFlashcards(response);
}

/* -------------------------------------------------------------------------- */
/*                       Main flashcard generation                            */
/* -------------------------------------------------------------------------- */

export async function generateFlashcardSet(
  request: FlashcardGenerationRequest
): Promise<GeneratedFlashcard[]> {
  if (!request || typeof request !== "object") {
    throw new Error("Invalid flashcard generation request.");
  }

  const requestedCount = Number(request.count);

  if (
    !Number.isFinite(requestedCount) ||
    requestedCount < 1
  ) {
    throw new Error(
      "Flashcard count must be at least 1."
    );
  }

  const count = Math.min(
    Math.floor(requestedCount),
    MAX_FLASHCARDS
  );

  const sourceMaterial = buildSourceMaterial(request);

  if (!sourceMaterial.trim()) {
    throw new Error(
      "Source material is required to generate flashcards."
    );
  }

  const allCards: GeneratedFlashcard[] = [];

  let attempts = 0;

  while (
    allCards.length < count &&
    attempts < MAX_GENERATION_ATTEMPTS
  ) {
    attempts++;

    const remaining = count - allCards.length;

    const batchCount = Math.min(
      remaining,
      FLASHCARD_BATCH_SIZE
    );

    try {
      const batch = await generateFlashcardBatch(
        sourceMaterial,
        request.topicLabel,
        batchCount,
        allCards
      );

      const uniqueBatch = deduplicateFlashcards([
        ...allCards,
        ...batch,
      ]);

      allCards.length = 0;
      allCards.push(...uniqueBatch);

      if (allCards.length >= count) {
        break;
      }
    } catch (error) {
      if (attempts >= MAX_GENERATION_ATTEMPTS) {
        throw error;
      }
    }
  }

  const finalCards = deduplicateFlashcards(allCards).slice(
    0,
    count
  );

  if (!finalCards.length) {
    throw new Error(
      "Unable to generate flashcards from the supplied material."
    );
  }

  return finalCards;
}

import { getSetting } from "./settings";

export type AIProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "groq"
  | "custom";

/**
 * Used by the explanations route to distinguish
 * configuration problems from normal AI/API errors.
 */
export class AiNotConfiguredError extends Error {
  constructor(message = "AI provider is not configured.") {
    super(message);
    this.name = "AiNotConfiguredError";

    Object.setPrototypeOf(
      this,
      AiNotConfiguredError.prototype
    );
  }
}

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

<<<<<<< HEAD
const MAX_FLASHCARDS = 100;
const FLASHCARD_BATCH_SIZE = 20;
const MAX_GENERATION_ATTEMPTS = 4;

/* -------------------------------------------------------------------------- */
/*                              AI CONFIGURATION                              */
/* -------------------------------------------------------------------------- */

async function getAIConfig(): Promise<{
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}> {
  const providerValue =
    (await getSetting("ai_provider")) ||
    process.env.AI_PROVIDER ||
    "gemini";

  const provider = providerValue as AIProvider;

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
      throw new AiNotConfiguredError(
        `Unsupported AI provider: ${providerValue}`
      );
  }

  if (!apiKey) {
    throw new AiNotConfiguredError(
      `No API key configured for AI provider "${provider}".`
    );
  }

  if (!model) {
    throw new AiNotConfiguredError(
      `No model configured for AI provider "${provider}".`
    );
  }

  if (provider === "custom" && !baseUrl) {
    throw new AiNotConfiguredError(
      "Custom AI provider requires a base URL."
    );
  }

  return {
    provider,
    apiKey,
    model,
    baseUrl: baseUrl || undefined,
  };
=======
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
>>>>>>> 2ee909e (Initial MedSchoolProffs upload)
}

/* -------------------------------------------------------------------------- */
/*                              RESPONSE PARSER                               */
/* -------------------------------------------------------------------------- */

async function parseResponse(
  response: Response
): Promise<any> {
  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text,
    };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.type ||
      data?.message ||
      data?.error ||
      data?.raw ||
      `HTTP ${response.status}`;

    throw new Error(
      `AI request failed: ${message}`
    );
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*                                ANTHROPIC                                   */
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
    ?.filter(
      (item: any) => item?.type === "text"
    )
    ?.map(
      (item: any) => item.text
    )
    ?.join("\n");

  if (!text) {
    throw new Error(
      "Anthropic returned an empty response."
    );
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                                  OPENAI                                    */
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

  const text =
    data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error(
      "OpenAI returned an empty response."
    );
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                                  GEMINI                                    */
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
      ?.map(
        (part: any) => part?.text || ""
      )
      ?.join("");

  if (!text) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                                   GROQ                                     */
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

  const text =
    data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error(
      "Groq returned an empty response."
    );
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                          CUSTOM OPENAI COMPATIBLE                          */
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

  const text =
    data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error(
      "Custom AI provider returned an empty response."
    );
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/*                              AI DISPATCHER                                 */
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
      throw new AiNotConfiguredError(
        `Unsupported AI provider: ${config.provider}`
      );
  }
}

/* -------------------------------------------------------------------------- */
/*                              JSON CLEANING                                 */
/* -------------------------------------------------------------------------- */

function cleanAIJson(
  text: string
): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(
    /^```(?:json)?\s*/i,
    ""
  );

  cleaned = cleaned.replace(
    /\s*```$/i,
    ""
  );

  const firstArray =
    cleaned.indexOf("[");

  const lastArray =
    cleaned.lastIndexOf("]");

  if (
    firstArray !== -1 &&
    lastArray !== -1 &&
    lastArray > firstArray
  ) {
    cleaned = cleaned.slice(
      firstArray,
      lastArray + 1
    );
  }

  return cleaned.trim();
}

/* -------------------------------------------------------------------------- */
/*                           FLASHCARD PARSER                                 */
/* -------------------------------------------------------------------------- */

function parseFlashcards(
  text: string
): GeneratedFlashcard[] {
  const cleaned = cleanAIJson(text);

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `AI returned invalid flashcard JSON: ${cleaned.slice(
        0,
        500
      )}`
    );
  }

<<<<<<< HEAD
  if (!Array.isArray(parsed)) {
    throw new Error(
      "AI response was not a JSON array."
    );
=======
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
    "Each question needs exactly 4 options (A-D equivalent, but return them as a plain string array, not labeled), one correct answer that must be an exact string match to one of the options, and a concise 1-3 sentence explanation of why it's correct.",
    "Vary the sub-topics, question stems, and clinical vs. factual framing across the set so it doesn't feel repetitive.",
    existingBlock,
    `Remember: this entire question set is about "${topicLabel}" — nothing else.`,
    "",
    "Respond with ONLY a valid JSON array, no prose before or after, no code fences, in this exact shape:",
    '[{"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "...", "explanation": "..."}]',
  ].join("\n");
}

function parseMcqJson(raw: string): GeneratedMcq[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("AI did not return valid MCQ JSON");
    parsed = JSON.parse(match[0]);
  }
  if (!Array.isArray(parsed)) throw new Error("AI did not return an MCQ array");
  return parsed
    .filter((m): m is { question: unknown; options: unknown; correctAnswer: unknown; explanation: unknown } => !!m && typeof m === "object")
    .map((m) => ({
      question: String((m as { question: unknown }).question ?? "").trim(),
      options: Array.isArray((m as { options: unknown }).options) ? ((m as { options: unknown[] }).options).map((o) => String(o).trim()).filter(Boolean) : [],
      correctAnswer: String((m as { correctAnswer: unknown }).correctAnswer ?? "").trim(),
      explanation: String((m as { explanation: unknown }).explanation ?? "").trim(),
    }))
    // Drop malformed entries (missing question/options) and ones where the
    // "correct answer" doesn't actually match one of the options — better to
    // silently skip a bad row than hand the admin a question with no valid
    // correct answer to review.
    .filter((m) => m.question.length > 0 && m.options.length >= 2 && m.options.includes(m.correctAnswer));
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
>>>>>>> 2ee909e (Initial MedSchoolProffs upload)
  }

  const cards: GeneratedFlashcard[] = [];

  for (const item of parsed) {
    if (
      !item ||
      typeof item !== "object"
    ) {
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
    throw new Error(
      "No valid flashcards were found in AI response."
    );
  }

  return cards;
}

/* -------------------------------------------------------------------------- */
/*                              DEDUPLICATION                                 */
/* -------------------------------------------------------------------------- */

function normalizeText(
  value: string
): string {
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
    const key = normalizeText(
      card.front
    );

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push(card);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*                         SOURCE MATERIAL BUILDER                            */
/* -------------------------------------------------------------------------- */

function buildSourceMaterial(
  request: FlashcardGenerationRequest
): string {
  const sections: string[] = [];

  if (request.topicLabel) {
    sections.push(
      `TOPIC:\n${request.topicLabel}`
    );
  }

  if (request.sourceText?.trim()) {
    sections.push(
      `SOURCE TEXT:\n${request.sourceText.trim()}`
    );
  }

  if (request.mcqs?.length) {
    const mcqText = request.mcqs
      .map((mcq, index) => {
        const options =
          mcq.options?.length
            ? `Options: ${mcq.options.join(
                " | "
              )}`
            : "";

        const answer =
          mcq.answer
            ? `Answer: ${mcq.answer}`
            : "";

        const explanation =
          mcq.explanation
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

    sections.push(
      `MCQ SOURCE:\n${mcqText}`
    );
  }

  return sections.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/*                         MCQ EXPLANATION GENERATION                         */
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
- Keep the explanation concise but educational.
- Do not invent facts.
- Do not mention that you are an AI.
`;

  return generateText(
    prompt,
    4000
  );
}

/* -------------------------------------------------------------------------- */
/*                     FLASHCARD EXPLANATION GENERATION                      */
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

  return generateText(
    prompt,
    3000
  );
}

/* -------------------------------------------------------------------------- */
/*                       FLASHCARD BATCH GENERATION                          */
/* -------------------------------------------------------------------------- */

async function generateFlashcardBatch(
  sourceMaterial: string,
  topicLabel: string | undefined,
  count: number,
  previousCards: GeneratedFlashcard[]
): Promise<GeneratedFlashcard[]> {
  const previousText =
    previousCards.length
      ? `
Previously generated flashcards:

${previousCards
  .map(
    (card, index) =>
      `${index + 1}. ${card.front} → ${card.back}`
  )
  .join("\n")}

Do NOT duplicate these flashcards.
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

Requirements:
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
    Math.max(
      5000,
      count * 300
    )
  );

  return parseFlashcards(
    response
  );
}

/* -------------------------------------------------------------------------- */
/*                       MAIN FLASHCARD GENERATOR                             */
/* -------------------------------------------------------------------------- */

export async function generateFlashcardSet(
  request: FlashcardGenerationRequest
): Promise<GeneratedFlashcard[]> {
  if (
    !request ||
    typeof request !== "object"
  ) {
    throw new Error(
      "Invalid flashcard generation request."
    );
  }

  const requestedCount =
    Number(request.count);

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

  const sourceMaterial =
    buildSourceMaterial(request);

  if (!sourceMaterial.trim()) {
    throw new Error(
      "Source material is required to generate flashcards."
    );
  }

  const allCards: GeneratedFlashcard[] =
    [];

  let attempts = 0;

  while (
    allCards.length < count &&
    attempts < MAX_GENERATION_ATTEMPTS
  ) {
    attempts++;

    const remaining =
      count - allCards.length;

    const batchCount = Math.min(
      remaining,
      FLASHCARD_BATCH_SIZE
    );

    try {
      const batch =
        await generateFlashcardBatch(
          sourceMaterial,
          request.topicLabel,
          batchCount,
          allCards
        );

      const uniqueCards =
        deduplicateFlashcards([
          ...allCards,
          ...batch,
        ]);

      allCards.length = 0;

      allCards.push(
        ...uniqueCards
      );

      if (
        allCards.length >= count
      ) {
        break;
      }
    } catch (error) {
      if (
        attempts >=
        MAX_GENERATION_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  const finalCards =
    deduplicateFlashcards(
      allCards
    ).slice(0, count);

  if (!finalCards.length) {
    throw new Error(
      "Unable to generate flashcards from the supplied material."
    );
  }

  return finalCards;
}

/** Generates draft MCQs strictly scoped to the given topic — see
 * buildMcqGenerationPrompt for the anti-drift prompt design. Callers should
 * treat these as editable drafts for admin review, not auto-publish. */
export async function generateMcqSet(request: McqGenerationRequest): Promise<GeneratedMcq[]> {
  const raw = await runPrompt(buildMcqGenerationPrompt(request));
  const parsed = parseMcqJson(raw);
  // Cheap post-hoc relevance guard: if the model still ignored the topic
  // instruction, at least surface fewer, better results rather than a full
  // batch of noise — cap to what actually parsed cleanly.
  return parsed.slice(0, request.count);
}

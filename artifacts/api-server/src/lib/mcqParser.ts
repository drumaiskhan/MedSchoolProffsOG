export interface ParsedMcqCandidate {
  question: string;
  options: string[];
  correctAnswer: string | null;
  explanation: string | null;
  reference: string | null;
  needsReview: boolean;
  rawBlock?: string;
}

export interface ImportPatternSet {
  questionPattern: string;
  optionPattern: string;
  answerPattern: string;
  explanationPattern: string;
}

export const DEFAULT_IMPORT_PATTERNS: ImportPatternSet = {
  // Matches "1.", "1)", "Q1.", "Q1)", "Q1:" at the start of a line
  questionPattern: "^\\s*(?:Q\\.?\\s*)?(\\d{1,3})[\\.\\):]\\s+(.+)$",
  // Matches "A.", "A)", "(A)", "a." etc for option lines — A through E so a
  // 5th option ("E") is recognized, not just the classic A-D.
  optionPattern: "^\\s*\\(?([A-Ea-e])\\)?[\\.\\):]\\s+(.+)$",
  // Matches "Answer: B", "Ans - C", "Correct Answer: D", "Key: A" (also E)
  answerPattern: "^\\s*(?:Answer|Ans|Correct\\s*Answer|Key)\\s*[:\\-]\\s*\\(?([A-Ea-e])\\)?",
  // Matches "Explanation: ...", "Rationale: ...", "Explain: ..."
  explanationPattern: "^\\s*(?:Explanation|Rationale|Explain)\\s*[:\\-]\\s*(.+)$",
};

// A second built-in preset for sources that number their options (1./1))
// instead of lettering them, with a numeric answer key ("Answer: 2").
export const NUMBERED_IMPORT_PATTERNS: ImportPatternSet = {
  questionPattern: DEFAULT_IMPORT_PATTERNS.questionPattern,
  optionPattern: "^\\s*\\(?([1-5])\\)?[\\.\\):]\\s+(.+)$",
  answerPattern: "^\\s*(?:Answer|Ans\\.?|Correct\\s*Answer|Key)\\s*[:\\-]\\s*\\(?([1-5])\\)?",
  explanationPattern: DEFAULT_IMPORT_PATTERNS.explanationPattern,
};

function buildRegex(pattern: string): RegExp {
  return new RegExp(pattern, "i");
}

// Inline correct-answer markers next to the option itself, instead of a
// separate "Answer:" line — e.g. "*C) Answer text", "C) Answer text (check)",
// or a "[correct]" tag.
function hasInlineCorrectMarker(rawLine: string): boolean {
  return /^\s*\*/.test(rawLine) || /[\u2713\u2714]\s*$/.test(rawLine) || /\[correct\]/i.test(rawLine);
}
function stripInlineCorrectMarker(text: string): string {
  return text.replace(/^\s*\*+\s*/, "").replace(/\s*[\u2713\u2714]\s*$/, "").replace(/\s*\[correct\]\s*/gi, "").trim();
}

// Loosen "Answer" line label variants beyond what a single regex easily
// captures (Ans., Ans -, Correct option, Correct choice, etc.), and allow
// the key to be the full option text instead of a letter/number.
const ANSWER_LABEL_LINE = /^\s*(?:answer|ans\.?|correct\s*answer|correct\s*option|correct\s*choice|key)\s*[:\-]\s*(.+)$/i;
const TRUE_FALSE_OPTION = /^\s*(true|false|t|f)\s*[.):]?\s*$/i;

function optionLetterOrNumber(raw: string): string | null {
  const m = raw.trim().match(/^\(?([A-Ea-e]|[1-5])\)?$/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Splits raw extracted text into MCQ candidates. Tries the given (or
 * admin-saved) pattern set first; for option/answer lines it doesn't match,
 * it also checks a few common variants per line (numbered options, inline
 * "*"/"✓" correct markers, True/False, loosened answer labels, full-text
 * answer keys) so one parse pass auto-detects mixed/varied formats rather
 * than requiring a perfectly uniform file.
 */
export function extractMcqsFromText(rawText: string, patterns: ImportPatternSet = DEFAULT_IMPORT_PATTERNS): ParsedMcqCandidate[] {
  const primaryOptionRe = buildRegex(patterns.optionPattern);
  const numberedOptionRe = buildRegex(NUMBERED_IMPORT_PATTERNS.optionPattern);
  const questionRe = buildRegex(patterns.questionPattern);
  const answerRe = buildRegex(patterns.answerPattern);
  const numberedAnswerRe = buildRegex(NUMBERED_IMPORT_PATTERNS.answerPattern);
  const explanationRe = buildRegex(patterns.explanationPattern);

  const lines = rawText.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  type Block = { questionLines: string[]; optionLines: { key: string; text: string; inlineCorrect: boolean }[]; answerKey: string | null; explanationLines: string[]; raw: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;
  let mode: "question" | "option" | "explanation" = "question";

  for (const line of lines) {
    const qMatch = line.match(questionRe);
    if (qMatch) {
      if (current) blocks.push(current);
      current = { questionLines: [qMatch[qMatch.length - 1] ?? line], optionLines: [], answerKey: null, explanationLines: [], raw: [line] };
      mode = "question";
      continue;
    }
    if (!current) continue; // ignore preamble text before the first recognized question
    current.raw.push(line);

    // Try the configured option pattern first, then fall back to the
    // numbered-option preset — lets one parse pass auto-detect either
    // lettered ("A)") or numbered ("1)") option styles per block.
    const optMatch = line.match(primaryOptionRe) ?? line.match(numberedOptionRe);
    if (optMatch) {
      const inlineCorrect = hasInlineCorrectMarker(line);
      const text = stripInlineCorrectMarker(optMatch[2]);
      current.optionLines.push({ key: optMatch[1].toUpperCase(), text, inlineCorrect });
      if (inlineCorrect) current.answerKey = optMatch[1].toUpperCase();
      mode = "option";
      continue;
    }

    // True/False style questions (2 options, no lettering at all).
    const tfMatch = line.match(TRUE_FALSE_OPTION);
    if (tfMatch && current.optionLines.length < 2) {
      const normalized = /^t/i.test(tfMatch[1]) ? "True" : "False";
      const key = normalized === "True" ? "A" : "B";
      const inlineCorrect = hasInlineCorrectMarker(line);
      current.optionLines.push({ key, text: normalized, inlineCorrect });
      if (inlineCorrect) current.answerKey = key;
      mode = "option";
      continue;
    }

    const ansMatch = line.match(answerRe) ?? line.match(numberedAnswerRe);
    if (ansMatch) {
      current.answerKey = ansMatch[1].toUpperCase();
      mode = "explanation";
      continue;
    }
    // Loosened answer-label line (handles label variants the strict
    // pattern above might miss, and full-option-text answer keys).
    const looseAns = line.match(ANSWER_LABEL_LINE);
    if (looseAns) {
      const value = looseAns[1].trim();
      const asKeyOrNumber = optionLetterOrNumber(value);
      if (asKeyOrNumber) {
        current.answerKey = asKeyOrNumber;
      } else {
        // Full option text given as the answer — resolve by comparing
        // (case-insensitively, trimmed) against parsed option text.
        const normalizedValue = value.toLowerCase();
        const matchByText = current.optionLines.find((o) => o.text.trim().toLowerCase() === normalizedValue);
        if (matchByText) current.answerKey = matchByText.key;
        else if (/^true$/i.test(value)) current.answerKey = "A";
        else if (/^false$/i.test(value)) current.answerKey = "B";
      }
      mode = "explanation";
      continue;
    }
    const expMatch = line.match(explanationRe);
    if (expMatch) {
      current.explanationLines.push(expMatch[1]);
      mode = "explanation";
      continue;
    }
    // continuation line — append to whichever section we're in
    if (mode === "question" && current.optionLines.length === 0) current.questionLines.push(line);
    else if (mode === "option" && current.optionLines.length > 0) current.optionLines[current.optionLines.length - 1].text += " " + line;
    else if (mode === "explanation") current.explanationLines.push(line);
  }
  if (current) blocks.push(current);

  return blocks.map((block) => {
    const question = block.questionLines.join(" ").trim();
    const options = block.optionLines.sort((a, b) => a.key.localeCompare(b.key)).map((o) => o.text.trim());
    const answerOption = block.answerKey ? block.optionLines.find((o) => o.key === block.answerKey) : undefined;
    const correctAnswer = answerOption ? answerOption.text.trim() : null;
    const explanation = block.explanationLines.join(" ").trim() || null;
    const needsReview = !question || options.length < 2 || !correctAnswer;
    return { question, options, correctAnswer, explanation, reference: null, needsReview, rawBlock: block.raw.join("\n") };
  }).filter((c) => c.question.length > 0);
}

const HEADER_ALIASES: Record<string, string[]> = {
  question: ["question", "questions", "q", "stem"],
  optionA: ["optiona", "option a", "a", "choice a", "opt a"],
  optionB: ["optionb", "option b", "b", "choice b", "opt b"],
  optionC: ["optionc", "option c", "c", "choice c", "opt c"],
  optionD: ["optiond", "option d", "d", "choice d", "opt d"],
  optionE: ["optione", "option e", "e", "choice e", "opt e"],
  answer: ["answer", "correct answer", "correct", "key", "ans"],
  explanation: ["explanation", "rationale", "explain", "reason"],
  reference: ["reference", "ref", "source"],
};

function matchHeader(header: string): string | null {
  const normalized = header.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

/**
 * Parses tabular rows (from a parsed .xlsx sheet or .csv) into MCQ
 * candidates using a header row to identify columns. Returns null if no
 * recognizable question/option columns are found — callers should fall
 * back to text-pattern extraction (e.g. by joining all cells into text).
 */
export function extractMcqsFromRows(rows: string[][]): ParsedMcqCandidate[] | null {
  if (rows.length < 2) return null;
  const headerRow = rows[0].map((h) => matchHeader(String(h ?? "")));
  const questionCol = headerRow.indexOf("question");
  const optionCols = ["optionA", "optionB", "optionC", "optionD", "optionE"].map((k) => headerRow.indexOf(k));
  if (questionCol === -1 || optionCols.every((c) => c === -1)) return null;
  const answerCol = headerRow.indexOf("answer");
  const explanationCol = headerRow.indexOf("explanation");
  const referenceCol = headerRow.indexOf("reference");

  const candidates: ParsedMcqCandidate[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const question = String(row[questionCol] ?? "").trim();
    if (!question) continue;
    const options = optionCols.map((c) => (c >= 0 ? String(row[c] ?? "").trim() : "")).filter((o) => o.length > 0);
    let correctAnswer: string | null = null;
    if (answerCol >= 0) {
      const rawAnswer = String(row[answerCol] ?? "").trim();
      if (/^[A-Ea-e]$/.test(rawAnswer)) {
        const idx = rawAnswer.toUpperCase().charCodeAt(0) - 65;
        correctAnswer = options[idx] ?? null;
      } else if (/^[1-5]$/.test(rawAnswer)) {
        const idx = Number(rawAnswer) - 1;
        correctAnswer = options[idx] ?? null;
      } else if (rawAnswer) {
        // Full text answer already, or matches an option case-insensitively.
        const byText = options.find((o) => o.toLowerCase() === rawAnswer.toLowerCase());
        correctAnswer = byText ?? rawAnswer;
      }
    }
    const explanation = explanationCol >= 0 ? String(row[explanationCol] ?? "").trim() || null : null;
    const reference = referenceCol >= 0 ? String(row[referenceCol] ?? "").trim() || null : null;
    candidates.push({ question, options, correctAnswer, explanation, reference, needsReview: options.length < 2 || !correctAnswer });
  }
  return candidates;
}

export interface ParsedMcqCandidate {
  question: string;
  options: string[];
  correctAnswer: string | null;
  explanation: string | null;
  // Index-aligned with `options` — why each individual option is right or
  // wrong (not just why the correct one is right). null/empty entries mean
  // "no specific explanation was found for this option in the source file."
  optionExplanations: (string | null)[] | null;
  reference: string | null;
  // A short pre-answer nudge distinct from `explanation` — shown to a
  // student WHILE attempting the question, so it must not reveal the
  // answer. Parsed from a "Hint:" line if the source file has one;
  // otherwise left null and can still be AI-generated later (see
  // generateHint in lib/aiExplain.ts and the auto-explain-on-import queue).
  hint: string | null;
  needsReview: boolean;
  rawBlock?: string;
  // Round 3, item 5 — the file-import pipeline never had a difficulty
  // field at all (unlike the AI-drafted-MCQ and manual/bulk-add forms,
  // which already did per the earlier difficulty fix). The parser has no
  // reliable signal for this from raw file text, so every candidate starts
  // at "moderate" and the admin adjusts it per-question in the review UI
  // before committing — same default the DB column itself uses.
  // Tabular sources (see extractMcqsFromRows) CAN carry a real difficulty
  // column though (e.g. "Difficulty_Scale": Easy/Medium/Hard) — when one is
  // found and recognized, this is the mapped value instead of the blanket
  // "moderate" fallback.
  difficulty: "easy" | "moderate" | "hard";
  // Populated only from tabular sources with recognizable Block/Module/
  // Subject/Topic-ish columns (see HEADER_ALIASES and extractMcqsFromRows
  // below) — e.g. an "enriched" question-bank export that tags every row
  // with its place in the curriculum (Block-I > Module 3 > Subject >
  // Chapter/Theme). This is a *suggestion* only: nothing in the app's
  // Block -> Module -> Subject -> Topic hierarchy is auto-created or
  // matched from it. The import-review UI/commit route would need to read
  // this, let the admin confirm/edit it, and resolve or create the actual
  // rows (moduleAdminApi/blockAdminApi/subjectAdminApi/topicAdminApi) for
  // it to do anything yet — see AI_HANDOFF note on this feature.
  suggestedPath?: { block: string | null; module: string | null; subject: string | null; topic: string | null } | null;
}

export interface ImportPatternSet {
  questionPattern: string;
  optionPattern: string;
  answerPattern: string;
  explanationPattern: string;
  // Optional — profiles saved before this field existed won't have one, so
  // every read-site falls back to DEFAULT_IMPORT_PATTERNS.hintPattern /
  // .referencePattern (see extractMcqsFromText below). Nullable too since a
  // profile row loaded straight from the DB (nullable columns) is assigned
  // to this type as-is.
  hintPattern?: string | null;
  referencePattern?: string | null;
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
  // Matches "Hint: ...", "Tip: ...", "Clue: ..."
  hintPattern: "^\\s*(?:Hint|Tip|Clue)\\s*[:\\-]\\s*(.+)$",
  // Matches "Reference: ...", "Ref: ...", "Source: ...", "Citation: ..."
  referencePattern: "^\\s*(?:Reference|Ref|Source|Citation)\\s*[:\\-]\\s*(.+)$",
};

// A second built-in preset for sources that number their options (1./1))
// instead of lettering them, with a numeric answer key ("Answer: 2").
export const NUMBERED_IMPORT_PATTERNS: ImportPatternSet = {
  questionPattern: DEFAULT_IMPORT_PATTERNS.questionPattern,
  optionPattern: "^\\s*\\(?([1-5])\\)?[\\.\\):]\\s+(.+)$",
  answerPattern: "^\\s*(?:Answer|Ans\\.?|Correct\\s*Answer|Key)\\s*[:\\-]\\s*\\(?([1-5])\\)?",
  explanationPattern: DEFAULT_IMPORT_PATTERNS.explanationPattern,
  hintPattern: DEFAULT_IMPORT_PATTERNS.hintPattern,
  referencePattern: DEFAULT_IMPORT_PATTERNS.referencePattern,
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
  // Fall back to the built-in defaults when a saved profile predates these
  // two fields (see ImportPatternSet's own comment).
  const hintRe = buildRegex(patterns.hintPattern ?? DEFAULT_IMPORT_PATTERNS.hintPattern!);
  const referenceRe = buildRegex(patterns.referencePattern ?? DEFAULT_IMPORT_PATTERNS.referencePattern!);

  const lines = rawText.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  type Block = { questionLines: string[]; optionLines: { key: string; text: string; inlineCorrect: boolean; explanationLines: string[] }[]; answerKey: string | null; explanationLines: string[]; hintLines: string[]; referenceLines: string[]; raw: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;
  // "option-explanation" is a distinct mode from "explanation" — it means
  // an explanation line was found directly attached to the option just
  // above it (per-option format), so continuation lines should keep
  // appending to THAT option's explanation rather than to a whole-block
  // explanation or the option's own text. "hint" and "reference" are their
  // own whole-block modes, same shape as "explanation".
  let mode: "question" | "option" | "option-explanation" | "explanation" | "hint" | "reference" = "question";

  for (const line of lines) {
    const qMatch = line.match(questionRe);
    if (qMatch) {
      if (current) blocks.push(current);
      current = { questionLines: [qMatch[qMatch.length - 1] ?? line], optionLines: [], answerKey: null, explanationLines: [], hintLines: [], referenceLines: [], raw: [line] };
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
      current.optionLines.push({ key: optMatch[1].toUpperCase(), text, inlineCorrect, explanationLines: [] });
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
      current.optionLines.push({ key, text: normalized, inlineCorrect, explanationLines: [] });
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
    // Hint and Reference lines are checked before the generic Explanation
    // pattern (and can appear anywhere in the block — before or after the
    // answer key) since they're distinct labeled fields, not part of the
    // explanation text itself.
    const hintMatch = line.match(hintRe);
    if (hintMatch) { current.hintLines.push(hintMatch[1]); mode = "hint"; continue; }
    const refMatch = line.match(referenceRe);
    if (refMatch) { current.referenceLines.push(refMatch[1]); mode = "reference"; continue; }
    const expMatch = line.match(explanationRe);
    if (expMatch) {
      // An explanation line that directly follows an option (before the
      // next option, an answer line, or the next question) is that
      // option's own explanation — a per-option format, e.g.:
      //   A) Some option
      //   Explanation: why this is right/wrong
      //   B) Next option
      //   Explanation: why THIS one is right/wrong
      // Otherwise (appearing after "Answer: X", or with no options seen
      // yet) it's the whole-question explanation, as before.
      if (mode === "option" && current.optionLines.length > 0) {
        current.optionLines[current.optionLines.length - 1].explanationLines.push(expMatch[1]);
        mode = "option-explanation";
      } else {
        current.explanationLines.push(expMatch[1]);
        mode = "explanation";
      }
      continue;
    }
    // continuation line — append to whichever section we're in
    if (mode === "question" && current.optionLines.length === 0) current.questionLines.push(line);
    else if (mode === "option" && current.optionLines.length > 0) current.optionLines[current.optionLines.length - 1].text += " " + line;
    else if (mode === "option-explanation" && current.optionLines.length > 0) current.optionLines[current.optionLines.length - 1].explanationLines.push(line);
    else if (mode === "explanation") current.explanationLines.push(line);
    else if (mode === "hint") current.hintLines.push(line);
    else if (mode === "reference") current.referenceLines.push(line);
  }
  if (current) blocks.push(current);

  return blocks.map((block) => {
    const sortedOptions = block.optionLines.sort((a, b) => a.key.localeCompare(b.key));
    const question = block.questionLines.join(" ").trim();
    const options = sortedOptions.map((o) => o.text.trim());
    const optionExplanationTexts = sortedOptions.map((o) => o.explanationLines.join(" ").trim() || null);
    const hasAnyOptionExplanation = optionExplanationTexts.some((e) => e != null);
    const answerOption = block.answerKey ? sortedOptions.find((o) => o.key === block.answerKey) : undefined;
    const correctAnswer = answerOption ? answerOption.text.trim() : null;
    // Whole-question `explanation` prefers an explicit block-level
    // explanation (after "Answer: X"); falls back to the correct option's
    // own per-option explanation if that's the only kind the file had, so
    // existing UI that only reads the single `explanation` field still
    // shows something sensible.
    const blockExplanation = block.explanationLines.join(" ").trim() || null;
    const correctOptionExplanation = answerOption ? optionExplanationTexts[sortedOptions.indexOf(answerOption)] : null;
    const explanation = blockExplanation || correctOptionExplanation;
    const hint = block.hintLines.join(" ").trim() || null;
    const reference = block.referenceLines.join(" ").trim() || null;
    const needsReview = !question || options.length < 2 || !correctAnswer;
    return { question, options, correctAnswer, explanation, optionExplanations: hasAnyOptionExplanation ? optionExplanationTexts : null, reference, hint, needsReview, rawBlock: block.raw.join("\n"), difficulty: "moderate" as const, suggestedPath: null };
  }).filter((c) => c.question.length > 0);
}

const HEADER_ALIASES: Record<string, string[]> = {
  // "stem" and "question stem" cover the "enriched question-bank" export
  // style (e.g. "Question_stem") seen alongside per-option clarification
  // columns and a curriculum-hierarchy tag per row — see the block/module/
  // subject/topic aliases and suggestedPath below.
  question: ["question", "questions", "q", "stem", "question stem"],
  optionA: ["optiona", "option a", "a", "choice a", "opt a"],
  optionB: ["optionb", "option b", "b", "choice b", "opt b"],
  optionC: ["optionc", "option c", "c", "choice c", "opt c"],
  optionD: ["optiond", "option d", "d", "choice d", "opt d"],
  optionE: ["optione", "option e", "e", "choice e", "opt e"],
  answer: ["answer", "correct answer", "correct", "key", "ans", "correct option"],
  explanation: ["explanation", "rationale", "explain", "reason", "concept explanation"],
  // Per-option explanation columns — "why is A right/wrong", "why is B
  // right/wrong", etc. Distinct from the single whole-question
  // "explanation" column above. "option clarification a" etc. covers the
  // enriched-export naming ("Option_Clarification_A").
  explanationA: ["explanationa", "explanation a", "why a", "rationale a", "explain a", "reason a", "option clarification a"],
  explanationB: ["explanationb", "explanation b", "why b", "rationale b", "explain b", "reason b", "option clarification b"],
  explanationC: ["explanationc", "explanation c", "why c", "rationale c", "explain c", "reason c", "option clarification c"],
  explanationD: ["explanationd", "explanation d", "why d", "rationale d", "explain d", "reason d", "option clarification d"],
  explanationE: ["explanatione", "explanation e", "why e", "rationale e", "explain e", "reason e", "option clarification e"],
  reference: ["reference", "ref", "source"],
  hint: ["hint", "tip", "clue", "question hint"],
  // Real difficulty signal when a source provides one (e.g.
  // "Difficulty_Scale": Easy/Medium/Hard) — mapped to the app's
  // easy/moderate/hard enum in extractMcqsFromRows below, instead of every
  // row silently defaulting to "moderate".
  difficulty: ["difficulty", "difficulty scale", "difficulty level"],
  // Bonus context columns some enriched exports include per question.
  // These don't have their own DB field, so they're folded into the
  // whole-question `explanation` as labeled paragraphs (see
  // buildEnrichedExplanation below) rather than silently dropped.
  keyTakeaway: ["key takeaway", "takeaway"],
  commonPitfall: ["common pitfall", "pitfall"],
  clinicalPearl: ["clinical pearl", "pearl"],
  learningObjective: ["lo", "learning objective", "objective"],
  // Curriculum-placement columns — see suggestedPath on
  // ParsedMcqCandidate. "chapter"/"topic" are treated as the same
  // (whichever the file uses) since both are the finest-grained label
  // available, one level below "theme".
  hierBlock: ["block"],
  hierModule: ["module"],
  hierSubject: ["subject"],
  hierTheme: ["theme"],
  hierChapter: ["chapter", "topic"],
};

function matchHeader(header: string): string | null {
  // Normalize underscores/hyphens to spaces (so "Option_A" / "Option-A"
  // match the "option a" alias the same as "Option A" does) and collapse
  // repeated whitespace before comparing.
  const normalized = header.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

const DIFFICULTY_ALIASES: Record<string, "easy" | "moderate" | "hard"> = {
  easy: "easy", e: "easy", low: "easy", basic: "easy", "1": "easy",
  medium: "moderate", moderate: "moderate", mid: "moderate", m: "moderate", average: "moderate", "2": "moderate",
  hard: "hard", h: "hard", difficult: "hard", high: "hard", "3": "hard",
};

function normalizeDifficulty(raw: string | undefined): "easy" | "moderate" | "hard" {
  if (!raw) return "moderate";
  const key = raw.trim().toLowerCase();
  return DIFFICULTY_ALIASES[key] ?? "moderate";
}

/**
 * Folds the bonus per-question context columns some enriched exports carry
 * (Key_Takeaway, Common_Pitfall, Clinical_Pearl, LO) into the whole-question
 * explanation as labeled paragraphs, so a file that has them doesn't lose
 * them just because there's no dedicated DB column for each. Only adds a
 * paragraph for whichever of the four columns is actually present and
 * non-empty on this row.
 */
function buildEnrichedExplanation(base: string | null, extra: { keyTakeaway?: string; commonPitfall?: string; clinicalPearl?: string; learningObjective?: string }): string | null {
  const parts = [base?.trim() || null];
  if (extra.learningObjective?.trim()) parts.push(`Learning objective: ${extra.learningObjective.trim()}`);
  if (extra.keyTakeaway?.trim()) parts.push(`Key takeaway: ${extra.keyTakeaway.trim()}`);
  if (extra.commonPitfall?.trim()) parts.push(`Common pitfall: ${extra.commonPitfall.trim()}`);
  if (extra.clinicalPearl?.trim()) parts.push(`Clinical pearl: ${extra.clinicalPearl.trim()}`);
  const joined = parts.filter((p): p is string => !!p).join("\n\n");
  return joined || null;
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
  const explanationCols = ["explanationA", "explanationB", "explanationC", "explanationD", "explanationE"].map((k) => headerRow.indexOf(k));
  const hasPerOptionExplanations = explanationCols.some((c) => c >= 0);
  const referenceCol = headerRow.indexOf("reference");
  const hintCol = headerRow.indexOf("hint");
  const difficultyCol = headerRow.indexOf("difficulty");
  // Bonus context + curriculum-placement columns (see HEADER_ALIASES'
  // own comments) — all optional, all -1 (ignored) for a plain question
  // bank that doesn't have them.
  const keyTakeawayCol = headerRow.indexOf("keyTakeaway");
  const commonPitfallCol = headerRow.indexOf("commonPitfall");
  const clinicalPearlCol = headerRow.indexOf("clinicalPearl");
  const learningObjectiveCol = headerRow.indexOf("learningObjective");
  const blockCol = headerRow.indexOf("hierBlock");
  const moduleCol = headerRow.indexOf("hierModule");
  const subjectCol = headerRow.indexOf("hierSubject");
  const themeCol = headerRow.indexOf("hierTheme");
  const chapterCol = headerRow.indexOf("hierChapter");
  const hasHierarchyCols = blockCol >= 0 || moduleCol >= 0 || subjectCol >= 0 || themeCol >= 0 || chapterCol >= 0;

  const candidates: ParsedMcqCandidate[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const question = String(row[questionCol] ?? "").trim();
    if (!question) continue;
    const options = optionCols.map((c) => (c >= 0 ? String(row[c] ?? "").trim() : "")).filter((o) => o.length > 0);
    let correctAnswer: string | null = null;
    let correctIndex = -1;
    if (answerCol >= 0) {
      const rawAnswer = String(row[answerCol] ?? "").trim();
      if (/^[A-Ea-e]$/.test(rawAnswer)) {
        correctIndex = rawAnswer.toUpperCase().charCodeAt(0) - 65;
        correctAnswer = options[correctIndex] ?? null;
      } else if (/^[1-5]$/.test(rawAnswer)) {
        correctIndex = Number(rawAnswer) - 1;
        correctAnswer = options[correctIndex] ?? null;
      } else if (rawAnswer) {
        // Full text answer already, or matches an option case-insensitively.
        const byIndex = options.findIndex((o) => o.toLowerCase() === rawAnswer.toLowerCase());
        correctIndex = byIndex;
        correctAnswer = byIndex >= 0 ? options[byIndex] : rawAnswer;
      }
    }
    // optionCols and explanationCols share the same A-E index order, but
    // optionCols may have gaps (a file with only A-D, no E) — filter
    // explanations down to the same positions that actually produced an
    // option above, so indices stay aligned with the filtered `options`.
    const optionExplanations = hasPerOptionExplanations
      ? optionCols.map((c, idx) => (c >= 0 ? (explanationCols[idx] >= 0 ? String(row[explanationCols[idx]] ?? "").trim() || null : null) : undefined)).filter((v) => v !== undefined) as (string | null)[]
      : null;
    const baseExplanation = explanationCol >= 0 ? String(row[explanationCol] ?? "").trim() || null : (optionExplanations && correctIndex >= 0 ? optionExplanations[correctIndex] : null);
    // Fold in Key_Takeaway/Common_Pitfall/Clinical_Pearl/LO-style bonus
    // columns when present, so an "enriched" export's extra per-question
    // context survives the import instead of being silently dropped just
    // because there's no dedicated column for each of them.
    const explanation = buildEnrichedExplanation(baseExplanation, {
      keyTakeaway: keyTakeawayCol >= 0 ? String(row[keyTakeawayCol] ?? "") : undefined,
      commonPitfall: commonPitfallCol >= 0 ? String(row[commonPitfallCol] ?? "") : undefined,
      clinicalPearl: clinicalPearlCol >= 0 ? String(row[clinicalPearlCol] ?? "") : undefined,
      learningObjective: learningObjectiveCol >= 0 ? String(row[learningObjectiveCol] ?? "") : undefined,
    });
    const reference = referenceCol >= 0 ? String(row[referenceCol] ?? "").trim() || null : null;
    const hint = hintCol >= 0 ? String(row[hintCol] ?? "").trim() || null : null;
    const difficulty = difficultyCol >= 0 ? normalizeDifficulty(String(row[difficultyCol] ?? "")) : "moderate";
    // Curriculum-placement suggestion (Block > Module > Subject > Topic) —
    // "topic" prefers the more granular Chapter column over Theme when a
    // file has both (see hierChapter's own comment above). This is only a
    // suggestion carried through to the review UI/commit payload; nothing
    // reads or acts on it yet — see suggestedPath's own comment on
    // ParsedMcqCandidate.
    const suggestedPath = hasHierarchyCols ? {
      block: blockCol >= 0 ? String(row[blockCol] ?? "").trim() || null : null,
      module: moduleCol >= 0 ? String(row[moduleCol] ?? "").trim() || null : null,
      subject: subjectCol >= 0 ? String(row[subjectCol] ?? "").trim() || null : null,
      topic: (chapterCol >= 0 ? String(row[chapterCol] ?? "").trim() || null : null) ?? (themeCol >= 0 ? String(row[themeCol] ?? "").trim() || null : null),
    } : null;
    candidates.push({ question, options, correctAnswer, explanation, optionExplanations: optionExplanations && optionExplanations.some((e) => e != null) ? optionExplanations : null, reference, hint, needsReview: options.length < 2 || !correctAnswer, difficulty, suggestedPath });
  }
  return candidates;
}

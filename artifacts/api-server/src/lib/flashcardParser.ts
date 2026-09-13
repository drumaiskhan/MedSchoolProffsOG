// Flashcard file-import parser — the flashcard-side counterpart to
// mcqParser.ts. Flashcards only ever have two fields (front/back), so this
// is deliberately much simpler than the MCQ parser: no configurable regex
// profiles, just a handful of common export shapes tried in order. Like the
// MCQ importer, this only ever produces *candidates* for the admin to
// review/edit in the UI — nothing is saved until they click commit.

export interface ParsedFlashcardCandidate {
  front: string;
  back: string;
  // True when we couldn't confidently pair a front with a back (e.g. a
  // dangling "Front:" line with nothing following it) — surfaced in the
  // review UI the same way the MCQ importer flags needsReview candidates.
  needsReview: boolean;
  rawBlock?: string;
}

const FRONT_LABEL = /^\s*(?:front|question|term|q)\s*[:\-]\s*(.+)$/i;
const BACK_LABEL = /^\s*(?:back|answer|definition|a)\s*[:\-]\s*(.+)$/i;

/**
 * Text-based extraction (.txt, .pdf, .docx) — tries a few common shapes,
 * from most to least structured, and stops at the first one that actually
 * matches the file:
 *  1. Tab-separated "front\tback" per line (the shape Anki/Quizlet export).
 *  2. Explicit "Front: ... / Back: ..." (also Q:/A:, Term:/Definition:)
 *     labeled pairs, any order, one per line.
 *  3. Blank-line-separated blocks — first line of each block is the front,
 *     the rest of the block (joined) is the back. This is the shape most
 *     people fall into when they just paste notes: a question, then its
 *     answer, then a blank line before the next card.
 *  4. Last resort: every two non-empty lines become one card.
 */
export function extractFlashcardsFromText(rawText: string): ParsedFlashcardCandidate[] {
  const text = (rawText ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (!lines.length) return [];

  // 1. Tab-separated — only trust this shape if most non-empty lines
  // actually contain a tab, so a stray tab in otherwise-prose text doesn't
  // misfire this branch.
  const tabLines = lines.filter((l) => l.includes("\t"));
  if (tabLines.length && tabLines.length >= Math.ceil(lines.length * 0.6)) {
    return tabLines.map((line) => {
      const [front, ...rest] = line.split("\t");
      const back = rest.join(" ").trim();
      return { front: front.trim(), back, needsReview: !front.trim() || !back, rawBlock: line };
    }).filter((c) => c.front || c.back);
  }

  // 2. Explicit Front:/Back: (or Q:/A:, Term:/Definition:) labeled lines.
  const labeled: ParsedFlashcardCandidate[] = [];
  let pendingFront: string | null = null;
  let sawAnyLabel = false;
  for (const line of lines) {
    const frontMatch = line.match(FRONT_LABEL);
    const backMatch = !frontMatch ? line.match(BACK_LABEL) : null;
    if (frontMatch) {
      sawAnyLabel = true;
      if (pendingFront !== null) labeled.push({ front: pendingFront, back: "", needsReview: true });
      pendingFront = frontMatch[1].trim();
    } else if (backMatch) {
      sawAnyLabel = true;
      if (pendingFront !== null) {
        labeled.push({ front: pendingFront, back: backMatch[1].trim(), needsReview: false });
        pendingFront = null;
      } else {
        labeled.push({ front: "", back: backMatch[1].trim(), needsReview: true });
      }
    }
  }
  if (pendingFront !== null) labeled.push({ front: pendingFront, back: "", needsReview: true });
  if (sawAnyLabel && labeled.length) return labeled;

  // 3. Blank-line-separated blocks: first line = front, rest = back.
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > 1) {
    return blocks.map((block) => {
      const blockLines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const front = blockLines[0] ?? "";
      const back = blockLines.slice(1).join(" ").trim();
      return { front, back, needsReview: !front || !back, rawBlock: block };
    });
  }

  // 4. Last resort — pair up every two non-empty lines.
  const pairs: ParsedFlashcardCandidate[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const front = lines[i] ?? "";
    const back = lines[i + 1] ?? "";
    pairs.push({ front, back, needsReview: !front || !back });
  }
  return pairs;
}

const HEADER_ALIASES: Record<"front" | "back", string[]> = {
  front: ["front", "question", "term", "q", "prompt"],
  back: ["back", "answer", "definition", "a", "response"],
};

/**
 * Structured-rows extraction (.csv, .xlsx, .xls). Looks for a header row
 * naming the front/back columns (case-insensitive, several common aliases);
 * falls back to "column A = front, column B = back, every row is data" for
 * a plain two-column export with no header the admin has forgotten to
 * label — same "don't punish a slightly-off file, just flag it for review"
 * spirit as extractMcqsFromRows.
 */
export function extractFlashcardsFromRows(rows: string[][]): ParsedFlashcardCandidate[] | null {
  if (!rows.length) return null;
  const headerRow = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const frontCol = headerRow.findIndex((h) => HEADER_ALIASES.front.includes(h));
  const backCol = headerRow.findIndex((h) => HEADER_ALIASES.back.includes(h));

  let dataRows = rows;
  let fCol = 0;
  let bCol = 1;
  if (frontCol >= 0 && backCol >= 0) {
    dataRows = rows.slice(1);
    fCol = frontCol;
    bCol = backCol;
  } else if (rows[0].length < 2) {
    return null; // not even two columns — nothing to map front/back to
  }

  const candidates: ParsedFlashcardCandidate[] = [];
  for (const row of dataRows) {
    const front = String(row[fCol] ?? "").trim();
    const back = String(row[bCol] ?? "").trim();
    if (!front && !back) continue;
    candidates.push({ front, back, needsReview: !front || !back });
  }
  return candidates.length ? candidates : null;
}

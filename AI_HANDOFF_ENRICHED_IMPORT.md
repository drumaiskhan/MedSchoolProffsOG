# Handoff note — enriched question-bank import parsing (Block/Module/Subject/Topic)

**Not verified with a real build.** No `pnpm install` for the workspace
packages was available here, so no `tsc`/`pnpm dev`/browser test could be
run. The parser changes (`mcqParser.ts`, `fileExtraction.ts`) were unit-
tested standalone with `tsx` directly against the real sample file
(`Oral_Medicine_Block_I_Enriched.csv`, 377 rows) and produced 377/377
candidates, 0 needing review — see "What was tested" below. **Run
`pnpm typecheck` and `pnpm dev` before trusting this in prod.**

## Why this exists

The admin was given a CSV export ("enriched" question-bank format) that
the existing file importer couldn't parse into anything useful — different
header names than what `extractMcqsFromRows` recognized (`Question_stem`
instead of `question`, `Option_Clarification_A` instead of
`explanationA`, etc.), so it silently fell back to null/empty candidates.
Separately, the same importer already powers the Past Papers uploader
(see the *other* recent handoff on `PastPaperUploader`'s review-UI
parity fix — same file, `shared.tsx`) and the exam-attach flow, so fixing
the parser here benefits all three import surfaces at once.

## 1. Enriched CSV/XLSX header recognition
**File:** `artifacts/api-server/src/lib/mcqParser.ts`

- `matchHeader()` now normalizes underscores/hyphens to spaces before
  comparing against `HEADER_ALIASES`, so `Option_A`, `Option-A`, and
  `Option A` all resolve the same way. This alone is a generic
  improvement, not specific to this one file's naming style.
- Added aliases for every enriched-export column actually seen in the
  sample file: `Question_stem`, `Correct_Option`, `Concept_Explanation`,
  `Option_Clarification_A..E`, `Question_Hint`.
- New `difficulty` column support (`Difficulty_Scale` and similar) with a
  `DIFFICULTY_ALIASES` map (`easy/medium/hard`, `low/mid/high`,
  `basic/average/difficult`, `1/2/3`) → the app's `easy | moderate | hard`
  enum. Previously **every** file-imported candidate hard-defaulted to
  `"moderate"` regardless of what the source said (see the difficulty
  field's own old comment) — this is the first import path that can
  actually pick up a real difficulty signal from the file itself, when
  the file has one; text-pattern imports (`extractMcqsFromText`) are
  unchanged and still default to moderate.
- Four "bonus context" columns some enriched exports carry per question —
  `Key_Takeaway`, `Common_Pitfall`, `Clinical_Pearl`, `LO` (learning
  objective) — have no dedicated DB column, so instead of being silently
  dropped they're now folded into the whole-question `explanation` as
  labeled paragraphs (`buildEnrichedExplanation()`). E.g.:
  ```
  <Concept_Explanation text>

  Learning objective: LO-48: Define orofacial pain

  Key takeaway: ...

  Common pitfall: ...

  Clinical pearl: ...
  ```
  This is a judgment call, not a schema fact — see "Open item" below if a
  cleaner solution (real columns, or a separate "context" field shown in
  its own UI section) is wanted later.

## 2. Curriculum-hierarchy extraction (Block/Module/Subject/Topic) — suggestion only
**File:** `artifacts/api-server/src/lib/mcqParser.ts`

The sample file tags every row with `Block`, `Module`, `Subject`,
`Theme`, and `Chapter` columns. The app's real hierarchy
(`lib/db/src/schema/medschool.ts`) is exactly four levels:
`med_blocks` → `med_modules` → `med_subjects` → `med_topics`. Mapping used:

| CSV column | App level  |
|---|---|
| `Block`    | Block   |
| `Module`   | Module  |
| `Subject`  | Subject |
| `Chapter` (falls back to `Theme` if no `Chapter` column) | Topic |

This mapping is a best-effort reading of the one sample file provided —
**it has not been confirmed against how this school's actual curriculum
is organized**, and a different enriched export might use these column
names differently (e.g. `Theme` as the real topic-equivalent instead of
`Chapter`, or `Module`/`Subject` swapped). Treat it as a starting
assumption to sanity-check with whoever provides the next batch of files,
not a settled decision.

Each parsed candidate now carries an optional
`suggestedPath: { block, module, subject, topic }` (all nullable strings).
**Nothing auto-creates or matches Block/Module/Subject/Topic rows from
this yet.** It's surfaced read-only in the three import review UIs
(`AdminMcqs.tsx`'s bulk import, `PastPaperUploader`, `ExamManagePanel` —
all in `shared.tsx` except the first) via a new shared
`<SuggestedPathHint path={c.suggestedPath} />` line under the question
textarea: *"Suggested from file: Block-I › Module 3: Craniofacial-II ›
Oral Medicine › 9. Orofacial Pain (not applied automatically...)"*.

### Open item — wiring this up for real (optional, not done)
To make this actually place questions instead of just suggesting:
1. Backend: `CommitBody` in `routes/mcq-import.ts` would need an optional
   `suggestedPath` per MCQ (or a batch-level one, if a whole file shares
   one path — true for the sample file, but maybe not for every enriched
   export). On commit, resolve each level by case-insensitive name match
   against existing rows scoped to its parent (`blocksTable` →
   `modulesTable.blockId` → `subjectsTable.moduleId` →
   `topicsTable.subjectId`); create whichever level doesn't exist yet,
   under its now-resolved parent. `blockAdminApi`/`moduleAdminApi`/
   `subjectAdminApi`/`topicAdminApi` (`frontend-admin/src/lib/api.ts`)
   already have `create` endpoints to model this against — the actual
   create/match logic belongs server-side in the commit route (a batch of
   377 rows sharing one path should resolve/create the chain **once**,
   not 377 times).
2. Frontend: the review UI would need this to be editable (a confirm/
   override control), not just a text hint, since auto-matching by name
   is inherently fuzzy (e.g. "Module 3: Craniofacial-II" vs an existing
   "Craniofacial II" module — same thing, different string).
3. Decide product behavior for a batch where rows disagree on path (mixed
   file) — group and create multiple chains, or treat it as one file/one
   destination and flag the outliers for manual review.

This was left as suggestion-only rather than guessed-and-wired because
getting the matching/creation semantics wrong (duplicate Subjects/Topics
piling up from near-identical names) is worse than not doing it, and
there was no way to verify against a real database or admin's existing
academic-structure content from here.

## 3. CSV robustness fix (found while testing the sample file)
**File:** `artifacts/api-server/src/lib/fileExtraction.ts`

- The old CSV path split the whole buffer on `\n` **before** doing any
  quote-aware parsing, so a quoted cell containing a literal newline
  (a multi-paragraph explanation pasted from Word/Google Sheets, common
  in exactly this kind of enriched export) would silently corrupt into
  two rows. Replaced with a proper full-text `parseCsv()` that scans
  character-by-character and treats a newline inside an open quote as
  part of the cell. Verified against a synthetic embedded-newline cell —
  parses as one row, one cell, newline intact.
- Also strips a leading UTF-8 BOM (`\uFEFF`) — the sample file had one,
  which would have made the header row's first cell come through as
  `"\uFEFFQuestion_ID"` and silently fail every header alias match on that
  column (harmless here since `Question_ID` isn't itself mapped, but would
  break the *next* file whose first column is e.g. `Question`/`Question_stem`).

## What was tested
Ran `extractFileContent` → `extractMcqsFromRows` directly (via `tsx`,
bypassing the Express layer — no DB/server available here) against the
provided `Oral_Medicine_Block_I_Enriched.csv`:
- 378 rows in (1 header + 377 data) → 377 candidates out, 0 flagged
  `needsReview`.
- Spot-checked candidate 0 and 1: question/options/correct answer/hint/
  per-option clarifications/explanation-with-folded-context/difficulty/
  suggestedPath all matched the source row.
- Difficulty distribution across the file: `{ easy: 68, moderate: 241,
  hard: 68 }` — sane spread, not a stuck default.
- Synthetic CSV with an embedded newline inside a quoted cell and a
  quoted cell containing a comma both parsed correctly with the new
  `parseCsv()`.

**Not tested:** the actual HTTP upload path (`POST
/admin/mcq-import/parse`), the review-UI rendering in a real browser, or
an `.xlsx` version of an enriched export (only `.csv` was provided) —
the `.xlsx` path already goes through the same `extractMcqsFromRows()`,
so it should pick up the same header aliases, but the `xlsx` library's
own cell-to-string coercion (numbers, dates) wasn't exercised here.

## Files touched
- `artifacts/api-server/src/lib/mcqParser.ts` — header aliases, header
  normalization, difficulty mapping, bonus-field folding, suggestedPath
  extraction.
- `artifacts/api-server/src/lib/fileExtraction.ts` — CSV parser rewrite
  (embedded-newline-safe) + BOM strip.
- `artifacts/frontend-admin/src/lib/api.ts` — `McqCandidate` type gains
  optional `suggestedPath`.
- `artifacts/frontend-admin/src/lib/shared.tsx` — new
  `SuggestedPathHint` component, wired into `PastPaperUploader` and
  `ExamManagePanel`'s candidate cards.
- `artifacts/frontend-admin/src/pages/AdminMcqs.tsx` — same
  `SuggestedPathHint` wired into the main MCQ-bank import candidate card.

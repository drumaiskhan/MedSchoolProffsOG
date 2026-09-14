# AI Handoff Note v28 (for the next AI/dev)

Scope: 2 requested features. Not build-tested (no network access to
`pnpm install` in this environment) — only syntax-checked in isolation
with `tsc --noEmit --ignoreConfig` on each touched file (the usual
workspace-import / missing-`@types` / implicit-`any` noise ignored, same
caveat as v27's note — this codebase's real tsconfig relaxes those, a
bare `tsc` invocation without it doesn't). **Run `pnpm dev` / a full
build before trusting this in prod.**

## 1. Flashcards backup export/import

Flashcards had no equivalent of the MCQ bank's "Backup / restore" panel
(`mcqBackup.ts` / `mcq-backup.ts` / the panel in `AdminMcqs.tsx`) — the
whole-bank JSON snapshot-and-restore path only existed for MCQs. Added
the flashcard-side counterpart, mirroring that system field-for-field:

- `lib/db/src/schema/medschool.ts` — added the missing
  `export type Flashcard = typeof flashcardsTable.$inferSelect;` (existed
  for `Mcq` already, not for `Flashcard` — needed for the backup file's
  row type).
- `artifacts/api-server/src/lib/flashcardBackup.ts` (new) —
  `buildFlashcardBackup()` / `FlashcardBackupFileSchema` /
  `restoreFlashcardBackup()` / `FLASHCARD_BACKUP_FORMAT_VERSION`. Simpler
  than `mcqBackup.ts` in one respect: nothing else references
  `flashcardsTable` by foreign key (no exam/past-paper/notebook
  attachment the way MCQs have), so "replace" mode is a plain bulk
  delete — no cascade helper needed.
- `artifacts/api-server/src/routes/flashcard-backup.ts` (new) —
  `GET /admin/flashcard-backup/export`,
  `POST /admin/flashcard-backup/import?mode=append|replace`. Same
  validation shape as `mcq-backup.ts`: rejects non-JSON, rejects a
  backup from a newer format version than this server understands,
  writes an audit log entry (`FLASHCARDS_BACKUP_RESTORED`).
- Wired into `artifacts/api-server/src/routes/index.ts`.
- `artifacts/frontend-admin/src/lib/api.ts` — added `flashcardBackupApi`
  (`exportUrl`/`downloadBackup`/`importBackup`), same shape as
  `mcqBackupApi`.
- `artifacts/frontend-admin/src/pages/AdminFlashcards.tsx` — added the
  "Backup / restore" toggle button + panel (download button, file input,
  append/replace mode select, confirm dialog) in the flashcard bank
  section header, same UX as `AdminMcqs.tsx`'s panel.

No DB migration needed — this only adds a TS type export and reads/writes
the existing `med_flashcards` table as-is.

## 2. Block picker in MCQ/flashcard import — grouped by Program + Year

The request: "MCQs and flashcards parser — years from which blocks
should open, like blocks for third year MBBS." What this turned out to
mean once I traced it through the code: Blocks already carry
`programTargetKind` + `yearTargetNumber` (e.g. a block tagged "MBBS ·
Year 3"), and the main bank displays (`McqBankTree` / `FlashcardBankTree`
in `lib/shared.tsx`, plus `AdminContent.tsx`'s block cards) already group
every block under its Program + Year via `groupByProgramYear()` — see
`McqBankTree`'s own existing comment block starting "Every block/module
becomes one 'leaf' with an effective program/year… this is what makes 'I
tagged my modules as MBBS Year 1 but never touched the block' still land
under MBBS > Year 1". *But* the flat Block `<select>` filter used by the
MCQ/flashcard **file-import ("parser")** pickers — and the flashcard
AI-generate picker — never got that same grouping; it just listed every
block alphabetically regardless of year, with no visual separation
between e.g. a Year 1 block and a Year 3 block. `McqBankTree`'s comment
even flags this explicitly: "same grouping level **the parser's Block
filter below** narrows by" — the asymmetry was already noted in a
comment, just never fixed.

Fix — one new shared helper, applied to every flat Block `<select>`:

- `artifacts/frontend-admin/src/lib/shared.tsx` — added
  `groupBlocksForPicker(blocks, modules)`, which reuses the exact same
  block→module fallback-targeting resolution `McqBankTree` and
  `AdminContent.tsx` already use (a block with no targeting of its own
  falls back to whatever one of its modules says), then buckets through
  the existing `groupByProgramYear()` helper. Returns
  `{ programLabel, yearLabel, blocks }[]`, ready to render as
  `<optgroup>`s.
- Applied via `<optgroup label={`${programLabel} · ${yearLabel}`}>` to
  every flat Block filter:
  - `AdminMcqs.tsx` — the file-import Block select (1 spot).
  - `AdminFlashcards.tsx` — file-import, AI-generate, and manual-add
    Block selects (3 spots — all three already existed as separate
    selects sharing the same `blockId` state, so all three needed the
    same treatment for consistency).

Net effect: picking a block for import now shows it grouped as e.g.
"MBBS · Year 3" / "MBBS · Year 1" / "Unspecified program · All years"
instead of one flat alphabetical list — an admin importing a Third Year
MBBS question set can now find blocks scoped to that year directly,
rather than having to already know the block's name. Purely a picker UI
change — nothing about how MCQs/flashcards are actually targeted or
stored changed; a block's `programTargetKind`/`yearTargetNumber` already
drove student-facing visibility before this, this only fixes *how it's
presented while importing into it*.

## Testing notes for whoever picks this up next

- No way to run the dev server or a full `tsc` build here (network
  disabled, no `node_modules`). Verify with `pnpm install && pnpm dev`
  that:
  - The flashcard bank's "Backup / restore" panel downloads a real
    `flashcard-bank-backup-YYYY-MM-DD.json` and that re-importing it
    (both modes) round-trips correctly.
  - The Block `<select>` in both admin pages renders `<optgroup>`s
    correctly across browsers (Firefox/Safari render `<optgroup>`
    slightly differently from Chrome — worth a visual check).
  - A block with genuinely no targeting AND no module with targeting
    still shows up (under "Unspecified program · All years") rather than
    silently disappearing from the picker — `groupBlocksForPicker` should
    handle this since `groupByProgramYear` already did for the tree
    views, but worth confirming with a real empty/untagged block.

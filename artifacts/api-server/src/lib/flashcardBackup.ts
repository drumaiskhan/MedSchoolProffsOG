import { z } from "zod";
import { db, flashcardsTable, type Flashcard } from "@workspace/db";

// ---------------------------------------------------------------------------
// Whole-flashcard-bank backup — the flashcard-side counterpart to
// mcqBackup.ts, same split of responsibility from flashcardParser.ts /
// flashcard-import.ts: that file turns loosely-formatted text/CSV/PDF into
// new draft candidates for one module/subject/topic at a time. This is the
// opposite direction — a full, exact snapshot of every flashcard row (every
// field) that can later be restored verbatim, e.g. before a risky bulk edit,
// or to move the whole bank between environments.
// ---------------------------------------------------------------------------

// Bumped only if the shape of a backup file changes in a way old files
// can't be read as. Restoring never trusts a mismatched version silently —
// see importFlashcardBackup's check in the route.
export const FLASHCARD_BACKUP_FORMAT_VERSION = 1;

export interface FlashcardBackupFile {
  formatVersion: number;
  exportedAt: string;
  count: number;
  flashcards: Flashcard[];
}

// Builds the full backup payload. Intentionally exports every column
// (including id, timestamps, moduleId/subjectId/topicId, module/topic
// labels, active/archived state, displayOrder) so a restore can reproduce
// the bank exactly rather than a lossy re-import.
export async function buildFlashcardBackup(): Promise<FlashcardBackupFile> {
  const flashcards = await db.select().from(flashcardsTable);
  return {
    formatVersion: FLASHCARD_BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    count: flashcards.length,
    flashcards,
  };
}

// Validates the shape of one backed-up flashcard row. Deliberately
// permissive on nullable/optional fields (older backups, or ones hand-edited
// by an admin, may be missing a field a newer schema added) but strict on
// the two columns nothing can sensibly default: front + back.
const BackupFlashcardSchema = z.object({
  id: z.number().int().positive().optional(), // dropped on restore — see restoreFlashcardBackup
  front: z.string().min(1),
  back: z.string().min(1),
  module: z.string().optional(),
  topic: z.string().optional(),
  moduleId: z.number().nullable().optional(),
  subjectId: z.number().nullable().optional(),
  topicId: z.number().nullable().optional(),
  active: z.boolean().optional(),
  archived: z.boolean().optional(),
  displayOrder: z.number().optional(),
});

export const FlashcardBackupFileSchema = z.object({
  formatVersion: z.number().int().optional(), // missing entirely = pre-versioning export, still accepted
  exportedAt: z.string().optional(),
  count: z.number().optional(),
  flashcards: z.array(BackupFlashcardSchema).min(1).max(50_000),
});

export type ParsedBackupFlashcard = z.infer<typeof BackupFlashcardSchema>;

// Postgres has a hard 65535-bound-parameter-per-query ceiling. Each
// flashcard row here binds far fewer columns than an MCQ row, but batching
// keeps every single insert well clear of that regardless of how large the
// backup is, same precaution as restoreMcqBackup.
const INSERT_BATCH_SIZE = 500;

// Re-inserts every row from a validated backup as brand-new flashcards (ids
// are always dropped, same reasoning as restoreMcqBackup — reusing old ids
// would risk colliding with rows created since the backup was taken) and
// returns how many were created. Caller decides whether to wipe the
// existing bank first (mode: "replace") or add alongside it (mode:
// "append") — this function only ever inserts.
export async function restoreFlashcardBackup(flashcards: ParsedBackupFlashcard[]): Promise<number> {
  let created = 0;
  for (let i = 0; i < flashcards.length; i += INSERT_BATCH_SIZE) {
    const batch = flashcards.slice(i, i + INSERT_BATCH_SIZE);
    const rows = await db.insert(flashcardsTable).values(
      batch.map((c) => ({
        front: c.front,
        back: c.back,
        module: c.module ?? "",
        topic: c.topic ?? "",
        moduleId: c.moduleId ?? null,
        subjectId: c.subjectId ?? null,
        topicId: c.topicId ?? null,
        active: c.active ?? true,
        archived: c.archived ?? false,
        displayOrder: c.displayOrder ?? 0,
      })),
    ).returning({ id: flashcardsTable.id });
    created += rows.length;
  }
  return created;
}

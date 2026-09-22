import { z } from "zod";
import { db, flashcardsTable, type Flashcard } from "@workspace/db";
import { buildScopeWhere, type BackupScope } from "./backupScope";

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
  // Present only for a scoped backup (one Year/Block/Module/Subject/Topic
  // branch rather than the whole bank) — absent means "whole bank", same as
  // every backup made before this field existed. Carried through to the
  // file itself so a "replace" restore later knows to only wipe that
  // branch, not the entire bank — see importFlashcardBackup's route.
  scope?: BackupScope;
  flashcards: Flashcard[];
}

// Builds the backup payload — the whole bank when `scope` is omitted, or
// just the flashcards under one Year/Block/Module/Subject/Topic branch when
// given. Intentionally exports every column (including id, timestamps,
// moduleId/subjectId/topicId, module/topic labels, active/archived state,
// displayOrder) so a restore can reproduce the rows exactly rather than a
// lossy re-import.
export async function buildFlashcardBackup(scope?: BackupScope): Promise<FlashcardBackupFile> {
  const query = db.select().from(flashcardsTable);
  const flashcards = scope
    ? await query.where(await buildScopeWhere(scope, { moduleId: flashcardsTable.moduleId, subjectId: flashcardsTable.subjectId, topicId: flashcardsTable.topicId }))
    : await query;
  return {
    formatVersion: FLASHCARD_BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    count: flashcards.length,
    ...(scope ? { scope } : {}),
    flashcards,
  };
}

// Selects just the ids of flashcards that fall under a scope — used by the
// import route's scoped "replace" mode, which (unlike a whole-bank replace)
// must only wipe the branch the backup itself covers before restoring it.
export async function selectFlashcardIdsInScope(scope: BackupScope): Promise<number[]> {
  const rows = await db
    .select({ id: flashcardsTable.id })
    .from(flashcardsTable)
    .where(await buildScopeWhere(scope, { moduleId: flashcardsTable.moduleId, subjectId: flashcardsTable.subjectId, topicId: flashcardsTable.topicId }));
  return rows.map((r) => r.id);
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

// Matches BackupScope (backupScope.ts) loosely enough to accept a backup
// hand-edited or produced by a slightly different app version — restoring
// only ever reads `scope` to decide what a scoped "replace" should wipe, it
// never trusts `label` for anything beyond display.
const BackupScopeSchema = z.object({
  level: z.enum(["year", "block", "module", "subject", "topic"]),
  id: z.number().int(),
  label: z.string(),
});

export const FlashcardBackupFileSchema = z.object({
  formatVersion: z.number().int().optional(), // missing entirely = pre-versioning export, still accepted
  exportedAt: z.string().optional(),
  count: z.number().optional(),
  scope: BackupScopeSchema.optional(), // absent = whole-bank backup, same as every pre-scope export
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

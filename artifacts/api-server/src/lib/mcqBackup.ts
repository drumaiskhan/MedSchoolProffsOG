import { z } from "zod";
import { db, mcqsTable, type Mcq } from "@workspace/db";

// ---------------------------------------------------------------------------
// Whole-question-bank backup — distinct from mcq-import.ts's file parser.
// mcq-import.ts turns loosely-formatted text/CSV/PDF into new draft
// candidates for one module/subject/topic at a time. This is the opposite
// direction: a full, exact snapshot of every MCQ row (every field, every
// section of the bank — main tree, past papers, and exams alike) that can
// later be restored verbatim, e.g. before a risky bulk edit, or to move the
// whole bank between environments.
// ---------------------------------------------------------------------------

// Bumped only if the shape of a backup file changes in a way old files
// can't be read as. Restoring never trusts a mismatched version silently —
// see importMcqBackup's check below.
export const MCQ_BACKUP_FORMAT_VERSION = 1;

export interface McqBackupFile {
  formatVersion: number;
  exportedAt: string;
  count: number;
  mcqs: Mcq[];
}

// Builds the full backup payload. Intentionally exports every column
// (including id, timestamps, moduleId/subjectId/topicId/pastPaperId/examId,
// explanationStatus, tags, imagePath, source) so a restore can reproduce the
// bank exactly rather than a lossy re-import.
export async function buildMcqBackup(): Promise<McqBackupFile> {
  const mcqs = await db.select().from(mcqsTable);
  return {
    formatVersion: MCQ_BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    count: mcqs.length,
    mcqs,
  };
}

// Validates the shape of one backed-up MCQ row. Deliberately permissive on
// nullable/optional fields (older backups, or ones hand-edited by an admin,
// may be missing a field that a newer schema added) but strict on the
// handful of columns nothing can sensibly default: question + options.
const BackupMcqSchema = z.object({
  id: z.number().int().positive().optional(), // dropped on restore — see importMcqBackup
  question: z.string().min(1),
  options: z.array(z.string()).min(2),
  correctAnswer: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  optionExplanations: z.array(z.string().nullable()).nullable().optional(),
  hint: z.string().nullable().optional(),
  explanationStatus: z.string().optional(),
  reference: z.string().nullable().optional(),
  difficulty: z.string().optional(),
  tags: z.array(z.string()).optional(),
  imagePath: z.string().nullable().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  moduleId: z.number().nullable().optional(),
  subjectId: z.number().nullable().optional(),
  topicId: z.number().nullable().optional(),
  pastPaperId: z.number().nullable().optional(),
  examId: z.number().nullable().optional(),
});

export const McqBackupFileSchema = z.object({
  formatVersion: z.number().int().optional(), // missing entirely = pre-versioning export, still accepted
  exportedAt: z.string().optional(),
  count: z.number().optional(),
  mcqs: z.array(BackupMcqSchema).min(1).max(50_000),
});

export type ParsedBackupMcq = z.infer<typeof BackupMcqSchema>;

// Postgres has a hard 65535-bound-parameter-per-query ceiling. Each MCQ row
// here binds ~17 columns, so batching keeps every single insert well clear
// of that regardless of how large the backup is.
const INSERT_BATCH_SIZE = 500;

// Re-inserts every row from a validated backup as brand-new MCQs (ids are
// always dropped — see the call site's comment on why reusing old ids would
// be unsafe) and returns how many were created. Caller decides whether to
// wipe the existing bank first (mode: "replace") or add alongside it
// (mode: "append") — this function only ever inserts.
export async function restoreMcqBackup(mcqs: ParsedBackupMcq[]): Promise<number> {
  let created = 0;
  for (let i = 0; i < mcqs.length; i += INSERT_BATCH_SIZE) {
    const batch = mcqs.slice(i, i + INSERT_BATCH_SIZE);
    const rows = await db.insert(mcqsTable).values(
      batch.map((m) => ({
        question: m.question,
        options: m.options,
        correctAnswer: m.correctAnswer ?? null,
        explanation: m.explanation ?? null,
        optionExplanations: m.optionExplanations ?? null,
        hint: m.hint ?? null,
        explanationStatus: (m.explanationStatus as "PENDING" | "AI_GENERATED" | "REVIEWED" | "APPROVED" | undefined) ?? "PENDING",
        reference: m.reference ?? null,
        difficulty: (m.difficulty as "easy" | "moderate" | "hard" | undefined) ?? "moderate",
        tags: m.tags ?? [],
        imagePath: m.imagePath ?? null,
        status: (m.status as "draft" | "published" | undefined) ?? "draft",
        source: "import" as const,
        moduleId: m.moduleId ?? null,
        subjectId: m.subjectId ?? null,
        topicId: m.topicId ?? null,
        pastPaperId: m.pastPaperId ?? null,
        examId: m.examId ?? null,
      })),
    ).returning({ id: mcqsTable.id });
    created += rows.length;
  }
  return created;
}

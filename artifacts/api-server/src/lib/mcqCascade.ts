import { inArray } from "drizzle-orm";
import {
  db, mcqsTable, practiceAnswersTable, examQuestionsTable, examAnswersTable,
  notebookEntriesTable, flaggedMcqsTable,
} from "@workspace/db";

// Hard-deletes a set of MCQs and every row anywhere else in the app that
// points at them (practice history, exam question lists, exam answer
// history, notebook entries, flags), so a deleted past paper or exam
// doesn't leave its questions sitting untagged in the question bank or
// dangling references in students' history. Order matters: dependents
// first, then the MCQs themselves.
export async function deleteMcqsEverywhere(mcqIds: number[]): Promise<void> {
  if (mcqIds.length === 0) return;
  await db.delete(practiceAnswersTable).where(inArray(practiceAnswersTable.mcqId, mcqIds));
  await db.delete(examAnswersTable).where(inArray(examAnswersTable.mcqId, mcqIds));
  await db.delete(examQuestionsTable).where(inArray(examQuestionsTable.mcqId, mcqIds));
  await db.delete(notebookEntriesTable).where(inArray(notebookEntriesTable.mcqId, mcqIds));
  await db.delete(flaggedMcqsTable).where(inArray(flaggedMcqsTable.mcqId, mcqIds));
  await db.delete(mcqsTable).where(inArray(mcqsTable.id, mcqIds));
}

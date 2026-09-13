import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod";
import { auditLogsTable, db } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { dbErrorMessage } from "../lib/dbErrors";
import {
  buildMcqBackup,
  restoreMcqBackup,
  McqBackupFileSchema,
  MCQ_BACKUP_FORMAT_VERSION,
} from "../lib/mcqBackup";
import { deleteMcqsEverywhere } from "../lib/mcqCascade";
import { mcqsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Backup files are plain JSON, not one of mcq-import.ts's parsed formats —
// its own upload() only accepts .txt/.csv/.xlsx/.xls/.pdf/.docx, so this
// gets its own multer instance rather than reusing that one. A full bank
// backup can run large (thousands of questions with explanations), hence
// the bigger ceiling than the 20MB file-import limit.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith(".json") || file.mimetype === "application/json";
    if (!ok) { cb(new Error("Backup files are .json")); return; }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Export — download the entire MCQ bank as one JSON backup file.
// ---------------------------------------------------------------------------

router.get("/admin/mcq-backup/export", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const backup = await buildMcqBackup();
    const stamp = backup.exportedAt.slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="mcq-bank-backup-${stamp}.json"`);
    res.status(200).send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: `Could not build the backup: ${dbErrorMessage(err, "unknown error")}` });
  }
});

// ---------------------------------------------------------------------------
// Import — restore a whole backed-up MCQs file.
// ---------------------------------------------------------------------------

const ImportQuery = z.object({
  // "append" (default) adds the backup's questions alongside whatever's
  // already in the bank. "replace" hard-deletes every existing MCQ (and its
  // practice/exam history, via the same cascade the past-paper/exam
  // permanent-delete routes use) before restoring, for a true "go back to
  // exactly this backup" restore.
  mode: z.enum(["append", "replace"]).default("append"),
});

router.post("/admin/mcq-backup/import", requireAdmin, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No backup file uploaded" }); return; }

  const queryParsed = ImportQuery.safeParse(req.query);
  if (!queryParsed.success) { res.status(400).json({ error: "Invalid mode" }); return; }
  const { mode } = queryParsed.data;

  let raw: unknown;
  try {
    raw = JSON.parse(req.file.buffer.toString("utf-8"));
  } catch {
    res.status(422).json({ error: "That file isn't valid JSON — is this an MCQ bank backup?" });
    return;
  }

  const parsed = McqBackupFileSchema.safeParse(raw);
  if (!parsed.success) {
    res.status(422).json({ error: `This doesn't look like an MCQ backup file: ${parsed.error.issues[0]?.message ?? "invalid shape"}` });
    return;
  }
  // A backup from a newer format than this server understands is rejected
  // rather than guessed at — silently dropping fields it doesn't recognize
  // could restore an incomplete/wrong bank with no warning.
  if (parsed.data.formatVersion && parsed.data.formatVersion > MCQ_BACKUP_FORMAT_VERSION) {
    res.status(422).json({ error: `This backup was made by a newer version of the app (format v${parsed.data.formatVersion}) and can't be safely restored here (this server supports up to v${MCQ_BACKUP_FORMAT_VERSION}).` });
    return;
  }

  try {
    let deletedCount = 0;
    if (mode === "replace") {
      const existing = await db.select({ id: mcqsTable.id }).from(mcqsTable);
      await deleteMcqsEverywhere(existing.map((r) => r.id));
      deletedCount = existing.length;
    }

    const created = await restoreMcqBackup(parsed.data.mcqs);

    await db.insert(auditLogsTable).values({
      actorId: req.user!.id,
      action: "MCQS_BACKUP_RESTORED",
      entity: "mcq",
      metadata: JSON.stringify({ mode, restored: created, deletedFirst: deletedCount }),
    });

    res.status(201).json({ restored: created, mode, deletedFirst: deletedCount });
  } catch (err) {
    logger.error({ err }, "[mcq-backup] restore failed");
    res.status(422).json({ error: `Could not restore this backup: ${dbErrorMessage(err, "unknown database error")}` });
  }
});

export default router;

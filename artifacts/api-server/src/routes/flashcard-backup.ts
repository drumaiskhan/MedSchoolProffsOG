import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { auditLogsTable, db, flashcardsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { dbErrorMessage } from "../lib/dbErrors";
import {
  buildFlashcardBackup,
  restoreFlashcardBackup,
  selectFlashcardIdsInScope,
  FlashcardBackupFileSchema,
  FLASHCARD_BACKUP_FORMAT_VERSION,
} from "../lib/flashcardBackup";
import { logger } from "../lib/logger";
import { BACKUP_SCOPE_LEVELS, describeScope, sanitizeScopeLabel, scopeFilenamePart, type BackupScope } from "../lib/backupScope";

const router: IRouter = Router();

// Backup files are plain JSON, not one of flashcard-import.ts's parsed
// formats — its own upload() only accepts .txt/.csv/.xlsx/.xls/.pdf/.docx,
// so this gets its own multer instance rather than reusing that one. A
// full bank backup can run large (thousands of cards), hence the bigger
// ceiling than the 20MB file-import limit — same as mcq-backup.ts.
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
// Export — download the whole flashcard bank, or (given ?scopeLevel &
// ?scopeId) just the cards under one Year/Block/Module/Subject/Topic
// branch, as one JSON backup file.
// ---------------------------------------------------------------------------

const ExportQuery = z.object({
  scopeLevel: z.enum(BACKUP_SCOPE_LEVELS).optional(),
  // The row id for block/module/subject/topic scopes, or the year number
  // (1-5) itself for a "year" scope — see backupScope.ts.
  scopeId: z.coerce.number().int().optional(),
  // Optional, admin-supplied label straight from whatever the picker showed
  // them — used as-is for the filename/embedded scope so it always matches
  // what they picked, with describeScope as a fallback when it's missing.
  scopeLabel: z.string().optional(),
});

router.get("/admin/flashcard-backup/export", requireAdmin, async (req, res): Promise<void> => {
  const queryParsed = ExportQuery.safeParse(req.query);
  if (!queryParsed.success) { res.status(400).json({ error: "Invalid scope" }); return; }
  const { scopeLevel, scopeId, scopeLabel } = queryParsed.data;
  if (scopeLevel && scopeId === undefined) { res.status(400).json({ error: "scopeId is required alongside scopeLevel" }); return; }

  try {
    const scope: BackupScope | undefined = scopeLevel && scopeId !== undefined
      ? { level: scopeLevel, id: scopeId, label: sanitizeScopeLabel(scopeLabel || (await describeScope(scopeLevel, scopeId))) }
      : undefined;

    const backup = await buildFlashcardBackup(scope);
    if (scope && backup.flashcards.length === 0) {
      res.status(404).json({ error: `No flashcards found under ${scope.label} — nothing to back up.` });
      return;
    }
    const stamp = backup.exportedAt.slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="flashcard-bank-backup-${scopeFilenamePart(scope ?? null)}-${stamp}.json"`);
    res.status(200).send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: `Could not build the backup: ${dbErrorMessage(err, "unknown error")}` });
  }
});

// ---------------------------------------------------------------------------
// Import — restore a whole backed-up flashcards file.
// ---------------------------------------------------------------------------

const ImportQuery = z.object({
  // "append" (default) adds the backup's flashcards alongside whatever's
  // already in the bank. "replace" deletes every existing flashcard first
  // — unlike mcqsTable, nothing else references flashcardsTable by foreign
  // key (no exam/past-paper/notebook attachment), so this is a plain bulk
  // delete rather than the cascade mcq-backup.ts needs.
  mode: z.enum(["append", "replace"]).default("append"),
});

router.post("/admin/flashcard-backup/import", requireAdmin, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No backup file uploaded" }); return; }

  const queryParsed = ImportQuery.safeParse(req.query);
  if (!queryParsed.success) { res.status(400).json({ error: "Invalid mode" }); return; }
  const { mode } = queryParsed.data;

  let raw: unknown;
  try {
    raw = JSON.parse(req.file.buffer.toString("utf-8"));
  } catch {
    res.status(422).json({ error: "That file isn't valid JSON — is this a flashcard bank backup?" });
    return;
  }

  const parsed = FlashcardBackupFileSchema.safeParse(raw);
  if (!parsed.success) {
    res.status(422).json({ error: `This doesn't look like a flashcard backup file: ${parsed.error.issues[0]?.message ?? "invalid shape"}` });
    return;
  }
  // A backup from a newer format than this server understands is rejected
  // rather than guessed at — silently dropping fields it doesn't recognize
  // could restore an incomplete/wrong bank with no warning.
  if (parsed.data.formatVersion && parsed.data.formatVersion > FLASHCARD_BACKUP_FORMAT_VERSION) {
    res.status(422).json({ error: `This backup was made by a newer version of the app (format v${parsed.data.formatVersion}) and can't be safely restored here (this server supports up to v${FLASHCARD_BACKUP_FORMAT_VERSION}).` });
    return;
  }

  const scope = parsed.data.scope;

  try {
    let deletedCount = 0;
    if (mode === "replace") {
      // A scoped backup (one Year/Block/Module/Subject/Topic branch) only
      // wipes that same branch before restoring — replacing the *entire*
      // bank because the admin restored one subject's backup would
      // silently destroy everything outside it. A whole-bank backup (no
      // embedded scope) keeps the original full wipe.
      if (scope) {
        const ids = await selectFlashcardIdsInScope(scope);
        if (ids.length) await db.delete(flashcardsTable).where(inArray(flashcardsTable.id, ids));
        deletedCount = ids.length;
      } else {
        const existing = await db.select({ id: flashcardsTable.id }).from(flashcardsTable);
        if (existing.length) await db.delete(flashcardsTable);
        deletedCount = existing.length;
      }
    }

    const created = await restoreFlashcardBackup(parsed.data.flashcards);

    await db.insert(auditLogsTable).values({
      actorId: req.user!.id,
      action: "FLASHCARDS_BACKUP_RESTORED",
      entity: "flashcard",
      metadata: JSON.stringify({ mode, restored: created, deletedFirst: deletedCount, scope: scope ?? null }),
    });

    res.status(201).json({ restored: created, mode, deletedFirst: deletedCount, scope: scope ?? null });
  } catch (err) {
    logger.error({ err }, "[flashcard-backup] restore failed");
    res.status(422).json({ error: `Could not restore this backup: ${dbErrorMessage(err, "unknown database error")}` });
  }
});

export default router;

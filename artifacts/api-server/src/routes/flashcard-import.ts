import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod";
import { db, flashcardsTable, auditLogsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { extractFileContent } from "../lib/fileExtraction";
import { extractFlashcardsFromText, extractFlashcardsFromRows } from "../lib/flashcardParser";
import { dbErrorMessage } from "../lib/dbErrors";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExt = [".txt", ".csv", ".xlsx", ".xls", ".pdf", ".docx"];
    const ok = allowedExt.some((ext) => file.originalname.toLowerCase().endsWith(ext));
    if (!ok) { cb(new Error("Supported formats: .txt, .csv, .xlsx, .xls, .pdf, .docx")); return; }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Parse (dry run — returns candidates for admin review, saves nothing)
// ---------------------------------------------------------------------------

router.post("/admin/flashcard-import/parse", requireAdmin, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  try {
    const extracted = await extractFileContent(req.file.buffer, req.file.originalname, req.file.mimetype);
    let candidates;
    if (extracted.kind === "rows" && extracted.rows) {
      candidates = extractFlashcardsFromRows(extracted.rows);
      // No recognizable front/back columns — fall back to pattern-matching
      // every row's cells joined as plain text, same fallback shape the MCQ
      // importer uses for an unstructured spreadsheet export.
      if (!candidates) candidates = extractFlashcardsFromText(extracted.rows.map((r) => r.join("\t")).join("\n"));
    } else {
      candidates = extractFlashcardsFromText(extracted.text ?? "");
    }
    res.json({
      fileName: req.file.originalname,
      totalFound: candidates.length,
      needsReviewCount: candidates.filter((c) => c.needsReview).length,
      candidates,
    });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? `Could not read this file: ${err.message}` : "Could not read this file" });
  }
});

// ---------------------------------------------------------------------------
// Commit (admin has reviewed/edited candidates — bulk insert)
// ---------------------------------------------------------------------------

const CommitBody = z.object({
  moduleId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  topicId: z.number().int().positive(),
  module: z.string().min(1),
  topic: z.string().min(1),
  cards: z.array(z.object({
    front: z.string().min(1),
    back: z.string().min(1),
  })).min(1).max(2000),
});

router.post("/admin/flashcard-import/commit", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CommitBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" }); return; }
  const data = parsed.data;

  try {
    const rows = await db.insert(flashcardsTable).values(
      data.cards.map((card) => ({
        front: card.front,
        back: card.back,
        module: data.module,
        topic: data.topic,
        moduleId: data.moduleId,
        subjectId: data.subjectId,
        topicId: data.topicId,
      })),
    ).returning({ id: flashcardsTable.id });

    await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "FLASHCARDS_BULK_IMPORTED", entity: "flashcard", metadata: JSON.stringify({ count: rows.length, moduleId: data.moduleId, subjectId: data.subjectId, topicId: data.topicId }) });

    res.status(201).json({ imported: rows.length, ids: rows.map((r) => r.id) });
  } catch (err) {
    res.status(422).json({ error: `Could not save these flashcards: ${dbErrorMessage(err, "unknown database error")}` });
  }
});

export default router;

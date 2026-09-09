import { Router, type IRouter } from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, mcqImportProfilesTable, mcqsTable, examQuestionsTable, auditLogsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { extractFileContent } from "../lib/fileExtraction";
import { extractMcqsFromText, extractMcqsFromRows, DEFAULT_IMPORT_PATTERNS, type ImportPatternSet } from "../lib/mcqParser";
import { dbErrorMessage } from "../lib/dbErrors";
import { getSetting } from "../lib/settings";
import { generateExplanation, generateHint } from "../lib/aiExplain";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — question banks can be large
  fileFilter: (_req, file, cb) => {
    const allowedExt = [".txt", ".csv", ".xlsx", ".xls", ".pdf", ".docx"];
    const ok = allowedExt.some((ext) => file.originalname.toLowerCase().endsWith(ext));
    if (!ok) { cb(new Error("Supported formats: .txt, .csv, .xlsx, .xls, .pdf, .docx")); return; }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Import profiles — admin-customizable extraction patterns
// ---------------------------------------------------------------------------

router.get("/admin/mcq-import-profiles", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(mcqImportProfilesTable);
  res.json(rows);
});

const ProfileBody = z.object({
  name: z.string().min(1).max(120),
  questionPattern: z.string().min(1).max(500),
  optionPattern: z.string().min(1).max(500),
  answerPattern: z.string().min(1).max(500),
  explanationPattern: z.string().min(1).max(500),
  isDefault: z.boolean().optional(),
});

router.post("/admin/mcq-import-profiles", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  // validate the regexes compile before saving, so a typo can't silently break future imports
  try {
    for (const pattern of [parsed.data.questionPattern, parsed.data.optionPattern, parsed.data.answerPattern, parsed.data.explanationPattern]) {
      new RegExp(pattern, "i");
    }
  } catch {
    res.status(400).json({ error: "One of the patterns is not a valid regular expression" });
    return;
  }
  const [row] = await db.insert(mcqImportProfilesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/admin/mcq-import-profiles/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ProfileBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.update(mcqImportProfilesTable).set(parsed.data).where(eq(mcqImportProfilesTable.id, Number(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Profile not found" }); return; }
  res.json(row);
});

router.delete("/admin/mcq-import-profiles/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(mcqImportProfilesTable).where(eq(mcqImportProfilesTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Parse (dry run — returns candidates for admin review, saves nothing)
// ---------------------------------------------------------------------------

router.post("/admin/mcq-import/parse", requireAdmin, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  let patterns: ImportPatternSet = DEFAULT_IMPORT_PATTERNS;
  const profileId = req.body.profileId ? Number(req.body.profileId) : null;
  if (profileId) {
    const [profile] = await db.select().from(mcqImportProfilesTable).where(eq(mcqImportProfilesTable.id, profileId));
    if (profile) patterns = profile;
  }

  try {
    const extracted = await extractFileContent(req.file.buffer, req.file.originalname, req.file.mimetype);
    let candidates;
    if (extracted.kind === "rows" && extracted.rows) {
      candidates = extractMcqsFromRows(extracted.rows);
      // structured columns weren't found (e.g. a plain export) — fall back to
      // treating every cell as text and pattern-matching it
      if (!candidates) candidates = extractMcqsFromText(extracted.rows.map((r) => r.join(" ")).join("\n"), patterns);
    } else {
      candidates = extractMcqsFromText(extracted.text ?? "", patterns);
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
  moduleId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  topicId: z.number().int().positive().optional(),
  pastPaperId: z.number().int().positive().optional(),
  examId: z.number().int().positive().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  mcqs: z.array(z.object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(6),
    correctAnswer: z.string().nullable().optional(),
    explanation: z.string().nullable().optional(),
    optionExplanations: z.array(z.string().nullable()).nullable().optional(),
    reference: z.string().nullable().optional(),
    // Round 3, item 5 — the file-import commit path never accepted a
    // difficulty at all (unlike AI-drafted MCQs and the manual/bulk-add
    // forms), so even an admin who set it per-candidate in the review UI
    // had it silently dropped here. Optional + defaulted so old clients
    // that don't send it yet still work.
    difficulty: z.enum(["easy", "moderate", "hard"]).optional(),
  })).min(1).max(2000),
}).refine(
  (data) => !!data.pastPaperId || !!data.examId || (!!data.moduleId && !!data.subjectId && !!data.topicId),
  { message: "Provide a pastPaperId, an examId, or a full moduleId/subjectId/topicId, to place these questions somewhere" },
);

const TRUTHY = new Set(["true", "1", "on", "yes"]);

/**
 * Round 3, item 4b — auto-generates an explanation + hint for every
 * imported question that doesn't already have one, when the admin has
 * turned on AI_AUTO_EXPLAIN_ON_IMPORT. Deliberately NOT awaited by the
 * caller (see the `void queueAutoExplain(...)` call site below) so a bulk
 * import of hundreds of MCQs doesn't hang the HTTP response waiting on
 * hundreds of sequential AI calls — the commit response returns as soon as
 * the DB insert is done, and this keeps working in the background.
 * Sequential (not Promise.all) on purpose, for the same reason: a few
 * hundred simultaneous requests to the configured AI provider would very
 * likely hit its rate limit and fail most of them, whereas one-at-a-time
 * finishes reliably even if it takes longer in wall-clock time.
 *
 * Lands as AI_GENERATED (awaiting admin review), matching exactly how the
 * existing on-demand "Ask AI to explain" flow (explanations.ts) marks a
 * freshly-generated explanation — never silently APPROVED.
 */
async function queueAutoExplain(items: Array<{ id: number; question: string; options: string[]; correctAnswer: string | null; reference: string | null; hasExplanationAlready: boolean }>): Promise<void> {
  const autoEnabledRaw = await getSetting("AI_AUTO_EXPLAIN_ON_IMPORT", null);
  if (!autoEnabledRaw || !TRUTHY.has(autoEnabledRaw.toLowerCase())) return;
  const modelOverride = (await getSetting("AI_AUTO_EXPLAIN_MODEL", null)) || undefined;

  for (const item of items) {
    if (item.hasExplanationAlready) continue; // don't overwrite an explanation the import file already provided
    try {
      const request = { question: item.question, options: item.options, correctAnswer: item.correctAnswer, reference: item.reference };
      const [explanation, hint] = await Promise.all([
        generateExplanation(request, modelOverride),
        generateHint(request, modelOverride),
      ]);
      await db.update(mcqsTable).set({ explanation, hint, explanationStatus: "AI_GENERATED" }).where(eq(mcqsTable.id, item.id));
    } catch (err) {
      // One question's generation failing (rate limit, provider hiccup,
      // AI not configured) must not stop the rest of the queue — it stays
      // PENDING and can still be explained on-demand or manually later.
      logger.error({ err, mcqId: item.id }, "[mcq-import] auto-explain-on-import generation failed for this question");
    }
  }
}

router.post("/admin/mcq-import/commit", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CommitBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" }); return; }
  const data = parsed.data;

  try {
    const rows = await db.insert(mcqsTable).values(
      data.mcqs.map((mcq) => ({
        question: mcq.question,
        options: mcq.options,
        correctAnswer: mcq.correctAnswer ?? null,
        explanation: mcq.explanation ?? null,
        optionExplanations: mcq.optionExplanations ?? null,
        explanationStatus: mcq.explanation?.trim() ? "APPROVED" as const : "PENDING" as const,
        reference: mcq.reference ?? null,
        difficulty: mcq.difficulty ?? "moderate",
        status: data.status,
        source: "import" as const,
        moduleId: data.moduleId ?? null,
        subjectId: data.subjectId ?? null,
        topicId: data.topicId ?? null,
        pastPaperId: data.pastPaperId ?? null,
        examId: data.examId ?? null,
      })),
    ).returning({ id: mcqsTable.id });

    // Questions attached directly to an exam are automatically added to
    // that exam's paper too — no need for the admin to separately paste
    // MCQ IDs into "Set paper" after importing.
    if (data.examId && rows.length) {
      await db.insert(examQuestionsTable).values(
        rows.map((r, i) => ({ examId: data.examId!, mcqId: r.id, displayOrder: i })),
      ).onConflictDoNothing();
    }

    await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MCQS_BULK_IMPORTED", entity: "mcq", metadata: JSON.stringify({ count: rows.length, moduleId: data.moduleId ?? null, pastPaperId: data.pastPaperId ?? null, examId: data.examId ?? null }) });

    // Fire-and-forget (see queueAutoExplain's own comment) — every imported
    // question across this batch, regardless of which module/subject/topic
    // or exam/past-paper it's homed under, is eligible; this isn't scoped
    // to one section.
    void queueAutoExplain(rows.map((r, i) => ({
      id: r.id,
      question: data.mcqs[i].question,
      options: data.mcqs[i].options,
      correctAnswer: data.mcqs[i].correctAnswer ?? null,
      reference: data.mcqs[i].reference ?? null,
      hasExplanationAlready: !!data.mcqs[i].explanation?.trim(),
    })));

    res.status(201).json({ imported: rows.length, ids: rows.map((r) => r.id) });
  } catch (err) {
    // Any DB constraint violation (or other insert failure) surfaces as a
    // real error to the admin instead of an unhandled 500 the frontend
    // can't explain. dbErrorMessage() unwraps Drizzle's DrizzleQueryError
    // (whose .message is just the raw SQL + bound params, not the actual
    // Postgres error) so this shows the real reason instead of a dump of
    // every question/option in the batch.
    res.status(422).json({ error: `Could not save these questions: ${dbErrorMessage(err, "unknown database error")}` });
  }
});

export default router;

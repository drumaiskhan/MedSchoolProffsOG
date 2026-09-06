import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, mcqsTable, flashcardsTable, topicsTable, subjectsTable, modulesTable, auditLogsTable } from "@workspace/db";
import { requireAdmin, requireAuth, requireActiveMembership } from "../middlewares/auth";
import { generateExplanation, generateFlashcardExplanation, generateFlashcardSet, generateMcqSet, AiNotConfiguredError } from "../lib/aiExplain";

const router: IRouter = Router();

const EXPLANATION_STATUSES = ["PENDING", "AI_GENERATED", "REVIEWED", "APPROVED"] as const;

// ---------------------------------------------------------------------------
// Admin: review queue
// ---------------------------------------------------------------------------

router.get("/admin/mcqs/explanations", requireAdmin, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const moduleId = req.query.moduleId ? Number(req.query.moduleId) : undefined;
  const rows = await db.select().from(mcqsTable).where(and(
    status ? eq(mcqsTable.explanationStatus, status) : undefined,
    moduleId ? eq(mcqsTable.moduleId, moduleId) : undefined,
  ));
  res.json(rows);
});

router.get("/admin/mcqs/explanations/summary", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({ status: mcqsTable.explanationStatus }).from(mcqsTable);
  const summary: Record<string, number> = { PENDING: 0, AI_GENERATED: 0, REVIEWED: 0, APPROVED: 0 };
  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1;
  res.json(summary);
});

// ---------------------------------------------------------------------------
// Admin: status transitions
// ---------------------------------------------------------------------------

router.patch("/admin/mcqs/:id/explanation-status", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ status: z.enum(EXPLANATION_STATUSES) }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid status" }); return; }
  const [mcq] = await db.update(mcqsTable).set({ explanationStatus: parsed.data.status }).where(eq(mcqsTable.id, id)).returning();
  if (!mcq) { res.status(404).json({ error: "MCQ not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXPLANATION_STATUS_CHANGED", entity: "mcq", entityId: mcq.id, metadata: JSON.stringify({ status: parsed.data.status }) });
  res.json(mcq);
});

router.post("/admin/mcqs/:id/reject-explanation", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [mcq] = await db.update(mcqsTable).set({ explanation: null, explanationStatus: "PENDING" }).where(eq(mcqsTable.id, id)).returning();
  if (!mcq) { res.status(404).json({ error: "MCQ not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXPLANATION_REJECTED", entity: "mcq", entityId: mcq.id });
  res.json(mcq);
});

// ---------------------------------------------------------------------------
// Admin: AI generation
// ---------------------------------------------------------------------------

router.post("/admin/mcqs/:id/generate-explanation", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [mcq] = await db.select().from(mcqsTable).where(eq(mcqsTable.id, id));
  if (!mcq) { res.status(404).json({ error: "MCQ not found" }); return; }
  try {
    const explanation = await generateExplanation({ question: mcq.question, options: mcq.options, correctAnswer: mcq.correctAnswer, reference: mcq.reference });
    const [updated] = await db.update(mcqsTable).set({ explanation, explanationStatus: "AI_GENERATED" }).where(eq(mcqsTable.id, id)).returning();
    await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXPLANATION_AI_GENERATED", entity: "mcq", entityId: id });
    res.json(updated);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: err.message }); return; }
    res.status(502).json({ error: err instanceof Error ? err.message : "AI generation failed" });
  }
});

const BulkGenerateBody = z.object({
  moduleId: z.number().int().positive().optional(),
  mcqIds: z.array(z.number().int().positive()).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

router.post("/admin/mcqs/bulk-generate-explanations", requireAdmin, async (req, res): Promise<void> => {
  const parsed = BulkGenerateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const { moduleId, mcqIds, limit } = parsed.data;

  const targets = await db.select().from(mcqsTable).where(and(
    eq(mcqsTable.explanationStatus, "PENDING"),
    moduleId ? eq(mcqsTable.moduleId, moduleId) : undefined,
    mcqIds && mcqIds.length ? inArray(mcqsTable.id, mcqIds) : undefined,
  )).limit(limit ?? 50);

  if (!targets.length) { res.json({ generated: 0, failed: 0, errors: [] }); return; }

  // Sequential, not parallel — most AI providers rate-limit aggressively,
  // and this endpoint is meant for "clean up the backlog," not speed.
  let generated = 0;
  const errors: Array<{ id: number; error: string }> = [];
  for (const mcq of targets) {
    try {
      const explanation = await generateExplanation({ question: mcq.question, options: mcq.options, correctAnswer: mcq.correctAnswer, reference: mcq.reference });
      await db.update(mcqsTable).set({ explanation, explanationStatus: "AI_GENERATED" }).where(eq(mcqsTable.id, mcq.id));
      generated++;
    } catch (err) {
      errors.push({ id: mcq.id, error: err instanceof Error ? err.message : "Unknown error" });
      if (err instanceof AiNotConfiguredError) break; // no point retrying the rest
    }
  }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXPLANATIONS_BULK_GENERATED", entity: "mcq", metadata: JSON.stringify({ generated, failed: errors.length }) });
  res.json({ generated, failed: errors.length, errors });
});

// ---------------------------------------------------------------------------
// Admin: AI-generated flashcard drafts (from a topic's MCQs, or pasted
// text) — returned as drafts only; nothing is saved here. The admin
// reviews/edits and saves accepted ones via the existing flashcards create
// endpoint, same "parse -> review -> import" pattern as MCQ import.
// ---------------------------------------------------------------------------

const GenerateFlashcardsBody = z.object({
  topicId: z.number().int().positive().optional(),
  sourceText: z.string().max(20000).optional(),
  count: z.number().int().min(1).max(100).default(8),
}).refine((data) => !!data.topicId || !!data.sourceText?.trim(), { message: "Provide either a topicId or sourceText" });

router.post("/admin/flashcards/generate", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GenerateFlashcardsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const { topicId, sourceText, count } = parsed.data;

  let topicLabel: string | undefined;
  let mcqs: Array<{ question: string; correctAnswer: string | null; explanation?: string | null }> = [];
  if (topicId) {
    const [topic] = await db.select().from(topicsTable).where(eq(topicsTable.id, topicId));
    if (!topic) { res.status(404).json({ error: "Topic not found" }); return; }
    topicLabel = topic.name;
    mcqs = await db.select({ question: mcqsTable.question, correctAnswer: mcqsTable.correctAnswer, explanation: mcqsTable.explanation }).from(mcqsTable).where(eq(mcqsTable.topicId, topicId)).limit(60);
    if (!mcqs.length && !sourceText?.trim()) { res.status(422).json({ error: "This topic has no MCQs yet to generate flashcards from — paste source text instead." }); return; }
  }

  try {
    const drafts = await generateFlashcardSet({ sourceText, mcqs, topicLabel, count });
    if (!drafts.length) { res.status(502).json({ error: "AI did not return any flashcards. Try again or provide more source text." }); return; }
    res.json({ drafts });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: err.message }); return; }
    res.status(502).json({ error: err instanceof Error ? err.message : "AI generation failed" });
  }
});

// ---------------------------------------------------------------------------
// Admin: AI-generate MCQs strictly scoped to one topic (fixes the "AI
// question generator ignores the selected topic" bug — see
// buildMcqGenerationPrompt in lib/aiExplain.ts for the actual fix). Returns
// drafts for review, same pattern as /admin/flashcards/generate — nothing
// is written to the bank until the admin reviews and saves via
// POST /admin/mcqs/bulk.
// ---------------------------------------------------------------------------

const GenerateMcqsBody = z.object({
  topicId: z.number().int().positive(),
  count: z.number().int().min(1).max(15).default(5),
});

router.post("/admin/mcqs/generate", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GenerateMcqsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const { topicId, count } = parsed.data;

  const [row] = await db.select({
    topicName: topicsTable.name, subjectName: subjectsTable.name, moduleName: modulesTable.name,
  }).from(topicsTable)
    .innerJoin(subjectsTable, eq(topicsTable.subjectId, subjectsTable.id))
    .innerJoin(modulesTable, eq(subjectsTable.moduleId, modulesTable.id))
    .where(eq(topicsTable.id, topicId));
  if (!row) { res.status(404).json({ error: "Topic not found" }); return; }

  // Full breadcrumb, most-specific first — this is what actually grounds the
  // model (a bare "Blood" is ambiguous; "Blood (Pathology, Systemic
  // Pathology Module)" is not).
  const topicLabel = `${row.topicName} (${row.subjectName}, ${row.moduleName} module)`;
  const existing = await db.select({ question: mcqsTable.question }).from(mcqsTable).where(eq(mcqsTable.topicId, topicId)).limit(8);

  try {
    const drafts = await generateMcqSet({ topicLabel, existingQuestions: existing.map((m) => m.question), count });
    if (!drafts.length) { res.status(502).json({ error: "AI did not return any usable questions for this topic. Try again, or narrow the topic name." }); return; }
    res.json({ drafts, topicLabel });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: err.message }); return; }
    res.status(502).json({ error: err instanceof Error ? err.message : "AI generation failed" });
  }
});

// ---------------------------------------------------------------------------
// Student: optional "Ask AI" for a deeper explanation (ephemeral — not
// stored, doesn't touch explanationStatus)
// ---------------------------------------------------------------------------

router.post("/mcqs/:id/ask-ai", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [mcq] = await db.select().from(mcqsTable).where(and(eq(mcqsTable.id, id), eq(mcqsTable.status, "published")));
  if (!mcq) { res.status(404).json({ error: "Question not found" }); return; }
  try {
    const explanation = await generateExplanation({ question: mcq.question, options: mcq.options, correctAnswer: mcq.correctAnswer, reference: mcq.reference });
    res.json({ explanation });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: "Ask AI isn't set up yet — ask your admin to configure it." }); return; }
    res.status(502).json({ error: "Couldn't generate an explanation right now. Try again shortly." });
  }
});

router.post("/flashcards/:id/ask-ai", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [card] = await db.select().from(flashcardsTable).where(and(eq(flashcardsTable.id, id), eq(flashcardsTable.active, true)));
  if (!card) { res.status(404).json({ error: "Flashcard not found" }); return; }
  try {
    const explanation = await generateFlashcardExplanation({ front: card.front, back: card.back });
    res.json({ explanation });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: "Ask AI isn't set up yet — ask your admin to configure it." }); return; }
    res.status(502).json({ error: "Couldn't generate an explanation right now. Try again shortly." });
  }
});

export default router;

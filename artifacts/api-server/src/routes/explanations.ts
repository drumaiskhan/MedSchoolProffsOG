import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, mcqsTable, flashcardsTable, topicsTable, subjectsTable, modulesTable, auditLogsTable } from "@workspace/db";
import { requireAdmin, requireAuth, requireMembershipFor } from "../middlewares/auth";
import { generateExplanation, generateFlashcardExplanation, generateFlashcardSet, generateMcqSet, classifyDifficulty, generateOptionExplanations, rewriteDuplicateMcq, repairInvalidMcq, AiNotConfiguredError } from "../lib/aiExplain";
import { getAllSettings } from "../lib/settings";

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
  // Optional — when set, every question in this batch is generated at
  // exactly this difficulty instead of the model varying it across the set.
  // Lets the admin build a deliberate easy/moderate/hard set instead of
  // whatever mix the model happens to produce.
  difficulty: z.enum(["easy", "moderate", "hard"]).optional(),
});

router.post("/admin/mcqs/generate", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GenerateMcqsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const { topicId, count, difficulty } = parsed.data;

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
    const drafts = await generateMcqSet({ topicLabel, existingQuestions: existing.map((m) => m.question), count, difficulty });
    if (!drafts.length) { res.status(502).json({ error: "AI did not return any usable questions for this topic. Try again, or narrow the topic name." }); return; }
    res.json({ drafts, topicLabel });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: err.message }); return; }
    res.status(502).json({ error: err instanceof Error ? err.message : "AI generation failed" });
  }
});

// ---------------------------------------------------------------------------
// Admin: re-run AI difficulty classification over existing questions —
// "mcqs analysis" at any tree scope (block/module/subject/topic all reduce
// to a moduleId/subjectId/topicId filter here, same as the bulk-delete
// endpoints). Capped per call since each question is its own AI request;
// callers that need a bigger scope classified just call this again — the
// frontend button already re-fetches remaining counts and lets the admin
// click again.
// ---------------------------------------------------------------------------

const ClassifyDifficultyBody = z.union([
  z.object({ ids: z.array(z.number().int().positive()).min(1).max(20) }),
  // pastPaperId lets the Past Papers admin screen run the same "all in this
  // scope" classification a module/subject/topic tree row gets — a
  // past-paper MCQ is scoped by its paper, not by curriculum placement (see
  // mcqsTable.pastPaperId's own comment), so it needs its own filter here
  // rather than reusing moduleId/subjectId/topicId.
  z.object({ all: z.literal(true), filters: z.object({ moduleId: z.number().int().optional(), subjectId: z.number().int().optional(), topicId: z.number().int().optional(), pastPaperId: z.number().int().optional() }).optional() }),
]);
// Was 30 — lowered alongside CLASSIFY_CONCURRENCY below (see that comment)
// so a full batch's worst-case wall-clock time has headroom under
// Netlify's 26s proxy ceiling. classifyDifficulty itself now also has a
// hard per-row deadline (see withHardDeadline in aiExplain.ts) — this cap
// just keeps the round count low on top of that.
const CLASSIFY_BATCH_CAP = 20;

router.post("/admin/mcqs/classify-difficulty", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ClassifyDifficultyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const rows = "ids" in parsed.data
    ? await db.select({ id: mcqsTable.id, question: mcqsTable.question, options: mcqsTable.options, correctAnswer: mcqsTable.correctAnswer })
        .from(mcqsTable).where(inArray(mcqsTable.id, parsed.data.ids))
    : await db.select({ id: mcqsTable.id, question: mcqsTable.question, options: mcqsTable.options, correctAnswer: mcqsTable.correctAnswer })
        .from(mcqsTable).where(and(
          parsed.data.filters?.moduleId ? eq(mcqsTable.moduleId, parsed.data.filters.moduleId) : undefined,
          parsed.data.filters?.subjectId ? eq(mcqsTable.subjectId, parsed.data.filters.subjectId) : undefined,
          parsed.data.filters?.topicId ? eq(mcqsTable.topicId, parsed.data.filters.topicId) : undefined,
          parsed.data.filters?.pastPaperId ? eq(mcqsTable.pastPaperId, parsed.data.filters.pastPaperId) : undefined,
        )).limit(CLASSIFY_BATCH_CAP);

  if (!rows.length) { res.json({ classified: 0, remaining: 0, results: [] }); return; }

  // Total-in-scope count so the frontend can show "classified 30 of 214 —
  // click again" instead of implying the whole scope is done after one
  // capped batch. Only meaningful for the {all, filters} path — the {ids}
  // path is already the exact batch the caller wants classified.
  let remaining = 0;
  if (!("ids" in parsed.data)) {
    const [{ count: totalCount } = { count: 0 }] = await db.select({ count: sql<number>`count(*)` }).from(mcqsTable).where(and(
      parsed.data.filters?.moduleId ? eq(mcqsTable.moduleId, parsed.data.filters.moduleId) : undefined,
      parsed.data.filters?.subjectId ? eq(mcqsTable.subjectId, parsed.data.filters.subjectId) : undefined,
      parsed.data.filters?.topicId ? eq(mcqsTable.topicId, parsed.data.filters.topicId) : undefined,
      parsed.data.filters?.pastPaperId ? eq(mcqsTable.pastPaperId, parsed.data.filters.pastPaperId) : undefined,
    ));
    remaining = Math.max(0, Number(totalCount) - rows.length);
  }

  // Classified in small concurrent batches rather than one row at a time —
  // a fully sequential loop over up to CLASSIFY_BATCH_CAP (20) AI calls
  // easily took 60-90+ seconds end to end, long enough that Netlify's proxy
  // (which forwards this admin app's /api/* calls to the Railway backend —
  // see netlify.admin.toml) gives up after its hard, non-configurable 26s
  // limit and returns a bare 504 (surfaced to the admin as "This is taking
  // longer than expected"). CLASSIFY_CONCURRENCY keeps several requests in
  // flight at once so a full batch needs only 2 rounds (20 / 10), each now
  // bounded by classifyDifficulty's own 6s hard deadline (see
  // withHardDeadline in aiExplain.ts) instead of the previous unbounded
  // multi-provider failover time — 2 x 6s stays comfortably under the 26s
  // ceiling even in the worst case, while still well short of hammering the
  // AI provider's rate limit the way a full Promise.all(20) would (see
  // queueAutoExplain's comment in mcq-import.ts for why that's avoided
  // elsewhere in this file). classifyDifficulty never throws or hangs past
  // its deadline (falls back to "moderate" on its own), so no row here can
  // fail or stall the batch.
  const CLASSIFY_CONCURRENCY = 10;
  const results: Array<{ id: number; difficulty: "easy" | "moderate" | "hard" }> = [];
  for (let i = 0; i < rows.length; i += CLASSIFY_CONCURRENCY) {
    const chunk = rows.slice(i, i + CLASSIFY_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async (row) => {
      const difficulty = await classifyDifficulty({ question: row.question, options: row.options as string[], correctAnswer: row.correctAnswer });
      await db.update(mcqsTable).set({ difficulty }).where(eq(mcqsTable.id, row.id));
      return { id: row.id, difficulty };
    }));
    results.push(...chunkResults);
  }
  res.json({ classified: results.length, remaining, results });
});

// ---------------------------------------------------------------------------
// Admin: bulk-generate per-option explanations for existing questions — same
// shape/pattern as classify-difficulty above (ids or {all, filters}, capped
// per call since each question is its own AI request; the admin button
// re-fetches remaining counts and lets the admin click again for banks of
// 100+ questions instead of one call trying to do it all at once and timing
// out).
// ---------------------------------------------------------------------------

const GenerateOptionExplanationsBody = z.union([
  z.object({ ids: z.array(z.number().int().positive()).min(1).max(10) }),
  // pastPaperId scopes this to one past paper's questions — same reasoning
  // as ClassifyDifficultyBody's pastPaperId above: past-paper MCQs aren't
  // reachable through moduleId/subjectId/topicId, so the Past Papers admin
  // screen needs its own filter to run this the same way the main MCQ
  // bank's tree does.
  z.object({ all: z.literal(true), filters: z.object({ moduleId: z.number().int().optional(), subjectId: z.number().int().optional(), topicId: z.number().int().optional(), pastPaperId: z.number().int().optional() }).optional() }),
]);
// Was 30 — lowered alongside GENERATE_CONCURRENCY below so a full batch
// fits in one round under generateOptionExplanations' own 12s hard
// deadline (see withHardDeadline in aiExplain.ts), keeping this route's
// worst-case wall-clock time well under Netlify's 26s proxy ceiling.
const OPTION_EXPLANATIONS_BATCH_CAP = 10;

router.post("/admin/mcqs/generate-option-explanations", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GenerateOptionExplanationsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const scopeFilter = "ids" in parsed.data ? undefined : and(
    parsed.data.filters?.moduleId ? eq(mcqsTable.moduleId, parsed.data.filters.moduleId) : undefined,
    parsed.data.filters?.subjectId ? eq(mcqsTable.subjectId, parsed.data.filters.subjectId) : undefined,
    parsed.data.filters?.topicId ? eq(mcqsTable.topicId, parsed.data.filters.topicId) : undefined,
    parsed.data.filters?.pastPaperId ? eq(mcqsTable.pastPaperId, parsed.data.filters.pastPaperId) : undefined,
  );

  // Only rows actually missing (or incomplete) per-option explanations —
  // "all" scope should skip questions that already have them rather than
  // re-generating and overwriting existing admin-reviewed text every click.
  const missing = sql`(${mcqsTable.optionExplanations} IS NULL OR array_length(${mcqsTable.optionExplanations}, 1) IS DISTINCT FROM array_length(${mcqsTable.options}, 1) OR EXISTS (SELECT 1 FROM unnest(${mcqsTable.optionExplanations}) e WHERE e IS NULL OR trim(e) = ''))`;

  const rows = "ids" in parsed.data
    ? await db.select({ id: mcqsTable.id, question: mcqsTable.question, options: mcqsTable.options, correctAnswer: mcqsTable.correctAnswer })
        .from(mcqsTable).where(inArray(mcqsTable.id, parsed.data.ids))
    : await db.select({ id: mcqsTable.id, question: mcqsTable.question, options: mcqsTable.options, correctAnswer: mcqsTable.correctAnswer })
        .from(mcqsTable).where(and(scopeFilter, missing)).limit(OPTION_EXPLANATIONS_BATCH_CAP);

  if (!rows.length) { res.json({ generated: 0, remaining: 0, results: [] }); return; }

  // Total-still-missing count so the frontend can show "generated 30 of
  // 214 — click again" instead of implying the whole scope is done after
  // one capped batch — same pattern as classify-difficulty's `remaining`.
  let remaining = 0;
  if (!("ids" in parsed.data)) {
    const [{ count: totalCount } = { count: 0 }] = await db.select({ count: sql<number>`count(*)` }).from(mcqsTable).where(and(scopeFilter, missing));
    remaining = Math.max(0, Number(totalCount) - rows.length);
  }

  // Concurrency-limited for the same reason as classify-difficulty: a fully
  // sequential loop over up to OPTION_EXPLANATIONS_BATCH_CAP (10) AI calls
  // (each one bigger than a difficulty call, since it returns a full
  // explanation per option) risks Netlify's hard 26s proxy timeout (see
  // netlify.admin.toml, and the CLASSIFY_CONCURRENCY comment above) before
  // this response returns. Set equal to the batch cap so a full batch
  // completes in a single round of generateOptionExplanations' own 12s
  // hard deadline (see withHardDeadline in aiExplain.ts) rather than the
  // previous unbounded multi-provider failover time — one round of 12s
  // leaves ample headroom under the 26s ceiling.
  const GENERATE_CONCURRENCY = 10;
  const results: Array<{ id: number; optionExplanations: string[] }> = [];
  for (let i = 0; i < rows.length; i += GENERATE_CONCURRENCY) {
    const chunk = rows.slice(i, i + GENERATE_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async (row) => {
      const optionExplanations = await generateOptionExplanations({ question: row.question, options: row.options as string[], correctAnswer: row.correctAnswer });
      if (optionExplanations.length) {
        await db.update(mcqsTable).set({ optionExplanations }).where(eq(mcqsTable.id, row.id));
      }
      return { id: row.id, optionExplanations };
    }));
    results.push(...chunkResults);
  }
  const generated = results.filter((r) => r.optionExplanations.length).length;
  res.json({ generated, remaining, results });
});

// ---------------------------------------------------------------------------
// Admin: "AI Fix All" duplicate removal — the Content Quality Center finds
// near-duplicate pairs client-side (findDuplicates in contentQuality.ts,
// over data it already has loaded) and sends capped batches of pairs here.
// Only the second question in each pair is rewritten; the first is left
// untouched as the "keeper" — same capped/concurrency-limited shape as
// classify-difficulty and generate-option-explanations above, so a bank
// with 100+ duplicate pairs is worked through by the frontend calling this
// repeatedly rather than one request trying to rewrite them all and hitting
// the 26s proxy ceiling.
// ---------------------------------------------------------------------------

const DedupeBatchBody = z.object({ pairs: z.array(z.object({ id: z.number().int().positive(), otherId: z.number().int().positive() })).min(1).max(8) });

router.post("/admin/mcqs/dedupe-batch", requireAdmin, async (req, res): Promise<void> => {
  const parsed = DedupeBatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const ids = Array.from(new Set(parsed.data.pairs.flatMap((p) => [p.id, p.otherId])));
  const rows = await db.select({ id: mcqsTable.id, question: mcqsTable.question, options: mcqsTable.options, correctAnswer: mcqsTable.correctAnswer }).from(mcqsTable).where(inArray(mcqsTable.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Same concurrency reasoning as CLASSIFY_CONCURRENCY / GENERATE_CONCURRENCY
  // above: a fully sequential loop over up to 8 AI calls (each with its own
  // 12s hard deadline) could take a while, so pairs run in parallel and the
  // batch size (8) is chosen so one round comfortably clears in a single
  // 12s window.
  const results = await Promise.all(parsed.data.pairs.map(async (pair) => {
    const row = byId.get(pair.id);
    const other = byId.get(pair.otherId);
    if (!row || !other) return { id: pair.id, rewritten: false };
    const rewritten = await rewriteDuplicateMcq({ question: row.question, options: row.options as string[], correctAnswer: row.correctAnswer, otherQuestion: other.question });
    if (!rewritten) return { id: pair.id, rewritten: false };
    await db.update(mcqsTable).set({ question: rewritten.question, options: rewritten.options, correctAnswer: rewritten.correctAnswer }).where(eq(mcqsTable.id, pair.id));
    return { id: pair.id, rewritten: true };
  }));
  res.json({ fixed: results.filter((r) => r.rewritten).length, results });
});

// ---------------------------------------------------------------------------
// Admin: "AI Fix" for structurally-invalid questions (empty question, too
// few/duplicate options, missing or mismatched correct answer — see
// invalidReasons in the frontend's contentQuality.ts). The client already
// has each row's reasons computed (no server-side re-check needed), so it
// sends them along with the batch. Same capped/concurrency-limited shape as
// dedupe-batch above.
// ---------------------------------------------------------------------------

const RepairInvalidBatchBody = z.object({ items: z.array(z.object({ id: z.number().int().positive(), reasons: z.array(z.string()).min(1) })).min(1).max(8) });

router.post("/admin/mcqs/repair-invalid-batch", requireAdmin, async (req, res): Promise<void> => {
  const parsed = RepairInvalidBatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const rows = await db.select({ id: mcqsTable.id, question: mcqsTable.question, options: mcqsTable.options, correctAnswer: mcqsTable.correctAnswer }).from(mcqsTable).where(inArray(mcqsTable.id, parsed.data.items.map((i) => i.id)));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const results = await Promise.all(parsed.data.items.map(async (item) => {
    const row = byId.get(item.id);
    if (!row) return { id: item.id, fixed: false };
    const repaired = await repairInvalidMcq({ question: row.question, options: row.options as string[], correctAnswer: row.correctAnswer, reasons: item.reasons });
    if (!repaired) return { id: item.id, fixed: false };
    await db.update(mcqsTable).set({ question: repaired.question, options: repaired.options, correctAnswer: repaired.correctAnswer }).where(eq(mcqsTable.id, item.id));
    return { id: item.id, fixed: true };
  }));
  res.json({ fixed: results.filter((r) => r.fixed).length, results });
});

// ---------------------------------------------------------------------------
// Student: optional "Ask AI" for a deeper explanation (ephemeral — not
// stored, doesn't touch explanationStatus)
// ---------------------------------------------------------------------------

router.post("/mcqs/:id/ask-ai", requireAuth, requireMembershipFor("ai_explain"), async (req, res): Promise<void> => {
  // Defense in depth: Practice.tsx already hides the button when
  // AI_EXPLAIN_ENABLED is off, but that's just UI — a direct API call (or
  // a stale page still open in a tab) should be refused too, not just
  // hidden from view. Same pattern as AI_VISUALIZER_ENABLED in
  // ai-visualizer.ts.
  const settings = await getAllSettings();
  if (settings.AI_EXPLAIN_ENABLED === "false") { res.status(403).json({ error: "Ask AI to explain is turned off right now." }); return; }
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

router.post("/flashcards/:id/ask-ai", requireAuth, requireMembershipFor("ai_explain"), async (req, res): Promise<void> => {
  // Same defense-in-depth check as POST /mcqs/:id/ask-ai above.
  const settings = await getAllSettings();
  if (settings.AI_EXPLAIN_ENABLED === "false") { res.status(403).json({ error: "Ask AI to explain is turned off right now." }); return; }
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

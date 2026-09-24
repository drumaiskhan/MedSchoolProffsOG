import { Router, type IRouter } from "express";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  ospeBlocksTable,
  ospeModulesTable,
  ospeLearningMaterialsTable,
  ospeStationsTable,
  ospeExamsTable,
  ospeExamStationsTable,
  ospeExamAttemptsTable,
  ospeExamAnswersTable,
  usersTable,
  auditLogsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, requireMembershipFor, isAdminRole } from "../middlewares/auth";
import { getStudentTargeting, isTargetVisible, notifyTargetedStudents, describeModuleTargeting } from "../lib/contentVisibility";
import { gradeWrittenAnswer, AiNotConfiguredError } from "../lib/aiExplain";

const router: IRouter = Router();

const ExamTypeEnum = z.enum(["OSPE", "OSCE"]);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function targetingFields(body: { programTargetKind?: string | null; yearTargetNumber?: number | null }) {
  return {
    ...(body.programTargetKind !== undefined ? { programTargetKind: body.programTargetKind ? body.programTargetKind.trim().toUpperCase() : null } : {}),
    ...(body.yearTargetNumber !== undefined ? { yearTargetNumber: body.yearTargetNumber } : {}),
  };
}

// ---------------------------------------------------------------------------
// Admin: Blocks
// ---------------------------------------------------------------------------

router.get("/admin/ospe/blocks", requireAdmin, async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const rows = await db.select().from(ospeBlocksTable).where(examType ? eq(ospeBlocksTable.examType, examType) : undefined).orderBy(ospeBlocksTable.displayOrder);
  res.json(rows.map((b) => ({ ...b, targetingLabel: describeModuleTargeting(b.programTargetKind, b.yearTargetNumber) })));
});

const BlockBody = z.object({
  name: z.string().min(1).max(200),
  subtitle: z.string().max(500).optional(),
  examType: ExamTypeEnum.optional(),
  iconPath: z.string().nullable().optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(5).nullable().optional(),
});

router.post("/admin/ospe/blocks", requireAdmin, async (req, res): Promise<void> => {
  const parsed = BlockBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;
  const [block] = await db.insert(ospeBlocksTable).values({
    name: d.name, subtitle: d.subtitle ?? "", examType: d.examType ?? "OSPE", iconPath: d.iconPath ?? null,
    active: d.active ?? true, displayOrder: d.displayOrder ?? 0, ...targetingFields(d),
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_BLOCK_CREATED", entity: "ospe_block", entityId: block.id });
  res.status(201).json({ ...block, targetingLabel: describeModuleTargeting(block.programTargetKind, block.yearTargetNumber) });
});

router.patch("/admin/ospe/blocks/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = BlockBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const d = parsed.data;
  const { programTargetKind, yearTargetNumber, ...rest } = d;
  const [block] = await db.update(ospeBlocksTable).set({ ...rest, ...targetingFields({ programTargetKind, yearTargetNumber }) }).where(eq(ospeBlocksTable.id, id)).returning();
  if (!block) { res.status(404).json({ error: "Block not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_BLOCK_UPDATED", entity: "ospe_block", entityId: id });
  res.json({ ...block, targetingLabel: describeModuleTargeting(block.programTargetKind, block.yearTargetNumber) });
});

router.delete("/admin/ospe/blocks/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [block] = await db.update(ospeBlocksTable).set({ active: false, archived: true }).where(eq(ospeBlocksTable.id, id)).returning();
  if (!block) { res.status(404).json({ error: "Block not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_BLOCK_ARCHIVED", entity: "ospe_block", entityId: id });
  res.json({ ok: true });
});

router.delete("/admin/ospe/blocks/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid block id" }); return; }
  const [block] = await db.select().from(ospeBlocksTable).where(eq(ospeBlocksTable.id, id));
  if (!block) { res.status(404).json({ error: "Block not found" }); return; }
  await db.update(ospeModulesTable).set({ blockId: null }).where(eq(ospeModulesTable.blockId, id));
  // Stations / material filed directly under this block become unassigned too (not deleted).
  await db.update(ospeStationsTable).set({ blockId: null }).where(eq(ospeStationsTable.blockId, id));
  await db.update(ospeLearningMaterialsTable).set({ blockId: null }).where(eq(ospeLearningMaterialsTable.blockId, id));
  await db.delete(ospeBlocksTable).where(eq(ospeBlocksTable.id, id));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_BLOCK_PERMANENTLY_DELETED", entity: "ospe_block", entityId: id });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin: Modules
// ---------------------------------------------------------------------------

router.get("/admin/ospe/modules", requireAdmin, async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const rows = await db.select().from(ospeModulesTable).where(examType ? eq(ospeModulesTable.examType, examType) : undefined).orderBy(ospeModulesTable.displayOrder);
  const blocks = await db.select().from(ospeBlocksTable);
  const blockNameById = new Map(blocks.map((b) => [b.id, b.name]));
  res.json(rows.map((m) => ({ ...m, blockName: m.blockId ? blockNameById.get(m.blockId) ?? null : null, targetingLabel: describeModuleTargeting(m.programTargetKind, m.yearTargetNumber) })));
});

const ModuleBody = z.object({
  name: z.string().min(1).max(200),
  subtitle: z.string().max(500).optional(),
  examType: ExamTypeEnum.optional(),
  blockId: z.number().int().nullable().optional(),
  iconPath: z.string().nullable().optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(5).nullable().optional(),
});

router.post("/admin/ospe/modules", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ModuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;
  const [module] = await db.insert(ospeModulesTable).values({
    name: d.name, subtitle: d.subtitle ?? "", examType: d.examType ?? "OSPE", blockId: d.blockId ?? null,
    iconPath: d.iconPath ?? null, active: d.active ?? true, displayOrder: d.displayOrder ?? 0, ...targetingFields(d),
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_MODULE_CREATED", entity: "ospe_module", entityId: module.id });
  res.status(201).json({ ...module, targetingLabel: describeModuleTargeting(module.programTargetKind, module.yearTargetNumber) });
});

router.patch("/admin/ospe/modules/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = ModuleBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const d = parsed.data;
  const { programTargetKind, yearTargetNumber, ...rest } = d;
  const [module] = await db.update(ospeModulesTable).set({ ...rest, ...targetingFields({ programTargetKind, yearTargetNumber }) }).where(eq(ospeModulesTable.id, id)).returning();
  if (!module) { res.status(404).json({ error: "Module not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_MODULE_UPDATED", entity: "ospe_module", entityId: id });
  res.json({ ...module, targetingLabel: describeModuleTargeting(module.programTargetKind, module.yearTargetNumber) });
});

router.delete("/admin/ospe/modules/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [module] = await db.update(ospeModulesTable).set({ active: false, archived: true }).where(eq(ospeModulesTable.id, id)).returning();
  if (!module) { res.status(404).json({ error: "Module not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_MODULE_ARCHIVED", entity: "ospe_module", entityId: id });
  res.json({ ok: true });
});

router.delete("/admin/ospe/modules/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid module id" }); return; }
  const [module] = await db.select().from(ospeModulesTable).where(eq(ospeModulesTable.id, id));
  if (!module) { res.status(404).json({ error: "Module not found" }); return; }
  // Content under this module is unassigned (moved to "Unassigned"), not
  // deleted — same non-destructive convention as med_modules' permanent
  // delete for its subjects/MCQs.
  await db.update(ospeStationsTable).set({ moduleId: null }).where(eq(ospeStationsTable.moduleId, id));
  await db.update(ospeLearningMaterialsTable).set({ moduleId: null }).where(eq(ospeLearningMaterialsTable.moduleId, id));
  await db.delete(ospeModulesTable).where(eq(ospeModulesTable.id, id));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_MODULE_PERMANENTLY_DELETED", entity: "ospe_module", entityId: id });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin: Learning materials
// ---------------------------------------------------------------------------

router.get("/admin/ospe/learning-materials", requireAdmin, async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const rows = await db.select().from(ospeLearningMaterialsTable).where(examType ? eq(ospeLearningMaterialsTable.examType, examType) : undefined).orderBy(ospeLearningMaterialsTable.displayOrder);
  res.json(rows.map((r) => ({ ...r, targetingLabel: describeModuleTargeting(r.programTargetKind, r.yearTargetNumber) })));
});

const LearningMaterialBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  bodyText: z.string().max(20000).optional(),
  examType: ExamTypeEnum.optional(),
  moduleId: z.number().int().nullable().optional(),
  blockId: z.number().int().nullable().optional(),
  imagePath: z.string().nullable().optional(),
  attachmentPath: z.string().nullable().optional(),
  externalUrl: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(5).nullable().optional(),
});

router.post("/admin/ospe/learning-materials", requireAdmin, async (req, res): Promise<void> => {
  const parsed = LearningMaterialBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(ospeLearningMaterialsTable).values({
    title: d.title, description: d.description ?? "", bodyText: d.bodyText ?? "", examType: d.examType ?? "OSPE",
    moduleId: d.moduleId ?? null, blockId: d.blockId ?? null, imagePath: d.imagePath ?? null, attachmentPath: d.attachmentPath ?? null,
    externalUrl: d.externalUrl ?? null, active: d.active ?? true, displayOrder: d.displayOrder ?? 0, ...targetingFields(d),
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_LEARNING_MATERIAL_CREATED", entity: "ospe_learning_material", entityId: row.id });

  const notified = await notifyTargetedStudents(row.programTargetKind, row.yearTargetNumber, `New ${row.examType} learning material`, `"${row.title}" was just added — check it out under ${row.examType}/OSCE.`, "info");
  void notified;

  res.status(201).json({ ...row, targetingLabel: describeModuleTargeting(row.programTargetKind, row.yearTargetNumber) });
});

router.patch("/admin/ospe/learning-materials/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = LearningMaterialBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const d = parsed.data;
  const { programTargetKind, yearTargetNumber, ...rest } = d;
  const [row] = await db.update(ospeLearningMaterialsTable).set({ ...rest, ...targetingFields({ programTargetKind, yearTargetNumber }) }).where(eq(ospeLearningMaterialsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Learning material not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_LEARNING_MATERIAL_UPDATED", entity: "ospe_learning_material", entityId: id });
  res.json({ ...row, targetingLabel: describeModuleTargeting(row.programTargetKind, row.yearTargetNumber) });
});

router.delete("/admin/ospe/learning-materials/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(ospeLearningMaterialsTable).set({ active: false, archived: true }).where(eq(ospeLearningMaterialsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Learning material not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_LEARNING_MATERIAL_ARCHIVED", entity: "ospe_learning_material", entityId: id });
  res.json({ ok: true });
});

router.delete("/admin/ospe/learning-materials/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(ospeLearningMaterialsTable).where(eq(ospeLearningMaterialsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Learning material not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_LEARNING_MATERIAL_PERMANENTLY_DELETED", entity: "ospe_learning_material", entityId: id });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin: Stations (question bank)
// ---------------------------------------------------------------------------

router.get("/admin/ospe/stations", requireAdmin, async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const rows = await db.select().from(ospeStationsTable).where(examType ? eq(ospeStationsTable.examType, examType) : undefined).orderBy(ospeStationsTable.displayOrder);
  res.json(rows.map((s) => ({ ...s, marks: Number(s.marks), targetingLabel: describeModuleTargeting(s.programTargetKind, s.yearTargetNumber) })));
});

const LabelPoint = z.object({
  id: z.string().min(1).max(40),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  label: z.string().min(1).max(200),
  marks: z.number().min(0).max(1000).nullable().optional(),
});

const StationBody = z.object({
  title: z.string().min(1).max(300),
  instructions: z.string().max(5000).optional(),
  examType: ExamTypeEnum.optional(),
  moduleId: z.number().int().nullable().optional(),
  blockId: z.number().int().nullable().optional(),
  imagePath: z.string().nullable().optional(),
  attachmentPath: z.string().nullable().optional(),
  answerType: z.enum(["MCQ", "WRITTEN", "LABELING"]).optional(),
  options: z.array(z.string().min(1)).max(10).nullable().optional(),
  correctAnswer: z.string().nullable().optional(),
  modelAnswer: z.string().max(5000).nullable().optional(),
  labelPoints: z.array(LabelPoint).max(30).nullable().optional(),
  marks: z.number().min(0).max(1000).optional(),
  timeLimitSeconds: z.number().int().min(0).max(3600).nullable().optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(5).nullable().optional(),
}).refine((d) => d.answerType !== "MCQ" || !d.options || d.options.length >= 2, { message: "MCQ stations need at least 2 options" })
  .refine((d) => d.answerType !== "LABELING" || !d.labelPoints || d.labelPoints.length >= 1, { message: "Identification stations need at least 1 point on the image" });

router.post("/admin/ospe/stations", requireAdmin, async (req, res): Promise<void> => {
  const parsed = StationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(ospeStationsTable).values({
    title: d.title, instructions: d.instructions ?? "", examType: d.examType ?? "OSPE", moduleId: d.moduleId ?? null, blockId: d.blockId ?? null,
    imagePath: d.imagePath ?? null, attachmentPath: d.attachmentPath ?? null, answerType: d.answerType ?? "WRITTEN",
    options: d.options ?? null, correctAnswer: d.correctAnswer ?? null, modelAnswer: d.modelAnswer ?? null,
    labelPoints: d.labelPoints ?? null,
    marks: String(d.marks ?? 1), timeLimitSeconds: d.timeLimitSeconds ?? null, active: d.active ?? true,
    displayOrder: d.displayOrder ?? 0, ...targetingFields(d),
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_STATION_CREATED", entity: "ospe_station", entityId: row.id });
  res.status(201).json({ ...row, marks: Number(row.marks), targetingLabel: describeModuleTargeting(row.programTargetKind, row.yearTargetNumber) });
});

router.patch("/admin/ospe/stations/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = StationBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const d = parsed.data;
  const { programTargetKind, yearTargetNumber, marks, ...rest } = d;
  const [row] = await db.update(ospeStationsTable).set({
    ...rest, ...(marks !== undefined ? { marks: String(marks) } : {}), ...targetingFields({ programTargetKind, yearTargetNumber }),
  }).where(eq(ospeStationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Station not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_STATION_UPDATED", entity: "ospe_station", entityId: id });
  res.json({ ...row, marks: Number(row.marks), targetingLabel: describeModuleTargeting(row.programTargetKind, row.yearTargetNumber) });
});

router.delete("/admin/ospe/stations/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(ospeStationsTable).set({ active: false, archived: true }).where(eq(ospeStationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Station not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_STATION_ARCHIVED", entity: "ospe_station", entityId: id });
  res.json({ ok: true });
});

router.delete("/admin/ospe/stations/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid station id" }); return; }
  const [row] = await db.select().from(ospeStationsTable).where(eq(ospeStationsTable.id, id));
  if (!row) { res.status(404).json({ error: "Station not found" }); return; }
  const [{ value: examUsage }] = await db.select({ value: count() }).from(ospeExamStationsTable).where(eq(ospeExamStationsTable.stationId, id));
  if (examUsage > 0) { res.status(409).json({ error: "This station is attached to one or more exam papers — remove it from those papers first." }); return; }
  await db.delete(ospeStationsTable).where(eq(ospeStationsTable.id, id));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_STATION_PERMANENTLY_DELETED", entity: "ospe_station", entityId: id });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin: Exams (papers built from stations)
// ---------------------------------------------------------------------------

function isEligible(exam: typeof ospeExamsTable.$inferSelect, targeting: { programKind: string | null; yearNumber: number | null }): boolean {
  return isTargetVisible(exam.programTargetKind, exam.yearTargetNumber, targeting);
}

function examView(exam: typeof ospeExamsTable.$inferSelect) {
  return {
    id: exam.id, title: exam.title, description: exam.description, examType: exam.examType,
    programTargetKind: exam.programTargetKind, yearTargetNumber: exam.yearTargetNumber,
    durationMinutes: exam.durationMinutes, startAt: exam.startAt.toISOString(), endAt: exam.endAt.toISOString(),
    maxAttempts: exam.maxAttempts, passingPercent: exam.passingPercent ? Number(exam.passingPercent) : null,
    resultReleaseMode: exam.resultReleaseMode, showMarks: exam.showMarks, showPercentage: exam.showPercentage,
    showCorrectAnswers: exam.showCorrectAnswers, status: exam.status,
  };
}

async function notifyOspeExamPublished(actorId: number, exam: typeof ospeExamsTable.$inferSelect): Promise<void> {
  const scopeLabel = describeModuleTargeting(exam.programTargetKind, exam.yearTargetNumber);
  const notified = await notifyTargetedStudents(
    exam.programTargetKind, exam.yearTargetNumber,
    `New ${exam.examType} exam available`,
    `"${exam.title}" has just been published — check it out under ${exam.examType}/OSCE.`,
    "info",
  );
  await db.insert(auditLogsTable).values({ actorId, action: "OSPE_NOTIFICATION_AUTO_EXAM", entity: "ospe_exam", entityId: exam.id, metadata: JSON.stringify({ scope: scopeLabel, notified }) });
}

router.get("/admin/ospe/exams", requireAdmin, async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const rows = await db.select().from(ospeExamsTable).where(examType ? eq(ospeExamsTable.examType, examType) : undefined).orderBy(desc(ospeExamsTable.startAt));
  const withCounts = await Promise.all(rows.map(async (exam) => {
    const [{ value: stationCount }] = await db.select({ value: count() }).from(ospeExamStationsTable).where(eq(ospeExamStationsTable.examId, exam.id));
    const [{ value: attemptCount }] = await db.select({ value: count() }).from(ospeExamAttemptsTable).where(eq(ospeExamAttemptsTable.examId, exam.id));
    return { ...examView(exam), stationCount, attemptCount };
  }));
  res.json(withCounts);
});

const ExamBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  examType: ExamTypeEnum.optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(5).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  passingPercent: z.number().min(0).max(100).nullable().optional(),
  resultReleaseMode: z.enum(["immediate", "after_end", "manual"]).optional(),
  showMarks: z.boolean().optional(),
  showPercentage: z.boolean().optional(),
  showCorrectAnswers: z.boolean().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

router.post("/admin/ospe/exams", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ExamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;
  if (new Date(d.endAt) <= new Date(d.startAt)) { res.status(400).json({ error: "End time must be after start time" }); return; }
  const [exam] = await db.insert(ospeExamsTable).values({
    title: d.title, description: d.description ?? "", examType: d.examType ?? "OSPE",
    programTargetKind: d.programTargetKind ? d.programTargetKind.trim().toUpperCase() : null, yearTargetNumber: d.yearTargetNumber ?? null,
    durationMinutes: d.durationMinutes ?? 60, startAt: new Date(d.startAt), endAt: new Date(d.endAt),
    maxAttempts: d.maxAttempts ?? 1, passingPercent: d.passingPercent != null ? String(d.passingPercent) : null,
    resultReleaseMode: d.resultReleaseMode ?? "immediate", showMarks: d.showMarks ?? true, showPercentage: d.showPercentage ?? true,
    showCorrectAnswers: d.showCorrectAnswers ?? true, status: d.status ?? "draft",
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_EXAM_CREATED", entity: "ospe_exam", entityId: exam.id });
  if (exam.status === "published") await notifyOspeExamPublished(req.user!.id, exam);
  res.status(201).json(examView(exam));
});

router.patch("/admin/ospe/exams/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = ExamBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [before] = await db.select().from(ospeExamsTable).where(eq(ospeExamsTable.id, id));
  const { programTargetKind, yearTargetNumber, startAt, endAt, passingPercent, ...rest } = parsed.data;
  const [exam] = await db.update(ospeExamsTable).set({
    ...rest,
    ...(programTargetKind !== undefined ? { programTargetKind: programTargetKind ? programTargetKind.trim().toUpperCase() : null } : {}),
    ...(yearTargetNumber !== undefined ? { yearTargetNumber } : {}),
    ...(startAt !== undefined ? { startAt: new Date(startAt) } : {}),
    ...(endAt !== undefined ? { endAt: new Date(endAt) } : {}),
    ...(passingPercent !== undefined ? { passingPercent: passingPercent != null ? String(passingPercent) : null } : {}),
  }).where(eq(ospeExamsTable.id, id)).returning();
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_EXAM_UPDATED", entity: "ospe_exam", entityId: id });
  if (before && before.status !== "published" && exam.status === "published") await notifyOspeExamPublished(req.user!.id, exam);
  res.json(examView(exam));
});

router.delete("/admin/ospe/exams/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [exam] = await db.update(ospeExamsTable).set({ status: "archived" }).where(eq(ospeExamsTable.id, id)).returning();
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_EXAM_ARCHIVED", entity: "ospe_exam", entityId: id });
  res.json({ ok: true });
});

router.delete("/admin/ospe/exams/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid exam id" }); return; }
  const force = req.query.force === "true";
  const [exam] = await db.select().from(ospeExamsTable).where(eq(ospeExamsTable.id, id));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  if (exam.status !== "archived") { res.status(409).json({ error: "Archive this exam first before deleting it permanently." }); return; }

  const [{ value: attemptCount }] = await db.select({ value: count() }).from(ospeExamAttemptsTable).where(eq(ospeExamAttemptsTable.examId, id));
  if (attemptCount > 0 && !force) {
    res.status(409).json({ error: "This exam has recorded attempts — deleting it will also erase those students' attempt history and results. Confirm again to delete anyway.", attemptCount, requiresForce: true });
    return;
  }
  if (attemptCount > 0) {
    const attemptRows = await db.select({ id: ospeExamAttemptsTable.id }).from(ospeExamAttemptsTable).where(eq(ospeExamAttemptsTable.examId, id));
    for (const { id: attemptId } of attemptRows) await db.delete(ospeExamAnswersTable).where(eq(ospeExamAnswersTable.attemptId, attemptId));
    await db.delete(ospeExamAttemptsTable).where(eq(ospeExamAttemptsTable.examId, id));
  }
  await db.delete(ospeExamStationsTable).where(eq(ospeExamStationsTable.examId, id));
  await db.delete(ospeExamsTable).where(eq(ospeExamsTable.id, id));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_EXAM_PERMANENTLY_DELETED", entity: "ospe_exam", entityId: id, metadata: JSON.stringify({ attemptsDeleted: attemptCount }) });
  res.json({ ok: true });
});

router.post("/admin/ospe/exams/:id/stations", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const parsed = z.object({ stationIds: z.array(z.number().int().positive()).min(1).max(100) }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(examId)) { res.status(400).json({ error: "stationIds is required" }); return; }
  await db.delete(ospeExamStationsTable).where(eq(ospeExamStationsTable.examId, examId));
  await db.insert(ospeExamStationsTable).values(parsed.data.stationIds.map((stationId, i) => ({ examId, stationId, displayOrder: i })));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "OSPE_EXAM_STATIONS_SET", entity: "ospe_exam", entityId: examId, metadata: JSON.stringify({ count: parsed.data.stationIds.length }) });
  res.json({ ok: true, count: parsed.data.stationIds.length });
});

router.get("/admin/ospe/exams/:id/stations", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const rows = await db.select({ examStation: ospeExamStationsTable, station: ospeStationsTable }).from(ospeExamStationsTable).innerJoin(ospeStationsTable, eq(ospeExamStationsTable.stationId, ospeStationsTable.id)).where(eq(ospeExamStationsTable.examId, examId)).orderBy(ospeExamStationsTable.displayOrder);
  res.json(rows.map((r) => ({ ...r.station, marks: Number(r.station.marks), examStationOrder: r.examStation.displayOrder })));
});

router.get("/admin/ospe/exams/:id/attempts", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const rows = await db.select().from(ospeExamAttemptsTable).where(eq(ospeExamAttemptsTable.examId, examId)).orderBy(desc(ospeExamAttemptsTable.startedAt));
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length ? await db.select().from(usersTable) : [];
  const userMap = new Map(users.filter((u) => userIds.includes(u.id)).map((u) => [u.id, u]));
  res.json(rows.map((r) => { const u = userMap.get(r.userId); return { ...r, totalMarks: Number(r.totalMarks), obtainedMarks: Number(r.obtainedMarks), percentage: Number(r.percentage), studentName: u?.name ?? "Unknown", institution: u?.institution ?? "—" }; }));
});

router.post("/admin/ospe/exam-attempts/:id/release", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [attempt] = await db.update(ospeExamAttemptsTable).set({ resultsReleasedAt: new Date() }).where(eq(ospeExamAttemptsTable.id, id)).returning();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  res.json({ ok: true });
});

router.post("/admin/ospe/exams/:id/release-all", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  await db.update(ospeExamAttemptsTable).set({ resultsReleasedAt: new Date() }).where(and(eq(ospeExamAttemptsTable.examId, examId), eq(ospeExamAttemptsTable.status, "submitted")));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Student: Blocks / Modules / Learning materials (browse only, no marking)
// ---------------------------------------------------------------------------

router.get("/ospe/blocks", requireAuth, async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(ospeBlocksTable).where(and(eq(ospeBlocksTable.active, true), examType ? eq(ospeBlocksTable.examType, examType) : undefined));
  const targeting = isAdmin ? { programKind: null, yearNumber: null } : await getStudentTargeting(req.user!.id);
  const visible = isAdmin ? rows : rows.filter((b) => isTargetVisible(b.programTargetKind, b.yearTargetNumber, targeting));
  res.json(visible.map((b) => ({ id: b.id, name: b.name, subtitle: b.subtitle, examType: b.examType, displayOrder: b.displayOrder })));
});

router.get("/ospe/modules", requireAuth, async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const blockId = req.query.blockId ? Number(req.query.blockId) : undefined;
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(ospeModulesTable).where(and(eq(ospeModulesTable.active, true), examType ? eq(ospeModulesTable.examType, examType) : undefined, blockId ? eq(ospeModulesTable.blockId, blockId) : undefined));
  const targeting = isAdmin ? { programKind: null, yearNumber: null } : await getStudentTargeting(req.user!.id);
  const visible = isAdmin ? rows : rows.filter((m) => isTargetVisible(m.programTargetKind, m.yearTargetNumber, targeting));
  res.json(visible.map((m) => ({ id: m.id, name: m.name, subtitle: m.subtitle, examType: m.examType, blockId: m.blockId, displayOrder: m.displayOrder })));
});

router.get("/ospe/learning-materials", requireAuth, requireMembershipFor("resources"), async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const moduleId = req.query.moduleId ? Number(req.query.moduleId) : undefined;
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(ospeLearningMaterialsTable).where(and(eq(ospeLearningMaterialsTable.active, true), examType ? eq(ospeLearningMaterialsTable.examType, examType) : undefined, moduleId ? eq(ospeLearningMaterialsTable.moduleId, moduleId) : undefined)).orderBy(ospeLearningMaterialsTable.displayOrder);
  const targeting = isAdmin ? { programKind: null, yearNumber: null } : await getStudentTargeting(req.user!.id);
  const visible = isAdmin ? rows : rows.filter((r) => isTargetVisible(r.programTargetKind, r.yearTargetNumber, targeting));
  res.json(visible.map((r) => ({ id: r.id, title: r.title, description: r.description, bodyText: r.bodyText, imagePath: r.imagePath, attachmentPath: r.attachmentPath, externalUrl: r.externalUrl, examType: r.examType, moduleId: r.moduleId })));
});

// ---------------------------------------------------------------------------
// Student: exams — list eligible, start, answer, submit, AI-grade, result
// ---------------------------------------------------------------------------

router.get("/ospe/exams", requireAuth, requireMembershipFor("exams"), async (req, res): Promise<void> => {
  const examType = typeof req.query.examType === "string" ? req.query.examType : undefined;
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(ospeExamsTable).where(and(eq(ospeExamsTable.status, "published"), examType ? eq(ospeExamsTable.examType, examType) : undefined));
  const targeting = isAdmin ? { programKind: null, yearNumber: null } : await getStudentTargeting(req.user!.id);
  const eligible = isAdmin ? rows : rows.filter((e) => isEligible(e, targeting));

  const myAttempts = await db.select().from(ospeExamAttemptsTable).where(eq(ospeExamAttemptsTable.userId, req.user!.id));
  const attemptsByExam = new Map<number, typeof myAttempts>();
  for (const a of myAttempts) attemptsByExam.set(a.examId, [...(attemptsByExam.get(a.examId) ?? []), a]);

  res.json(eligible.map((exam) => {
    const attempts = attemptsByExam.get(exam.id) ?? [];
    const inProgress = attempts.find((a) => a.status === "in_progress");
    const now = Date.now();
    return {
      ...examView(exam),
      attemptsUsed: attempts.filter((a) => a.status !== "in_progress").length,
      canStart: !inProgress && attempts.filter((a) => a.status !== "in_progress").length < exam.maxAttempts && now >= exam.startAt.getTime() && now <= exam.endAt.getTime(),
      inProgressAttemptId: inProgress?.id ?? null,
      windowStatus: now < exam.startAt.getTime() ? "upcoming" : now > exam.endAt.getTime() ? "closed" : "open",
    };
  }));
});

/** Returns exam stations WITHOUT the correct answer/model answer — the
 * answer-security boundary, same as getExamQuestionsForStudent in
 * exams.ts. Never add correctAnswer/modelAnswer to this payload. */
async function getExamStationsForStudent(examId: number) {
  const rows = await db.select({ examStation: ospeExamStationsTable, station: ospeStationsTable }).from(ospeExamStationsTable).innerJoin(ospeStationsTable, eq(ospeExamStationsTable.stationId, ospeStationsTable.id)).where(eq(ospeExamStationsTable.examId, examId)).orderBy(ospeExamStationsTable.displayOrder);
  return rows.map((r) => ({
    id: r.station.id, title: r.station.title, instructions: r.station.instructions, imagePath: r.station.imagePath,
    attachmentPath: r.station.attachmentPath, answerType: r.station.answerType, options: r.station.options,
    // Identification points minus their `label` — the correct answer never
    // reaches the client, same boundary as omitting correctAnswer/modelAnswer.
    labelPoints: ((r.station.labelPoints as Array<{ id: string; x: number; y: number }> | null) || null)?.map((p) => ({ id: p.id, x: p.x, y: p.y })) ?? null,
    marks: Number(r.station.marks), timeLimitSeconds: r.station.timeLimitSeconds,
  }));
}

router.post("/ospe/exams/:id/start", requireAuth, requireMembershipFor("exams"), async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const [exam] = await db.select().from(ospeExamsTable).where(and(eq(ospeExamsTable.id, examId), eq(ospeExamsTable.status, "published")));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const targeting = await getStudentTargeting(req.user!.id);
  if (!isEligible(exam, targeting)) { res.status(403).json({ error: "You are not eligible for this exam" }); return; }

  const now = Date.now();
  if (now < exam.startAt.getTime()) { res.status(403).json({ error: "This exam hasn't started yet" }); return; }
  if (now > exam.endAt.getTime()) { res.status(403).json({ error: "This exam has closed" }); return; }

  const existingAttempts = await db.select().from(ospeExamAttemptsTable).where(and(eq(ospeExamAttemptsTable.examId, examId), eq(ospeExamAttemptsTable.userId, req.user!.id)));
  const inProgress = existingAttempts.find((a) => a.status === "in_progress");
  if (inProgress) {
    const stations = await getExamStationsForStudent(examId);
    res.json({ attemptId: inProgress.id, startedAt: inProgress.startedAt.toISOString(), durationMinutes: exam.durationMinutes, stations });
    return;
  }
  const completedCount = existingAttempts.filter((a) => a.status !== "in_progress").length;
  if (completedCount >= exam.maxAttempts) { res.status(403).json({ error: "You've used all your attempts for this exam" }); return; }

  const stations = await getExamStationsForStudent(examId);
  if (!stations.length) { res.status(400).json({ error: "This exam has no stations yet — contact your admin" }); return; }
  const totalMarks = stations.reduce((sum, s) => sum + s.marks, 0);

  const [attempt] = await db.insert(ospeExamAttemptsTable).values({
    examId, userId: req.user!.id, attemptNumber: completedCount + 1, totalStations: stations.length, totalMarks: String(totalMarks), status: "in_progress",
  }).returning();

  res.status(201).json({ attemptId: attempt.id, startedAt: attempt.startedAt.toISOString(), durationMinutes: exam.durationMinutes, stations });
});

const AnswerBody = z.object({
  stationId: z.number().int().positive(),
  selectedAnswer: z.string().nullable().optional(),
  writtenAnswer: z.string().max(10000).nullable().optional(),
  // For LABELING stations: { [pointId]: student's text for that pin }.
  labelAnswers: z.record(z.string(), z.string().max(500)).nullable().optional(),
});

router.post("/ospe/exam-attempts/:id/answer", requireAuth, async (req, res): Promise<void> => {
  const attemptId = Number(req.params.id);
  const parsed = AnswerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "stationId is required" }); return; }

  const [attempt] = await db.select().from(ospeExamAttemptsTable).where(and(eq(ospeExamAttemptsTable.id, attemptId), eq(ospeExamAttemptsTable.userId, req.user!.id)));
  if (!attempt || attempt.status !== "in_progress") { res.status(409).json({ error: "This attempt is not in progress" }); return; }

  const [exam] = await db.select().from(ospeExamsTable).where(eq(ospeExamsTable.id, attempt.examId));
  if (exam && Date.now() > attempt.startedAt.getTime() + exam.durationMinutes * 60_000) {
    await gradeAndSubmit(attempt.id, "auto_submitted");
    res.status(409).json({ error: "Time's up — this attempt was auto-submitted" });
    return;
  }

  await db.insert(ospeExamAnswersTable).values({ attemptId, stationId: parsed.data.stationId, selectedAnswer: parsed.data.selectedAnswer ?? null, writtenAnswer: parsed.data.writtenAnswer ?? null, labelAnswers: parsed.data.labelAnswers ?? null })
    .onConflictDoUpdate({ target: [ospeExamAnswersTable.attemptId, ospeExamAnswersTable.stationId], set: { selectedAnswer: parsed.data.selectedAnswer ?? null, writtenAnswer: parsed.data.writtenAnswer ?? null, labelAnswers: parsed.data.labelAnswers ?? null } });
  res.json({ ok: true });
});

router.post("/ospe/exam-attempts/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const attemptId = Number(req.params.id);
  const [attempt] = await db.select().from(ospeExamAttemptsTable).where(and(eq(ospeExamAttemptsTable.id, attemptId), eq(ospeExamAttemptsTable.userId, req.user!.id)));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  if (attempt.status !== "in_progress") { res.status(409).json({ error: "This attempt was already submitted" }); return; }
  const result = await gradeAndSubmit(attempt.id, "submitted");
  res.json(result);
});

/** Server-side grading: MCQ stations are graded deterministically against
 * correctAnswer; WRITTEN stations are graded by AI against the admin's
 * model answer (see lib/aiExplain.ts gradeWrittenAnswer) — never trust a
 * client-submitted "correct" flag or marksObtained. AI grading runs for
 * every written station in parallel and best-effort within the route's
 * time budget (see gradeAndSubmit's caller / WRITTEN_GRADING_HARD_DEADLINE_MS
 * in aiExplain.ts): any station that fails or times out is simply left
 * ungraded (aiVerdict null, marksObtained null) rather than failing the
 * whole submit — the student can retry those via POST
 * /ospe/exam-attempts/:id/grade once from the result page. */
async function gradeAndSubmit(attemptId: number, status: "submitted" | "auto_submitted") {
  const [attempt] = await db.select().from(ospeExamAttemptsTable).where(eq(ospeExamAttemptsTable.id, attemptId));
  const [exam] = await db.select().from(ospeExamsTable).where(eq(ospeExamsTable.id, attempt.examId));
  const stations = await db.select({ examStation: ospeExamStationsTable, station: ospeStationsTable }).from(ospeExamStationsTable).innerJoin(ospeStationsTable, eq(ospeExamStationsTable.stationId, ospeStationsTable.id)).where(eq(ospeExamStationsTable.examId, attempt.examId));
  const answers = await db.select().from(ospeExamAnswersTable).where(eq(ospeExamAnswersTable.attemptId, attemptId));
  const answerMap = new Map(answers.map((a) => [a.stationId, a]));

  for (const { station } of stations) {
    if (station.answerType === "MCQ") {
      const answer = answerMap.get(station.id);
      const selected = answer?.selectedAnswer ?? null;
      const isCorrect = selected != null && station.correctAnswer != null && selected === station.correctAnswer;
      const marksObtained = isCorrect ? Number(station.marks) : 0;
      if (answer) {
        await db.update(ospeExamAnswersTable).set({ correct: isCorrect, marksObtained: String(marksObtained) }).where(eq(ospeExamAnswersTable.id, answer.id));
      } else {
        await db.insert(ospeExamAnswersTable).values({ attemptId, stationId: station.id, correct: isCorrect, marksObtained: String(marksObtained) });
      }
    } else if (station.answerType === "LABELING") {
      const answer = answerMap.get(station.id);
      const { correctCount, totalPoints, marksObtained } = gradeLabelingStation(station, (answer?.labelAnswers as Record<string, string> | null) ?? null);
      const isCorrect = totalPoints > 0 && correctCount === totalPoints;
      if (answer) {
        await db.update(ospeExamAnswersTable).set({ correct: isCorrect, marksObtained: String(marksObtained) }).where(eq(ospeExamAnswersTable.id, answer.id));
      } else {
        await db.insert(ospeExamAnswersTable).values({ attemptId, stationId: station.id, correct: isCorrect, marksObtained: String(marksObtained) });
      }
    }
  }

  await gradeWrittenStations(attemptId, stations.map((s) => s.station), answerMap);

  const obtainedMarks = await recomputeAttemptMarks(attemptId);
  const totalMarks = Number(attempt.totalMarks);
  const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
  const passed = exam.passingPercent != null ? percentage >= Number(exam.passingPercent) : null;
  const releaseNow = exam.resultReleaseMode === "immediate";

  const [updated] = await db.update(ospeExamAttemptsTable).set({
    submittedAt: new Date(), status, obtainedMarks: String(obtainedMarks), percentage: String(percentage.toFixed(2)), passed,
    resultsReleasedAt: releaseNow ? new Date() : null,
  }).where(eq(ospeExamAttemptsTable.id, attemptId)).returning();

  return { attemptId: updated.id, status: updated.status, resultsReleased: releaseNow };
}

/** Runs AI grading for every WRITTEN station in `stations` that doesn't
 * already have an aiVerdict, in parallel, and writes the result (or
 * leaves it ungraded on failure/timeout) to med_ospe_exam_answers.
 * Shared by gradeAndSubmit (first pass, at submit time) and the
 * POST /ospe/exam-attempts/:id/grade retry endpoint below (mop-up pass
 * for anything that didn't finish in time the first time). */
async function gradeWrittenStations(attemptId: number, stations: Array<typeof ospeStationsTable.$inferSelect>, answerMap: Map<number, typeof ospeExamAnswersTable.$inferSelect>): Promise<{ graded: number; pending: number }> {
  const toGrade = stations.filter((s) => s.answerType === "WRITTEN" && !answerMap.get(s.id)?.aiVerdict);
  let graded = 0;
  await Promise.all(toGrade.map(async (station) => {
    const existing = answerMap.get(station.id);
    try {
      const result = await gradeWrittenAnswer({
        instructions: station.instructions, modelAnswer: station.modelAnswer ?? "(no model answer was provided by the admin — grade generously based on general medical knowledge)",
        studentAnswer: existing?.writtenAnswer ?? "", maxMarks: Number(station.marks),
      });
      if (existing) {
        await db.update(ospeExamAnswersTable).set({ aiVerdict: result.verdict, aiFeedback: result.feedback, aiGradedAt: new Date(), marksObtained: String(result.marksAwarded) }).where(eq(ospeExamAnswersTable.id, existing.id));
      } else {
        await db.insert(ospeExamAnswersTable).values({ attemptId, stationId: station.id, aiVerdict: result.verdict, aiFeedback: result.feedback, aiGradedAt: new Date(), marksObtained: String(result.marksAwarded) });
      }
      graded++;
    } catch {
      // Left ungraded (aiVerdict/marksObtained stay null) — surfaced to the
      // student as "not graded yet" on the result page, retryable via the
      // /grade endpoint. Not re-thrown: one station's AI failure shouldn't
      // block the rest of the submit.
    }
  }));
  return { graded, pending: toGrade.length - graded };
}

/** Loose match for identification/labeling answers — trims, lowercases,
 * and collapses punctuation/whitespace so "Left ventricle", "left  ventricle."
 * and "LEFT-VENTRICLE" all count the same, without going as far as fuzzy/AI
 * matching (the admin's label is the exact expected term). */
function normalizeLabel(s: string): string { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

/** Deterministic grading for a LABELING (identification) station: each
 * point in station.labelPoints is worth its own `marks` if set, else an
 * even share of the station's total marks. Never trust client-submitted
 * correctness — always recomputed here against the admin's stored labels. */
function gradeLabelingStation(station: typeof ospeStationsTable.$inferSelect, studentAnswers: Record<string, string> | null): { correctCount: number; totalPoints: number; marksObtained: number } {
  const points = (station.labelPoints as Array<{ id: string; label: string; marks?: number | null }> | null) || [];
  if (!points.length) return { correctCount: 0, totalPoints: 0, marksObtained: 0 };
  const stationMarks = Number(station.marks);
  const explicitTotal = points.reduce((sum, p) => sum + (p.marks ?? 0), 0);
  const evenShare = stationMarks / points.length;
  let correctCount = 0;
  let marksObtained = 0;
  for (const p of points) {
    const given = studentAnswers?.[p.id] ?? "";
    const isCorrect = !!given.trim() && normalizeLabel(given) === normalizeLabel(p.label);
    if (isCorrect) {
      correctCount++;
      marksObtained += p.marks != null ? p.marks : evenShare;
    }
  }
  // If admins set per-point marks that don't add up to the station total,
  // scale proportionally so the station never awards more than its marks.
  if (explicitTotal > 0 && explicitTotal !== stationMarks) marksObtained = marksObtained * (stationMarks / explicitTotal);
  return { correctCount, totalPoints: points.length, marksObtained: Math.round(marksObtained * 100) / 100 };
}

async function recomputeAttemptMarks(attemptId: number): Promise<number> {
  const answers = await db.select().from(ospeExamAnswersTable).where(eq(ospeExamAnswersTable.attemptId, attemptId));
  return answers.reduce((sum, a) => sum + (a.marksObtained != null ? Number(a.marksObtained) : 0), 0);
}

// Retries AI grading for whichever WRITTEN stations in this attempt aren't
// graded yet — the student-facing mop-up for anything gradeAndSubmit left
// pending because it didn't finish within its time budget, or because no
// AI provider was configured yet at submit time. Safe to call repeatedly:
// stations that already have an aiVerdict are skipped.
router.post("/ospe/exam-attempts/:id/grade", requireAuth, async (req, res): Promise<void> => {
  const attemptId = Number(req.params.id);
  const [attempt] = await db.select().from(ospeExamAttemptsTable).where(and(eq(ospeExamAttemptsTable.id, attemptId), eq(ospeExamAttemptsTable.userId, req.user!.id)));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  if (attempt.status === "in_progress") { res.status(409).json({ error: "Finish the exam before it can be graded" }); return; }

  const stations = await db.select({ station: ospeStationsTable }).from(ospeExamStationsTable).innerJoin(ospeStationsTable, eq(ospeExamStationsTable.stationId, ospeStationsTable.id)).where(eq(ospeExamStationsTable.examId, attempt.examId));
  const answers = await db.select().from(ospeExamAnswersTable).where(eq(ospeExamAnswersTable.attemptId, attemptId));
  const answerMap = new Map(answers.map((a) => [a.stationId, a]));

  let outcome: { graded: number; pending: number };
  try {
    outcome = await gradeWrittenStations(attemptId, stations.map((s) => s.station), answerMap);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: err.message }); return; }
    res.status(502).json({ error: "Grading failed — try again shortly." });
    return;
  }

  const [exam] = await db.select().from(ospeExamsTable).where(eq(ospeExamsTable.id, attempt.examId));
  const obtainedMarks = await recomputeAttemptMarks(attemptId);
  const totalMarks = Number(attempt.totalMarks);
  const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
  const passed = exam.passingPercent != null ? percentage >= Number(exam.passingPercent) : null;
  await db.update(ospeExamAttemptsTable).set({ obtainedMarks: String(obtainedMarks), percentage: String(percentage.toFixed(2)), passed }).where(eq(ospeExamAttemptsTable.id, attemptId));

  res.json({ ok: true, ...outcome, obtainedMarks, percentage });
});

router.get("/ospe/exam-attempts/:id/result", requireAuth, async (req, res): Promise<void> => {
  const attemptId = Number(req.params.id);
  const [attempt] = await db.select().from(ospeExamAttemptsTable).where(and(eq(ospeExamAttemptsTable.id, attemptId), eq(ospeExamAttemptsTable.userId, req.user!.id)));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  const [exam] = await db.select().from(ospeExamsTable).where(eq(ospeExamsTable.id, attempt.examId));

  if (attempt.status === "in_progress") { res.status(409).json({ error: "This attempt is still in progress" }); return; }

  const released = exam.resultReleaseMode === "manual" ? !!attempt.resultsReleasedAt
    : exam.resultReleaseMode === "after_end" ? Date.now() > exam.endAt.getTime()
    : true;
  if (!released) { res.json({ released: false }); return; }

  let breakdown: Array<{ stationId: number; title: string; instructions: string; imagePath: string | null; answerType: string; options: string[] | null; selectedAnswer: string | null; writtenAnswer: string | null; correctAnswer: string | null; modelAnswer: string | null; labelPoints: Array<{ id: string; x: number; y: number; label: string }> | null; labelAnswers: Record<string, string> | null; marks: number; marksObtained: number | null; correct: boolean | null; aiVerdict: string | null; aiFeedback: string | null }> = [];
  let fullyGraded = true;
  if (exam.showCorrectAnswers) {
    const stations = await db.select({ examStation: ospeExamStationsTable, station: ospeStationsTable }).from(ospeExamStationsTable).innerJoin(ospeStationsTable, eq(ospeExamStationsTable.stationId, ospeStationsTable.id)).where(eq(ospeExamStationsTable.examId, attempt.examId)).orderBy(ospeExamStationsTable.displayOrder);
    const answers = await db.select().from(ospeExamAnswersTable).where(eq(ospeExamAnswersTable.attemptId, attemptId));
    const answerMap = new Map(answers.map((a) => [a.stationId, a]));
    breakdown = stations.map(({ station }) => {
      const a = answerMap.get(station.id);
      if (station.answerType === "WRITTEN" && !a?.aiVerdict) fullyGraded = false;
      return {
        stationId: station.id, title: station.title, instructions: station.instructions, imagePath: station.imagePath,
        answerType: station.answerType, options: station.options, selectedAnswer: a?.selectedAnswer ?? null, writtenAnswer: a?.writtenAnswer ?? null,
        correctAnswer: station.correctAnswer, modelAnswer: station.modelAnswer,
        labelPoints: (station.labelPoints as Array<{ id: string; x: number; y: number; label: string }> | null) ?? null,
        labelAnswers: (a?.labelAnswers as Record<string, string> | null) ?? null,
        marks: Number(station.marks),
        marksObtained: a?.marksObtained != null ? Number(a.marksObtained) : null, correct: a?.correct ?? null,
        aiVerdict: a?.aiVerdict ?? null, aiFeedback: a?.aiFeedback ?? null,
      };
    });
  }

  res.json({
    released: true, status: attempt.status, totalStations: attempt.totalStations, fullyGraded,
    totalMarks: Number(attempt.totalMarks), obtainedMarks: exam.showMarks ? Number(attempt.obtainedMarks) : null,
    percentage: exam.showPercentage ? Number(attempt.percentage) : null, passed: attempt.passed, breakdown,
  });
});

export default router;

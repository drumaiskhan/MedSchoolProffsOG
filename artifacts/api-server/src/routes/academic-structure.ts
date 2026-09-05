import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, institutionsTable, programsTable, academicYearsTable, batchesTable, auditLogsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function boolQuery(value: unknown): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------

router.get("/institutions", async (req, res): Promise<void> => {
  const activeOnly = boolQuery(req.query.active) ?? !req.user;
  const rows = await db.select().from(institutionsTable).where(activeOnly ? eq(institutionsTable.active, true) : undefined).orderBy(asc(institutionsTable.displayOrder), asc(institutionsTable.name));
  res.json(rows);
});

const InstitutionBody = z.object({ name: z.string().min(2).max(160), city: z.string().max(120).optional(), active: z.boolean().optional(), displayOrder: z.number().int().optional() });

router.post("/institutions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = InstitutionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(institutionsTable).values({ name: parsed.data.name, city: parsed.data.city ?? "", active: parsed.data.active ?? true, displayOrder: parsed.data.displayOrder ?? 0 }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "INSTITUTION_CREATED", entity: "institution", entityId: row.id });
  res.status(201).json(row);
});

router.patch("/institutions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = InstitutionBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [row] = await db.update(institutionsTable).set(parsed.data).where(eq(institutionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Institution not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "INSTITUTION_UPDATED", entity: "institution", entityId: row.id });
  res.json(row);
});

router.delete("/institutions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(institutionsTable).set({ active: false }).where(eq(institutionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Institution not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "INSTITUTION_ARCHIVED", entity: "institution", entityId: row.id });
  res.json(row);
});

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

router.get("/programs", async (req, res): Promise<void> => {
  const institutionId = req.query.institutionId ? Number(req.query.institutionId) : undefined;
  const activeOnly = boolQuery(req.query.active) ?? !req.user;
  const rows = await db.select().from(programsTable).where(and(institutionId ? eq(programsTable.institutionId, institutionId) : undefined, activeOnly ? eq(programsTable.active, true) : undefined)).orderBy(asc(programsTable.displayOrder), asc(programsTable.name));
  res.json(rows);
});

const ProgramBody = z.object({ institutionId: z.number().int().positive(), name: z.string().min(1).max(160), kind: z.string().max(40).optional(), active: z.boolean().optional(), displayOrder: z.number().int().optional() });

router.post("/programs", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ProgramBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(programsTable).values({ institutionId: parsed.data.institutionId, name: parsed.data.name, kind: (parsed.data.kind || "").trim().toUpperCase(), active: parsed.data.active ?? true, displayOrder: parsed.data.displayOrder ?? 0 }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PROGRAM_CREATED", entity: "program", entityId: row.id });
  res.status(201).json(row);
});

router.patch("/programs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = ProgramBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const { kind, ...rest } = parsed.data;
  const [row] = await db.update(programsTable).set({ ...rest, ...(kind !== undefined ? { kind: kind.trim().toUpperCase() } : {}) }).where(eq(programsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Program not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PROGRAM_UPDATED", entity: "program", entityId: row.id });
  res.json(row);
});

router.delete("/programs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(programsTable).set({ active: false }).where(eq(programsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Program not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PROGRAM_ARCHIVED", entity: "program", entityId: row.id });
  res.json(row);
});

// ---------------------------------------------------------------------------
// Academic Years
// ---------------------------------------------------------------------------

router.get("/academic-years", async (req, res): Promise<void> => {
  const programId = req.query.programId ? Number(req.query.programId) : undefined;
  const activeOnly = boolQuery(req.query.active) ?? !req.user;
  const rows = await db.select().from(academicYearsTable).where(and(programId ? eq(academicYearsTable.programId, programId) : undefined, activeOnly ? eq(academicYearsTable.active, true) : undefined)).orderBy(asc(academicYearsTable.displayOrder), asc(academicYearsTable.label));
  res.json(rows);
});

const AcademicYearBody = z.object({ programId: z.number().int().positive(), label: z.string().min(1).max(80), yearNumber: z.number().int().min(1).max(5).nullable().optional(), active: z.boolean().optional(), displayOrder: z.number().int().optional() });

router.post("/academic-years", requireAdmin, async (req, res): Promise<void> => {
  const parsed = AcademicYearBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(academicYearsTable).values({ programId: parsed.data.programId, label: parsed.data.label, yearNumber: parsed.data.yearNumber ?? null, active: parsed.data.active ?? true, displayOrder: parsed.data.displayOrder ?? 0 }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "ACADEMIC_YEAR_CREATED", entity: "academic_year", entityId: row.id });
  res.status(201).json(row);
});

router.patch("/academic-years/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = AcademicYearBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [row] = await db.update(academicYearsTable).set(parsed.data).where(eq(academicYearsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Academic year not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "ACADEMIC_YEAR_UPDATED", entity: "academic_year", entityId: row.id });
  res.json(row);
});

router.delete("/academic-years/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(academicYearsTable).set({ active: false }).where(eq(academicYearsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Academic year not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "ACADEMIC_YEAR_ARCHIVED", entity: "academic_year", entityId: row.id });
  res.json(row);
});

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

router.get("/batches", async (req, res): Promise<void> => {
  const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
  const activeOnly = boolQuery(req.query.active) ?? !req.user;
  const rows = await db.select().from(batchesTable).where(and(academicYearId ? eq(batchesTable.academicYearId, academicYearId) : undefined, activeOnly ? eq(batchesTable.active, true) : undefined)).orderBy(asc(batchesTable.displayOrder), asc(batchesTable.label));
  res.json(rows);
});

const BatchBody = z.object({ academicYearId: z.number().int().positive(), label: z.string().min(1).max(80), active: z.boolean().optional(), displayOrder: z.number().int().optional() });

router.post("/batches", requireAdmin, async (req, res): Promise<void> => {
  const parsed = BatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(batchesTable).values({ academicYearId: parsed.data.academicYearId, label: parsed.data.label, active: parsed.data.active ?? true, displayOrder: parsed.data.displayOrder ?? 0 }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BATCH_CREATED", entity: "batch", entityId: row.id });
  res.status(201).json(row);
});

router.patch("/batches/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = BatchBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [row] = await db.update(batchesTable).set(parsed.data).where(eq(batchesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Batch not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BATCH_UPDATED", entity: "batch", entityId: row.id });
  res.json(row);
});

router.delete("/batches/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(batchesTable).set({ active: false }).where(eq(batchesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Batch not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BATCH_ARCHIVED", entity: "batch", entityId: row.id });
  res.json(row);
});

export default router;

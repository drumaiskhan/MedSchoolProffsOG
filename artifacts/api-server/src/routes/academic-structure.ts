import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, institutionsTable, programsTable, academicYearsTable, batchesTable, auditLogsTable, usersTable } from "@workspace/db";
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
  // Optional ?kind=MBBS|BDS filter so the student registration form can
  // ask for "MBBS colleges" or "BDS colleges" as two separate lists
  // instead of one flat list of every institution regardless of program.
  const kind = typeof req.query.kind === "string" ? req.query.kind.trim().toUpperCase() : undefined;
  // Bug fix: every institution created before the MBBS/BDS split (v13) has
  // kind === "" (see ensureSchema's backfill). Filtering on an *exact* kind
  // match meant a freshly-migrated deployment showed "No MBBS/BDS colleges
  // are set up yet" on the public registration form for every one of those
  // colleges — the college picker looked broken even though the colleges
  // were right there in the admin panel's "Unset" tab. Matching kind === ""
  // alongside the requested kind keeps not-yet-categorized colleges visible
  // (under BOTH tabs, harmlessly) until an admin tags them from Admin ->
  // Colleges & courses, instead of hiding them from students in the
  // meantime.
  const kindFilter = kind ? or(eq(institutionsTable.kind, kind), eq(institutionsTable.kind, "")) : undefined;
  const rows = await db.select().from(institutionsTable).where(and(activeOnly ? eq(institutionsTable.active, true) : undefined, kindFilter)).orderBy(asc(institutionsTable.displayOrder), asc(institutionsTable.name));
  res.json(rows);
});

const InstitutionBody = z.object({ name: z.string().min(2).max(160), city: z.string().max(120).optional(), kind: z.string().max(40).optional(), active: z.boolean().optional(), displayOrder: z.number().int().optional() });

router.post("/institutions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = InstitutionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  // Default to "after everything else" rather than a flat 0 — the admin's
  // "Add institution" form never sends displayOrder, and if every row
  // created this way lands on the same 0, the reorder arrows' swap-based
  // move has nothing to actually change (see the frontend fix for the
  // matching symptom). Newly added institutions should appear at the end
  // of the list, not silently tie with everything already there.
  let displayOrder = parsed.data.displayOrder;
  if (displayOrder === undefined) {
    const [{ maxOrder } = { maxOrder: null }] = await db.select({ maxOrder: sql<number | null>`max(${institutionsTable.displayOrder})` }).from(institutionsTable);
    displayOrder = (maxOrder ?? -1) + 1;
  }
  const [row] = await db.insert(institutionsTable).values({ name: parsed.data.name, city: parsed.data.city ?? "", kind: (parsed.data.kind || "").trim().toUpperCase(), active: parsed.data.active ?? true, displayOrder }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "INSTITUTION_CREATED", entity: "institution", entityId: row.id });
  res.status(201).json(row);
});

router.patch("/institutions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = InstitutionBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const { kind, ...rest } = parsed.data;
  const [row] = await db.update(institutionsTable).set({ ...rest, ...(kind !== undefined ? { kind: kind.trim().toUpperCase() } : {}) }).where(eq(institutionsTable.id, id)).returning();
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

// Hard delete — only reachable once the institution is already archived
// (the soft delete above). Blocked only if a real student account is still
// assigned to it (see the usersTable check below) — that's the one thing
// this route deliberately never deletes on its own, since a student login
// is real user data, not config.
//
// Programs/academic years/batches underneath the institution are NOT a
// reason to block anymore (fix: "delete institution ... gives error" when
// it still has programs/batches). They're just the structural config an
// admin built up while setting the institution up, not user data, and —
// same root cause as hardDeleteMcqs() in medschool.ts — none of
// med_programs/med_academic_years/med_batches has a real DB-level FOREIGN
// KEY back to med_institutions (checked ensureSchema.ts: plain integer
// columns, no REFERENCES), so a bare DELETE FROM med_institutions was never
// actually going to be stopped by the database — the 409 here was an
// application-level guard, not a real constraint. Rather than make the
// admin manually hunt down and delete every program/year/batch first, this
// now cascades the delete itself, bottom-up, in one transaction: batches,
// then academic years, then programs, then the institution. A few other
// tables (resources, past papers) hold these program/year ids as *optional*
// targeting filters, not ownership — those just go unmatched afterward,
// same tolerance the app already has for any other archived/removed id.
router.delete("/institutions/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid institution id" }); return; }
  const [row] = await db.select().from(institutionsTable).where(eq(institutionsTable.id, id));
  if (!row) { res.status(404).json({ error: "Institution not found" }); return; }
  if (row.active) { res.status(409).json({ error: "Archive this institution first before deleting it permanently." }); return; }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.institutionId, id)).limit(1);
  if (user) { res.status(409).json({ error: "Students are still assigned to this institution — reassign or remove them first." }); return; }

  let cascadedPrograms = 0;
  let cascadedYears = 0;
  let cascadedBatches = 0;
  await db.transaction(async (tx) => {
    const programRows = await tx.select({ id: programsTable.id }).from(programsTable).where(eq(programsTable.institutionId, id));
    const programIds = programRows.map((p) => p.id);
    if (programIds.length) {
      const yearRows = await tx.select({ id: academicYearsTable.id }).from(academicYearsTable).where(inArray(academicYearsTable.programId, programIds));
      const yearIds = yearRows.map((y) => y.id);
      if (yearIds.length) {
        const deletedBatches = await tx.delete(batchesTable).where(inArray(batchesTable.academicYearId, yearIds)).returning({ id: batchesTable.id });
        cascadedBatches = deletedBatches.length;
        await tx.delete(academicYearsTable).where(inArray(academicYearsTable.id, yearIds));
        cascadedYears = yearIds.length;
      }
      await tx.delete(programsTable).where(inArray(programsTable.id, programIds));
      cascadedPrograms = programIds.length;
    }
    await tx.delete(institutionsTable).where(eq(institutionsTable.id, id));
  });

  await db.insert(auditLogsTable).values({
    actorId: req.user!.id,
    action: "INSTITUTION_PERMANENTLY_DELETED",
    entity: "institution",
    entityId: id,
    metadata: JSON.stringify({ cascadedPrograms, cascadedYears, cascadedBatches }),
  });
  res.json({ ok: true, cascadedPrograms, cascadedYears, cascadedBatches });
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

import { Router, type IRouter } from "express";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pastPapersTable, mcqsTable, auditLogsTable, usersTable } from "@workspace/db";
import { requireAdmin, requireAuth, requireActiveMembership, isAdminRole } from "../middlewares/auth";

const router: IRouter = Router();

async function paperView(paper: typeof pastPapersTable.$inferSelect) {
  const [mcqCount] = await db.select({ count: sql<number>`count(*)` }).from(mcqsTable).where(eq(mcqsTable.pastPaperId, paper.id));
  return { ...paper, mcqCount: Number(mcqCount?.count ?? 0) };
}

router.get("/past-papers", async (req, res): Promise<void> => {
  const isAdmin = req.user && (isAdminRole(req.user.role));
  const level = typeof req.query.level === "string" ? req.query.level : undefined;

  // Scope students to their own program + academic year, the same way
  // GET /exams already does via getStudentTargeting/isEligible — a paper
  // with programId/academicYearId left null is "all programs/years" and
  // stays visible to everyone; a paper tagged to a specific program/year
  // is only visible to matching students. Admins see everything.
  let studentProgramId: number | null = null;
  let studentAcademicYearId: number | null = null;
  if (req.user && !isAdmin) {
    const [student] = await db.select({ programId: usersTable.programId, academicYearId: usersTable.academicYearId }).from(usersTable).where(eq(usersTable.id, req.user.id));
    studentProgramId = student?.programId ?? null;
    studentAcademicYearId = student?.academicYearId ?? null;
  }

  const rows = await db.select().from(pastPapersTable).where(and(
    isAdmin ? undefined : eq(pastPapersTable.active, true),
    level ? eq(pastPapersTable.level, level) : undefined,
    isAdmin || !req.user ? undefined : or(isNull(pastPapersTable.programId), eq(pastPapersTable.programId, studentProgramId ?? -1)),
    isAdmin || !req.user ? undefined : or(isNull(pastPapersTable.academicYearId), eq(pastPapersTable.academicYearId, studentAcademicYearId ?? -1)),
  )).orderBy(pastPapersTable.displayOrder);
  res.json(await Promise.all(rows.map(paperView)));
});

router.get("/past-papers/:id/mcqs", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rows = await db.select().from(mcqsTable).where(and(eq(mcqsTable.pastPaperId, id), eq(mcqsTable.status, "published")));
  res.json(rows.map((row) => ({ ...row, module: "", subject: "", topic: "" })));
});

const PaperBody = z.object({
  title: z.string().min(1).max(160),
  examBoard: z.string().max(80).optional(),
  year: z.string().max(20).optional(),
  level: z.string().max(80).optional(),
  institutionId: z.number().int().positive().optional(),
  programId: z.number().int().positive().optional(),
  academicYearId: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  archived: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

router.post("/past-papers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = PaperBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(pastPapersTable).values({ ...parsed.data, active: parsed.data.active ?? true }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAST_PAPER_CREATED", entity: "past_paper", entityId: row.id });
  res.status(201).json(await paperView(row));
});

router.patch("/past-papers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = PaperBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [row] = await db.update(pastPapersTable).set(parsed.data).where(eq(pastPapersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Past paper not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAST_PAPER_UPDATED", entity: "past_paper", entityId: row.id });
  res.json(await paperView(row));
});

router.delete("/past-papers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(pastPapersTable).set({ active: false, archived: true }).where(eq(pastPapersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Past paper not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAST_PAPER_ARCHIVED", entity: "past_paper", entityId: row.id });
  res.json({ ok: true });
});

// Hard delete — only for a paper already archived (the DELETE above).
// Un-tags any MCQs linked to it (they stay in the bank, same wording as the
// existing "lose the paper tag" behavior) before removing the row.
router.delete("/past-papers/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid past paper id" }); return; }
  const [paper] = await db.select().from(pastPapersTable).where(eq(pastPapersTable.id, id));
  if (!paper) { res.status(404).json({ error: "Past paper not found" }); return; }

  await db.update(mcqsTable).set({ pastPaperId: null }).where(eq(mcqsTable.pastPaperId, id));
  await db.delete(pastPapersTable).where(eq(pastPapersTable.id, id));

  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAST_PAPER_PERMANENTLY_DELETED", entity: "past_paper", entityId: id });
  res.json({ ok: true });
});

// Attach/detach MCQs to a paper (admin only) — lets admins build a paper from
// existing MCQs or ones they add fresh via the MCQ bank with pastPaperId set.
router.post("/past-papers/:id/mcqs", requireAdmin, async (req, res): Promise<void> => {
  const paperId = Number(req.params.id);
  const parsed = z.object({ mcqIds: z.array(z.number().int().positive()) }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(paperId)) { res.status(400).json({ error: "mcqIds is required" }); return; }
  for (const mcqId of parsed.data.mcqIds) {
    await db.update(mcqsTable).set({ pastPaperId: paperId }).where(eq(mcqsTable.id, mcqId));
  }
  res.json({ ok: true });
});

router.delete("/past-papers/:id/mcqs/:mcqId", requireAdmin, async (req, res): Promise<void> => {
  await db.update(mcqsTable).set({ pastPaperId: null }).where(eq(mcqsTable.id, Number(req.params.mcqId)));
  res.json({ ok: true });
});

export default router;

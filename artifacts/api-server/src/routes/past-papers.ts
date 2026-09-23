import { Router, type IRouter } from "express";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pastPapersTable, mcqsTable, auditLogsTable, usersTable } from "@workspace/db";
import { requireAdmin, requireAuth, requireMembershipFor, isAdminRole } from "../middlewares/auth";
import { deleteMcqsEverywhere } from "../lib/mcqCascade";
import { getStudentTargeting, isTargetVisible, notifyTargetedStudents } from "../lib/contentVisibility";

const router: IRouter = Router();

// Mirrors DEGREE_YEAR_OPTIONS in frontend-admin/src/lib/shared.tsx — position
// within the array is the year number (index + 1), same convention the
// Degree + Year picker's studyYearToNumber() uses. Duplicated here rather
// than imported since this is server code and that lives in a frontend
// package; keep the two in sync if a degree/year label ever changes.
const DEGREE_YEAR_OPTIONS: Record<string, string[]> = {
  MBBS: ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year"],
  BDS: ["1st Year", "2nd Year", "3rd Year", "Final Year"],
};

async function paperView(paper: typeof pastPapersTable.$inferSelect) {
  const [mcqCount] = await db.select({ count: sql<number>`count(*)` }).from(mcqsTable).where(eq(mcqsTable.pastPaperId, paper.id));
  return { ...paper, mcqCount: Number(mcqCount?.count ?? 0) };
}

router.get("/past-papers", async (req, res): Promise<void> => {
  const isAdmin = req.user && (isAdminRole(req.user.role));
  const level = typeof req.query.level === "string" ? req.query.level : undefined;

  // Scope students to their own program + academic year. Two targeting
  // mechanisms exist side by side here: the older institutionId/programId/
  // academicYearId FK trio (which requires "Colleges & courses" to be set
  // up first — see AdminPastPapers' "No programs set up yet" notice, which
  // most admins never do), and programTargetKind/yearTargetNumber, which
  // is derived automatically from the paper's own Degree + Year picker at
  // save time — same simple convention Modules/Blocks already use, no
  // separate setup needed. A paper is visible to a student only if it
  // passes BOTH: left untouched on an axis (null) always passes that axis;
  // set on either axis means the student's own value has to match it.
  let studentProgramId: number | null = null;
  let studentAcademicYearId: number | null = null;
  let targeting = { programKind: null as string | null, yearNumber: null as number | null };
  if (req.user && !isAdmin) {
    const [student] = await db.select({ programId: usersTable.programId, academicYearId: usersTable.academicYearId }).from(usersTable).where(eq(usersTable.id, req.user.id));
    studentProgramId = student?.programId ?? null;
    studentAcademicYearId = student?.academicYearId ?? null;
    targeting = await getStudentTargeting(req.user.id);
  }

  const rows = await db.select().from(pastPapersTable).where(and(
    isAdmin ? undefined : eq(pastPapersTable.active, true),
    level ? eq(pastPapersTable.level, level) : undefined,
    isAdmin || !req.user ? undefined : or(isNull(pastPapersTable.programId), eq(pastPapersTable.programId, studentProgramId ?? -1)),
    isAdmin || !req.user ? undefined : or(isNull(pastPapersTable.academicYearId), eq(pastPapersTable.academicYearId, studentAcademicYearId ?? -1)),
  )).orderBy(pastPapersTable.displayOrder);
  const scoped = isAdmin || !req.user ? rows : rows.filter((row) => isTargetVisible(row.programTargetKind, row.yearTargetNumber, targeting));
  res.json(await Promise.all(scoped.map(paperView)));
});

router.get("/past-papers/:id/mcqs", requireAuth, requireMembershipFor("past_papers"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rows = await db.select().from(mcqsTable).where(and(eq(mcqsTable.pastPaperId, id), eq(mcqsTable.status, "published")));
  res.json(rows.map((row) => ({ ...row, module: "", subject: "", topic: "" })));
});

const PaperBody = z.object({
  title: z.string().min(1).max(160),
  examBoard: z.string().max(80).optional(),
  year: z.string().max(20).optional(),
  level: z.string().max(80).optional(),
  // Nullable, not just optional: PastPaperEditForm (the edit form, unlike
  // the create form) always sends these three keys explicitly — a real id
  // when set, or `null` when the admin leaves/clears the field — rather
  // than omitting the key. With `.optional()` alone, zod rejected `null`
  // outright (a type mismatch, not a "missing field"), so safeParse
  // failed on every single edit save and PATCH returned 400 before
  // touching the DB. The update mutation on the frontend has no onError
  // toast either, so that 400 was invisible — "Save changes" just did
  // nothing. `.nullable()` lets an edit both set AND clear these fields.
  institutionId: z.number().int().positive().nullable().optional(),
  programId: z.number().int().positive().nullable().optional(),
  academicYearId: z.number().int().positive().nullable().optional(),
  // Derived from the Degree + Year picker (see the paperView/GET comment
  // above) — null/omitted means "every program" / "every year" on that
  // axis, same convention as Modules/Blocks.
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(6).nullable().optional(),
  active: z.boolean().optional(),
  archived: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

router.post("/past-papers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = PaperBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const { programTargetKind, yearTargetNumber, ...rest } = parsed.data;
  const active = parsed.data.active ?? true;
  const normalizedKind = programTargetKind ? programTargetKind.trim().toUpperCase() : null;
  const [row] = await db.insert(pastPapersTable).values({
    ...rest,
    active,
    programTargetKind: normalizedKind,
    yearTargetNumber: yearTargetNumber ?? null,
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAST_PAPER_CREATED", entity: "past_paper", entityId: row.id });

  // Auto-notify the same audience this paper is actually visible to (see
  // notifyTargetedStudents in contentVisibility.ts) — same
  // programTargetKind/yearTargetNumber rule GET /past-papers uses, so a
  // paper scoped to e.g. MBBS Year 3 only pings MBBS Year 3 students, and
  // an untargeted paper reaches everyone. Skipped for a paper saved
  // inactive (admin still working on it) — nothing to notify anyone about
  // yet since students can't see it either.
  if (active) {
    const scopeLabel = `${normalizedKind || "All programs"} · ${yearTargetNumber ? `Year ${yearTargetNumber}` : "All years"}`;
    const notified = await notifyTargetedStudents(
      normalizedKind,
      yearTargetNumber ?? null,
      "New past paper available",
      `"${row.title}" has just been added — check it out under Past papers.`,
      "info",
    );
    await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "NOTIFICATION_AUTO_PAST_PAPER", entity: "past_paper", entityId: row.id, metadata: JSON.stringify({ scope: scopeLabel, notified }) });
  }

  res.status(201).json(await paperView(row));
});

router.patch("/past-papers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = PaperBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [before] = await db.select().from(pastPapersTable).where(eq(pastPapersTable.id, id));
  const { programTargetKind, yearTargetNumber, ...rest } = parsed.data;
  const [row] = await db.update(pastPapersTable).set({
    ...rest,
    ...(programTargetKind !== undefined ? { programTargetKind: programTargetKind ? programTargetKind.trim().toUpperCase() : null } : {}),
    ...(yearTargetNumber !== undefined ? { yearTargetNumber } : {}),
  }).where(eq(pastPapersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Past paper not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAST_PAPER_UPDATED", entity: "past_paper", entityId: row.id });

  // Only fires the auto-notification on the false → true transition (a
  // paper made visible for the first time after being saved inactive) —
  // never on every edit, or every title tweak to an already-active paper
  // would re-spam the same students.
  if (before && !before.active && row.active) {
    const scopeLabel = `${row.programTargetKind || "All programs"} · ${row.yearTargetNumber ? `Year ${row.yearTargetNumber}` : "All years"}`;
    const notified = await notifyTargetedStudents(
      row.programTargetKind,
      row.yearTargetNumber,
      "New past paper available",
      `"${row.title}" has just been added — check it out under Past papers.`,
      "info",
    );
    await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "NOTIFICATION_AUTO_PAST_PAPER", entity: "past_paper", entityId: row.id, metadata: JSON.stringify({ scope: scopeLabel, notified }) });
  }

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
// Deletes every MCQ that belongs to this paper — and everything else in
// the app that references those MCQs (practice history, exam
// attachments, notebook entries, flags) — instead of just un-tagging
// them, so nothing is left behind in the question bank or anywhere else.
router.delete("/past-papers/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid past paper id" }); return; }
  const [paper] = await db.select().from(pastPapersTable).where(eq(pastPapersTable.id, id));
  if (!paper) { res.status(404).json({ error: "Past paper not found" }); return; }

  const mcqRows = await db.select({ id: mcqsTable.id }).from(mcqsTable).where(eq(mcqsTable.pastPaperId, id));
  await deleteMcqsEverywhere(mcqRows.map((r) => r.id));
  await db.delete(pastPapersTable).where(eq(pastPapersTable.id, id));

  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAST_PAPER_PERMANENTLY_DELETED", entity: "past_paper", entityId: id, metadata: JSON.stringify({ mcqsDeleted: mcqRows.length }) });
  res.json({ ok: true, mcqsDeleted: mcqRows.length });
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

// One-time backward-compat fix (same pattern as
// POST /admin/books/backfill-links) for papers uploaded before the Degree +
// Year picker existed. Those rows only ever got the free-text `level`
// field (e.g. "MBBS - 1st Year") typed or composed at creation, with
// programTargetKind/yearTargetNumber left null — and null on either axis
// means "visible to every program/year" (see contentVisibility.ts), which
// is exactly why an old First Year paper still shows up in a Third Year
// student's account: it was never actually tagged as First-Year-only, it
// was just labeled that way in text nobody parsed back into the real
// targeting fields. This walks every paper missing that targeting, splits
// its `level` on " - " into a degree and a study-year label, and — only
// when both halves match a real DEGREE_YEAR_OPTIONS entry — fills in
// programTargetKind/yearTargetNumber from it. Safe to re-run: a paper
// already tagged (by this or the create/edit form) is left untouched, and
// a paper whose `level` doesn't parse cleanly is skipped rather than
// guessed at.
router.post("/past-papers/backfill-year-targeting", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(pastPapersTable).where(and(isNull(pastPapersTable.programTargetKind), isNull(pastPapersTable.yearTargetNumber)));
  let fixed = 0;
  let skipped = 0;
  for (const row of rows) {
    const [degree, studyYear] = (row.level || "").split(" - ").map((s) => s.trim());
    const yearIndex = degree && studyYear ? (DEGREE_YEAR_OPTIONS[degree] || []).indexOf(studyYear) : -1;
    if (yearIndex < 0) { skipped++; continue; }
    await db.update(pastPapersTable).set({ programTargetKind: degree, yearTargetNumber: yearIndex + 1 }).where(eq(pastPapersTable.id, row.id));
    fixed++;
  }
  res.json({ fixed, skipped });
});

export default router;

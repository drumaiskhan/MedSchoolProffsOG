import { Router, type IRouter } from "express";
import { or, ilike, eq, and, ne, desc } from "drizzle-orm";
import { db, usersTable, mcqsTable, modulesTable, subjectsTable, topicsTable, examsTable, pastPapersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Universal admin search — the header's search bar hits this one endpoint
// instead of the admin needing to already know which of the ~10 separate
// pages (Students, MCQ bank, Modules, Subjects, Topics, Pre-Proffs Exams,
// Past papers...) something lives on. Deliberately one lightweight ilike
// query per entity type here, rather than wiring every admin list hook
// into the header component itself — that would mean 7+ full-table
// fetches firing on every keystroke just to back a search box that's
// closed almost all the time. Each query is capped and independent, so a
// slow/huge table in one category can't block the others.
const LIMIT = 6;

router.get("/admin/search", requireAdmin, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  // Same "at least 2 characters" floor as the student app's QuickJump —
  // a single character against `ilike '%x%'` on a students/MCQs table
  // would match almost every row and cost a full scan for no useful result.
  if (q.length < 2) { res.json({ students: [], mcqs: [], modules: [], subjects: [], topics: [], exams: [], pastPapers: [] }); return; }
  const like = `%${q}%`;

  const [students, mcqs, modules, subjects, topics, exams, pastPapers] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, status: usersTable.status })
      .from(usersTable)
      .where(and(
        eq(usersTable.role, "student"),
        ne(usersTable.status, "DELETED"),
        or(ilike(usersTable.name, like), ilike(usersTable.email, like), ilike(usersTable.rollNumber, like)),
      ))
      .orderBy(desc(usersTable.createdAt)).limit(LIMIT),
    db.select({ id: mcqsTable.id, question: mcqsTable.question }).from(mcqsTable).where(ilike(mcqsTable.question, like)).limit(LIMIT),
    db.select({ id: modulesTable.id, name: modulesTable.name }).from(modulesTable).where(ilike(modulesTable.name, like)).limit(LIMIT),
    db.select({ id: subjectsTable.id, name: subjectsTable.name }).from(subjectsTable).where(ilike(subjectsTable.name, like)).limit(LIMIT),
    db.select({ id: topicsTable.id, name: topicsTable.name }).from(topicsTable).where(ilike(topicsTable.name, like)).limit(LIMIT),
    db.select({ id: examsTable.id, title: examsTable.title }).from(examsTable).where(ilike(examsTable.title, like)).limit(LIMIT),
    db.select({ id: pastPapersTable.id, title: pastPapersTable.title }).from(pastPapersTable).where(ilike(pastPapersTable.title, like)).limit(LIMIT),
  ]);

  res.json({
    students: students.map((s) => ({ id: s.id, title: s.name, subtitle: s.email, status: s.status })),
    // MCQ question text can run long — trimmed to a one-line preview here
    // so the dropdown result stays a single row; the full question is
    // still just a click away on the MCQ bank page itself.
    mcqs: mcqs.map((m) => ({ id: m.id, title: m.question.length > 90 ? `${m.question.slice(0, 90)}…` : m.question })),
    modules: modules.map((m) => ({ id: m.id, title: m.name })),
    subjects: subjects.map((s) => ({ id: s.id, title: s.name })),
    topics: topics.map((t) => ({ id: t.id, title: t.name })),
    exams: exams.map((e) => ({ id: e.id, title: e.title })),
    pastPapers: pastPapers.map((p) => ({ id: p.id, title: p.title })),
  });
});

export default router;

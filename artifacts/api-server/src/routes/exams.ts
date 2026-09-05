import { Router, type IRouter } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, examsTable, examQuestionsTable, examAttemptsTable, examAnswersTable, mcqsTable, usersTable, auditLogsTable } from "@workspace/db";
import { requireAuth, requireAdmin, requireActiveMembership, isAdminRole } from "../middlewares/auth";
import { getStudentTargeting } from "../lib/contentVisibility";

const router: IRouter = Router();

function isEligible(exam: typeof examsTable.$inferSelect, targeting: { programKind: string | null; yearNumber: number | null }): boolean {
  const programOk = !exam.programTargetKind || exam.programTargetKind === targeting.programKind;
  const yearOk = !exam.yearTargetNumber || exam.yearTargetNumber === targeting.yearNumber;
  return programOk && yearOk;
}

function examStudentView(exam: typeof examsTable.$inferSelect) {
  return {
    id: exam.id, title: exam.title, description: exam.description,
    programTargetKind: exam.programTargetKind, yearTargetNumber: exam.yearTargetNumber,
    durationMinutes: exam.durationMinutes, startAt: exam.startAt.toISOString(), endAt: exam.endAt.toISOString(),
    maxAttempts: exam.maxAttempts, negativeMarkingEnabled: exam.negativeMarkingEnabled, negativeMarkPerWrong: Number(exam.negativeMarkPerWrong),
    passingPercent: exam.passingPercent ? Number(exam.passingPercent) : null, status: exam.status,
  };
}

// ---------------------------------------------------------------------------
// Admin: exam CRUD
// ---------------------------------------------------------------------------

router.get("/admin/exams", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(examsTable).orderBy(desc(examsTable.startAt));
  const withCounts = await Promise.all(rows.map(async (exam) => {
    const [{ value: questionCount }] = await db.select({ value: count() }).from(examQuestionsTable).where(eq(examQuestionsTable.examId, exam.id));
    const [{ value: attemptCount }] = await db.select({ value: count() }).from(examAttemptsTable).where(eq(examAttemptsTable.examId, exam.id));
    return { ...exam, negativeMarkPerWrong: Number(exam.negativeMarkPerWrong), passingPercent: exam.passingPercent ? Number(exam.passingPercent) : null, questionCount, attemptCount };
  }));
  res.json(withCounts);
});

const ExamBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(5).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  negativeMarkingEnabled: z.boolean().optional(),
  negativeMarkPerWrong: z.number().min(0).max(10).optional(),
  passingPercent: z.number().min(0).max(100).nullable().optional(),
  resultReleaseMode: z.enum(["immediate", "after_end", "manual"]).optional(),
  showMarks: z.boolean().optional(),
  showPercentage: z.boolean().optional(),
  showCorrectAnswers: z.boolean().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

router.post("/admin/exams", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ExamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const data = parsed.data;
  if (new Date(data.endAt) <= new Date(data.startAt)) { res.status(400).json({ error: "End time must be after start time" }); return; }
  const [exam] = await db.insert(examsTable).values({
    title: data.title, description: data.description ?? "",
    programTargetKind: data.programTargetKind ? data.programTargetKind.trim().toUpperCase() : null,
    yearTargetNumber: data.yearTargetNumber ?? null,
    durationMinutes: data.durationMinutes ?? 60, startAt: new Date(data.startAt), endAt: new Date(data.endAt),
    maxAttempts: data.maxAttempts ?? 1, negativeMarkingEnabled: data.negativeMarkingEnabled ?? false,
    negativeMarkPerWrong: String(data.negativeMarkPerWrong ?? 0), passingPercent: data.passingPercent != null ? String(data.passingPercent) : null,
    resultReleaseMode: data.resultReleaseMode ?? "immediate", showMarks: data.showMarks ?? true, showPercentage: data.showPercentage ?? true,
    showCorrectAnswers: data.showCorrectAnswers ?? true, status: data.status ?? "draft",
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXAM_CREATED", entity: "exam", entityId: exam.id });
  res.status(201).json(exam);
});

router.patch("/admin/exams/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = ExamBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const { programTargetKind, yearTargetNumber, startAt, endAt, negativeMarkPerWrong, passingPercent, ...rest } = parsed.data;
  const [exam] = await db.update(examsTable).set({
    ...rest,
    ...(programTargetKind !== undefined ? { programTargetKind: programTargetKind ? programTargetKind.trim().toUpperCase() : null } : {}),
    ...(yearTargetNumber !== undefined ? { yearTargetNumber } : {}),
    ...(startAt !== undefined ? { startAt: new Date(startAt) } : {}),
    ...(endAt !== undefined ? { endAt: new Date(endAt) } : {}),
    ...(negativeMarkPerWrong !== undefined ? { negativeMarkPerWrong: String(negativeMarkPerWrong) } : {}),
    ...(passingPercent !== undefined ? { passingPercent: passingPercent != null ? String(passingPercent) : null } : {}),
  }).where(eq(examsTable.id, id)).returning();
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXAM_UPDATED", entity: "exam", entityId: exam.id });
  res.json(exam);
});

router.delete("/admin/exams/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [exam] = await db.update(examsTable).set({ status: "archived" }).where(eq(examsTable.id, id)).returning();
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXAM_ARCHIVED", entity: "exam", entityId: exam.id });
  res.json({ ok: true });
});

router.post("/admin/exams/:id/questions", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const parsed = z.object({ mcqIds: z.array(z.number().int().positive()).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(examId)) { res.status(400).json({ error: "mcqIds is required" }); return; }
  await db.delete(examQuestionsTable).where(eq(examQuestionsTable.examId, examId));
  await db.insert(examQuestionsTable).values(parsed.data.mcqIds.map((mcqId, i) => ({ examId, mcqId, displayOrder: i })));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "EXAM_QUESTIONS_SET", entity: "exam", entityId: examId, metadata: JSON.stringify({ count: parsed.data.mcqIds.length }) });
  res.json({ ok: true, count: parsed.data.mcqIds.length });
});

router.get("/admin/exams/:id/questions", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const rows = await db.select({ examQuestion: examQuestionsTable, mcq: mcqsTable }).from(examQuestionsTable).innerJoin(mcqsTable, eq(examQuestionsTable.mcqId, mcqsTable.id)).where(eq(examQuestionsTable.examId, examId)).orderBy(examQuestionsTable.displayOrder);
  res.json(rows.map((r) => ({ ...r.mcq, examQuestionOrder: r.examQuestion.displayOrder })));
});

router.get("/admin/exams/:id/attempts", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const rows = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.examId, examId)).orderBy(desc(examAttemptsTable.startedAt));
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length ? await db.select().from(usersTable) : [];
  const userMap = new Map(users.filter((u) => userIds.includes(u.id)).map((u) => [u.id, u.name]));
  res.json(rows.map((r) => ({ ...r, score: Number(r.score), percentage: Number(r.percentage), studentName: userMap.get(r.userId) ?? "Unknown" })));
});

router.post("/admin/exam-attempts/:id/release", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [attempt] = await db.update(examAttemptsTable).set({ resultsReleasedAt: new Date() }).where(eq(examAttemptsTable.id, id)).returning();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  res.json({ ok: true });
});

router.post("/admin/exams/:id/release-all", requireAdmin, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  await db.update(examAttemptsTable).set({ resultsReleasedAt: new Date() }).where(and(eq(examAttemptsTable.examId, examId), eq(examAttemptsTable.status, "submitted")));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Student: list eligible exams, start, answer, submit, result
// ---------------------------------------------------------------------------

router.get("/exams", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(examsTable).where(eq(examsTable.status, "published"));
  const targeting = isAdmin ? { programKind: null, yearNumber: null } : await getStudentTargeting(req.user!.id);
  const eligible = isAdmin ? rows : rows.filter((e) => isEligible(e, targeting));

  const myAttempts = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.userId, req.user!.id));
  const attemptsByExam = new Map<number, typeof myAttempts>();
  for (const a of myAttempts) attemptsByExam.set(a.examId, [...(attemptsByExam.get(a.examId) ?? []), a]);

  res.json(eligible.map((exam) => {
    const attempts = attemptsByExam.get(exam.id) ?? [];
    const inProgress = attempts.find((a) => a.status === "in_progress");
    const now = Date.now();
    return {
      ...examStudentView(exam),
      attemptsUsed: attempts.filter((a) => a.status !== "in_progress").length,
      canStart: !inProgress && attempts.filter((a) => a.status !== "in_progress").length < exam.maxAttempts && now >= exam.startAt.getTime() && now <= exam.endAt.getTime(),
      inProgressAttemptId: inProgress?.id ?? null,
      windowStatus: now < exam.startAt.getTime() ? "upcoming" : now > exam.endAt.getTime() ? "closed" : "open",
    };
  }));
});

router.post("/exams/:id/start", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const examId = Number(req.params.id);
  const [exam] = await db.select().from(examsTable).where(and(eq(examsTable.id, examId), eq(examsTable.status, "published")));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const targeting = await getStudentTargeting(req.user!.id);
  if (!isEligible(exam, targeting)) { res.status(403).json({ error: "You are not eligible for this exam" }); return; }

  const now = Date.now();
  if (now < exam.startAt.getTime()) { res.status(403).json({ error: "This exam hasn't started yet" }); return; }
  if (now > exam.endAt.getTime()) { res.status(403).json({ error: "This exam has closed" }); return; }

  const existingAttempts = await db.select().from(examAttemptsTable).where(and(eq(examAttemptsTable.examId, examId), eq(examAttemptsTable.userId, req.user!.id)));
  const inProgress = existingAttempts.find((a) => a.status === "in_progress");
  if (inProgress) {
    const questions = await getExamQuestionsForStudent(examId);
    res.json({ attemptId: inProgress.id, startedAt: inProgress.startedAt.toISOString(), durationMinutes: exam.durationMinutes, questions });
    return;
  }
  const completedCount = existingAttempts.filter((a) => a.status !== "in_progress").length;
  if (completedCount >= exam.maxAttempts) { res.status(403).json({ error: "You've used all your attempts for this exam" }); return; }

  const questions = await getExamQuestionsForStudent(examId);
  if (!questions.length) { res.status(400).json({ error: "This exam has no questions yet — contact your admin" }); return; }

  const [attempt] = await db.insert(examAttemptsTable).values({
    examId, userId: req.user!.id, attemptNumber: completedCount + 1, totalQuestions: questions.length, status: "in_progress",
  }).returning();

  res.status(201).json({ attemptId: attempt.id, startedAt: attempt.startedAt.toISOString(), durationMinutes: exam.durationMinutes, questions });
});

/** Returns exam questions WITHOUT the correct answer — this is the answer-
 * security boundary. Never add correctAnswer to this payload. */
async function getExamQuestionsForStudent(examId: number) {
  const rows = await db.select({ examQuestion: examQuestionsTable, mcq: mcqsTable }).from(examQuestionsTable).innerJoin(mcqsTable, eq(examQuestionsTable.mcqId, mcqsTable.id)).where(eq(examQuestionsTable.examId, examId)).orderBy(examQuestionsTable.displayOrder);
  return rows.map((r) => ({ id: r.mcq.id, question: r.mcq.question, options: r.mcq.options, difficulty: r.mcq.difficulty }));
}

router.post("/exam-attempts/:id/answer", requireAuth, async (req, res): Promise<void> => {
  const attemptId = Number(req.params.id);
  const parsed = z.object({ mcqId: z.number().int().positive(), selectedAnswer: z.string().nullable() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "mcqId is required" }); return; }

  const [attempt] = await db.select().from(examAttemptsTable).where(and(eq(examAttemptsTable.id, attemptId), eq(examAttemptsTable.userId, req.user!.id)));
  if (!attempt || attempt.status !== "in_progress") { res.status(409).json({ error: "This attempt is not in progress" }); return; }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, attempt.examId));
  if (exam && Date.now() > attempt.startedAt.getTime() + exam.durationMinutes * 60_000) {
    await autoSubmit(attempt.id);
    res.status(409).json({ error: "Time's up — this attempt was auto-submitted" });
    return;
  }

  await db.insert(examAnswersTable).values({ attemptId, mcqId: parsed.data.mcqId, selectedAnswer: parsed.data.selectedAnswer })
    .onConflictDoUpdate({ target: [examAnswersTable.attemptId, examAnswersTable.mcqId], set: { selectedAnswer: parsed.data.selectedAnswer } });
  res.json({ ok: true });
});

router.post("/exam-attempts/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const attemptId = Number(req.params.id);
  const [attempt] = await db.select().from(examAttemptsTable).where(and(eq(examAttemptsTable.id, attemptId), eq(examAttemptsTable.userId, req.user!.id)));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  if (attempt.status !== "in_progress") { res.status(409).json({ error: "This attempt was already submitted" }); return; }
  const result = await gradeAndSubmit(attempt.id, "submitted");
  res.json(result);
});

/** Server-side grading — the only place correctness is ever determined.
 * Never trust a client-submitted "correct" flag. */
async function gradeAndSubmit(attemptId: number, status: "submitted" | "auto_submitted") {
  const [attempt] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, attemptId));
  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, attempt.examId));
  const questions = await db.select({ examQuestion: examQuestionsTable, mcq: mcqsTable }).from(examQuestionsTable).innerJoin(mcqsTable, eq(examQuestionsTable.mcqId, mcqsTable.id)).where(eq(examQuestionsTable.examId, attempt.examId));
  const answers = await db.select().from(examAnswersTable).where(eq(examAnswersTable.attemptId, attemptId));
  const answerMap = new Map(answers.map((a) => [a.mcqId, a.selectedAnswer]));

  let correctCount = 0, wrongCount = 0, unansweredCount = 0;
  for (const { mcq } of questions) {
    const selected = answerMap.get(mcq.id);
    if (selected == null) { unansweredCount++; continue; }
    if (mcq.correctAnswer && selected === mcq.correctAnswer) correctCount++;
    else wrongCount++;
    await db.update(examAnswersTable).set({ correct: mcq.correctAnswer ? selected === mcq.correctAnswer : null }).where(and(eq(examAnswersTable.attemptId, attemptId), eq(examAnswersTable.mcqId, mcq.id)));
  }

  const negativePerWrong = exam.negativeMarkingEnabled ? Number(exam.negativeMarkPerWrong) : 0;
  const score = correctCount - wrongCount * negativePerWrong;
  const percentage = questions.length ? (correctCount / questions.length) * 100 : 0;
  const passed = exam.passingPercent != null ? percentage >= Number(exam.passingPercent) : null;

  const releaseNow = exam.resultReleaseMode === "immediate";
  const [updated] = await db.update(examAttemptsTable).set({
    submittedAt: new Date(), status, correctCount, wrongCount, unansweredCount,
    score: String(score), percentage: String(percentage.toFixed(2)), passed,
    resultsReleasedAt: releaseNow ? new Date() : null,
  }).where(eq(examAttemptsTable.id, attemptId)).returning();

  return { attemptId: updated.id, status: updated.status, resultsReleased: releaseNow };
}

async function autoSubmit(attemptId: number) {
  await gradeAndSubmit(attemptId, "auto_submitted");
}

router.get("/exam-attempts/:id/result", requireAuth, async (req, res): Promise<void> => {
  const attemptId = Number(req.params.id);
  const [attempt] = await db.select().from(examAttemptsTable).where(and(eq(examAttemptsTable.id, attemptId), eq(examAttemptsTable.userId, req.user!.id)));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, attempt.examId));

  if (attempt.status === "in_progress") { res.status(409).json({ error: "This attempt is still in progress" }); return; }

  const released = exam.resultReleaseMode === "manual" ? !!attempt.resultsReleasedAt
    : exam.resultReleaseMode === "after_end" ? Date.now() > exam.endAt.getTime()
    : true;
  if (!released) { res.json({ released: false }); return; }

  let breakdown: Array<{ mcqId: number; question: string; options: string[]; selectedAnswer: string | null; correctAnswer: string | null; explanation: string | null; correct: boolean | null }> = [];
  if (exam.showCorrectAnswers) {
    const questions = await db.select({ examQuestion: examQuestionsTable, mcq: mcqsTable }).from(examQuestionsTable).innerJoin(mcqsTable, eq(examQuestionsTable.mcqId, mcqsTable.id)).where(eq(examQuestionsTable.examId, attempt.examId)).orderBy(examQuestionsTable.displayOrder);
    const answers = await db.select().from(examAnswersTable).where(eq(examAnswersTable.attemptId, attemptId));
    const answerMap = new Map(answers.map((a) => [a.mcqId, a]));
    breakdown = questions.map(({ mcq }) => {
      const a = answerMap.get(mcq.id);
      return { mcqId: mcq.id, question: mcq.question, options: mcq.options, selectedAnswer: a?.selectedAnswer ?? null, correctAnswer: mcq.correctAnswer, explanation: mcq.explanation, correct: a?.correct ?? null };
    });
  }

  res.json({
    released: true,
    status: attempt.status,
    totalQuestions: attempt.totalQuestions,
    correctCount: attempt.correctCount,
    wrongCount: attempt.wrongCount,
    unansweredCount: attempt.unansweredCount,
    score: exam.showMarks ? Number(attempt.score) : null,
    percentage: exam.showPercentage ? Number(attempt.percentage) : null,
    passed: attempt.passed,
    breakdown,
  });
});

export default router;

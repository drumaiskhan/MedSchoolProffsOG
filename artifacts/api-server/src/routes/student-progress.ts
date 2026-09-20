import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  db, practiceAttemptsTable, practiceAnswersTable, mcqsTable, usersTable, subjectsTable, topicsTable, modulesTable,
  pastPapersTable, examsTable, examAttemptsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { liveStreak } from "../lib/streak";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /student/progress-overview — everything the student "My Progress" page
// shows in one round trip: practice sessions, per-subject accuracy, past-paper
// coverage, weekly improvement, and Pre-Proffs exam results.
//
// Read-only and scoped to the signed-in student's own rows. Deliberately NOT
// behind requireMembershipFor: a student whose membership lapsed (or whose
// trial ended) can still look at the history they built up.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (correct: number, total: number): number | null => (total > 0 ? round1((correct / total) * 100) : null);

/** Monday 00:00 UTC of the week containing `d`. */
function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

function trendOf(delta: number | null): "up" | "down" | "flat" | "new" {
  if (delta === null) return "new";
  return delta >= 3 ? "up" : delta <= -3 ? "down" : "flat";
}

interface AnswerRow { mcqId: number; correct: boolean; at: Date; subjectId: number | null; topicId: number | null; pastPaperId: number | null }

router.get("/student/progress-overview", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const now = Date.now();

  const [attempts, answers, [user]] = await Promise.all([
    db.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.userId, userId)).orderBy(desc(practiceAttemptsTable.createdAt)).limit(2000),
    db.select({
      mcqId: practiceAnswersTable.mcqId, correct: practiceAnswersTable.correct, createdAt: practiceAnswersTable.createdAt,
      subjectId: mcqsTable.subjectId, topicId: mcqsTable.topicId, pastPaperId: mcqsTable.pastPaperId,
    })
      .from(practiceAnswersTable)
      .innerJoin(practiceAttemptsTable, eq(practiceAnswersTable.attemptId, practiceAttemptsTable.id))
      .leftJoin(mcqsTable, eq(practiceAnswersTable.mcqId, mcqsTable.id))
      .where(eq(practiceAttemptsTable.userId, userId))
      .orderBy(desc(practiceAnswersTable.createdAt))
      .limit(20000),
    db.select().from(usersTable).where(eq(usersTable.id, userId)),
  ]);

  const rows: AnswerRow[] = answers.map((a) => ({ mcqId: a.mcqId, correct: a.correct, at: a.createdAt, subjectId: a.subjectId ?? null, topicId: a.topicId ?? null, pastPaperId: a.pastPaperId ?? null }));

  // ---- Names for scopes -----------------------------------------------------
  const moduleIds = [...new Set(attempts.map((a) => a.moduleId).filter((x): x is number => x != null))];
  const subjectIds = [...new Set([...attempts.map((a) => a.subjectId), ...rows.map((r) => r.subjectId)].filter((x): x is number => x != null))];
  const topicIds = [...new Set([...attempts.map((a) => a.topicId), ...rows.map((r) => r.topicId)].filter((x): x is number => x != null))];
  const paperIds = [...new Set(rows.map((r) => r.pastPaperId).filter((x): x is number => x != null))];

  const [moduleRows, subjectRows, topicRows, paperRows, paperTotals] = await Promise.all([
    moduleIds.length ? db.select({ id: modulesTable.id, name: modulesTable.name }).from(modulesTable).where(inArray(modulesTable.id, moduleIds)) : Promise.resolve([]),
    subjectIds.length ? db.select({ id: subjectsTable.id, name: subjectsTable.name }).from(subjectsTable).where(inArray(subjectsTable.id, subjectIds)) : Promise.resolve([]),
    topicIds.length ? db.select({ id: topicsTable.id, name: topicsTable.name, subjectId: topicsTable.subjectId }).from(topicsTable).where(inArray(topicsTable.id, topicIds)) : Promise.resolve([]),
    paperIds.length ? db.select({ id: pastPapersTable.id, title: pastPapersTable.title, year: pastPapersTable.year, examBoard: pastPapersTable.examBoard }).from(pastPapersTable).where(inArray(pastPapersTable.id, paperIds)) : Promise.resolve([]),
    paperIds.length
      ? db.select({ pastPaperId: mcqsTable.pastPaperId, total: sql<number>`count(*)::int` }).from(mcqsTable).where(and(inArray(mcqsTable.pastPaperId, paperIds), eq(mcqsTable.status, "published"))).groupBy(mcqsTable.pastPaperId)
      : Promise.resolve([]),
  ]);
  const moduleName = new Map(moduleRows.map((m) => [m.id, m.name]));
  const subjectName = new Map(subjectRows.map((s) => [s.id, s.name]));
  const topicInfo = new Map(topicRows.map((t) => [t.id, t]));
  const paperTotal = new Map(paperTotals.map((p) => [p.pastPaperId as number, p.total]));

  // ---- Summary --------------------------------------------------------------
  const totalQuestions = attempts.reduce((s, a) => s + a.totalQuestions, 0);
  const totalCorrect = attempts.reduce((s, a) => s + a.correctCount, 0);
  const timeSpentSeconds = attempts.reduce((s, a) => s + (a.completedAt && a.startedAt ? Math.max(0, (a.completedAt.getTime() - a.startedAt.getTime()) / 1000) : 0), 0);
  const activeDays = new Set(attempts.filter((a) => now - a.createdAt.getTime() <= 30 * DAY_MS).map((a) => a.createdAt.toISOString().slice(0, 10))).size;
  const summary = {
    sessions: attempts.length,
    questionsAnswered: totalQuestions,
    uniqueMcqsAttempted: new Set(rows.map((r) => r.mcqId)).size,
    accuracy: pct(totalCorrect, totalQuestions),
    timeSpentMinutes: Math.round(timeSpentSeconds / 60),
    activeDaysLast30: activeDays,
    currentStreak: liveStreak(user).current,
    longestStreak: liveStreak(user).longest,
  };

  // ---- Recent practice sessions --------------------------------------------
  const recentSessions = attempts.slice(0, 15).map((a) => {
    const scope = a.topicId != null ? topicInfo.get(a.topicId)?.name : a.subjectId != null ? subjectName.get(a.subjectId) : a.moduleId != null ? moduleName.get(a.moduleId) : null;
    return {
      id: a.id,
      date: (a.completedAt ?? a.createdAt).toISOString(),
      scope: scope ?? "Mixed practice",
      mode: a.mode,
      totalQuestions: a.totalQuestions,
      correctCount: a.correctCount,
      scorePercent: Number(a.scorePercent),
      durationMinutes: a.completedAt && a.startedAt ? Math.max(0, Math.round((a.completedAt.getTime() - a.startedAt.getTime()) / 60000)) : null,
    };
  });

  // ---- Per-subject / per-topic accuracy, with recent-vs-earlier change -----
  const recentCut = now - 14 * DAY_MS;
  const priorCut = now - 28 * DAY_MS;
  interface Bucket { correct: number; total: number; recentC: number; recentT: number; priorC: number; priorT: number }
  const blank = (): Bucket => ({ correct: 0, total: 0, recentC: 0, recentT: 0, priorC: 0, priorT: 0 });
  const add = (b: Bucket, r: AnswerRow) => {
    b.total++; if (r.correct) b.correct++;
    const t = r.at.getTime();
    if (t >= recentCut) { b.recentT++; if (r.correct) b.recentC++; }
    else if (t >= priorCut) { b.priorT++; if (r.correct) b.priorC++; }
  };
  const bySubjectMap = new Map<number, Bucket>();
  const byTopicMap = new Map<number, Bucket>();
  const overall = blank();
  for (const r of rows) {
    add(overall, r);
    if (r.subjectId != null) add(bySubjectMap.get(r.subjectId) ?? bySubjectMap.set(r.subjectId, blank()).get(r.subjectId)!, r);
    if (r.topicId != null) add(byTopicMap.get(r.topicId) ?? byTopicMap.set(r.topicId, blank()).get(r.topicId)!, r);
  }
  const deltaOf = (b: Bucket): number | null => {
    const recent = pct(b.recentC, b.recentT), prior = pct(b.priorC, b.priorT);
    // Need a handful of answers on both sides, or a single lucky question
    // reads as a huge "improvement".
    return b.recentT >= 3 && b.priorT >= 3 && recent !== null && prior !== null ? round1(recent - prior) : null;
  };
  const bySubject = [...bySubjectMap.entries()].map(([id, b]) => ({
    id, name: subjectName.get(id) ?? "Subject", answered: b.total, accuracy: pct(b.correct, b.total), delta: deltaOf(b),
  })).sort((a, b) => b.answered - a.answered).slice(0, 12);
  const topicRowsOut = [...byTopicMap.entries()].map(([id, b]) => ({
    id, name: topicInfo.get(id)?.name ?? "Topic", subject: subjectName.get(topicInfo.get(id)?.subjectId ?? -1) ?? null, answered: b.total, accuracy: pct(b.correct, b.total), delta: deltaOf(b),
  })).filter((t) => t.answered >= 5 && t.accuracy !== null);
  const needsWork = [...topicRowsOut].sort((a, b) => (a.accuracy as number) - (b.accuracy as number)).slice(0, 5);
  const strongest = [...topicRowsOut].sort((a, b) => (b.accuracy as number) - (a.accuracy as number)).slice(0, 5);
  const improvedTopics = topicRowsOut.filter((t) => t.delta !== null && (t.delta as number) > 0).sort((a, b) => (b.delta as number) - (a.delta as number)).slice(0, 3);

  // ---- Past papers ------------------------------------------------------------
  const paperBuckets = new Map<number, { answered: number; correct: number; mcqs: Set<number>; last: Date; sessionsApprox: Set<string> }>();
  for (const r of rows) {
    if (r.pastPaperId == null) continue;
    const b = paperBuckets.get(r.pastPaperId) ?? { answered: 0, correct: 0, mcqs: new Set<number>(), last: r.at, sessionsApprox: new Set<string>() };
    b.answered++; if (r.correct) b.correct++; b.mcqs.add(r.mcqId);
    if (r.at > b.last) b.last = r.at;
    // Answers submitted in one practice-session call share (near-)identical timestamps.
    b.sessionsApprox.add(r.at.toISOString().slice(0, 16));
    paperBuckets.set(r.pastPaperId, b);
  }
  const pastPapers = paperRows.map((p) => {
    const b = paperBuckets.get(p.id)!;
    const total = paperTotal.get(p.id) ?? b.mcqs.size;
    return {
      id: p.id, title: p.title, year: p.year, examBoard: p.examBoard,
      attemptedQuestions: b.mcqs.size, totalQuestions: Math.max(total, b.mcqs.size),
      coveragePercent: Math.min(100, Math.round((b.mcqs.size / Math.max(total, 1)) * 100)),
      accuracy: pct(b.correct, b.answered), sessions: b.sessionsApprox.size, lastAttemptAt: b.last.toISOString(),
    };
  }).sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));

  // ---- Weekly improvement (last 8 weeks) ---------------------------------------
  const thisWeek = weekStart(new Date(now));
  const weeks: Array<{ weekStart: string; sessions: number; questions: number; correct: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisWeek); d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push({ weekStart: d.toISOString().slice(0, 10), sessions: 0, questions: 0, correct: 0 });
  }
  const weekIndex = new Map(weeks.map((w, i) => [w.weekStart, i]));
  for (const a of attempts) {
    const i = weekIndex.get(weekStart(a.createdAt).toISOString().slice(0, 10));
    if (i === undefined) continue;
    weeks[i].sessions++; weeks[i].questions += a.totalQuestions; weeks[i].correct += a.correctCount;
  }
  const weekly = weeks.map((w) => ({ weekStart: w.weekStart, sessions: w.sessions, questions: w.questions, accuracy: pct(w.correct, w.questions) }));
  const overallDelta = deltaOf(overall);
  const withData = weekly.filter((w) => w.accuracy !== null);
  const improvement = {
    weekly,
    trend: trendOf(overallDelta),
    deltaPoints: overallDelta,
    firstAccuracy: withData.length ? withData[0].accuracy : null,
    latestAccuracy: withData.length ? withData[withData.length - 1].accuracy : null,
    improvedTopics,
    needsWork,
    strongest,
  };

  // ---- Pre-Proffs exam results ----------------------------------------------------
  const examRows = await db.select({ attempt: examAttemptsTable, exam: examsTable })
    .from(examAttemptsTable).innerJoin(examsTable, eq(examAttemptsTable.examId, examsTable.id))
    .where(and(eq(examAttemptsTable.userId, userId), ne(examAttemptsTable.status, "in_progress")))
    .orderBy(desc(examAttemptsTable.submittedAt)).limit(50);
  const exams = examRows.map(({ attempt, exam }) => {
    // Same release rule as GET /exam-attempts/:id/result — progress must never
    // reveal a score the exam itself is still holding back.
    const released = exam.resultReleaseMode === "manual" ? !!attempt.resultsReleasedAt : exam.resultReleaseMode === "after_end" ? now > exam.endAt.getTime() : true;
    return {
      attemptId: attempt.id, examId: exam.id, title: exam.title, attemptNumber: attempt.attemptNumber,
      submittedAt: (attempt.submittedAt ?? attempt.createdAt).toISOString(), released,
      totalQuestions: attempt.totalQuestions,
      correctCount: released ? attempt.correctCount : null,
      percentage: released && exam.showPercentage ? Number(attempt.percentage) : null,
      score: released && exam.showMarks ? Number(attempt.score) : null,
      passed: released ? attempt.passed : null,
    };
  });

  res.json({ summary, recentSessions, bySubject, pastPapers, improvement, exams });
});

export default router;

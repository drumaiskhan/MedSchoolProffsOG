import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, practiceAttemptsTable, practiceAnswersTable, mcqsTable, usersTable } from "@workspace/db";
import { requireAuth, requireActiveMembership } from "../middlewares/auth";

const router: IRouter = Router();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function bumpStreak(userId: number): Promise<void> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return;
  const today = todayUtc();
  if (user.lastPracticeDate === today) return; // already counted today
  const continuing = user.lastPracticeDate === yesterdayUtc();
  const currentStreak = continuing ? user.currentStreak + 1 : 1;
  const longestStreak = Math.max(user.longestStreak, currentStreak);
  await db.update(usersTable).set({ currentStreak, longestStreak, lastPracticeDate: today }).where(eq(usersTable.id, userId));
}

// ---------------------------------------------------------------------------
// Submit a completed practice session (single call — quick sessions, not a
// multi-step exam flow)
// ---------------------------------------------------------------------------

const SubmitSessionBody = z.object({
  moduleId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  topicId: z.number().int().positive().optional(),
  mode: z.enum(["timed", "untimed"]).optional(),
  answers: z.array(z.object({ mcqId: z.number().int().positive(), selectedAnswer: z.string().nullable() })).min(1),
  durationSeconds: z.number().int().min(0).optional(),
});

router.post("/practice-sessions", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const parsed = SubmitSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const data = parsed.data;

  const mcqIds = data.answers.map((a) => a.mcqId);
  const mcqs = await db.select().from(mcqsTable);
  const mcqMap = new Map(mcqs.filter((m) => mcqIds.includes(m.id)).map((m) => [m.id, m]));

  let correctCount = 0;
  for (const answer of data.answers) {
    const mcq = mcqMap.get(answer.mcqId);
    if (mcq && mcq.correctAnswer && answer.selectedAnswer === mcq.correctAnswer) correctCount += 1;
  }
  const scorePercent = ((correctCount / data.answers.length) * 100).toFixed(2);

  const [attempt] = await db
    .insert(practiceAttemptsTable)
    .values({
      userId: req.user!.id, moduleId: data.moduleId, subjectId: data.subjectId, topicId: data.topicId,
      mode: data.mode ?? "untimed", totalQuestions: data.answers.length, correctCount, scorePercent,
      completedAt: new Date(),
    })
    .returning();

  await db.insert(practiceAnswersTable).values(
    data.answers.map((a) => ({ attemptId: attempt.id, mcqId: a.mcqId, selectedAnswer: a.selectedAnswer, correct: mcqMap.get(a.mcqId)?.correctAnswer === a.selectedAnswer })),
  );

  await bumpStreak(req.user!.id);

  res.status(201).json({ ...attempt, scorePercent: Number(attempt.scorePercent) });
});

// ---------------------------------------------------------------------------
// Analytics dashboard
// ---------------------------------------------------------------------------

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "3m": 90, "1y": 365 };

router.get("/student/analytics", requireAuth, async (req, res): Promise<void> => {
  const range = typeof req.query.range === "string" ? req.query.range : "7d";
  const days = RANGE_DAYS[range] ?? 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const attempts = await db.select().from(practiceAttemptsTable).where(and(eq(practiceAttemptsTable.userId, req.user!.id), gte(practiceAttemptsTable.createdAt, since)));
  const totalSessions = attempts.length;
  const totalQuestions = attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  const totalCorrect = attempts.reduce((sum, a) => sum + a.correctCount, 0);
  const averageScore = totalQuestions ? (totalCorrect / totalQuestions) * 100 : 0;
  const timeSpentSeconds = attempts.reduce((sum, a) => sum + (a.completedAt && a.startedAt ? Math.max(0, (a.completedAt.getTime() - a.startedAt.getTime()) / 1000) : 0), 0);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));

  res.json({
    range,
    totalSessions,
    averageScore: Number(averageScore.toFixed(1)),
    questionsAnswered: totalQuestions,
    timeSpentMinutes: Math.round(timeSpentSeconds / 60),
    currentStreak: user?.currentStreak ?? 0,
    longestStreak: user?.longestStreak ?? 0,
  });
});

// ---------------------------------------------------------------------------
// Progress trend — powers the "improving / steady / needs more practice"
// verdict shown on the practice-session result card and the student
// dashboard's progress profile. Compares the last 7 days against the 7
// days before that (rather than two overlapping cumulative ranges, which
// would double-count and mute any real change) so a genuine improvement or
// dip actually shows up.
// ---------------------------------------------------------------------------

function weightedAverage(attempts: { totalQuestions: number; correctCount: number }[]): number | null {
  const totalQuestions = attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  if (!totalQuestions) return null;
  const totalCorrect = attempts.reduce((sum, a) => sum + a.correctCount, 0);
  return (totalCorrect / totalQuestions) * 100;
}

router.get("/student/progress", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const recentSince = new Date(now); recentSince.setDate(recentSince.getDate() - 7);
  const priorSince = new Date(now); priorSince.setDate(priorSince.getDate() - 14);

  const [allAttempts, user] = await Promise.all([
    db.select().from(practiceAttemptsTable).where(and(eq(practiceAttemptsTable.userId, req.user!.id), gte(practiceAttemptsTable.createdAt, priorSince))).orderBy(desc(practiceAttemptsTable.createdAt)),
    db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)),
  ]);
  const recentAttempts = allAttempts.filter((a) => a.createdAt >= recentSince);
  const priorAttempts = allAttempts.filter((a) => a.createdAt < recentSince);
  const recentAverage = weightedAverage(recentAttempts);
  const priorAverage = weightedAverage(priorAttempts);

  let trend: "up" | "down" | "flat" | "new" = "new";
  let trendDelta = 0;
  if (recentAverage != null && priorAverage != null) {
    trendDelta = Math.round((recentAverage - priorAverage) * 10) / 10;
    trend = trendDelta >= 3 ? "up" : trendDelta <= -3 ? "down" : "flat";
  }

  const history = allAttempts.slice(0, 10).reverse().map((a) => ({ date: (a.completedAt ?? a.createdAt).toISOString(), scorePercent: Number(a.scorePercent) }));

  res.json({
    recentAverage: recentAverage != null ? Number(recentAverage.toFixed(1)) : null,
    priorAverage: priorAverage != null ? Number(priorAverage.toFixed(1)) : null,
    trend,
    trendDelta,
    recentSessions: recentAttempts.length,
    history,
    currentStreak: user?.currentStreak ?? 0,
    longestStreak: user?.longestStreak ?? 0,
  });
});

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

router.get("/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const range = typeof req.query.range === "string" ? req.query.range : "30d";
  const days = RANGE_DAYS[range] ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      userId: practiceAttemptsTable.userId,
      totalQuestions: sql<number>`sum(${practiceAttemptsTable.totalQuestions})`,
      totalCorrect: sql<number>`sum(${practiceAttemptsTable.correctCount})`,
      sessions: sql<number>`count(*)`,
    })
    .from(practiceAttemptsTable)
    .where(gte(practiceAttemptsTable.createdAt, since))
    .groupBy(practiceAttemptsTable.userId)
    .orderBy(desc(sql`sum(${practiceAttemptsTable.correctCount})`));

  const userIds = rows.map((r) => r.userId);
  const users = userIds.length ? await db.select().from(usersTable) : [];
  const userMap = new Map(users.filter((u) => userIds.includes(u.id)).map((u) => [u.id, u]));

  res.json(rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    name: userMap.get(row.userId)?.name ?? "Student",
    sessions: Number(row.sessions),
    questionsAnswered: Number(row.totalQuestions ?? 0),
    correct: Number(row.totalCorrect ?? 0),
    accuracy: row.totalQuestions ? Number(((Number(row.totalCorrect ?? 0) / Number(row.totalQuestions)) * 100).toFixed(1)) : 0,
    isYou: row.userId === req.user!.id,
  })));
});

export default router;

import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, practiceAttemptsTable, practiceAnswersTable, mcqsTable, usersTable, topicsTable, subjectsTable } from "@workspace/db";
import { requireAuth, requireMembershipFor } from "../middlewares/auth";
import { liveStreak, utcDay } from "../lib/streak";
import { trialDailyMcqCapError, getTrialDailyMcqStatus } from "../lib/trial";

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

router.post("/practice-sessions", requireAuth, requireMembershipFor(["mcqs", "past_papers"]), async (req, res): Promise<void> => {
  const parsed = SubmitSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const data = parsed.data;

  // Trial-only students (see lib/trial.ts studentIsTrialOnly) are capped at
  // TRIAL_DAILY_MCQ_LIMIT MCQs per UTC day, summed across sessions — set by
  // an admin on Settings → Access & trial. Paying students are never capped.
  if (req.user!.role === "student") {
    const capError = await trialDailyMcqCapError(req.user!.id, data.answers.length);
    if (capError) { res.status(403).json({ error: capError, code: "TRIAL_DAILY_LIMIT_REACHED" }); return; }
  }

  const mcqIds = data.answers.map((a) => a.mcqId);
  const mcqs = await db.select().from(mcqsTable);
  const mcqMap = new Map(mcqs.filter((m) => mcqIds.includes(m.id)).map((m) => [m.id, m]));

  let correctCount = 0;
  for (const answer of data.answers) {
    const mcq = mcqMap.get(answer.mcqId);
    if (mcq && mcq.correctAnswer && answer.selectedAnswer === mcq.correctAnswer) correctCount += 1;
  }
  const scorePercent = ((correctCount / data.answers.length) * 100).toFixed(2);

  // "Time spent" on the dashboard is sum(completedAt - startedAt) per row
  // (see GET /student/analytics below). Without this, startedAt defaults to
  // now() at insert time — identical to completedAt — so time spent is
  // always ~0 regardless of how long the student actually studied. Prefer
  // the client-tracked durationSeconds (session-start to session-finish) to
  // back-date startedAt; fall back to "now" only if the client didn't send one.
  const completedAt = new Date();
  const startedAt = data.durationSeconds != null ? new Date(completedAt.getTime() - data.durationSeconds * 1000) : completedAt;

  // The Practice page only ever sends `topicId`, so moduleId/subjectId used to
  // be saved as null — which left nothing to tell the dashboard's "continue
  // where you left off" card which module a session belonged to. Derive both
  // from the topic (topic -> subject -> module) when the client didn't send
  // them; explicit values from the client still win.
  let { moduleId, subjectId } = data;
  if (data.topicId != null && (moduleId == null || subjectId == null)) {
    const [placement] = await db
      .select({ subjectId: topicsTable.subjectId, moduleId: subjectsTable.moduleId })
      .from(topicsTable)
      .innerJoin(subjectsTable, eq(topicsTable.subjectId, subjectsTable.id))
      .where(eq(topicsTable.id, data.topicId));
    if (placement) { subjectId ??= placement.subjectId; moduleId ??= placement.moduleId; }
  }

  const [attempt] = await db
    .insert(practiceAttemptsTable)
    .values({
      userId: req.user!.id, moduleId, subjectId, topicId: data.topicId,
      mode: data.mode ?? "untimed", totalQuestions: data.answers.length, correctCount, scorePercent,
      startedAt, completedAt,
    })
    .returning();

  await db.insert(practiceAnswersTable).values(
    data.answers.map((a) => ({ attemptId: attempt.id, mcqId: a.mcqId, selectedAnswer: a.selectedAnswer, correct: mcqMap.get(a.mcqId)?.correctAnswer === a.selectedAnswer })),
  );

  await bumpStreak(req.user!.id);

  res.status(201).json({ ...attempt, scorePercent: Number(attempt.scorePercent) });
});

// ---------------------------------------------------------------------------
// Trial MCQ usage — powers the Practice page's "X of Y MCQs used today" bar
// for trial-only students, so the cap shows up as they go instead of only
// surfacing as a rejected submission after they've already answered past
// it. Paying students (and any student when the cap is unlimited) just get
// back { limited: false }.
// ---------------------------------------------------------------------------
router.get("/student/trial-mcq-usage", requireAuth, async (req, res): Promise<void> => {
  if (req.user!.role !== "student") { res.json({ limited: false, limit: 0, used: 0, remaining: null }); return; }
  const status = await getTrialDailyMcqStatus(req.user!.id);
  res.json({ ...status, remaining: Number.isFinite(status.remaining) ? status.remaining : null });
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
    // liveStreak(): the stored number goes stale the moment a student stops
    // practising, so a lapsed run reads 0 instead of its old value.
    currentStreak: liveStreak(user).current,
    longestStreak: liveStreak(user).longest,
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

const DAILY_WINDOW_DAYS = 7;

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

  // Bug fix: this destructured `user` straight out of Promise.all, but
  // db.select() resolves to an ARRAY of rows — so `user?.currentStreak` below
  // was always undefined and the "day streak" on the progress profile card
  // read 0 for everyone. Take the first row explicitly.
  const [allAttempts, userRows] = await Promise.all([
    db.select().from(practiceAttemptsTable).where(and(eq(practiceAttemptsTable.userId, req.user!.id), gte(practiceAttemptsTable.createdAt, priorSince))).orderBy(desc(practiceAttemptsTable.createdAt)),
    db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)),
  ]);
  const user = userRows[0];
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

  // One entry per calendar day for the last 7 days (oldest -> today), bucketed
  // in the STUDENT's local day. The browser sends its own offset as
  // `?tz=<Date.getTimezoneOffset()>` (minutes; UTC+5 => -300) — without it a
  // student in Pakistan who practises at 1 a.m. would see that session on the
  // "previous" day's bar. Missing/invalid => UTC. `history` above is kept as-is
  // for existing consumers; the dashboard chart uses `daily` because ten
  // per-session bars with one-letter weekday labels ("W W T T T T F F S S")
  // can't tell you WHICH Saturday or how many sessions a day had.
  const tzRaw = Number(req.query.tz);
  const tzOffsetMin = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, Math.trunc(tzRaw))) : 0;
  const localDayKey = (t: Date) => new Date(t.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
  const todayKey = localDayKey(now);
  const dayKeys: string[] = [];
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(`${todayKey}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const buckets = new Map(dayKeys.map((k) => [k, { sessions: 0, questions: 0, correct: 0 }]));
  for (const a of allAttempts) {
    const bucket = buckets.get(localDayKey(a.completedAt ?? a.createdAt));
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.questions += a.totalQuestions;
    bucket.correct += a.correctCount;
  }
  const daily = dayKeys.map((date) => {
    const b = buckets.get(date)!;
    return { date, sessions: b.sessions, questions: b.questions, scorePercent: b.questions ? Number(((b.correct / b.questions) * 100).toFixed(1)) : null };
  });

  res.json({
    recentAverage: recentAverage != null ? Number(recentAverage.toFixed(1)) : null,
    priorAverage: priorAverage != null ? Number(priorAverage.toFixed(1)) : null,
    trend,
    trendDelta,
    recentSessions: recentAttempts.length,
    history,
    daily,
    currentStreak: liveStreak(user).current,
    longestStreak: liveStreak(user).longest,
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
    .groupBy(practiceAttemptsTable.userId);

  // Points formula (section 4 fix notes): ranking by raw correct-answer
  // count rewards pure volume — a student who blitzes through 500 easy
  // questions outranks one with excellent accuracy on fewer, harder ones.
  // 10 points per correct answer, minus 3 per wrong answer (floored at 0)
  // rewards genuine mastery over guessing/volume-farming, since spamming
  // wrong answers actively costs points instead of just not helping.
  // These weights are a reasonable default, not a spec — easy to retune.
  const scored = rows.map((row) => {
    const correct = Number(row.totalCorrect ?? 0);
    const total = Number(row.totalQuestions ?? 0);
    const wrong = Math.max(0, total - correct);
    const points = Math.max(0, correct * 10 - wrong * 3);
    return { ...row, points, correct, total };
  });

  // Bug fix: this used to pull every row from usersTable unfiltered (no
  // WHERE at all) on every poll — including admin accounts and
  // soft-deleted students — then just looked names up by id. An admin
  // account that had ever submitted a practice session (e.g. while
  // browsing the student portal to check something) would rank on the
  // student leaderboard, and a student who deleted their account would
  // keep showing up forever since nothing excluded status "DELETED".
  // Filtering to real, current students here (and dropping their
  // attempts from `scored`/ranking entirely, not just hiding the name)
  // is what the "community" framing on the leaderboard actually promises.
  const userIds = scored.map((r) => r.userId);
  const students = userIds.length
    ? await db.select().from(usersTable).where(and(inArray(usersTable.id, userIds), eq(usersTable.role, "student"), ne(usersTable.status, "DELETED")))
    : [];
  const studentMap = new Map(students.map((u) => [u.id, u]));

  // Ties on points used to fall back to whatever order the GROUP BY happened
  // to return, so two students on the same score could swap places between
  // polls (the page refreshes every 10s). Break ties by accuracy, then volume,
  // then id so the order is stable.
  const ranked = scored
    .filter((row) => studentMap.has(row.userId))
    .sort((a, b) => b.points - a.points || (b.total ? b.correct / b.total : 0) - (a.total ? a.correct / a.total : 0) || b.total - a.total || a.userId - b.userId);

  res.json(ranked.map((row, index) => {
    const student = studentMap.get(row.userId);
    // Live streak (0 once a day has been missed) — see lib/streak.ts.
    const streak = liveStreak(student);
    return {
      rank: index + 1,
      userId: row.userId,
      name: student?.name ?? "Student",
      currentStreak: streak.current,
      longestStreak: streak.longest,
      practicedToday: streak.practicedToday,
      // Same field the payment/profile views already surface a student's
      // college under (usersTable.institution — see userView/paymentView in
      // routes/medschool.ts) — added here so the leaderboard can show which
      // college each player is from, without a separate institutionsTable
      // join or a new column.
      institution: student?.institution ?? null,
      sessions: Number(row.sessions),
      questionsAnswered: row.total,
      correct: row.correct,
      points: row.points,
      accuracy: row.total ? Number(((row.correct / row.total) * 100).toFixed(1)) : 0,
      isYou: row.userId === req.user!.id,
    };
  }));
});

// ---------------------------------------------------------------------------
// Streak card — the signed-in student's own streak plus the last 14 days of
// activity, for the leaderboard hero (flame + day dots). Separate from
// /leaderboard so the (polled, all-students) board doesn't carry per-day data.
// ---------------------------------------------------------------------------

router.get("/leaderboard/streak", requireAuth, async (req, res): Promise<void> => {
  const WINDOW_DAYS = 14;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
  since.setUTCHours(0, 0, 0, 0);

  const [attempts, [user]] = await Promise.all([
    db.select({ createdAt: practiceAttemptsTable.createdAt, totalQuestions: practiceAttemptsTable.totalQuestions })
      .from(practiceAttemptsTable)
      .where(and(eq(practiceAttemptsTable.userId, req.user!.id), gte(practiceAttemptsTable.createdAt, since))),
    db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)),
  ]);

  const perDay = new Map<string, { sessions: number; questions: number }>();
  for (const a of attempts) {
    const key = a.createdAt.toISOString().slice(0, 10);
    const cur = perDay.get(key) ?? { sessions: 0, questions: 0 };
    cur.sessions += 1;
    cur.questions += a.totalQuestions;
    perDay.set(key, cur);
  }
  // Oldest -> newest, always WINDOW_DAYS entries (empty days included).
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const date = utcDay(i - (WINDOW_DAYS - 1));
    const v = perDay.get(date);
    return { date, sessions: v?.sessions ?? 0, questions: v?.questions ?? 0 };
  });

  const s = liveStreak(user);
  res.json({ currentStreak: s.current, longestStreak: s.longest, practicedToday: s.practicedToday, atRisk: s.atRisk, days });
});

export default router;

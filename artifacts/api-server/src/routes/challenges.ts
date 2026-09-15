import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, mcqsTable, challengesTable, challengeAttemptsTable, notificationsTable } from "@workspace/db";
import { requireAuth, requireActiveMembership } from "../middlewares/auth";
import { sendEmail, challengeInviteEmailHtml, challengeResultEmailHtml } from "../lib/email";
import { getPublicAppUrl } from "../lib/publicAppUrl";

const router: IRouter = Router();

const APP_URL = getPublicAppUrl();
const CHALLENGE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // a week to accept/play before it goes stale

function publicOpponent(user: typeof usersTable.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, rollNumber: user.rollNumber, institution: user.institution };
}

// ---------------------------------------------------------------------------
// Find a friend to challenge — search by name, email, phone, or roll number.
// ---------------------------------------------------------------------------

router.get("/students/find", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const like = `%${q}%`;
  const rows = await db
    .select()
    .from(usersTable)
    .where(and(
      eq(usersTable.role, "student"),
      ne(usersTable.id, req.user!.id),
      or(ilike(usersTable.name, like), ilike(usersTable.email, like), ilike(usersTable.phone, like), ilike(usersTable.rollNumber, like)),
    ))
    .limit(10);
  res.json(rows.map(publicOpponent));
});

// ---------------------------------------------------------------------------
// Create a challenge — picks a fixed random set of published MCQs (matching
// the given scope, or the whole bank if no scope given) that both players
// answer, sends the opponent a notification + email invite.
// ---------------------------------------------------------------------------

const CreateChallengeBody = z.object({
  opponentId: z.number().int().positive(),
  moduleId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  topicId: z.number().int().positive().optional(),
  totalQuestions: z.number().int().min(5).max(30).default(10),
});

router.post("/challenges", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const parsed = CreateChallengeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid challenge details" }); return; }
  const data = parsed.data;

  if (data.opponentId === req.user!.id) { res.status(400).json({ error: "You can't challenge yourself" }); return; }
  const [opponent] = await db.select().from(usersTable).where(and(eq(usersTable.id, data.opponentId), eq(usersTable.role, "student")));
  if (!opponent) { res.status(404).json({ error: "That student couldn't be found" }); return; }

  const mcqs = await db
    .select({ id: mcqsTable.id })
    .from(mcqsTable)
    .where(and(
      eq(mcqsTable.status, "published"),
      data.moduleId ? eq(mcqsTable.moduleId, data.moduleId) : undefined,
      data.subjectId ? eq(mcqsTable.subjectId, data.subjectId) : undefined,
      data.topicId ? eq(mcqsTable.topicId, data.topicId) : undefined,
    ))
    .orderBy(sql`random()`)
    .limit(data.totalQuestions);

  if (mcqs.length < 5) { res.status(400).json({ error: "Not enough questions available in that scope to start a challenge (need at least 5)." }); return; }

  const [challenge] = await db
    .insert(challengesTable)
    .values({
      challengerId: req.user!.id,
      opponentId: opponent.id,
      moduleId: data.moduleId,
      subjectId: data.subjectId,
      topicId: data.topicId,
      mcqIds: mcqs.map((m) => m.id),
      status: "PENDING",
      expiresAt: new Date(Date.now() + CHALLENGE_EXPIRY_MS),
    })
    .returning();

  await db.insert(notificationsTable).values({
    userId: opponent.id,
    title: `${req.user!.name} challenged you to a quiz!`,
    body: `${mcqs.length} questions — see if you can beat them.`,
    type: "info",
  });
  void sendEmail(opponent.email, `${req.user!.name} challenged you to a quiz`, challengeInviteEmailHtml(opponent.name, req.user!.name, mcqs.length, APP_URL)).catch(() => {});

  res.status(201).json({ id: challenge.id, opponent: publicOpponent(opponent), totalQuestions: mcqs.length, status: challenge.status });
});

// ---------------------------------------------------------------------------
// List my challenges — sent (I'm the challenger) and received (I'm the
// opponent), each with both sides' scores once completed.
// ---------------------------------------------------------------------------

async function summarize(rows: (typeof challengesTable.$inferSelect)[], myId: number) {
  if (!rows.length) return [];
  const userIds = [...new Set(rows.flatMap((r) => [r.challengerId, r.opponentId]))];
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const challengeIds = rows.map((r) => r.id);
  const attempts = await db.select().from(challengeAttemptsTable).where(inArray(challengeAttemptsTable.challengeId, challengeIds));
  const attemptsByChallenge = new Map<number, typeof attempts>();
  for (const a of attempts) {
    const list = attemptsByChallenge.get(a.challengeId);
    if (list) list.push(a); else attemptsByChallenge.set(a.challengeId, [a]);
  }

  return rows.map((row) => {
    const isChallenger = row.challengerId === myId;
    const opponentId = isChallenger ? row.opponentId : row.challengerId;
    const opponent = userMap.get(opponentId);
    const rowAttempts = attemptsByChallenge.get(row.id) ?? [];
    const myAttempt = rowAttempts.find((a) => a.userId === myId) ?? null;
    const opponentAttempt = rowAttempts.find((a) => a.userId === opponentId) ?? null;
    return {
      id: row.id,
      role: isChallenger ? "challenger" : "opponent" as const,
      opponent: opponent ? publicOpponent(opponent) : null,
      totalQuestions: row.mcqIds.length,
      status: row.status,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      myScorePercent: myAttempt ? Number(myAttempt.scorePercent) : null,
      myCorrectCount: myAttempt ? myAttempt.correctCount : null,
      opponentScorePercent: opponentAttempt ? Number(opponentAttempt.scorePercent) : null,
      opponentCorrectCount: opponentAttempt ? opponentAttempt.correctCount : null,
      iHavePlayed: !!myAttempt,
      opponentHasPlayed: !!opponentAttempt,
    };
  });
}

router.get("/challenges/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(challengesTable).where(or(eq(challengesTable.challengerId, req.user!.id), eq(challengesTable.opponentId, req.user!.id))).orderBy(desc(challengesTable.createdAt));
  const summarized = await summarize(rows, req.user!.id);
  res.json({
    sent: summarized.filter((c) => c.role === "challenger"),
    received: summarized.filter((c) => c.role === "opponent"),
  });
});

// ---------------------------------------------------------------------------
// Fetch a single challenge to play it — question text/options only; answers
// and explanations are withheld until this user has submitted their own
// attempt (see below), so peeking at the challenge doesn't leak the key.
// ---------------------------------------------------------------------------

router.get("/challenges/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, id));
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }
  const myId = req.user!.id;
  if (challenge.challengerId !== myId && challenge.opponentId !== myId) { res.status(403).json({ error: "Not authorized to view this challenge" }); return; }

  const opponentId = challenge.challengerId === myId ? challenge.opponentId : challenge.challengerId;
  const [opponent] = await db.select().from(usersTable).where(eq(usersTable.id, opponentId));
  const [myAttempt] = await db.select().from(challengeAttemptsTable).where(and(eq(challengeAttemptsTable.challengeId, id), eq(challengeAttemptsTable.userId, myId)));

  const mcqRows = await db.select().from(mcqsTable).where(inArray(mcqsTable.id, challenge.mcqIds));
  const mcqMap = new Map(mcqRows.map((m) => [m.id, m]));
  const orderedMcqs = challenge.mcqIds.map((mcqId) => mcqMap.get(mcqId)).filter((m): m is typeof mcqRows[number] => !!m);

  const revealAnswers = !!myAttempt; // only show the key once this user has already locked in their own answers
  res.json({
    id: challenge.id,
    status: challenge.status,
    opponent: opponent ? publicOpponent(opponent) : null,
    myAttempt: myAttempt ? { correctCount: myAttempt.correctCount, totalQuestions: myAttempt.totalQuestions, scorePercent: Number(myAttempt.scorePercent) } : null,
    mcqs: orderedMcqs.map((m) => ({
      id: m.id,
      question: m.question,
      options: m.options,
      correctAnswer: revealAnswers ? m.correctAnswer : null,
      explanation: revealAnswers ? m.explanation : null,
    })),
  });
});

router.post("/challenges/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, id));
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }
  if (challenge.opponentId !== req.user!.id) { res.status(403).json({ error: "Only the challenged student can decline" }); return; }
  if (challenge.status !== "PENDING") { res.status(400).json({ error: "This challenge can no longer be declined" }); return; }
  const [updated] = await db.update(challengesTable).set({ status: "DECLINED" }).where(eq(challengesTable.id, id)).returning();
  res.json({ id: updated.id, status: updated.status });
});

// ---------------------------------------------------------------------------
// Submit my answers for a challenge — whichever side submits first just
// records their score; once both sides have a completed attempt the
// challenge is marked COMPLETED and both players get a result notification.
// ---------------------------------------------------------------------------

const SubmitChallengeBody = z.object({
  answers: z.array(z.object({ mcqId: z.number().int().positive(), selectedAnswer: z.string().nullable() })).min(1),
  durationSeconds: z.number().int().min(0).optional(),
});

router.post("/challenges/:id/submit", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = SubmitChallengeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid submission" }); return; }

  const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, id));
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }
  const myId = req.user!.id;
  if (challenge.challengerId !== myId && challenge.opponentId !== myId) { res.status(403).json({ error: "Not authorized to play this challenge" }); return; }
  if (challenge.status === "DECLINED" || challenge.status === "EXPIRED") { res.status(400).json({ error: "This challenge is no longer active" }); return; }
  if (new Date(challenge.expiresAt) < new Date()) { res.status(400).json({ error: "This challenge has expired" }); return; }

  const [existing] = await db.select().from(challengeAttemptsTable).where(and(eq(challengeAttemptsTable.challengeId, id), eq(challengeAttemptsTable.userId, myId)));
  if (existing) { res.status(409).json({ error: "You've already played this challenge" }); return; }

  const mcqRows = await db.select().from(mcqsTable).where(inArray(mcqsTable.id, challenge.mcqIds));
  const mcqMap = new Map(mcqRows.map((m) => [m.id, m]));
  let correctCount = 0;
  for (const answer of parsed.data.answers) {
    const mcq = mcqMap.get(answer.mcqId);
    if (mcq?.correctAnswer && answer.selectedAnswer === mcq.correctAnswer) correctCount += 1;
  }
  const totalQuestions = challenge.mcqIds.length;
  const scorePercent = ((correctCount / totalQuestions) * 100).toFixed(2);

  const [attempt] = await db
    .insert(challengeAttemptsTable)
    .values({ challengeId: id, userId: myId, correctCount, totalQuestions, scorePercent, durationSeconds: parsed.data.durationSeconds, completedAt: new Date() })
    .returning();

  const opponentId = challenge.challengerId === myId ? challenge.opponentId : challenge.challengerId;
  const [opponentAttempt] = await db.select().from(challengeAttemptsTable).where(and(eq(challengeAttemptsTable.challengeId, id), eq(challengeAttemptsTable.userId, opponentId)));

  if (opponentAttempt) {
    await db.update(challengesTable).set({ status: "COMPLETED" }).where(eq(challengesTable.id, id));
    const [me, opponent] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, myId)).then((r) => r[0]),
      db.select().from(usersTable).where(eq(usersTable.id, opponentId)).then((r) => r[0]),
    ]);
    const myScore = Number(scorePercent);
    const opponentScore = Number(opponentAttempt.scorePercent);
    const myOutcome = myScore > opponentScore ? "won" : myScore < opponentScore ? "lost" : "tied";
    const opponentOutcome = myOutcome === "won" ? "lost" : myOutcome === "lost" ? "won" : "tied";

    await db.insert(notificationsTable).values([
      { userId: myId, title: "Your quiz challenge is complete", body: myOutcome === "won" ? `You beat ${opponent?.name ?? "your friend"}!` : myOutcome === "lost" ? `${opponent?.name ?? "Your friend"} edged you out this time.` : "It's a tie!", type: myOutcome === "won" ? "success" : "info" },
      { userId: opponentId, title: "Your quiz challenge is complete", body: opponentOutcome === "won" ? `You beat ${me?.name ?? "your friend"}!` : opponentOutcome === "lost" ? `${me?.name ?? "Your friend"} edged you out this time.` : "It's a tie!", type: opponentOutcome === "won" ? "success" : "info" },
    ]);
    if (me && opponent) {
      void sendEmail(me.email, "Your quiz challenge is complete", challengeResultEmailHtml(me.name, opponent.name, myOutcome, myScore, opponentScore, APP_URL)).catch(() => {});
      void sendEmail(opponent.email, "Your quiz challenge is complete", challengeResultEmailHtml(opponent.name, me.name, opponentOutcome, opponentScore, myScore, APP_URL)).catch(() => {});
    }
  }

  res.status(201).json({ correctCount, totalQuestions, scorePercent: Number(scorePercent), opponentHasPlayed: !!opponentAttempt, opponentScorePercent: opponentAttempt ? Number(opponentAttempt.scorePercent) : null });
});

export default router;

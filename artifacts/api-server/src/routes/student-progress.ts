import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import {
  db, practiceAttemptsTable, practiceAnswersTable, mcqsTable, usersTable, subjectsTable, topicsTable, modulesTable,
  pastPapersTable, examsTable, examAttemptsTable, blocksTable,
} from "@workspace/db";
import { requireAuth, isAdminRole } from "../middlewares/auth";
import { getStudentTargeting, getVisibleBlockIds, getVisibleModuleIds, isTargetVisible } from "../lib/contentVisibility";
import { resolveFileUrl, THUMBNAIL_TRANSFORM } from "../lib/storage";
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

// ---------------------------------------------------------------------------
// GET /student/continue-learning — powers the dashboard's "Continue where you
// left off" card. Nothing here is hardcoded or guessed from list order:
//
//  * `resume` is the module the student most recently PRACTISED (latest
//    practice attempt that can be tied to a module), plus the subject and the
//    exact topic to carry on with. Old attempts that were saved with only a
//    topicId (the Practice page has always sent just `topic`) are resolved
//    topic -> subject -> module here, so history from before this endpoint
//    still works; new attempts also get moduleId/subjectId filled in at save
//    time (see POST /practice-sessions).
//  * the topic is the last one practised if it still has unanswered
//    questions ("continue"), otherwise the next topic in that subject with
//    unanswered questions ("next"), otherwise the last topic ("review").
//  * `upNext` is other modules the student can see, started-but-unfinished
//    ones first, then untouched ones — real per-module question counts and
//    progress, using the same "distinct MCQs answered / published MCQs"
//    rule as GET /student/dashboard.
//
// Visibility: same program/year targeting as every other module list, so a
// student never gets deep-linked into a module they can't open. Read-only,
// scoped to the signed-in user, not behind requireMembershipFor (a lapsed
// student can still see where they were).
// ---------------------------------------------------------------------------

const RESUME_LOOKBACK_ATTEMPTS = 60;
const UP_NEXT_LIMIT = 3;

router.get("/student/continue-learning", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const visibleModuleIds = isAdminRole(req.user!.role) ? null : await getVisibleModuleIds(await getStudentTargeting(userId));
  if (visibleModuleIds && visibleModuleIds.length === 0) { res.json({ resume: null, upNext: [] }); return; }

  const [moduleRows, attempts] = await Promise.all([
    db.select().from(modulesTable)
      .where(and(eq(modulesTable.active, true), eq(modulesTable.archived, false), visibleModuleIds ? inArray(modulesTable.id, visibleModuleIds) : undefined))
      .orderBy(asc(modulesTable.displayOrder), asc(modulesTable.id)),
    db.select().from(practiceAttemptsTable)
      .where(and(
        eq(practiceAttemptsTable.userId, userId),
        or(isNotNull(practiceAttemptsTable.moduleId), isNotNull(practiceAttemptsTable.subjectId), isNotNull(practiceAttemptsTable.topicId)),
      ))
      .orderBy(desc(practiceAttemptsTable.createdAt))
      .limit(RESUME_LOOKBACK_ATTEMPTS),
  ]);
  const moduleIds = moduleRows.map((m) => m.id);
  if (!moduleIds.length) { res.json({ resume: null, upNext: [] }); return; }

  // ---- Per-module numbers (3 grouped queries, not one per module) ----------
  const [mcqTotals, answered, subjectTotals] = await Promise.all([
    db.select({ moduleId: mcqsTable.moduleId, total: sql<number>`count(*)::int` }).from(mcqsTable)
      .where(and(inArray(mcqsTable.moduleId, moduleIds), eq(mcqsTable.status, "published"))).groupBy(mcqsTable.moduleId),
    db.select({ moduleId: mcqsTable.moduleId, done: sql<number>`count(distinct ${practiceAnswersTable.mcqId})::int` }).from(practiceAnswersTable)
      .innerJoin(practiceAttemptsTable, eq(practiceAttemptsTable.id, practiceAnswersTable.attemptId))
      .innerJoin(mcqsTable, eq(mcqsTable.id, practiceAnswersTable.mcqId))
      .where(and(eq(practiceAttemptsTable.userId, userId), inArray(mcqsTable.moduleId, moduleIds), eq(mcqsTable.status, "published"))).groupBy(mcqsTable.moduleId),
    db.select({ moduleId: subjectsTable.moduleId, total: sql<number>`count(*)::int` }).from(subjectsTable)
      .where(and(inArray(subjectsTable.moduleId, moduleIds), eq(subjectsTable.archived, false))).groupBy(subjectsTable.moduleId),
  ]);
  const totalByModule = new Map(mcqTotals.map((r) => [r.moduleId as number, r.total]));
  const doneByModule = new Map(answered.map((r) => [r.moduleId as number, r.done]));
  const subjectsByModule = new Map(subjectTotals.map((r) => [r.moduleId, r.total]));

  const summarise = (m: typeof moduleRows[number]) => {
    const mcqCount = totalByModule.get(m.id) ?? 0;
    const attempted = Math.min(doneByModule.get(m.id) ?? 0, mcqCount);
    return {
      id: m.id, name: m.name, subtitle: m.subtitle,
      iconUrl: resolveFileUrl(m.iconPath, { transform: THUMBNAIL_TRANSFORM }),
      subjectCount: subjectsByModule.get(m.id) ?? 0,
      mcqCount, attempted,
      progress: mcqCount ? Math.round((attempted / mcqCount) * 100) : 0,
    };
  };
  const summaries = new Map(moduleRows.map((m) => [m.id, summarise(m)]));

  // ---- Resolve each attempt to a module (topic -> subject -> module) --------
  const attemptTopicIds = [...new Set(attempts.map((a) => a.topicId).filter((x): x is number => x != null))];
  const topicRows = attemptTopicIds.length
    ? await db.select({ id: topicsTable.id, subjectId: topicsTable.subjectId }).from(topicsTable).where(inArray(topicsTable.id, attemptTopicIds))
    : [];
  const topicSubject = new Map(topicRows.map((t) => [t.id, t.subjectId]));
  const attemptSubjectIds = [...new Set(attempts.map((a) => a.subjectId ?? (a.topicId != null ? topicSubject.get(a.topicId) ?? null : null)).filter((x): x is number => x != null))];
  const subjectRows = attemptSubjectIds.length
    ? await db.select({ id: subjectsTable.id, moduleId: subjectsTable.moduleId, name: subjectsTable.name }).from(subjectsTable).where(inArray(subjectsTable.id, attemptSubjectIds))
    : [];
  const subjectInfo = new Map(subjectRows.map((s) => [s.id, s]));

  type ResolvedAttempt = { attempt: typeof attempts[number]; moduleId: number; subjectId: number | null };
  const resolved: ResolvedAttempt[] = [];
  for (const a of attempts) {
    const subjectId = a.subjectId ?? (a.topicId != null ? topicSubject.get(a.topicId) ?? null : null);
    const moduleId = a.moduleId ?? (subjectId != null ? subjectInfo.get(subjectId)?.moduleId ?? null : null);
    if (moduleId != null && summaries.has(moduleId)) resolved.push({ attempt: a, moduleId, subjectId });
  }

  let resume: Record<string, unknown> | null = null;
  const latest = resolved[0];
  if (latest) {
    const summary = summaries.get(latest.moduleId)!;
    const sessionsInModule = resolved.filter((r) => r.moduleId === latest.moduleId).length;

    // Which topic to carry on with, within the subject last practised.
    let topic: { id: number; name: string; questionCount: number; attempted: number; state: "continue" | "next" | "review" } | null = null;
    let subject: { id: number; name: string } | null = null;
    if (latest.subjectId != null) {
      const info = subjectInfo.get(latest.subjectId);
      if (info) subject = { id: info.id, name: info.name };
      const topics = await db.select({ id: topicsTable.id, name: topicsTable.name }).from(topicsTable)
        .where(and(eq(topicsTable.subjectId, latest.subjectId), eq(topicsTable.active, true), eq(topicsTable.archived, false)))
        .orderBy(asc(topicsTable.displayOrder), asc(topicsTable.id));
      const topicIds = topics.map((t) => t.id);
      if (topicIds.length) {
        const [totals, done] = await Promise.all([
          db.select({ topicId: mcqsTable.topicId, total: sql<number>`count(*)::int` }).from(mcqsTable)
            .where(and(inArray(mcqsTable.topicId, topicIds), eq(mcqsTable.status, "published"))).groupBy(mcqsTable.topicId),
          db.select({ topicId: mcqsTable.topicId, done: sql<number>`count(distinct ${practiceAnswersTable.mcqId})::int` }).from(practiceAnswersTable)
            .innerJoin(practiceAttemptsTable, eq(practiceAttemptsTable.id, practiceAnswersTable.attemptId))
            .innerJoin(mcqsTable, eq(mcqsTable.id, practiceAnswersTable.mcqId))
            .where(and(eq(practiceAttemptsTable.userId, userId), inArray(mcqsTable.topicId, topicIds), eq(mcqsTable.status, "published"))).groupBy(mcqsTable.topicId),
        ]);
        const totalByTopic = new Map(totals.map((r) => [r.topicId as number, r.total]));
        const doneByTopic = new Map(done.map((r) => [r.topicId as number, r.done]));
        const view = (t: { id: number; name: string }, state: "continue" | "next" | "review") => {
          const questionCount = totalByTopic.get(t.id) ?? 0;
          return { id: t.id, name: t.name, questionCount, attempted: Math.min(doneByTopic.get(t.id) ?? 0, questionCount), state };
        };
        const hasQuestionsLeft = (t: { id: number }) => (totalByTopic.get(t.id) ?? 0) > (doneByTopic.get(t.id) ?? 0);
        const lastIdx = latest.attempt.topicId != null ? topics.findIndex((t) => t.id === latest.attempt.topicId) : -1;
        if (lastIdx >= 0 && hasQuestionsLeft(topics[lastIdx])) topic = view(topics[lastIdx], "continue");
        else {
          const after = topics.slice(lastIdx + 1).find(hasQuestionsLeft) ?? topics.find(hasQuestionsLeft);
          if (after) topic = view(after, "next");
          else if (lastIdx >= 0) topic = view(topics[lastIdx], "review");
        }
      }
    }

    const a = latest.attempt;
    resume = {
      ...summary,
      lastPracticedAt: (a.completedAt ?? a.createdAt).toISOString(),
      lastScorePercent: Number(a.scorePercent),
      sessionsInModule,
      subject,
      topic,
    };
  }

  // ---- Up next: started-but-unfinished first, then untouched -----------------
  const resumeId = latest?.moduleId ?? null;
  const candidates = moduleRows.map((m) => summaries.get(m.id)!).filter((m) => m.id !== resumeId && m.mcqCount > 0 && m.progress < 100);
  const upNext = [...candidates.filter((m) => m.progress > 0), ...candidates.filter((m) => m.progress === 0)].slice(0, UP_NEXT_LIMIT);

  res.json({ resume, upNext });
});

// ---------------------------------------------------------------------------
// GET /student/search?q= — powers the header search palette. The palette used
// to filter only the sidebar's page names while its placeholder promised
// "Search modules, topics, MCQs…". This searches real content, and only what
// THIS student may open: same program/year targeting as the module, block,
// exam and past-paper lists. MCQ text is deliberately not searched — question
// stems are the paid product, and a search box shouldn't leak them to lapsed
// or trial students.
//
// At least 2 characters (a single letter matches nearly every row), each group
// capped at SEARCH_LIMIT and queried independently so one slow table can't
// hold up the others. LIKE wildcards in the query are escaped so "50%" or
// "a_b" search for those characters literally.
// ---------------------------------------------------------------------------

const SEARCH_LIMIT = 5;
const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_CHARS = 60;
/** Exams / past papers are filtered by targeting in JS after the query, so over-fetch a little before slicing. */
const SEARCH_OVERFETCH = SEARCH_LIMIT * 3;

interface SearchHit { id: number; title: string; subtitle?: string; moduleId?: number; subjectId?: number }
const EMPTY_SEARCH = { blocks: [], modules: [], subjects: [], topics: [], exams: [], pastPapers: [] };

router.get("/student/search", requireAuth, async (req, res): Promise<void> => {
  const raw = typeof req.query.q === "string" ? req.query.q.trim().slice(0, SEARCH_MAX_CHARS) : "";
  if (raw.length < SEARCH_MIN_CHARS) { res.json(EMPTY_SEARCH); return; }
  const like = `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const admin = isAdminRole(req.user!.role);
  const targeting = await getStudentTargeting(req.user!.id);
  const [visibleModuleIds, visibleBlockIds] = admin ? [null, null] : await Promise.all([getVisibleModuleIds(targeting), getVisibleBlockIds(targeting)]);
  const modulesScope = visibleModuleIds ? (visibleModuleIds.length ? inArray(modulesTable.id, visibleModuleIds) : sql`false`) : undefined;

  const [blocks, modules, subjects, topics, exams, papers] = await Promise.all([
    visibleBlockIds && !visibleBlockIds.length ? Promise.resolve([]) :
      db.select({ id: blocksTable.id, name: blocksTable.name, subtitle: blocksTable.subtitle }).from(blocksTable)
        .where(and(eq(blocksTable.active, true), eq(blocksTable.archived, false), ilike(blocksTable.name, like), visibleBlockIds ? inArray(blocksTable.id, visibleBlockIds) : undefined))
        .orderBy(asc(blocksTable.displayOrder)).limit(SEARCH_LIMIT),
    db.select({ id: modulesTable.id, name: modulesTable.name, subtitle: modulesTable.subtitle }).from(modulesTable)
      .where(and(eq(modulesTable.active, true), eq(modulesTable.archived, false), ilike(modulesTable.name, like), modulesScope))
      .orderBy(asc(modulesTable.displayOrder)).limit(SEARCH_LIMIT),
    db.select({ id: subjectsTable.id, name: subjectsTable.name, moduleId: subjectsTable.moduleId, moduleName: modulesTable.name }).from(subjectsTable)
      .innerJoin(modulesTable, eq(subjectsTable.moduleId, modulesTable.id))
      .where(and(eq(subjectsTable.active, true), eq(subjectsTable.archived, false), eq(modulesTable.active, true), eq(modulesTable.archived, false), ilike(subjectsTable.name, like), modulesScope))
      .limit(SEARCH_LIMIT),
    db.select({ id: topicsTable.id, name: topicsTable.name, subjectId: topicsTable.subjectId, subjectName: subjectsTable.name, moduleId: subjectsTable.moduleId }).from(topicsTable)
      .innerJoin(subjectsTable, eq(topicsTable.subjectId, subjectsTable.id))
      .innerJoin(modulesTable, eq(subjectsTable.moduleId, modulesTable.id))
      .where(and(eq(topicsTable.active, true), eq(topicsTable.archived, false), eq(subjectsTable.active, true), eq(subjectsTable.archived, false), eq(modulesTable.active, true), eq(modulesTable.archived, false), ilike(topicsTable.name, like), modulesScope))
      .limit(SEARCH_LIMIT),
    db.select({ id: examsTable.id, title: examsTable.title, programTargetKind: examsTable.programTargetKind, yearTargetNumber: examsTable.yearTargetNumber }).from(examsTable)
      .where(and(eq(examsTable.status, "published"), ilike(examsTable.title, like))).limit(SEARCH_OVERFETCH),
    db.select({ id: pastPapersTable.id, title: pastPapersTable.title, programTargetKind: pastPapersTable.programTargetKind, yearTargetNumber: pastPapersTable.yearTargetNumber }).from(pastPapersTable)
      .where(and(eq(pastPapersTable.active, true), eq(pastPapersTable.archived, false), ilike(pastPapersTable.title, like))).limit(SEARCH_OVERFETCH),
  ]);

  const visible = <T extends { programTargetKind: string | null; yearTargetNumber: number | null }>(rows: T[]) =>
    (admin ? rows : rows.filter((r) => isTargetVisible(r.programTargetKind, r.yearTargetNumber, targeting))).slice(0, SEARCH_LIMIT);

  res.json({
    blocks: blocks.map<SearchHit>((b) => ({ id: b.id, title: b.name, subtitle: b.subtitle || undefined })),
    modules: modules.map<SearchHit>((m) => ({ id: m.id, title: m.name, subtitle: m.subtitle || undefined })),
    subjects: subjects.map<SearchHit>((s) => ({ id: s.id, title: s.name, subtitle: s.moduleName, moduleId: s.moduleId })),
    topics: topics.map<SearchHit>((t) => ({ id: t.id, title: t.name, subtitle: t.subjectName, subjectId: t.subjectId, moduleId: t.moduleId })),
    exams: visible(exams).map<SearchHit>((e) => ({ id: e.id, title: e.title })),
    pastPapers: visible(papers).map<SearchHit>((p) => ({ id: p.id, title: p.title })),
  });
});

export default router;

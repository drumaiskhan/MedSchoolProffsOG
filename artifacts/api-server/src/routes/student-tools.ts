import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, notebookEntriesTable, savedSessionsTable, flaggedMcqsTable, feedbackTable, feedbackRepliesTable, notificationsTable, usersTable } from "@workspace/db";
import { requireAuth, requireAdmin, isAdminRole } from "../middlewares/auth";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Notebook
// ---------------------------------------------------------------------------

router.get("/notebook", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(notebookEntriesTable).where(eq(notebookEntriesTable.userId, req.user!.id)).orderBy(desc(notebookEntriesTable.updatedAt));
  res.json(rows);
});

const NotebookBody = z.object({ title: z.string().max(160).optional(), content: z.string().min(1).max(10000), mcqId: z.number().int().positive().optional() });

router.post("/notebook", requireAuth, async (req, res): Promise<void> => {
  const parsed = NotebookBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(notebookEntriesTable).values({ userId: req.user!.id, title: parsed.data.title ?? "", content: parsed.data.content, mcqId: parsed.data.mcqId }).returning();
  res.status(201).json(row);
});

router.patch("/notebook/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = NotebookBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.update(notebookEntriesTable).set(parsed.data).where(and(eq(notebookEntriesTable.id, Number(req.params.id)), eq(notebookEntriesTable.userId, req.user!.id))).returning();
  if (!row) { res.status(404).json({ error: "Note not found" }); return; }
  res.json(row);
});

router.delete("/notebook/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(notebookEntriesTable).where(and(eq(notebookEntriesTable.id, Number(req.params.id)), eq(notebookEntriesTable.userId, req.user!.id)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Saved sessions
// ---------------------------------------------------------------------------

router.get("/saved-sessions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(savedSessionsTable).where(eq(savedSessionsTable.userId, req.user!.id)).orderBy(desc(savedSessionsTable.createdAt));
  res.json(rows.map((row) => ({ ...row, config: JSON.parse(row.config) })));
});

router.post("/saved-sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ name: z.string().min(1).max(120), config: z.record(z.string(), z.any()) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "name and config are required" }); return; }
  const [row] = await db.insert(savedSessionsTable).values({ userId: req.user!.id, name: parsed.data.name, config: JSON.stringify(parsed.data.config) }).returning();
  res.status(201).json({ ...row, config: parsed.data.config });
});

router.delete("/saved-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(savedSessionsTable).where(and(eq(savedSessionsTable.id, Number(req.params.id)), eq(savedSessionsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Flagged MCQs
// ---------------------------------------------------------------------------

router.get("/flagged-mcqs", requireAuth, async (req, res): Promise<void> => {
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(flaggedMcqsTable).where(isAdmin ? undefined : eq(flaggedMcqsTable.userId, req.user!.id)).orderBy(desc(flaggedMcqsTable.createdAt));
  res.json(rows);
});

router.post("/flagged-mcqs", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ mcqId: z.number().int().positive(), reason: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "mcqId is required" }); return; }
  const [row] = await db
    .insert(flaggedMcqsTable)
    .values({ userId: req.user!.id, mcqId: parsed.data.mcqId, reason: parsed.data.reason ?? "" })
    .onConflictDoUpdate({ target: [flaggedMcqsTable.userId, flaggedMcqsTable.mcqId], set: { reason: parsed.data.reason ?? "", status: "open" } })
    .returning();
  res.status(201).json(row);
});

router.patch("/flagged-mcqs/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({ status: z.enum(["open", "resolved"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid status" }); return; }
  const [row] = await db.update(flaggedMcqsTable).set({ status: parsed.data.status }).where(eq(flaggedMcqsTable.id, Number(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Flag not found" }); return; }
  res.json(row);
});

router.delete("/flagged-mcqs/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(flaggedMcqsTable).where(and(eq(flaggedMcqsTable.id, Number(req.params.id)), eq(flaggedMcqsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

router.get("/feedback", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(feedbackTable).orderBy(desc(feedbackTable.createdAt));
  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is number => id !== null))];
  const users = userIds.length ? await db.select().from(usersTable) : [];
  const userMap = new Map(users.filter((u) => userIds.includes(u.id)).map((u) => [u.id, { name: u.name, email: u.email }]));
  res.json(rows.map((row) => ({ ...row, user: row.userId ? userMap.get(row.userId) ?? null : null })));
});

router.post("/feedback", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ category: z.string().max(60).optional(), message: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A message is required" }); return; }
  const [row] = await db.insert(feedbackTable).values({ userId: req.user!.id, category: parsed.data.category ?? "general", message: parsed.data.message }).returning();
  res.status(201).json(row);
});

router.patch("/feedback/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({ status: z.enum(["open", "replied", "reviewed"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid status" }); return; }
  const [row] = await db.update(feedbackTable).set({ status: parsed.data.status }).where(eq(feedbackTable.id, Number(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Feedback not found" }); return; }
  res.json(row);
});

// A student's own feedback history, each with its reply thread — lets them
// see whether the team has responded instead of submitting into a void.
router.get("/feedback/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(feedbackTable).where(eq(feedbackTable.userId, req.user!.id)).orderBy(desc(feedbackTable.createdAt));
  const replies = rows.length ? await db.select().from(feedbackRepliesTable).orderBy(feedbackRepliesTable.createdAt) : [];
  const repliesByFeedback = new Map<number, typeof replies>();
  for (const reply of replies) {
    if (!rows.some((r) => r.id === reply.feedbackId)) continue;
    const list = repliesByFeedback.get(reply.feedbackId);
    if (list) list.push(reply); else repliesByFeedback.set(reply.feedbackId, [reply]);
  }
  res.json(rows.map((row) => ({ ...row, replies: repliesByFeedback.get(row.id) ?? [] })));
});

function canAccessFeedback(feedback: typeof feedbackTable.$inferSelect, userId: number, isAdmin: boolean) {
  return isAdmin || feedback.userId === userId;
}

router.get("/feedback/:id/replies", requireAuth, async (req, res): Promise<void> => {
  const feedbackId = Number(req.params.id);
  const [feedback] = await db.select().from(feedbackTable).where(eq(feedbackTable.id, feedbackId));
  if (!feedback) { res.status(404).json({ error: "Feedback not found" }); return; }
  if (!canAccessFeedback(feedback, req.user!.id, isAdminRole(req.user!.role))) { res.status(403).json({ error: "Not authorized to view this thread" }); return; }
  const rows = await db.select().from(feedbackRepliesTable).where(eq(feedbackRepliesTable.feedbackId, feedbackId)).orderBy(feedbackRepliesTable.createdAt);
  res.json(rows);
});

router.post("/feedback/:id/replies", requireAuth, async (req, res): Promise<void> => {
  const feedbackId = Number(req.params.id);
  const parsed = z.object({ message: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A message is required" }); return; }
  const [feedback] = await db.select().from(feedbackTable).where(eq(feedbackTable.id, feedbackId));
  if (!feedback) { res.status(404).json({ error: "Feedback not found" }); return; }
  const isAdmin = isAdminRole(req.user!.role);
  if (!canAccessFeedback(feedback, req.user!.id, isAdmin)) { res.status(403).json({ error: "Not authorized to reply to this thread" }); return; }

  const [reply] = await db.insert(feedbackRepliesTable).values({
    feedbackId,
    authorId: req.user!.id,
    authorRole: isAdmin ? "admin" : "student",
    message: parsed.data.message,
  }).returning();

  // Admin replying -> mark as answered for the admin queue, and let the
  // student know. Student following up -> reopen it so it doesn't sit
  // buried under "replied" items the admin has already addressed.
  if (isAdmin) {
    await db.update(feedbackTable).set({ status: "replied" }).where(eq(feedbackTable.id, feedbackId));
    if (feedback.userId) {
      await db.insert(notificationsTable).values({ userId: feedback.userId, title: "The team replied to your feedback", body: parsed.data.message.slice(0, 140), type: "info" });
    }
  } else {
    await db.update(feedbackTable).set({ status: "open" }).where(eq(feedbackTable.id, feedbackId));
  }

  res.status(201).json(reply);
});

export default router;

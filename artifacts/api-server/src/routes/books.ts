import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, booksTable, auditLogsTable } from "@workspace/db";
import { requireAuth, requireAdmin, requireActiveMembership, isAdminRole } from "../middlewares/auth";
import { resolveFileUrl } from "../lib/storage";
import { getStudentTargeting, getVisibleModuleIds } from "../lib/contentVisibility";

const router: IRouter = Router();

function serializeBook(row: typeof booksTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    moduleId: row.moduleId,
    subjectId: row.subjectId,
    topicId: row.topicId,
    storagePath: resolveFileUrl(row.storagePath) ?? row.storagePath,
    coverImagePath: row.coverImagePath ? resolveFileUrl(row.coverImagePath) ?? row.coverImagePath : null,
    active: row.active,
  };
}

// Student-visible listing — same "no moduleId = globally visible" convention
// as flashcards/resources, gated behind an active membership like the rest
// of the study-tools content.
router.get("/books", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(booksTable).where(eq(booksTable.active, true));
  if (isAdmin) { res.json(rows.map(serializeBook)); return; }
  const targeting = await getStudentTargeting(req.user!.id);
  const visibleModuleIds = await getVisibleModuleIds(targeting);
  const visible = rows.filter((row) => row.moduleId === null || visibleModuleIds.includes(row.moduleId));
  res.json(visible.map(serializeBook));
});

// Admin listing — includes archived so the admin UI can offer "show archived" like modules.
router.get("/admin/books", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(booksTable);
  res.json(rows.map(serializeBook));
});

const CreateBookBody = z.object({
  title: z.string().min(1),
  author: z.string().min(1).optional(),
  moduleId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  topicId: z.number().int().positive().optional(),
  storagePath: z.string().min(1),
  coverImagePath: z.string().min(1).optional(),
});

router.post("/books", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid book" }); return; }
  const [row] = await db.insert(booksTable).values({
    title: parsed.data.title,
    author: parsed.data.author ?? null,
    moduleId: parsed.data.moduleId ?? null,
    subjectId: parsed.data.subjectId ?? null,
    topicId: parsed.data.topicId ?? null,
    storagePath: parsed.data.storagePath,
    coverImagePath: parsed.data.coverImagePath ?? null,
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_CREATED", entity: "book", entityId: row.id });
  res.status(201).json(serializeBook(row));
});

router.delete("/books/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(booksTable).set({ active: false, archived: true }).where(and(eq(booksTable.id, id))).returning();
  if (!row) { res.status(404).json({ error: "Book not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_ARCHIVED", entity: "book", entityId: row.id });
  res.json({ ok: true });
});

// Permanent delete — the admin "Delete this book?" dialog wires to this (not
// the soft-archive route above), since the request is for the book to be
// gone, not archived. Mirrors the past-papers permanent-delete pattern.
router.delete("/admin/books/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid book id" }); return; }
  const [row] = await db.select().from(booksTable).where(eq(booksTable.id, id));
  if (!row) { res.status(404).json({ error: "Book not found" }); return; }
  await db.delete(booksTable).where(eq(booksTable.id, id));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_PERMANENTLY_DELETED", entity: "book", entityId: id });
  res.json({ ok: true });
});

export default router;

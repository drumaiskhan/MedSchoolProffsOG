import { Router, type IRouter } from "express";
import { and, eq, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { db, booksTable, bookPurchasesTable, usersTable, auditLogsTable } from "@workspace/db";
import { requireAuth, requireAdmin, isAdminRole } from "../middlewares/auth";
import { resolveFileUrl, reresolveLegacyCloudinaryPath, deleteFromCloudinary, THUMBNAIL_TRANSFORM } from "../lib/storage";
import { getStudentTargeting, getVisibleModuleIds, isTargetVisible } from "../lib/contentVisibility";
import { trialGrantsAccess } from "../lib/trial";

const router: IRouter = Router();

// `locked` hides storagePath (the actual file) from a student who hasn't
// bought this specific book yet — everything else about the book (title,
// cover, price) still shows so they know what they'd be buying. `pending`
// tells the frontend "there's already a submission awaiting review" so it
// doesn't offer to submit a second one. Both are omitted (book always
// unlocked) for admins and for the admin listing route.
function serializeBook(row: typeof booksTable.$inferSelect, opts?: { locked?: boolean; pending?: boolean; secureReader?: boolean }) {
  const locked = opts?.locked ?? false;
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    moduleId: row.moduleId,
    subjectId: row.subjectId,
    topicId: row.topicId,
    programTargetKind: row.programTargetKind,
    yearTargetNumber: row.yearTargetNumber,
    // NOTE: fall back to null, never to the raw row.storagePath — that raw
    // value is an internal "cloudinary:image/books/xyz.pdf"-style storage
    // key, not a URL. Leaking it to the client used to make the frontend
    // build a bogus request to its own API origin (resolveUploadUrl treats
    // any non-"http(s)://" string as a relative path), which is what
    // produced "This site can't be reached" instead of a clean "no file"
    // state. A null here always means "genuinely not resolvable right now"
    // (e.g. Cloudinary not configured) OR the book is locked — the
    // frontend already handles null as a disabled/missing state either way,
    // and `locked` below is what distinguishes the two for its messaging.
    // A PAID book that a student has unlocked is read through the secure reader
    // (routes/book-reader.ts) — the file's URL is never sent to them, so there
    // is nothing to open in a new tab, download, or share. Free books keep the
    // plain link, and admins (who manage the files) always get it.
    storagePath: locked || opts?.secureReader ? null : resolveFileUrl(row.storagePath),
    secureReader: opts?.secureReader ?? false,
    // Round 3, item 10 (perf) — the cover thumbnail gets a delivery
    // transform (resized + auto format/quality); the actual book file
    // (storagePath) deliberately does NOT, since it's a raw/PDF resource,
    // not an image, and transformations don't apply the same way there.
    coverImagePath: row.coverImagePath ? resolveFileUrl(row.coverImagePath, { transform: THUMBNAIL_TRANSFORM }) : null,
    active: row.active,
    isFree: row.isFree,
    price: row.price !== null ? Number(row.price) : null,
    currency: row.currency,
    locked,
    purchasePending: opts?.pending ?? false,
  };
}

// Student-visible listing — same "no moduleId = globally visible" convention
// as flashcards/resources. Free books are open to everyone with an account.
// A PAID book is now gated by its OWN approved purchase (med_book_purchases)
// — not by having an active membership, which is how this worked before a
// client decision to review book payments independently of the membership
// queue. A locked paid book still appears in the list (with locked: true,
// storagePath: null) so the student can see it exists and buy it, rather
// than disappearing entirely the way it did under the old membership gate.
router.get("/books", requireAuth, async (req, res): Promise<void> => {
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(booksTable).where(eq(booksTable.active, true));
  if (isAdmin) { res.json(rows.map((row) => serializeBook(row))); return; }
  const targeting = await getStudentTargeting(req.user!.id);
  const visibleModuleIds = await getVisibleModuleIds(targeting);
  const purchases = await db.select().from(bookPurchasesTable).where(eq(bookPurchasesTable.userId, req.user!.id));
  const approvedBookIds = new Set(purchases.filter((p) => p.status === "approved").map((p) => p.bookId));
  // General Trial Mode can optionally open paid books too (its "Paid books"
  // toggle, off by default — see lib/trial.ts). Same scope rules (program /
  // years / end date) as every other trial-gated feature.
  const trialOpensBooks = await trialGrantsAccess(req.user!.id, "books");
  const pendingBookIds = new Set(purchases.filter((p) => p.status === "PAYMENT_PENDING_REVIEW").map((p) => p.bookId));
  // New books are targeted directly via Degree/Year (programTargetKind +
  // yearTargetNumber), same convention as past papers — null on either
  // axis means "everyone" on that axis. Older books that were instead
  // scoped to a Module (before this picker existed) keep working off that
  // module's own visibility.
  const visible = rows.filter((row) => (
    row.programTargetKind !== null || row.yearTargetNumber !== null
      ? isTargetVisible(row.programTargetKind, row.yearTargetNumber, targeting)
      : row.moduleId === null || visibleModuleIds.includes(row.moduleId)
  ));
  res.json(visible.map((row) => {
    const locked = !row.isFree && !approvedBookIds.has(row.id) && !trialOpensBooks;
    return serializeBook(row, { locked, pending: pendingBookIds.has(row.id), secureReader: !row.isFree && !locked });
  }));
});

// Admin listing — includes archived so the admin UI can offer "show archived" like modules.
router.get("/admin/books", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(booksTable);
  res.json(rows.map((row) => serializeBook(row)));
});

const CreateBookBody = z.object({
  title: z.string().min(1),
  author: z.string().min(1).optional(),
  moduleId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  topicId: z.number().int().positive().optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(6).nullable().optional(),
  storagePath: z.string().min(1),
  coverImagePath: z.string().min(1).optional(),
  isFree: z.boolean().optional(),
  price: z.number().nonnegative().nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
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
    programTargetKind: parsed.data.programTargetKind ? parsed.data.programTargetKind.trim().toUpperCase() : null,
    yearTargetNumber: parsed.data.yearTargetNumber ?? null,
    storagePath: parsed.data.storagePath,
    coverImagePath: parsed.data.coverImagePath ?? null,
    isFree: parsed.data.isFree ?? false,
    price: parsed.data.isFree ? null : (parsed.data.price != null ? String(parsed.data.price) : null),
    currency: parsed.data.isFree ? null : (parsed.data.currency ?? null),
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_CREATED", entity: "book", entityId: row.id });
  res.status(201).json(serializeBook(row));
});

// Edit an existing book. Added alongside the free/paid split so an admin
// can flip a book that's already uploaded, rather than only being able to
// set it once at creation — previously books.ts had no update route at
// all (only create + archive/delete).
const UpdateBookBody = z.object({
  title: z.string().min(1).optional(),
  author: z.string().min(1).nullable().optional(),
  programTargetKind: z.string().max(40).nullable().optional(),
  yearTargetNumber: z.number().int().min(1).max(6).nullable().optional(),
  isFree: z.boolean().optional(),
  price: z.number().nonnegative().nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
});

router.patch("/books/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateBookBody.safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: parsed.success ? "Invalid book id" : (parsed.error.issues[0]?.message ?? "Invalid update") }); return; }
  const update: Partial<typeof booksTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.author !== undefined) update.author = parsed.data.author;
  if (parsed.data.programTargetKind !== undefined) update.programTargetKind = parsed.data.programTargetKind ? parsed.data.programTargetKind.trim().toUpperCase() : null;
  if (parsed.data.yearTargetNumber !== undefined) update.yearTargetNumber = parsed.data.yearTargetNumber;
  if (parsed.data.isFree !== undefined) {
    update.isFree = parsed.data.isFree;
    // A free book carries no price — clear any price this book had while
    // it was paid, so the UI never shows a stale price on a free book.
    if (parsed.data.isFree) { update.price = null; update.currency = null; }
  }
  if (!parsed.data.isFree && parsed.data.price !== undefined) update.price = parsed.data.price != null ? String(parsed.data.price) : null;
  if (!parsed.data.isFree && parsed.data.currency !== undefined) update.currency = parsed.data.currency;
  const [row] = await db.update(booksTable).set(update).where(eq(booksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Book not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_UPDATED", entity: "book", entityId: row.id });
  res.json(serializeBook(row));
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
//
// New in round 3: also deletes the underlying Cloudinary asset(s) (the
// book's file, plus its cover image if one was set), not just the DB row.
// Previously this only removed `med_books`, leaving the actual PDF/file
// orphaned on Cloudinary forever (silently consuming storage quota with no
// way to find/clean it up from the admin UI). The DB row is still deleted
// even if the Cloudinary delete fails or the asset was already gone
// (deleteFromCloudinary never throws) — a failed remote cleanup shouldn't
// block the admin from removing the book, but is reported back so it's not
// silently swallowed.
router.delete("/admin/books/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid book id" }); return; }
  const [row] = await db.select().from(booksTable).where(eq(booksTable.id, id));
  if (!row) { res.status(404).json({ error: "Book not found" }); return; }

  const [fileResult, coverResult] = await Promise.all([
    deleteFromCloudinary(row.storagePath),
    deleteFromCloudinary(row.coverImagePath),
  ]);

  await db.delete(booksTable).where(eq(booksTable.id, id));
  await db.insert(auditLogsTable).values({
    actorId: req.user!.id, action: "BOOK_PERMANENTLY_DELETED", entity: "book", entityId: id,
    metadata: JSON.stringify({ cloudinaryFileDeleted: fileResult.ok && !fileResult.skipped, cloudinaryCoverDeleted: coverResult.ok && !coverResult.skipped }),
  });
  const cloudinaryWarning = !fileResult.ok || !coverResult.ok
    ? "Book removed, but the file on Cloudinary could not be deleted — it may need manual cleanup." : undefined;
  res.json({ ok: true, ...(cloudinaryWarning ? { warning: cloudinaryWarning } : {}) });
});

// One-time backward-compat fix for books uploaded before the "keep the
// extension in Cloudinary's public_id" bug was fixed (see storage.ts). Those
// rows resolve to a URL Cloudinary can't serve, which is why a pre-existing
// book can still fail to open even after a fresh upload works fine. Looks up
// each affected book's real format on Cloudinary and rewrites its stored
// path with the extension. Safe to re-run — it's a no-op for already-correct
// rows and for books whose file isn't on Cloudinary (e.g. legacy Supabase
// rows or ones with no storagePath at all).
router.post("/admin/books/backfill-links", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(booksTable);
  let fixed = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.storagePath) { skipped++; continue; }
    const corrected = await reresolveLegacyCloudinaryPath(row.storagePath);
    if (!corrected) { skipped++; continue; }
    try {
      await db.update(booksTable).set({ storagePath: corrected }).where(eq(booksTable.id, row.id));
      fixed++;
    } catch (err) {
      failed++;
    }
  }
  res.json({ fixed, skipped, failed });
});

// ---------------------------------------------------------------------------
// Per-book purchases — separate review queue from med_payments (membership).
// A student submits proof-of-payment for one specific paid book; an admin
// approves or rejects it here, independently of their membership status.
// ---------------------------------------------------------------------------

const SubmitBookPurchaseBody = z.object({
  method: z.string().min(1),
  reference: z.string().min(1),
  paymentDate: z.string().min(1),
  proofPath: z.string().min(1).nullable().optional(),
});

function serializeBookPurchase(row: typeof bookPurchasesTable.$inferSelect, user?: { name: string; email: string } | null) {
  return {
    id: row.id,
    bookId: row.bookId,
    bookTitle: row.bookTitle,
    amount: Number(row.amount),
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    paymentDate: row.paymentDate,
    proofPath: row.proofPath ? resolveFileUrl(row.proofPath) : null,
    status: row.status,
    rejectionReason: row.rejectionReason,
    submittedAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    user: user ? { name: user.name, email: user.email } : undefined,
  };
}

router.post("/books/:id/purchases", requireAuth, async (req, res): Promise<void> => {
  const bookId = Number(req.params.id);
  const parsed = SubmitBookPurchaseBody.safeParse(req.body);
  if (!parsed.success || Number.isNaN(bookId)) { res.status(400).json({ error: parsed.success ? "Invalid book id" : (parsed.error.issues[0]?.message ?? "Invalid submission") }); return; }
  const [book] = await db.select().from(booksTable).where(and(eq(booksTable.id, bookId), eq(booksTable.active, true)));
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  if (book.isFree) { res.status(400).json({ error: "This book is free — no purchase needed" }); return; }
  // Already approved, or already has a submission sitting in review —
  // don't let the student queue up duplicate requests for the same book.
  const existing = await db.select().from(bookPurchasesTable).where(and(eq(bookPurchasesTable.userId, req.user!.id), eq(bookPurchasesTable.bookId, bookId)));
  if (existing.some((p) => p.status === "approved")) { res.status(400).json({ error: "You already own this book" }); return; }
  if (existing.some((p) => p.status === "PAYMENT_PENDING_REVIEW")) { res.status(400).json({ error: "You already have a submission for this book awaiting review" }); return; }
  if (existing.some((p) => p.status === "suspended")) { res.status(400).json({ error: "Access to this book was suspended. Please contact support instead of submitting a new purchase." }); return; }
  const [row] = await db.insert(bookPurchasesTable).values({
    userId: req.user!.id, bookId: book.id, bookTitle: book.title,
    amount: book.price ?? "0", currency: book.currency ?? "PKR",
    method: parsed.data.method, reference: parsed.data.reference, paymentDate: parsed.data.paymentDate,
    proofPath: parsed.data.proofPath ?? null, status: "PAYMENT_PENDING_REVIEW",
  }).returning();
  res.status(201).json(serializeBookPurchase(row));
});

router.get("/books/purchases/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(bookPurchasesTable).where(eq(bookPurchasesTable.userId, req.user!.id)).orderBy(desc(bookPurchasesTable.createdAt));
  res.json(rows.map((row) => serializeBookPurchase(row)));
});

router.get("/admin/book-purchases", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(bookPurchasesTable).orderBy(desc(bookPurchasesTable.createdAt));
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  res.json(rows.map((row) => serializeBookPurchase(row, userMap.get(row.userId))));
});

router.post("/admin/book-purchases/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid purchase id" }); return; }
  const [row] = await db.update(bookPurchasesTable).set({ status: "approved", reviewedBy: req.user!.id, reviewedAt: new Date(), rejectionReason: null }).where(eq(bookPurchasesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Purchase not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_PURCHASE_APPROVED", entity: "book_purchase", entityId: row.id });
  res.json(serializeBookPurchase(row));
});

router.post("/admin/book-purchases/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ reason: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [row] = await db.update(bookPurchasesTable).set({ status: "rejected", reviewedBy: req.user!.id, reviewedAt: new Date(), rejectionReason: parsed.data.reason ?? null }).where(eq(bookPurchasesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Purchase not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_PURCHASE_REJECTED", entity: "book_purchase", entityId: row.id });
  res.json(serializeBookPurchase(row));
});

// Suspend: cuts the student's access to the book (resolveBookAccess only
// treats status "approved" as owned) without losing the payment record —
// use this for a chargeback, a shared-account concern, etc. Reactivate
// undoes it. Both only apply to a purchase that was actually approved.
router.post("/admin/book-purchases/:id/suspend", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ reason: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [existing] = await db.select().from(bookPurchasesTable).where(eq(bookPurchasesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Purchase not found" }); return; }
  if (existing.status !== "approved") { res.status(400).json({ error: "Only an approved purchase can be suspended." }); return; }
  const [row] = await db.update(bookPurchasesTable).set({ status: "suspended", reviewedBy: req.user!.id, reviewedAt: new Date(), rejectionReason: parsed.data.reason ?? null }).where(eq(bookPurchasesTable.id, id)).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_PURCHASE_SUSPENDED", entity: "book_purchase", entityId: row.id });
  res.json(serializeBookPurchase(row));
});

router.post("/admin/book-purchases/:id/reactivate", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid purchase id" }); return; }
  const [existing] = await db.select().from(bookPurchasesTable).where(eq(bookPurchasesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Purchase not found" }); return; }
  if (existing.status !== "suspended") { res.status(400).json({ error: "Only a suspended purchase can be reactivated." }); return; }
  const [row] = await db.update(bookPurchasesTable).set({ status: "approved", reviewedBy: req.user!.id, reviewedAt: new Date(), rejectionReason: null }).where(eq(bookPurchasesTable.id, id)).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "BOOK_PURCHASE_REACTIVATED", entity: "book_purchase", entityId: row.id });
  res.json(serializeBookPurchase(row));
});

// Hard delete — removes the row entirely (e.g. a test/duplicate/fraudulent
// submission that shouldn't remain in the queue at all). Unlike suspend this
// can't be undone, so it's logged with a snapshot of what was deleted.
router.delete("/admin/book-purchases/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid purchase id" }); return; }
  const [deleted] = await db.delete(bookPurchasesTable).where(eq(bookPurchasesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Purchase not found" }); return; }
  await db.insert(auditLogsTable).values({
    actorId: req.user!.id, action: "BOOK_PURCHASE_DELETED", entity: "book_purchase", entityId: id,
    metadata: JSON.stringify({ userId: deleted.userId, bookId: deleted.bookId, bookTitle: deleted.bookTitle, status: deleted.status, amount: deleted.amount, currency: deleted.currency }),
  });
  res.json({ ok: true });
});

export default router;

import { and, eq } from "drizzle-orm";
import { db, booksTable, bookPurchasesTable } from "@workspace/db";
import { isAdminRole } from "../middlewares/auth";
import { getStudentTargeting, getVisibleModuleIds, isTargetVisible } from "./contentVisibility";
import { trialGrantsAccess } from "./trial";

type BookRow = typeof booksTable.$inferSelect;
export type BookAccess = { ok: true; book: BookRow } | { ok: false; status: 403 | 404; error: string };

/**
 * Can this user read this book in the secure reader? The same rules the
 * /books listing uses to decide `locked` — visible to their program/year,
 * free, OR bought (approved purchase), OR opened by the trial's "Paid books"
 * toggle — kept in one place so the reader can never be more generous than the
 * library. Admins read anything, including archived books.
 */
export async function resolveBookAccess(user: { id: number; role: string }, bookId: number): Promise<BookAccess> {
  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
  if (!book) return { ok: false, status: 404, error: "Book not found" };
  if (isAdminRole(user.role)) return { ok: true, book };
  if (!book.active) return { ok: false, status: 404, error: "Book not found" };

  const targeting = await getStudentTargeting(user.id);
  const visibleModuleIds = await getVisibleModuleIds(targeting);
  const visible = book.programTargetKind !== null || book.yearTargetNumber !== null
    ? isTargetVisible(book.programTargetKind, book.yearTargetNumber, targeting)
    : book.moduleId === null || visibleModuleIds.includes(book.moduleId);
  if (!visible) return { ok: false, status: 404, error: "Book not found" };

  if (book.isFree) return { ok: true, book };
  const [approved] = await db.select({ id: bookPurchasesTable.id }).from(bookPurchasesTable)
    .where(and(eq(bookPurchasesTable.userId, user.id), eq(bookPurchasesTable.bookId, book.id), eq(bookPurchasesTable.status, "approved")));
  if (approved) return { ok: true, book };
  if (await trialGrantsAccess(user.id, "books")) return { ok: true, book };
  return { ok: false, status: 403, error: "You don't have access to this book yet." };
}

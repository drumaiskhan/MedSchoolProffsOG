// One-off migration for fix-notes section 7: before local-disk storage was
// removed, uploadFile() could silently fall back to writing under this
// server's local uploads/ directory when Supabase wasn't configured — and
// that directory is wiped on every redeploy/restart on this app's hosts
// (Render/Railway/Netlify functions all do this). Any row still holding a
// "local:"-prefixed storage path is pointing at a file that is almost
// certainly already gone.
//
// This script can't un-delete those files — they're gone. What it CAN do:
// find every remaining "local:" row so you know exactly what needs
// re-uploading, and clear the dead path (set it to null) so the frontend's
// existing "no cover / no photo" empty-state renders instead of a broken
// image tag pointing at a URL that 404s forever.
//
// Run once with: pnpm --filter scripts exec tsx src/migrate-local-storage.ts
import { db, booksTable, resourcesTable, teamMembersTable, usersTable, paymentsTable, mcqsTable } from "@workspace/db";
import { like, or } from "drizzle-orm";

const LOCAL_PREFIX = "local:";

async function main() {
  const report: Array<{ table: string; id: number; column: string; path: string }> = [];

  // med_books: storagePath (the PDF itself) and coverImagePath
  const books = await db.select().from(booksTable).where(or(like(booksTable.storagePath, `${LOCAL_PREFIX}%`), like(booksTable.coverImagePath, `${LOCAL_PREFIX}%`)));
  for (const row of books) {
    if (row.storagePath?.startsWith(LOCAL_PREFIX)) report.push({ table: "med_books", id: row.id, column: "storagePath", path: row.storagePath });
    if (row.coverImagePath?.startsWith(LOCAL_PREFIX)) {
      report.push({ table: "med_books", id: row.id, column: "coverImagePath", path: row.coverImagePath });
      await db.update(booksTable).set({ coverImagePath: null }).where(like(booksTable.coverImagePath, `${LOCAL_PREFIX}%`));
    }
  }
  // Deliberately NOT clearing storagePath (the PDF itself) — a book with no
  // file at all is worse than one pointing at a dead link, since clearing it
  // would silently make the book "exist" with nothing to open. Left as-is
  // for you to re-upload; the report below tells you which ones need it.

  // med_resources
  const resources = await db.select().from(resourcesTable).where(like(resourcesTable.storagePath, `${LOCAL_PREFIX}%`));
  for (const row of resources) report.push({ table: "med_resources", id: row.id, column: "storagePath", path: row.storagePath ?? "" });
  // Same reasoning as books.storagePath above — left for manual re-upload.

  // med_team_members.photoPath — safe to null out, it's a "nice to have" photo
  const team = await db.select().from(teamMembersTable).where(like(teamMembersTable.photoPath, `${LOCAL_PREFIX}%`));
  for (const row of team) report.push({ table: "med_team_members", id: row.id, column: "photoPath", path: row.photoPath ?? "" });
  if (team.length) await db.update(teamMembersTable).set({ photoPath: null }).where(like(teamMembersTable.photoPath, `${LOCAL_PREFIX}%`));

  // usersTable.profilePicturePath — safe to null out
  const users = await db.select().from(usersTable).where(like(usersTable.profilePicturePath, `${LOCAL_PREFIX}%`));
  for (const row of users) report.push({ table: "users", id: row.id, column: "profilePicturePath", path: row.profilePicturePath ?? "" });
  if (users.length) await db.update(usersTable).set({ profilePicturePath: null }).where(like(usersTable.profilePicturePath, `${LOCAL_PREFIX}%`));

  // med_payments.proofPath — do NOT null this out. A payment proof is
  // financial evidence tied to an approval decision; silently clearing it
  // would erase the audit trail for why a payment was approved. Report only.
  const payments = await db.select().from(paymentsTable).where(like(paymentsTable.proofPath, `${LOCAL_PREFIX}%`));
  for (const row of payments) report.push({ table: "med_payments", id: row.id, column: "proofPath", path: row.proofPath ?? "" });

  // med_mcqs.imagePath — safe to null out (question still has its text)
  const mcqs = await db.select().from(mcqsTable).where(like(mcqsTable.imagePath, `${LOCAL_PREFIX}%`));
  for (const row of mcqs) report.push({ table: "med_mcqs", id: row.id, column: "imagePath", path: row.imagePath ?? "" });
  if (mcqs.length) await db.update(mcqsTable).set({ imagePath: null }).where(like(mcqsTable.imagePath, `${LOCAL_PREFIX}%`));

  if (!report.length) {
    console.log("No local:-prefixed storage paths found. Nothing to do.");
  } else {
    console.log(`Found ${report.length} row(s) with dead local: storage paths:\n`);
    for (const r of report) console.log(`  ${r.table}#${r.id}.${r.column} = ${r.path}`);
    console.log(
      "\nCleared the ones that are safe to blank (team photos, profile pictures, MCQ images).\n" +
      "Left book files, resource files, and payment proofs as-is — those need a real re-upload " +
      "(book/resource files) or should never be silently cleared (payment proofs, for audit-trail reasons).",
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

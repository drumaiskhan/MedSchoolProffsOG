// One-time data-integrity cleanup for the "Subscribed students" over-count
// bug (fix-notes section 10): historically, approving a second payment for
// an already-subscribed student could leave multiple simultaneously-ACTIVE
// rows in med_memberships for the same user. POST /payments/:id/approve and
// the manual grant path now supersede prior ACTIVE rows going forward, but
// existing duplicates need a one-time cleanup so the dashboard count is
// correct retroactively too.
//
// Run once with: pnpm --filter scripts exec tsx src/deduplicate-active-memberships.ts
import { db, membershipsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";

async function main() {
  const activeRows = await db.select().from(membershipsTable).where(eq(membershipsTable.status, "ACTIVE"));
  const byUser = new Map<number, typeof activeRows>();
  for (const row of activeRows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  let superseded = 0;
  for (const [userId, rows] of byUser) {
    if (rows.length <= 1) continue;
    // Keep the row with the latest expiresAt, supersede the rest.
    const sorted = [...rows].sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
    const [, ...stale] = sorted;
    for (const row of stale) {
      await db.update(membershipsTable).set({ status: "SUPERSEDED" }).where(and(eq(membershipsTable.id, row.id), eq(membershipsTable.status, "ACTIVE")));
      superseded += 1;
    }
    console.log(`user ${userId}: kept membership ${sorted[0].id}, superseded ${stale.length} duplicate(s)`);
  }
  console.log(`Done. Superseded ${superseded} duplicate ACTIVE membership row(s) across ${byUser.size} user(s) checked.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { auditLogsTable, db, usersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/admin/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is number => id !== null))];
  const actors = actorIds.length ? await db.select().from(usersTable) : [];
  const actorMap = new Map(actors.filter((a) => actorIds.includes(a.id)).map((a) => [a.id, a.name]));
  res.json(rows.map((row) => ({ ...row, actorName: row.actorId ? actorMap.get(row.actorId) ?? "Unknown" : "System" })));
});

export default router;

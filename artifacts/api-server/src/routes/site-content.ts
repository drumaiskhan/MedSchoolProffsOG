import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, teamMembersTable, auditLogsTable } from "@workspace/db";
import { requireAdmin, isAdminRole } from "../middlewares/auth";
import { getAllSettings } from "../lib/settings";
import { resolveFileUrl } from "../lib/storage";

const router: IRouter = Router();

const SITE_CONTENT_KEYS = [
  "PLATFORM_NAME",
  "PLATFORM_TAGLINE",
  "PLATFORM_DESCRIPTION",
  "SOCIAL_FACEBOOK",
  "SOCIAL_YOUTUBE",
  "SOCIAL_LINKEDIN",
  "SOCIAL_INSTAGRAM",
  "CONTACT_EMAIL",
  "CONTACT_LOCATION",
  "SUPPORT_WHATSAPP",
  "SUPPORT_HOURS",
  "COPYRIGHT_NOTICE",
  "FEATURES_LIST",
  "QUICK_LINKS",
  "SITE_FAVICON_PATH",
] as const;

function teamView(member: typeof teamMembersTable.$inferSelect) {
  return { ...member, photoPath: resolveFileUrl(member.photoPath) ?? member.photoPath };
}

// Bundles everything the footer / about page needs in one request.
router.get("/site-content", async (req, res): Promise<void> => {
  const isAdmin = req.user && (isAdminRole(req.user.role));
  const settings = await getAllSettings();
  const content: Record<string, string> = {};
  for (const key of SITE_CONTENT_KEYS) content[key] = settings[key] ?? "";

  let features: string[] = [];
  let quickLinks: Array<{ label: string; url: string }> = [];
  try { features = JSON.parse(content.FEATURES_LIST || "[]"); } catch { features = []; }
  try { quickLinks = JSON.parse(content.QUICK_LINKS || "[]"); } catch { quickLinks = []; }

  const team = await db.select().from(teamMembersTable).where(isAdmin ? undefined : eq(teamMembersTable.active, true)).orderBy(teamMembersTable.displayOrder);

  const faviconUrl = resolveFileUrl(content.SITE_FAVICON_PATH) ?? null;
  res.json({ ...content, features, quickLinks, team: team.map(teamView), faviconUrl });
});

// ---------------------------------------------------------------------------
// Team members — admin CRUD
// ---------------------------------------------------------------------------

const TeamMemberBody = z.object({
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  bio: z.string().max(1000).optional(),
  achievementBadge: z.string().max(120).optional(),
  photoPath: z.string().max(500).optional(),
  linkedinUrl: z.string().max(300).optional(),
  instagramUrl: z.string().max(300).optional(),
  email: z.string().max(200).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

router.post("/admin/team-members", requireAdmin, async (req, res): Promise<void> => {
  const parsed = TeamMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(teamMembersTable).values({ ...parsed.data, active: parsed.data.active ?? true }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "TEAM_MEMBER_CREATED", entity: "team_member", entityId: row.id });
  res.status(201).json(teamView(row));
});

router.patch("/admin/team-members/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = TeamMemberBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.update(teamMembersTable).set(parsed.data).where(eq(teamMembersTable.id, Number(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Team member not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "TEAM_MEMBER_UPDATED", entity: "team_member", entityId: row.id });
  res.json(teamView(row));
});

router.delete("/admin/team-members/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(teamMembersTable).set({ active: false }).where(eq(teamMembersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Team member not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "TEAM_MEMBER_ARCHIVED", entity: "team_member", entityId: row.id });
  res.json({ ok: true });
});

// Hard delete — only for a member already hidden (the DELETE above sets
// active:false; "Hidden" via the visibility toggle and "removed" via that
// same endpoint were previously indistinguishable, which made the old
// "Remove" button misleading — it never actually removed anyone from this
// list). This is the real, unrecoverable removal.
router.delete("/admin/team-members/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid team member id" }); return; }
  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, id));
  if (!member) { res.status(404).json({ error: "Team member not found" }); return; }
  if (member.active) { res.status(400).json({ error: "Hide this team member before permanently deleting them." }); return; }
  await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "TEAM_MEMBER_PERMANENTLY_DELETED", entity: "team_member", entityId: id });
  res.json({ ok: true });
});

router.get("/admin/team-members", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(teamMembersTable).orderBy(teamMembersTable.displayOrder);
  res.json(rows.map(teamView));
});

export default router;

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, teamMembersTable, auditLogsTable } from "@workspace/db";
import { requireAdmin, isAdminRole } from "../middlewares/auth";
import { getAllSettings, THEME_KEYS, DEFAULT_THEME } from "../lib/settings";
import { resolveFileUrl } from "../lib/storage";
import { getTrialConfig, publicTrialView } from "../lib/trial";

const router: IRouter = Router();

const SITE_CONTENT_KEYS = [
  "PLATFORM_NAME",
  "PLATFORM_TAGLINE",
  "PLATFORM_DESCRIPTION",
  // SEO — see the matching comment in settings.ts's EDITABLE_KEYS. Public
  // on purpose: this is exactly what needs to reach signed-out visitors
  // and search engines.
  "SEO_TITLE",
  "SEO_DESCRIPTION",
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
  // Read by the student SideNav to decide whether to show the "AI
  // Visualizer" link — public/authenticated-student-visible by design,
  // same as everything else in this list.
  "AI_VISUALIZER_ENABLED",
  // Public so Practice.tsx / Flashcards.tsx (and anything else reusing
  // those screens, e.g. past-paper practice) can decide whether to render
  // the "Ask AI to explain differently" button. Same reasoning and same
  // "false" = off / anything else = on convention as AI_VISUALIZER_ENABLED
  // above. See routes/settings.ts for the full comment.
  "AI_EXPLAIN_ENABLED",
  // General Trial Mode — public/student-visible (same reasoning as
  // AI_VISUALIZER_ENABLED above) so the student app can show a banner
  // while it's on. The actual access grant is enforced server-side in
  // requireActiveMembership (middlewares/auth.ts), not by this flag being
  // readable — a student can't unlock anything just by knowing this value.
  "GLOBAL_TRIAL_MODE",
  // Scoping for GLOBAL_TRIAL_MODE — see routes/settings.ts's comment on
  // these same two keys. Public for the same reason GLOBAL_TRIAL_MODE
  // itself is: only used here to word the trial banner correctly (e.g.
  // "for MBBS · 3rd Year" vs "for every student"), the actual grant is
  // still enforced server-side in requireActiveMembership.
  "GLOBAL_TRIAL_PROGRAM",
  "GLOBAL_TRIAL_YEAR",
  "GLOBAL_TRIAL_YEARS",
  "GLOBAL_TRIAL_FEATURES",
  "GLOBAL_TRIAL_ENDS_AT",
  // Bug fix: admin's Settings > General page has always had an
  // "Announcement banner (blank to hide)" field, but this key was never
  // added to the public bundle the student app actually fetches — so
  // whatever an admin typed there had nowhere to go and the banner never
  // showed up anywhere. Public/student-visible by design, same as
  // GLOBAL_TRIAL_MODE above (it's just announcement text, not a
  // permission — nothing is gated by this being readable).
  "ANNOUNCEMENT_BANNER",
  // Optional decorative photo for the student Dashboard's greeting card —
  // public (not admin-gated) since students need to see it, resolved to
  // dashboardHeroImageUrl below the same way SITE_FAVICON_PATH resolves to
  // faviconUrl.
  "DASHBOARD_HERO_IMAGE_PATH",
  // Design & Branding — public on purpose (see lib/settings.ts) so /login,
  // /register, and any other signed-out page render with the saved colors
  // instead of falling back to the shipped defaults only.
  ...THEME_KEYS,
] as const;

// The only three groups team members can be shown under (see
// teamMembersTable.category) — deliberately not "Professors" or any other
// open-ended label, per the initial ask.
export const TEAM_CATEGORIES = ["reviewer", "question_setter", "ownership"] as const;
export type TeamCategory = (typeof TEAM_CATEGORIES)[number];

function teamView(member: typeof teamMembersTable.$inferSelect) {
  return { ...member, photoPath: resolveFileUrl(member.photoPath) };
}

// Bundles everything the footer / about page needs in one request.
router.get("/site-content", async (req, res): Promise<void> => {
  const isAdmin = req.user && (isAdminRole(req.user.role));
  const settings = await getAllSettings();
  const content: Record<string, string> = {};
  for (const key of SITE_CONTENT_KEYS) content[key] = settings[key] || ((THEME_KEYS as readonly string[]).includes(key) ? DEFAULT_THEME[key as keyof typeof DEFAULT_THEME] : "");

  let features: string[] = [];
  let quickLinks: Array<{ label: string; url: string }> = [];
  try { features = JSON.parse(content.FEATURES_LIST || "[]"); } catch { features = []; }
  try { quickLinks = JSON.parse(content.QUICK_LINKS || "[]"); } catch { quickLinks = []; }

  const team = await db.select().from(teamMembersTable).where(isAdmin ? undefined : eq(teamMembersTable.active, true)).orderBy(teamMembersTable.displayOrder);

  const faviconUrl = resolveFileUrl(content.SITE_FAVICON_PATH) ?? null;
  const dashboardHeroImageUrl = resolveFileUrl(content.DASHBOARD_HERO_IMAGE_PATH) ?? null;
  // Resolved trial view (defaults applied, end date honoured) — what the
  // student app should actually read; the flat GLOBAL_TRIAL_* strings above
  // are only the raw saved values. Enforcement is server-side either way.
  const trial = publicTrialView(await getTrialConfig());
  res.json({ ...content, features, quickLinks, team: team.map(teamView), faviconUrl, dashboardHeroImageUrl, trial });
});

// ---------------------------------------------------------------------------
// Team members — admin CRUD
// ---------------------------------------------------------------------------

const TeamMemberBody = z.object({
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  category: z.enum(TEAM_CATEGORIES).optional(),
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

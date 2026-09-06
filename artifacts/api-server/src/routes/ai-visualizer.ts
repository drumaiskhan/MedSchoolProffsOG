import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db, aiVisualizerLogsTable, usersTable } from "@workspace/db";
import { requireAuth, requireActiveMembership, requireAdmin } from "../middlewares/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { generateVisualization, explainStep, AiNotConfiguredError, InvalidVisualizationError } from "../lib/aiVisualizer";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Student: generate a visualization
// ---------------------------------------------------------------------------

const VisualizerBody = z.object({ prompt: z.string().min(3).max(500) });

router.post("/ai/visualizer", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const parsed = VisualizerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "A prompt is required" }); return; }

  const limit = checkRateLimit(`ai-visualizer:${req.user!.id}`, 10, 10 * 60 * 1000); // 10 generations / 10 min / student
  if (!limit.allowed) { res.status(429).json({ error: "You're generating visualizations too quickly. Try again in a minute." }); return; }

  try {
    const visualization = await generateVisualization(parsed.data.prompt);
    await db.insert(aiVisualizerLogsTable).values({ userId: req.user!.id, prompt: parsed.data.prompt, status: "success", visualizationType: visualization.type });
    res.json({ visualization });
  } catch (err) {
    const errorMessage = err instanceof AiNotConfiguredError ? err.message : err instanceof InvalidVisualizationError ? "Invalid AI output" : (err instanceof Error ? err.message.slice(0, 300) : "Unknown error");
    await db.insert(aiVisualizerLogsTable).values({ userId: req.user!.id, prompt: parsed.data.prompt, status: "error", errorMessage });
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: err.message }); return; }
    if (err instanceof InvalidVisualizationError) { res.status(502).json({ error: "The AI produced an unusable visualization. Try rephrasing your prompt or regenerating." }); return; }
    res.status(502).json({ error: "Couldn't generate a visualization right now. Try again shortly." });
  }
});

// ---------------------------------------------------------------------------
// Student: explain one step further (not logged — high-frequency follow-up,
// same trust tier as ask-ai, not the thing admins need to review)
// ---------------------------------------------------------------------------

const ExplainStepBody = z.object({ overallTitle: z.string().max(160), stepTitle: z.string().max(120), stepDescription: z.string().max(600) });

router.post("/ai/visualizer/explain-step", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const parsed = ExplainStepBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid step" }); return; }
  const limit = checkRateLimit(`ai-visualizer-explain:${req.user!.id}`, 20, 10 * 60 * 1000);
  if (!limit.allowed) { res.status(429).json({ error: "Too many requests. Try again shortly." }); return; }
  try {
    const explanation = await explainStep(parsed.data.stepTitle, parsed.data.stepDescription, parsed.data.overallTitle);
    res.json({ explanation });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) { res.status(503).json({ error: err.message }); return; }
    res.status(502).json({ error: "Couldn't generate an explanation right now." });
  }
});

// ---------------------------------------------------------------------------
// Admin: read-only activity log (what students are generating)
// ---------------------------------------------------------------------------

router.get("/admin/ai-visualizer-logs", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db.select().from(aiVisualizerLogsTable).orderBy(desc(aiVisualizerLogsTable.createdAt)).limit(limit);
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length ? await db.select().from(usersTable) : [];
  const userMap = new Map(users.filter((u) => userIds.includes(u.id)).map((u) => [u.id, { name: u.name, email: u.email }]));
  res.json(rows.map((row) => ({ ...row, student: userMap.get(row.userId) ?? { name: "Unknown", email: "—" } })));
});

export default router;

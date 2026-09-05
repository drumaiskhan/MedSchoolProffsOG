import { Router, type IRouter } from "express";
import { and, desc, eq, gte, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ApprovePaymentParams,
  ApprovePaymentResponse,
  CreateMcqBody,
  CreateMcqResponse,
  CreateMembershipPlanBody,
  CreateMembershipPlanResponse,
  CreateModuleBody,
  CreateModuleResponse,
  GetAdminDashboardResponse,
  GetStudentDashboardResponse,
  ListFlashcardsResponse,
  ListFlashcardsQueryParams,
  ListMcqsQueryParams,
  ListMcqsResponse,
  ListMembershipPlansResponse,
  ListModulesQueryParams,
  ListModulesResponse,
  ListNotificationsResponse,
  ListPaymentsQueryParams,
  ListPaymentsResponse,
  ListResourcesQueryParams,
  ListResourcesResponse,
  ListStudentsQueryParams,
  ListStudentsResponse,
  ListSubjectsQueryParams,
  ListSubjectsResponse,
  ListTopicsQueryParams,
  ListTopicsResponse,
  RejectPaymentBody,
  RejectPaymentParams,
  RejectPaymentResponse,
  SubmitPaymentBody,
  UpdateMembershipPlanBody,
  UpdateMembershipPlanParams,
  UpdateMembershipPlanResponse,
} from "@workspace/api-zod";
import {
  db,
  usersTable,
  membershipPlansTable,
  paymentsTable,
  membershipsTable,
  modulesTable,
  subjectsTable,
  practiceAttemptsTable,
  topicsTable,
  mcqsTable,
  flashcardsTable,
  resourcesTable,
  notificationsTable,
  auditLogsTable,
  academicYearsTable,
  batchesTable,
  emailVerificationTokensTable,
  passwordResetTokensTable,
  studentDocumentsTable,
  studentProgressTable,
  examAttemptsTable,
  notebookEntriesTable,
  savedSessionsTable,
  flaggedMcqsTable,
  feedbackTable,
  practiceAnswersTable,
  examAnswersTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, requireActiveMembership, isAdminRole } from "../middlewares/auth";
import { getStudentTargeting, getVisibleModuleIds, describeModuleTargeting } from "../lib/contentVisibility";
import { resolveFileUrl } from "../lib/storage";
import { sendEmail, membershipActivatedEmailHtml } from "../lib/email";

const router: IRouter = Router();

// Shared count helpers so module/subject cards never drift out of sync with
// hardcoded 0s again (see section 4 of the fix notes).
async function getModuleCounts(moduleId: number): Promise<{ subjectCount: number; topicCount: number }> {
  const [subjectCount] = await db.select({ count: sql<number>`count(*)` }).from(subjectsTable).where(eq(subjectsTable.moduleId, moduleId));
  const [topicCount] = await db.select({ count: sql<number>`count(*)` }).from(topicsTable).innerJoin(subjectsTable, eq(topicsTable.subjectId, subjectsTable.id)).where(eq(subjectsTable.moduleId, moduleId));
  return { subjectCount: Number(subjectCount?.count ?? 0), topicCount: Number(topicCount?.count ?? 0) };
}

async function getSubjectTopicCount(subjectId: number): Promise<number> {
  const [topicCount] = await db.select({ count: sql<number>`count(*)` }).from(topicsTable).where(eq(topicsTable.subjectId, subjectId));
  return Number(topicCount?.count ?? 0);
}

function planView(plan: typeof membershipPlansTable.$inferSelect) {
  return { ...plan, price: Number(plan.price), originalPrice: plan.originalPrice !== null ? Number(plan.originalPrice) : null };
}

async function userView(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    institution: user.institution,
    program: user.program,
  };
}

async function paymentView(payment: typeof paymentsTable.$inferSelect) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId));
  const [academicYear] = user?.academicYearId ? await db.select().from(academicYearsTable).where(eq(academicYearsTable.id, user.academicYearId)) : [];
  const [batch] = user?.batchId ? await db.select().from(batchesTable).where(eq(batchesTable.id, user.batchId)) : [];
  return {
    id: payment.id,
    studentName: user?.name ?? "Unknown",
    institution: user?.institution ?? "—",
    program: user?.program ?? "—",
    academicYear: academicYear?.label ?? "—",
    batch: batch?.label ?? "—",
    rollNumber: user?.rollNumber ?? "—",
    planName: payment.planName,
    amount: Number(payment.amount),
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    paymentDate: payment.paymentDate,
    proofPath: resolveFileUrl(payment.proofPath) ?? payment.proofPath,
    status: payment.status,
    submittedAt: payment.createdAt.toISOString(),
  };
}

router.get("/student/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [moduleRows, notificationRows, membership, user, weeklyAttempts, topicAttemptRows, [streakRow]] = await Promise.all([
    db.select().from(modulesTable).where(eq(modulesTable.active, true)).orderBy(modulesTable.displayOrder),
    db.select().from(notificationsTable).where(or(eq(notificationsTable.userId, userId), sql`${notificationsTable.userId} IS NULL`)).orderBy(desc(notificationsTable.createdAt)).limit(4),
    db.select().from(membershipsTable).where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.status, "ACTIVE"))).orderBy(desc(membershipsTable.expiresAt)).limit(1),
    userView(userId),
    // "Weekly goal" progress: number of practice sessions completed in the
    // last 7 days (the frontend shows this against a fixed target of 5).
    db.select({ count: sql<number>`count(*)` }).from(practiceAttemptsTable).where(and(eq(practiceAttemptsTable.userId, userId), gte(practiceAttemptsTable.createdAt, weekAgo))),
    // Distinct topics this student has attempted at least once, per module —
    // used as a simple "coverage" progress metric until spaced-repetition
    // mastery tracking exists. Joined through topics/subjects rather than
    // trusting practiceAttemptsTable.moduleId, since Practice only ever
    // sends topicId today.
    db.selectDistinct({ moduleId: subjectsTable.moduleId, topicId: practiceAttemptsTable.topicId })
      .from(practiceAttemptsTable)
      .innerJoin(topicsTable, eq(topicsTable.id, practiceAttemptsTable.topicId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, topicsTable.subjectId))
      .where(and(eq(practiceAttemptsTable.userId, userId), sql`${practiceAttemptsTable.topicId} IS NOT NULL`)),
    // userView() is a deliberately limited public projection that doesn't
    // include streak fields — fetch separately rather than widen it.
    db.select({ currentStreak: usersTable.currentStreak }).from(usersTable).where(eq(usersTable.id, userId)),
  ]);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const attemptedTopicsByModule = new Map<number, Set<number>>();
  for (const row of topicAttemptRows) {
    if (row.moduleId == null || row.topicId == null) continue;
    if (!attemptedTopicsByModule.has(row.moduleId)) attemptedTopicsByModule.set(row.moduleId, new Set());
    attemptedTopicsByModule.get(row.moduleId)!.add(row.topicId);
  }

  let totalTopics = 0;
  let totalAttemptedTopics = 0;
  const modules = await Promise.all(moduleRows.map(async (module) => {
    const [subjectCount] = await db.select({ count: sql<number>`count(*)` }).from(subjectsTable).where(eq(subjectsTable.moduleId, module.id));
    const [topicCount] = await db.select({ count: sql<number>`count(*)` }).from(topicsTable).innerJoin(subjectsTable, eq(topicsTable.subjectId, subjectsTable.id)).where(eq(subjectsTable.moduleId, module.id));
    const topics = Number(topicCount?.count ?? 0);
    const attempted = attemptedTopicsByModule.get(module.id)?.size ?? 0;
    totalTopics += topics;
    totalAttemptedTopics += attempted;
    return { id: module.id, name: module.name, subtitle: module.subtitle, subjectCount: Number(subjectCount?.count ?? 0), topicCount: topics, progress: topics ? Math.round((attempted / topics) * 100) : 0, active: module.active };
  }));

  const activeMembership = membership[0];

  res.json(GetStudentDashboardResponse.parse({
    user,
    membershipStatus: activeMembership ? "ACTIVE" : "INACTIVE",
    membershipExpiry: activeMembership ? activeMembership.expiresAt.toISOString() : null,
    progress: totalTopics ? Math.round((totalAttemptedTopics / totalTopics) * 100) : 0,
    weeklyGoal: Number(weeklyAttempts[0]?.count ?? 0),
    streak: streakRow?.currentStreak ?? 0,
    modules,
    recentActivity: [],
    notifications: notificationRows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
  }));
});

router.get("/admin/dashboard", requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const [users, payments, activeMemberships, recent] = await Promise.all([
    db.select().from(usersTable).where(and(eq(usersTable.role, "student"), ne(usersTable.status, "DELETED"))),
    db.select().from(paymentsTable),
    // Membership rows are never flipped to EXPIRED by a background job (see
    // the note near the student-status handler below), so a plain
    // status="ACTIVE" count includes memberships whose expiresAt has
    // already passed — the "subscribed students" number would silently
    // drift upward and stop reflecting who's actually subscribed right
    // now. Filtering on expiresAt here keeps it accurate on every refresh.
    db.select().from(membershipsTable).where(and(eq(membershipsTable.status, "ACTIVE"), gte(membershipsTable.expiresAt, now))),
    db.select().from(paymentsTable).where(ne(paymentsTable.status, "VOIDED")).orderBy(desc(paymentsTable.createdAt)).limit(5),
  ]);
  const revenue = payments.filter((item) => item.status === "APPROVED").reduce((sum, item) => sum + Number(item.amount), 0);
  // Count distinct students, not membership rows — a student with two
  // (legacy/duplicate) simultaneously-ACTIVE rows must still only count once,
  // as a defensive guarantee this can never exceed totalStudents even if a
  // future bug reintroduces duplicate ACTIVE rows (see section 10 fix notes).
  const distinctActiveUserIds = new Set(activeMemberships.map((m) => m.userId));
  res.json(GetAdminDashboardResponse.parse({
    totalStudents: users.length,
    activeMembers: distinctActiveUserIds.size,
    pendingPayments: payments.filter((item) => item.status === "PAYMENT_PENDING_REVIEW").length,
    monthlyRevenue: revenue,
    recentPayments: await Promise.all(recent.map(paymentView)),
    studentsByStatus: users.reduce<Record<string, number>>((result, user) => {
      result[user.status] = (result[user.status] ?? 0) + 1;
      return result;
    }, {}),
  }));
});

router.get("/membership-plans", async (req, res): Promise<void> => {
  const includeInactive = req.user && (isAdminRole(req.user.role));
  const plans = await db.select().from(membershipPlansTable).where(includeInactive ? undefined : eq(membershipPlansTable.active, true)).orderBy(membershipPlansTable.displayOrder);
  res.json(ListMembershipPlansResponse.parse(plans.map(planView)));
});

router.post("/membership-plans", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMembershipPlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [plan] = await db.insert(membershipPlansTable).values({
    ...parsed.data,
    price: String(parsed.data.price),
    originalPrice: parsed.data.originalPrice != null ? String(parsed.data.originalPrice) : null,
    discountLabel: parsed.data.discountLabel ?? null,
    active: parsed.data.active ?? true,
    displayOrder: parsed.data.displayOrder ?? 0,
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PLAN_CREATED", entity: "membership_plan", entityId: plan.id });
  res.status(201).json(CreateMembershipPlanResponse.parse(planView(plan)));
});

router.patch("/membership-plans/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateMembershipPlanParams.safeParse(req.params);
  const body = UpdateMembershipPlanBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid membership plan" }); return; }
  const [plan] = await db.update(membershipPlansTable).set({
    ...body.data,
    price: body.data.price === undefined ? undefined : String(body.data.price),
    originalPrice: body.data.originalPrice === undefined ? undefined : (body.data.originalPrice != null ? String(body.data.originalPrice) : null),
  }).where(eq(membershipPlansTable.id, params.data.id)).returning();
  if (!plan) { res.status(404).json({ error: "Membership plan not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PLAN_UPDATED", entity: "membership_plan", entityId: plan.id });
  res.json(UpdateMembershipPlanResponse.parse(planView(plan)));
});

router.delete("/membership-plans/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [plan] = await db.update(membershipPlansTable).set({ active: false, archived: true }).where(eq(membershipPlansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Membership plan not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PLAN_ARCHIVED", entity: "membership_plan", entityId: plan.id });
  res.json(planView(plan));
});

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const params = ListPaymentsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const isAdmin = isAdminRole(req.user!.role);
  const rows = await db.select().from(paymentsTable).where(isAdmin ? undefined : eq(paymentsTable.userId, req.user!.id)).orderBy(desc(paymentsTable.createdAt));
  const filtered = rows.filter((row) => (params.data.status ? row.status === params.data.status : row.status !== "VOIDED") && (!params.data.search || row.reference.toLowerCase().includes(params.data.search.toLowerCase())));
  res.json(ListPaymentsResponse.parse(await Promise.all(filtered.map(paymentView))));
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = SubmitPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [plan] = await db.select().from(membershipPlansTable).where(and(eq(membershipPlansTable.id, parsed.data.planId), eq(membershipPlansTable.active, true)));
  if (!plan) { res.status(400).json({ error: "Selected plan is not available" }); return; }
  const [payment] = await db.insert(paymentsTable).values({
    userId: req.user!.id, planId: plan.id, planName: plan.name, amount: plan.price, currency: plan.currency,
    duration: plan.duration, durationUnit: plan.durationUnit, method: parsed.data.method, reference: parsed.data.reference,
    paymentDate: parsed.data.paymentDate, proofPath: parsed.data.proofPath ?? null, status: "PAYMENT_PENDING_REVIEW",
  }).returning();
  await db.update(usersTable).set({ status: "PAYMENT_PENDING_REVIEW" }).where(eq(usersTable.id, req.user!.id));
  res.status(201).json(await paymentView(payment));
});

router.post("/payments/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const params = ApprovePaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment || payment.status !== "PAYMENT_PENDING_REVIEW") { res.status(409).json({ error: "Payment is not awaiting review" }); return; }
  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  if (payment.durationUnit === "years") expiresAt.setFullYear(expiresAt.getFullYear() + payment.duration);
  else if (payment.durationUnit === "months") expiresAt.setMonth(expiresAt.getMonth() + payment.duration);
  else expiresAt.setDate(expiresAt.getDate() + payment.duration);
  const [updated] = await db.update(paymentsTable).set({ status: "APPROVED", reviewedBy: req.user!.id, reviewedAt: new Date() }).where(eq(paymentsTable.id, payment.id)).returning();
  // Supersede any previously-active membership row(s) for this student before
  // inserting the new one, so a renewal/duplicate approval never leaves two
  // simultaneously-ACTIVE rows (see section 10 of the fix notes — this was
  // the root cause of "subscribed students" over-counting).
  await db.update(membershipsTable).set({ status: "SUPERSEDED" }).where(and(eq(membershipsTable.userId, payment.userId), eq(membershipsTable.status, "ACTIVE")));
  await db.insert(membershipsTable).values({ userId: payment.userId, paymentId: payment.id, planId: payment.planId, status: "ACTIVE", startsAt, expiresAt });
  await db.update(usersTable).set({ status: "ACTIVE" }).where(eq(usersTable.id, payment.userId));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAYMENT_APPROVED", entity: "payment", entityId: payment.id });
  await db.insert(notificationsTable).values({ userId: payment.userId, title: "Membership activated", body: "Your payment was verified. Your study access is now active.", type: "success" });

  const [student] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, payment.userId));
  if (student) {
    void sendEmail(student.email, "Your MedschoolProffs membership is active", membershipActivatedEmailHtml(student.name, payment.planName, expiresAt)).catch(() => {});
  }

  res.json(ApprovePaymentResponse.parse(await paymentView(updated)));
});

router.post("/payments/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const params = RejectPaymentParams.safeParse(req.params);
  const body = RejectPaymentBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "A rejection reason is required" }); return; }
  const [updated] = await db.update(paymentsTable).set({ status: "REJECTED", rejectionReason: body.data.reason, reviewedBy: req.user!.id, reviewedAt: new Date() }).where(eq(paymentsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Payment not found" }); return; }
  await db.update(usersTable).set({ status: "REJECTED" }).where(eq(usersTable.id, updated.userId));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAYMENT_REJECTED", entity: "payment", entityId: updated.id, metadata: JSON.stringify({ reason: body.data.reason }) });
  await db.insert(notificationsTable).values({ userId: updated.userId, title: "Payment needs attention", body: body.data.reason, type: "warning" });
  res.json(RejectPaymentResponse.parse(await paymentView(updated)));
});

// Void an erroneously-entered payment. Kept as a row (status VOIDED) rather
// than hard-deleted so the audit trail and any already-activated membership
// remain inspectable; it's simply excluded from the default admin queue view.
router.delete("/payments/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid payment id" }); return; }
  const [updated] = await db.update(paymentsTable).set({ status: "VOIDED", reviewedBy: req.user!.id, reviewedAt: new Date() }).where(eq(paymentsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Payment not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAYMENT_VOIDED", entity: "payment", entityId: updated.id });
  res.json({ ok: true });
});

// Hard delete — only for payments already VOIDED (the route above), so a
// pending/approved/rejected submission can't be erased by accident. Clears
// the paymentId back-reference on any membership it created (the
// membership itself is untouched, same as the void endpoint) before
// removing the row.
router.delete("/payments/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid payment id" }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  await db.update(membershipsTable).set({ paymentId: null }).where(eq(membershipsTable.paymentId, id));
  await db.delete(paymentsTable).where(eq(paymentsTable.id, id));

  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "PAYMENT_PERMANENTLY_DELETED", entity: "payment", entityId: id });
  res.json({ ok: true });
});

router.get("/modules", requireAuth, async (req, res): Promise<void> => {
  const params = ListModulesQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const isAdmin = isAdminRole(req.user!.role);
  let visibleIds: number[] | null = null;
  if (!isAdmin) {
    const targeting = await getStudentTargeting(req.user!.id);
    visibleIds = await getVisibleModuleIds(targeting);
  }
  const rows = await db.select().from(modulesTable).where(and(
    params.data.search ? ilike(modulesTable.name, `%${params.data.search}%`) : undefined,
    isAdmin ? undefined : eq(modulesTable.active, true),
    visibleIds ? inArray(modulesTable.id, visibleIds) : undefined,
  )).orderBy(modulesTable.displayOrder);
  const withCounts = await Promise.all(rows.map(async (row) => {
    const counts = await getModuleCounts(row.id);
    return {
      id: row.id, name: row.name, subtitle: row.subtitle, subjectCount: counts.subjectCount, topicCount: counts.topicCount, progress: 0, active: row.active,
      ...(isAdmin ? { programTargetKind: row.programTargetKind, yearTargetNumber: row.yearTargetNumber, targetingLabel: describeModuleTargeting(row.programTargetKind, row.yearTargetNumber) } : {}),
    };
  }));
  res.json(withCounts);
});

const ModuleTargetingFields = { programTargetKind: z.string().max(40).nullable().optional(), yearTargetNumber: z.number().int().min(1).max(5).nullable().optional() };

router.post("/modules", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateModuleBody.and(z.object(ModuleTargetingFields)).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [module] = await db.insert(modulesTable).values({
    name: parsed.data.name, subtitle: parsed.data.subtitle, active: parsed.data.active ?? true,
    programTargetKind: parsed.data.programTargetKind ? parsed.data.programTargetKind.trim().toUpperCase() : null,
    yearTargetNumber: parsed.data.yearTargetNumber ?? null,
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MODULE_CREATED", entity: "module", entityId: module.id });
  res.status(201).json(CreateModuleResponse.parse({ id: module.id, name: module.name, subtitle: module.subtitle, subjectCount: 0, topicCount: 0, progress: 0, active: module.active })); // genuinely 0/0 — brand-new module has no subjects/topics yet
});

router.patch("/modules/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = CreateModuleBody.partial().and(z.object(ModuleTargetingFields)).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid module" }); return; }
  const { programTargetKind, yearTargetNumber, ...rest } = parsed.data;
  const [module] = await db.update(modulesTable).set({
    ...rest,
    ...(programTargetKind !== undefined ? { programTargetKind: programTargetKind ? programTargetKind.trim().toUpperCase() : null } : {}),
    ...(yearTargetNumber !== undefined ? { yearTargetNumber } : {}),
  }).where(eq(modulesTable.id, id)).returning();
  if (!module) { res.status(404).json({ error: "Module not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MODULE_UPDATED", entity: "module", entityId: module.id });
  const moduleCounts = await getModuleCounts(module.id);
  res.json({ id: module.id, name: module.name, subtitle: module.subtitle, subjectCount: moduleCounts.subjectCount, topicCount: moduleCounts.topicCount, progress: 0, active: module.active, programTargetKind: module.programTargetKind, yearTargetNumber: module.yearTargetNumber, targetingLabel: describeModuleTargeting(module.programTargetKind, module.yearTargetNumber) });
});

router.delete("/modules/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [module] = await db.update(modulesTable).set({ active: false, archived: true }).where(eq(modulesTable.id, id)).returning();
  if (!module) { res.status(404).json({ error: "Module not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MODULE_ARCHIVED", entity: "module", entityId: module.id });
  res.json({ ok: true });
});

// Hard delete — only reachable from the "Show archived" list, and only for
// a module that's already archived (the DELETE above). Detaches its
// subjects/topics and un-tags any MCQs/flashcards filed under it (they stay
// in their respective banks, just unassigned) before removing the row, so
// this never orphans a foreign key or silently deletes question content.
router.delete("/modules/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid module id" }); return; }
  const [module] = await db.select().from(modulesTable).where(eq(modulesTable.id, id));
  if (!module) { res.status(404).json({ error: "Module not found" }); return; }

  const subjectRows = await db.select({ id: subjectsTable.id }).from(subjectsTable).where(eq(subjectsTable.moduleId, id));
  const subjectIds = subjectRows.map((s) => s.id);

  await db.update(mcqsTable).set({ moduleId: null, subjectId: null, topicId: null }).where(eq(mcqsTable.moduleId, id));
  await db.update(flashcardsTable).set({ moduleId: null, subjectId: null, topicId: null }).where(eq(flashcardsTable.moduleId, id));
  if (subjectIds.length) await db.delete(topicsTable).where(inArray(topicsTable.subjectId, subjectIds));
  await db.delete(subjectsTable).where(eq(subjectsTable.moduleId, id));
  await db.delete(modulesTable).where(eq(modulesTable.id, id));

  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MODULE_PERMANENTLY_DELETED", entity: "module", entityId: id });
  res.json({ ok: true });
});

router.get("/subjects", requireAuth, async (req, res): Promise<void> => {
  const params = ListSubjectsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const isAdmin = isAdminRole(req.user!.role);
  let visibleIds: number[] | null = null;
  if (!isAdmin) {
    const targeting = await getStudentTargeting(req.user!.id);
    visibleIds = await getVisibleModuleIds(targeting);
    // A requested moduleId the student can't see returns nothing, rather
    // than silently falling back to "all modules" — this is the actual
    // access-control enforcement, not just a UI filter.
    if (params.data.moduleId && !visibleIds.includes(params.data.moduleId)) { res.json([]); return; }
  }
  const rows = await db.select().from(subjectsTable).where(and(
    params.data.moduleId ? eq(subjectsTable.moduleId, params.data.moduleId) : undefined,
    visibleIds ? inArray(subjectsTable.moduleId, visibleIds) : undefined,
  ));
  const topicCounts = new Map<number, number>();
  if (rows.length) {
    const counted = await db.select({ subjectId: topicsTable.subjectId, count: sql<number>`count(*)` }).from(topicsTable)
      .where(inArray(topicsTable.subjectId, rows.map((r) => r.id))).groupBy(topicsTable.subjectId);
    for (const c of counted) topicCounts.set(c.subjectId, Number(c.count));
  }
  res.json(ListSubjectsResponse.parse(rows.map((row) => ({ id: row.id, moduleId: row.moduleId, name: row.name, topicCount: topicCounts.get(row.id) ?? 0 }))));
});

router.post("/subjects", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({ moduleId: z.number().int().positive(), name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "moduleId and name are required" }); return; }
  const [row] = await db.insert(subjectsTable).values(parsed.data).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "SUBJECT_CREATED", entity: "subject", entityId: row.id });
  res.status(201).json({ id: row.id, moduleId: row.moduleId, name: row.name, topicCount: 0 });
});

router.patch("/subjects/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid subject" }); return; }
  const [row] = await db.update(subjectsTable).set(parsed.data).where(eq(subjectsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Subject not found" }); return; }
  res.json({ id: row.id, moduleId: row.moduleId, name: row.name, topicCount: await getSubjectTopicCount(row.id) });
});

router.delete("/subjects/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(subjectsTable).set({ active: false, archived: true }).where(eq(subjectsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Subject not found" }); return; }
  res.json({ ok: true });
});

router.get("/topics", requireAuth, async (req, res): Promise<void> => {
  const params = ListTopicsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const isAdmin = isAdminRole(req.user!.role);
  let visibleModuleIds: number[] | null = null;
  if (!isAdmin) {
    const targeting = await getStudentTargeting(req.user!.id);
    visibleModuleIds = await getVisibleModuleIds(targeting);
  }
  let subjectFilter = params.data.subjectId ? eq(topicsTable.subjectId, params.data.subjectId) : undefined;
  if (!isAdmin && params.data.subjectId) {
    const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, params.data.subjectId));
    if (!subject || !visibleModuleIds!.includes(subject.moduleId)) { res.json([]); return; }
  }
  const rows = await db.select({ id: topicsTable.id, subjectId: topicsTable.subjectId, name: topicsTable.name, moduleId: subjectsTable.moduleId })
    .from(topicsTable).innerJoin(subjectsTable, eq(topicsTable.subjectId, subjectsTable.id))
    .where(and(subjectFilter, visibleModuleIds ? inArray(subjectsTable.moduleId, visibleModuleIds) : undefined));
  res.json(ListTopicsResponse.parse(rows.map((row) => ({ id: row.id, subjectId: row.subjectId, name: row.name, questionCount: 0, completed: false }))));
});

router.post("/topics", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({ subjectId: z.number().int().positive(), name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "subjectId and name are required" }); return; }
  const [row] = await db.insert(topicsTable).values(parsed.data).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "TOPIC_CREATED", entity: "topic", entityId: row.id });
  res.status(201).json({ id: row.id, subjectId: row.subjectId, name: row.name, questionCount: 0, completed: false });
});

router.patch("/topics/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid topic" }); return; }
  const [row] = await db.update(topicsTable).set(parsed.data).where(eq(topicsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Topic not found" }); return; }
  res.json({ id: row.id, subjectId: row.subjectId, name: row.name, questionCount: 0, completed: false });
});

router.delete("/topics/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(topicsTable).set({ active: false, archived: true }).where(eq(topicsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Topic not found" }); return; }
  res.json({ ok: true });
});

router.get("/mcqs", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const params = ListMcqsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const isAdmin = isAdminRole(req.user!.role);
  let visibleModuleIds: number[] | null = null;
  if (!isAdmin) {
    const targeting = await getStudentTargeting(req.user!.id);
    visibleModuleIds = await getVisibleModuleIds(targeting);
  }
  const rows = await db.select().from(mcqsTable).where(and(
    params.data.search ? ilike(mcqsTable.question, `%${params.data.search}%`) : undefined,
    params.data.moduleId ? eq(mcqsTable.moduleId, params.data.moduleId) : undefined,
    params.data.subjectId ? eq(mcqsTable.subjectId, params.data.subjectId) : undefined,
    params.data.topicId ? eq(mcqsTable.topicId, params.data.topicId) : undefined,
    // Past-paper practice ("Start Session" on a past paper) needs its own
    // question set — without this filter, students got served the entire
    // published MCQ bank instead of that paper's questions.
    params.data.pastPaperId ? eq(mcqsTable.pastPaperId, params.data.pastPaperId) : undefined,
    // Jumping to a single question from a linked notebook note.
    params.data.mcqId ? eq(mcqsTable.id, params.data.mcqId) : undefined,
    params.data.difficulty ? eq(mcqsTable.difficulty, params.data.difficulty) : undefined,
    isAdmin ? undefined : eq(mcqsTable.status, "published"),
    // Bug fix: MCQs with no moduleId set (very common for past-paper
    // questions, which don't require picking a module when attached) were
    // being silently excluded here — inArray(moduleId, [...]) never matches
    // a null moduleId in SQL. Flashcards/books already treat a null
    // moduleId as "globally visible"; MCQs need the same OR isNull(...)
    // clause, or "Start Session" on a past paper returns zero questions.
    visibleModuleIds ? or(isNull(mcqsTable.moduleId), inArray(mcqsTable.moduleId, visibleModuleIds)) : undefined,
  )).orderBy(desc(mcqsTable.createdAt));
  res.json(ListMcqsResponse.parse(rows.map((row) => ({ ...row, module: "", subject: "", topic: "" }))));
});

// Admin-only variant of the listing above that keeps moduleId/subjectId/
// topicId/explanationStatus on the wire (the generic ListMcqsResponse
// schema strips them) — used to group the question bank into the
// Module -> Subject -> Topic tree in the admin UI.
router.get("/admin/mcqs", requireAdmin, async (req, res): Promise<void> => {
  const params = ListMcqsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rows = await db.select().from(mcqsTable).where(and(
    params.data.search ? ilike(mcqsTable.question, `%${params.data.search}%`) : undefined,
    params.data.moduleId ? eq(mcqsTable.moduleId, params.data.moduleId) : undefined,
    params.data.subjectId ? eq(mcqsTable.subjectId, params.data.subjectId) : undefined,
    params.data.topicId ? eq(mcqsTable.topicId, params.data.topicId) : undefined,
    params.data.difficulty ? eq(mcqsTable.difficulty, params.data.difficulty) : undefined,
  )).orderBy(desc(mcqsTable.createdAt));
  res.json(rows);
});

router.post("/mcqs", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMcqBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [mcq] = await db.insert(mcqsTable).values({
    ...parsed.data, options: parsed.data.options, status: "draft",
    explanationStatus: parsed.data.explanation?.trim() ? "APPROVED" : "PENDING",
  }).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MCQ_CREATED", entity: "mcq", entityId: mcq.id });
  res.status(201).json(CreateMcqResponse.parse({ ...mcq, module: "", subject: "", topic: "" }));
});

router.patch("/mcqs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = CreateMcqBody.partial().safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid MCQ" }); return; }
  const updates: Record<string, unknown> = { ...parsed.data };
  // If the admin is hand-editing the explanation text (not just toggling
  // status separately via /mcqs/:id/explanation-status), treat that as a
  // review — it's no longer an unreviewed AI draft.
  if (parsed.data.explanation !== undefined) {
    updates.explanationStatus = parsed.data.explanation.trim() ? "REVIEWED" : "PENDING";
  }
  const [mcq] = await db.update(mcqsTable).set(updates).where(eq(mcqsTable.id, id)).returning();
  if (!mcq) { res.status(404).json({ error: "MCQ not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MCQ_UPDATED", entity: "mcq", entityId: mcq.id });
  res.json({ ...mcq, module: "", subject: "", topic: "" });
});

router.post("/mcqs/:id/publish", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [mcq] = await db.update(mcqsTable).set({ status: "published" }).where(eq(mcqsTable.id, id)).returning();
  if (!mcq) { res.status(404).json({ error: "MCQ not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MCQ_PUBLISHED", entity: "mcq", entityId: mcq.id });
  res.json({ ...mcq, module: "", subject: "", topic: "" });
});

router.delete("/mcqs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [mcq] = await db.update(mcqsTable).set({ status: "archived" }).where(eq(mcqsTable.id, id)).returning();
  if (!mcq) { res.status(404).json({ error: "MCQ not found" }); return; }
  res.json({ ok: true });
});

// Bulk delete for the MCQ bank's multi-select / "delete all in current
// filtered view" admin tools. Accepts either an explicit id list or
// { all: true, filters } to archive everything matching the current list
// filters (mirrors the bulk-generate pattern already used in
// explanations.ts). Archives (soft-delete) rather than hard-deletes, same
// as the single-MCQ delete route above.
const BulkDeleteMcqsBody = z.object({ ids: z.array(z.number().int().positive()) }).or(
  z.object({
    all: z.literal(true),
    filters: z.object({
      search: z.string().optional(),
      moduleId: z.number().int().positive().optional(),
      subjectId: z.number().int().positive().optional(),
      topicId: z.number().int().positive().optional(),
      difficulty: z.string().optional(),
    }).optional(),
  }),
);

router.delete("/admin/mcqs/bulk", requireAdmin, async (req, res): Promise<void> => {
  const parsed = BulkDeleteMcqsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let idsToDelete: number[];
  if ("ids" in parsed.data) {
    idsToDelete = parsed.data.ids;
  } else {
    const filters = parsed.data.filters ?? {};
    const rows = await db.select({ id: mcqsTable.id }).from(mcqsTable).where(and(
      filters.search ? ilike(mcqsTable.question, `%${filters.search}%`) : undefined,
      filters.moduleId ? eq(mcqsTable.moduleId, filters.moduleId) : undefined,
      filters.subjectId ? eq(mcqsTable.subjectId, filters.subjectId) : undefined,
      filters.topicId ? eq(mcqsTable.topicId, filters.topicId) : undefined,
      filters.difficulty ? eq(mcqsTable.difficulty, filters.difficulty) : undefined,
    ));
    idsToDelete = rows.map((r) => r.id);
  }

  if (!idsToDelete.length) { res.json({ ok: true, deleted: 0 }); return; }

  await db.update(mcqsTable).set({ status: "archived" }).where(inArray(mcqsTable.id, idsToDelete));
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MCQ_BULK_DELETED", entity: "mcq", entityId: 0, metadata: JSON.stringify({ ids: idsToDelete, count: idsToDelete.length }) });
  res.json({ ok: true, deleted: idsToDelete.length });
});

// Bulk create for the "Add multiple MCQs" admin flow — accepts an array of
// MCQ payloads shaped like CreateMcqBody and inserts them in one request.
router.post("/admin/mcqs/bulk", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({ mcqs: z.array(CreateMcqBody).min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rows = await db.insert(mcqsTable).values(parsed.data.mcqs.map((mcq) => ({
    ...mcq, options: mcq.options, status: "draft" as const,
    explanationStatus: (mcq.explanation?.trim() ? "APPROVED" : "PENDING") as "APPROVED" | "PENDING",
  }))).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "MCQ_BULK_CREATED", entity: "mcq", entityId: 0, metadata: JSON.stringify({ count: rows.length }) });
  res.status(201).json({ ok: true, created: rows.length, mcqs: rows.map((mcq) => ({ ...mcq, module: "", subject: "", topic: "" })) });
});

router.get("/flashcards", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const params = ListFlashcardsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const isAdmin = isAdminRole(req.user!.role);
  let visibleModuleIds: number[] | null = null;
  if (!isAdmin) {
    const targeting = await getStudentTargeting(req.user!.id);
    visibleModuleIds = await getVisibleModuleIds(targeting);
  }
  // Flashcards with no moduleId set are treated as globally visible, same as
  // an untargeted module — most existing/demo flashcards predate this field.
  const rows = await db.select().from(flashcardsTable).where(and(
    eq(flashcardsTable.active, true),
    params.data.moduleId ? eq(flashcardsTable.moduleId, params.data.moduleId) : undefined,
    params.data.subjectId ? eq(flashcardsTable.subjectId, params.data.subjectId) : undefined,
    params.data.topicId ? eq(flashcardsTable.topicId, params.data.topicId) : undefined,
    visibleModuleIds ? or(isNull(flashcardsTable.moduleId), inArray(flashcardsTable.moduleId, visibleModuleIds)) : undefined,
  ));
  res.json(ListFlashcardsResponse.parse(rows.map((row) => ({ ...row, learned: false }))));
});

router.post("/flashcards", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({
    front: z.string().min(1), back: z.string().min(1), module: z.string().min(1), topic: z.string().min(1),
    moduleId: z.number().int().positive().optional(), subjectId: z.number().int().positive().optional(), topicId: z.number().int().positive().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "front, back, module, and topic are required" }); return; }
  const [row] = await db.insert(flashcardsTable).values(parsed.data).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "FLASHCARD_CREATED", entity: "flashcard", entityId: row.id });
  res.status(201).json({ ...row, learned: false });
});

router.delete("/flashcards/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(flashcardsTable).set({ active: false, archived: true }).where(eq(flashcardsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Flashcard not found" }); return; }
  res.json({ ok: true });
});

router.get("/resources", requireAuth, requireActiveMembership, async (req, res): Promise<void> => {
  const params = ListResourcesQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rows = await db.select().from(resourcesTable).where(and(params.data.kind ? eq(resourcesTable.kind, params.data.kind) : undefined, eq(resourcesTable.active, true)));
  res.json(ListResourcesResponse.parse(rows.map((row) => ({ ...row, storagePath: resolveFileUrl(row.storagePath) ?? row.storagePath, updatedAt: row.updatedAt.toISOString() }))));
});

router.post("/resources", requireAdmin, async (req, res): Promise<void> => {
  const parsed = z.object({ title: z.string().min(1), description: z.string().default(""), kind: z.string().min(1), module: z.string().default(""), size: z.string().default(""), storagePath: z.string().optional(), externalUrl: z.string().optional(), protected: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [row] = await db.insert(resourcesTable).values(parsed.data).returning();
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "RESOURCE_CREATED", entity: "resource", entityId: row.id });
  res.status(201).json({ ...row, updatedAt: row.updatedAt.toISOString() });
});

router.delete("/resources/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(resourcesTable).set({ active: false, archived: true }).where(eq(resourcesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Resource not found" }); return; }
  res.json({ ok: true });
});

router.get("/students", requireAdmin, async (req, res): Promise<void> => {
  const params = ListStudentsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db.select().from(usersTable).where(and(
    eq(usersTable.role, "student"),
    params.data.search ? or(ilike(usersTable.name, `%${params.data.search}%`), ilike(usersTable.email, `%${params.data.search}%`), ilike(usersTable.rollNumber, `%${params.data.search}%`)) : undefined,
    statusFilter ? eq(usersTable.status, statusFilter) : ne(usersTable.status, "DELETED"),
  )).orderBy(desc(usersTable.createdAt));
  res.json(ListStudentsResponse.parse(rows.map((row) => ({ id: row.id, name: row.name, email: row.email, institution: row.institution ?? "—", program: row.program ?? "—", status: row.status, joinedAt: row.createdAt.toISOString(), progress: 0 }))));
});

router.get("/students/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [student] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "student")));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  const [academicYear] = student.academicYearId ? await db.select().from(academicYearsTable).where(eq(academicYearsTable.id, student.academicYearId)) : [];
  const [batch] = student.batchId ? await db.select().from(batchesTable).where(eq(batchesTable.id, student.batchId)) : [];
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.userId, id)).orderBy(desc(paymentsTable.createdAt));
  const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, id)).orderBy(desc(membershipsTable.expiresAt));
  res.json({
    id: student.id, name: student.name, email: student.email, phone: student.phone, rollNumber: student.rollNumber,
    status: student.status, emailVerified: student.emailVerified,
    institution: student.institution, program: student.program, academicYear: academicYear?.label ?? null, batch: batch?.label ?? null,
    currentStreak: student.currentStreak, longestStreak: student.longestStreak,
    lastLoginAt: student.lastLoginAt?.toISOString() ?? null, joinedAt: student.createdAt.toISOString(),
    payments: await Promise.all(payments.map(paymentView)),
    activeMembership: memberships.find((m) => m.status === "ACTIVE" && m.expiresAt.getTime() > Date.now()) ? {
      expiresAt: memberships.find((m) => m.status === "ACTIVE")!.expiresAt.toISOString(),
    } : null,
  });
});

router.patch("/students/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ name: z.string().min(2).max(120).optional(), phone: z.string().max(30).optional(), rollNumber: z.string().max(60).optional() }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  const [row] = await db.update(usersTable).set(parsed.data).where(and(eq(usersTable.id, id), eq(usersTable.role, "student"))).returning();
  if (!row) { res.status(404).json({ error: "Student not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "STUDENT_UPDATED", entity: "user", entityId: row.id });
  res.json({ ok: true });
});

const STUDENT_STATUSES = ["UNVERIFIED", "VERIFIED", "PAYMENT_PENDING_REVIEW", "ACTIVE", "EXPIRED", "SUSPENDED", "REJECTED"] as const;

router.patch("/students/:id/status", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ status: z.enum(STUDENT_STATUSES), emailVerified: z.boolean().optional(), planId: z.number().int().positive().optional(), durationDays: z.number().int().positive().optional() }).safeParse(req.body);
  if (!parsed.success || Number.isNaN(id)) { res.status(400).json({ error: "Invalid request" }); return; }
  // Moving a student to VERIFIED, PAYMENT_PENDING_REVIEW, or ACTIVE implies
  // an admin has confirmed their identity — auto-clear the email-verification
  // gate too, so the account status change actually lets them log in instead
  // of silently leaving them blocked at the "please verify your email" step.
  const impliesVerified = parsed.data.status === "VERIFIED" || parsed.data.status === "PAYMENT_PENDING_REVIEW" || parsed.data.status === "ACTIVE";
  const emailVerified = parsed.data.emailVerified ?? (impliesVerified ? true : undefined);
  const [row] = await db.update(usersTable).set({ status: parsed.data.status, ...(emailVerified !== undefined ? { emailVerified } : {}) }).where(and(eq(usersTable.id, id), eq(usersTable.role, "student"))).returning();
  if (!row) { res.status(404).json({ error: "Student not found" }); return; }

  // IMPORTANT: GET /student/dashboard reads membership status/expiry only
  // from membershipsTable (never usersTable.status) — see planView()/the
  // dashboard route below. If this handler sets ACTIVE without also
  // creating a membership row, the student's own dashboard will disagree
  // with what the admin just did ("no active subscription" despite being
  // marked Active here). Keep both in sync: manually activating a student
  // without an existing active membership grants one here, same shape as
  // POST /payments/:id/approve.
  let grantedMembership: { planId: number; expiresAt: Date } | null = null;
  if (parsed.data.status === "ACTIVE") {
    const [existingActive] = await db.select().from(membershipsTable).where(and(eq(membershipsTable.userId, id), eq(membershipsTable.status, "ACTIVE"))).orderBy(desc(membershipsTable.expiresAt)).limit(1);
    const stillActive = existingActive && existingActive.expiresAt > new Date();
    if (!stillActive) {
      let plan: typeof membershipPlansTable.$inferSelect | undefined;
      if (parsed.data.planId) {
        [plan] = await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.id, parsed.data.planId));
      } else {
        [plan] = await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.active, true)).orderBy(membershipPlansTable.price).limit(1);
      }
      const startsAt = new Date();
      const expiresAt = new Date(startsAt);
      if (parsed.data.durationDays) {
        expiresAt.setDate(expiresAt.getDate() + parsed.data.durationDays);
      } else if (plan) {
        if (plan.durationUnit === "years") expiresAt.setFullYear(expiresAt.getFullYear() + plan.duration);
        else if (plan.durationUnit === "months") expiresAt.setMonth(expiresAt.getMonth() + plan.duration);
        else expiresAt.setDate(expiresAt.getDate() + plan.duration);
      } else {
        expiresAt.setDate(expiresAt.getDate() + 30); // no plan configured at all — 30-day default so the grant isn't silently a no-op
      }
      // Defensively supersede any stale ACTIVE rows for this student (even
      // expired ones) before inserting, so a student can never end up with
      // more than one ACTIVE-status membership row at a time.
      await db.update(membershipsTable).set({ status: "SUPERSEDED" }).where(and(eq(membershipsTable.userId, id), eq(membershipsTable.status, "ACTIVE")));
      await db.insert(membershipsTable).values({ userId: id, planId: plan?.id ?? null, status: "ACTIVE", startsAt, expiresAt });
      if (plan) grantedMembership = { planId: plan.id, expiresAt };
      void sendEmail(row.email, "Your MedschoolProffs membership is active", membershipActivatedEmailHtml(row.name, plan?.name ?? null, expiresAt)).catch(() => {});
    }
  }

  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "STUDENT_STATUS_UPDATED", entity: "user", entityId: row.id, metadata: JSON.stringify({ status: parsed.data.status, emailVerified: row.emailVerified, grantedMembership }) });
  res.json({ ok: true, status: row.status, emailVerified: row.emailVerified, grantedMembership });
});

// Standalone "verify email" action — lets an admin unblock a student's login
// (which is gated on emailVerified, independent of the status field above)
// without having to also change their account status.
router.post("/students/:id/verify-email", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid student id" }); return; }
  const [row] = await db.update(usersTable).set({ emailVerified: true, status: sql`CASE WHEN ${usersTable.status} = 'UNVERIFIED' THEN 'VERIFIED' ELSE ${usersTable.status} END` }).where(and(eq(usersTable.id, id), eq(usersTable.role, "student"))).returning();
  if (!row) { res.status(404).json({ error: "Student not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "STUDENT_EMAIL_VERIFIED_BY_ADMIN", entity: "user", entityId: row.id });
  res.json({ ok: true, status: row.status, emailVerified: row.emailVerified });
});

// Soft-delete only: a student record cascades to payments, exam attempts, and
// notebook entries, so a hard DELETE would either orphan or cascade-wipe that
// history. We mark the account DELETED (excluded from active listings/stats)
// and keep the row so admins retain payment/audit history. Revisit with the
// project owner if a true hard-delete is ever required.
router.delete("/students/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid student id" }); return; }
  const [row] = await db.update(usersTable).set({ status: "DELETED" }).where(and(eq(usersTable.id, id), eq(usersTable.role, "student"))).returning();
  if (!row) { res.status(404).json({ error: "Student not found" }); return; }
  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "STUDENT_DELETED", entity: "user", entityId: row.id });
  res.json({ ok: true });
});

// Hard delete — erases the student account and everything tied to it
// (payments, memberships, practice/exam history, notebook, flagged MCQs,
// feedback, documents, sessions). There is no dependency on the soft-delete
// above; this can be called directly on any student, active or not.
router.delete("/students/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid student id" }); return; }
  const [student] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "student")));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const practiceAttemptRows = await db.select({ id: practiceAttemptsTable.id }).from(practiceAttemptsTable).where(eq(practiceAttemptsTable.userId, id));
  const practiceAttemptIds = practiceAttemptRows.map((r) => r.id);
  if (practiceAttemptIds.length) await db.delete(practiceAnswersTable).where(inArray(practiceAnswersTable.attemptId, practiceAttemptIds));

  const examAttemptRows = await db.select({ id: examAttemptsTable.id }).from(examAttemptsTable).where(eq(examAttemptsTable.userId, id));
  const examAttemptIds = examAttemptRows.map((r) => r.id);
  if (examAttemptIds.length) await db.delete(examAnswersTable).where(inArray(examAnswersTable.attemptId, examAttemptIds));

  await db.update(membershipsTable).set({ paymentId: null }).where(eq(membershipsTable.userId, id));
  await db.delete(emailVerificationTokensTable).where(eq(emailVerificationTokensTable.userId, id));
  await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, id));
  await db.delete(studentDocumentsTable).where(eq(studentDocumentsTable.userId, id));
  await db.delete(practiceAttemptsTable).where(eq(practiceAttemptsTable.userId, id));
  await db.delete(studentProgressTable).where(eq(studentProgressTable.userId, id));
  await db.delete(examAttemptsTable).where(eq(examAttemptsTable.userId, id));
  await db.delete(notebookEntriesTable).where(eq(notebookEntriesTable.userId, id));
  await db.delete(savedSessionsTable).where(eq(savedSessionsTable.userId, id));
  await db.delete(flaggedMcqsTable).where(eq(flaggedMcqsTable.userId, id));
  await db.delete(feedbackTable).where(eq(feedbackTable.userId, id));
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, id));
  await db.delete(membershipsTable).where(eq(membershipsTable.userId, id));
  await db.delete(paymentsTable).where(eq(paymentsTable.userId, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));

  await db.insert(auditLogsTable).values({ actorId: req.user!.id, action: "STUDENT_PERMANENTLY_DELETED", entity: "user", entityId: id });
  res.json({ ok: true });
});

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(notificationsTable).where(or(eq(notificationsTable.userId, req.user!.id), sql`${notificationsTable.userId} IS NULL`)).orderBy(desc(notificationsTable.createdAt));
  res.json(ListNotificationsResponse.parse(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, id));
  res.json({ ok: true });
});

export default router;

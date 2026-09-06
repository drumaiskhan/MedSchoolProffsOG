import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Institutions / Programs / Academic Years / Batches
// ---------------------------------------------------------------------------

export const institutionsTable = pgTable("med_institutions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull().default(""),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const programsTable = pgTable("med_programs", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").notNull(),
  name: text("name").notNull(),
  // Normalized program kind used for cross-institution content targeting —
  // e.g. two different colleges' "MBBS" program rows both get kind="MBBS",
  // so a module targeted at MBBS shows to every MBBS student regardless of
  // institution. Free text so admins aren't locked out of other programs,
  // but the importer/UI steer toward MBBS/BDS.
  kind: text("kind").notNull().default(""),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const academicYearsTable = pgTable("med_academic_years", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull(),
  label: text("label").notNull(),
  // Normalized 1-5 year number for cross-institution content targeting —
  // same idea as programs.kind above. Nullable since not every "year" (e.g.
  // "House Job") maps to a simple number.
  yearNumber: integer("year_number"),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const batchesTable = pgTable("med_batches", {
  id: serial("id").primaryKey(),
  academicYearId: integer("academic_year_id").notNull(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Users / auth
// ---------------------------------------------------------------------------

export const usersTable = pgTable(
  "med_users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("student"), // student | admin (legacy "superadmin" rows are normalized to "admin" at boot — see api-server/src/lib/normalizeLegacyRoles.ts)
    status: text("status").notNull().default("UNVERIFIED"),
    // UNVERIFIED | VERIFIED | PENDING_PAYMENT | PAYMENT_PENDING_REVIEW | ACTIVE | EXPIRED | SUSPENDED | REJECTED
    emailVerified: boolean("email_verified").notNull().default(false),
    institutionId: integer("institution_id"),
    programId: integer("program_id"),
    academicYearId: integer("academic_year_id"),
    batchId: integer("batch_id"),
    rollNumber: text("roll_number"),
    phone: text("phone"),
    profilePicturePath: text("profile_picture_path"),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastPracticeDate: date("last_practice_date", { mode: "string" }),
    // legacy free-text fallback fields kept for backward compatibility with existing demo data
    institution: text("institution"),
    program: text("program"),
    ...timestamps,
  },
  (table) => ({ emailIdx: uniqueIndex("med_users_email_idx").on(table.email) }),
);

export const emailVerificationTokensTable = pgTable("med_email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  newEmail: text("new_email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps,
});

export const passwordResetTokensTable = pgTable("med_password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps,
});

export const studentDocumentsTable = pgTable("med_student_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  label: text("label").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Membership plans / payments / memberships
// ---------------------------------------------------------------------------

export const membershipPlansTable = pgTable("med_membership_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  duration: integer("duration").notNull(),
  durationUnit: text("duration_unit").notNull(),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  autoRenew: boolean("auto_renew").notNull().default(false),
  eligibility: text("eligibility"),
  // Optional promotional pricing — when set, the plan shows a struck-through
  // originalPrice next to the discounted `price`, e.g. Rs 4000 -> Rs 2999.
  // Null means "not currently discounted."
  originalPrice: numeric("original_price", { precision: 12, scale: 2 }),
  discountLabel: text("discount_label"),
  ...timestamps,
});

export const paymentsTable = pgTable("med_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  planId: integer("plan_id").notNull(),
  planName: text("plan_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  duration: integer("duration").notNull(),
  durationUnit: text("duration_unit").notNull(),
  method: text("method").notNull(),
  reference: text("reference").notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  proofPath: text("proof_path"),
  proofMimeType: text("proof_mime_type"),
  status: text("status").notNull().default("PAYMENT_PENDING_REVIEW"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  gatewayProvider: text("gateway_provider"),
  gatewayReference: text("gateway_reference"),
  ...timestamps,
});

export const membershipsTable = pgTable("med_memberships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  paymentId: integer("payment_id"),
  planId: integer("plan_id"),
  status: text("status").notNull().default("ACTIVE"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  suspendedReason: text("suspended_reason"),
  ...timestamps,
});

export const paymentWebhookEventsTable = pgTable("med_payment_webhook_events", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  payload: text("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({ eventIdx: uniqueIndex("med_webhook_event_idx").on(table.provider, table.eventId) }));

// ---------------------------------------------------------------------------
// Academic content
// ---------------------------------------------------------------------------

export const modulesTable = pgTable("med_modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull(),
  // Content targeting — null means visible to everyone. Set programTargetKind
  // to restrict to students whose program.kind matches (e.g. "MBBS"), and/or
  // yearTargetNumber to restrict to a specific academic year (1-5). Subjects,
  // topics, and MCQs inherit visibility from their parent module — they are
  // never individually targeted.
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const subjectsTable = pgTable("med_subjects", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const topicsTable = pgTable("med_topics", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const mcqsTable = pgTable("med_mcqs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  options: text("options").array().notNull(),
  correctAnswer: text("correct_answer"),
  explanation: text("explanation"),
  // Per-option explanations, index-aligned with `options` — e.g.
  // optionExplanations[2] explains why options[2] is right or wrong. Lets
  // admins (or the bulk-upload parser) capture not just "why the correct
  // answer is correct" but "why each wrong option is wrong", which is what
  // most real exam-prep question banks actually provide. Nullable/optional:
  // a null array or a null/empty entry at a given index just means that
  // option has no specific explanation yet, and the UI falls back to the
  // single `explanation` field above for the correct option.
  optionExplanations: text("option_explanations").array(),
  // PENDING (no explanation yet, or needs work) | AI_GENERATED (drafted by
  // AI, awaiting review) | REVIEWED (admin edited/checked it) | APPROVED
  // (final). Existing/imported explanations default to APPROVED at
  // creation time so this never gates content that already had a written
  // explanation — see routes that insert MCQs for the actual default logic.
  explanationStatus: text("explanation_status").notNull().default("PENDING"),
  reference: text("reference"),
  difficulty: text("difficulty").notNull().default("moderate"),
  tags: text("tags").array().notNull().default([]),
  imagePath: text("image_path"),
  status: text("status").notNull().default("draft"),
  source: text("source").notNull().default("manual"),
  // Nullable: MCQs imported under a past paper (pastPaperId set) are
  // organized by the paper itself, not by curriculum placement — the
  // admin can optionally also tag one under a module/subject/topic, but
  // it isn't required. MCQs in the main question bank (no pastPaperId)
  // are still expected to carry all three — enforced by the API layer
  // (CommitBody's .refine() in mcq-import.ts), not by the DB anymore.
  moduleId: integer("module_id"),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  pastPaperId: integer("past_paper_id"),
  ...timestamps,
});

export const flashcardsTable = pgTable("med_flashcards", {
  id: serial("id").primaryKey(),
  front: text("front").notNull(),
  back: text("back").notNull(),
  moduleId: integer("module_id"),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  module: text("module").notNull(),
  topic: text("topic").notNull(),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const resourcesTable = pgTable("med_resources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  kind: text("kind").notNull(),
  moduleId: integer("module_id"),
  institutionId: integer("institution_id"),
  programId: integer("program_id"),
  academicYearId: integer("academic_year_id"),
  module: text("module").notNull(),
  size: text("size").notNull(),
  storagePath: text("storage_path"),
  externalUrl: text("external_url"),
  protected: boolean("protected").notNull().default(true),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

// Books library — admin-uploaded PDF books, browsable/downloadable by
// students. Targeting reuses the same moduleId/subjectId/topicId pattern
// used by MCQs/flashcards, but all three are optional: a book with no
// targeting at all is treated as globally visible, same convention as
// flashcards with no moduleId.
export const booksTable = pgTable("med_books", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author"),
  moduleId: integer("module_id"),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  storagePath: text("storage_path").notNull(),
  coverImagePath: text("cover_image_path"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Practice / progress
// ---------------------------------------------------------------------------

export const practiceAttemptsTable = pgTable("med_practice_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  moduleId: integer("module_id"),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  mode: text("mode").notNull().default("untimed"),
  totalQuestions: integer("total_questions").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  scorePercent: numeric("score_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

export const practiceAnswersTable = pgTable("med_practice_answers", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull(),
  mcqId: integer("mcq_id").notNull(),
  selectedAnswer: text("selected_answer"),
  correct: boolean("correct").notNull().default(false),
  ...timestamps,
});

export const studentProgressTable = pgTable("med_student_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  moduleId: integer("module_id").notNull(),
  topicsCompleted: integer("topics_completed").notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => ({ userModuleIdx: uniqueIndex("med_progress_user_module_idx").on(table.userId, table.moduleId) }));

// ---------------------------------------------------------------------------
// Past papers
// ---------------------------------------------------------------------------

export const pastPapersTable = pgTable("med_past_papers", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(), // e.g. "KMU 2024 G"
  examBoard: text("exam_board").notNull().default(""),
  year: text("year").notNull().default(""),
  level: text("level").notNull().default(""), // e.g. "3rd Year MBBS" — matches an academic year label
  institutionId: integer("institution_id"),
  programId: integer("program_id"),
  academicYearId: integer("academic_year_id"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Public site content: team members (footer/social/contact/features live in
// platform_settings as key/value — see routes/settings.ts)
// ---------------------------------------------------------------------------

export const teamMembersTable = pgTable("med_team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  bio: text("bio").notNull().default(""),
  achievementBadge: text("achievement_badge").notNull().default(""),
  photoPath: text("photo_path"),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  instagramUrl: text("instagram_url").notNull().default(""),
  email: text("email").notNull().default(""),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Pre-Proffs Exams
// ---------------------------------------------------------------------------

export const examsTable = pgTable("med_exams", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Eligibility — same targeting model as modules (null = everyone on that axis)
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  maxAttempts: integer("max_attempts").notNull().default(1),
  // Negative marking is supported but defaults off — configurable per exam.
  negativeMarkingEnabled: boolean("negative_marking_enabled").notNull().default(false),
  negativeMarkPerWrong: numeric("negative_mark_per_wrong", { precision: 5, scale: 2 }).notNull().default("0"),
  passingPercent: numeric("passing_percent", { precision: 5, scale: 2 }),
  resultReleaseMode: text("result_release_mode").notNull().default("immediate"), // immediate | after_end | manual
  showMarks: boolean("show_marks").notNull().default(true),
  showPercentage: boolean("show_percentage").notNull().default(true),
  showCorrectAnswers: boolean("show_correct_answers").notNull().default(true),
  status: text("status").notNull().default("draft"), // draft | published | archived
  ...timestamps,
});

export const examQuestionsTable = pgTable("med_exam_questions", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull(),
  mcqId: integer("mcq_id").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
}, (table) => ({ examMcqIdx: uniqueIndex("med_exam_questions_exam_mcq_idx").on(table.examId, table.mcqId) }));

export const examAttemptsTable = pgTable("med_exam_attempts", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull(),
  userId: integer("user_id").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  totalQuestions: integer("total_questions").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  wrongCount: integer("wrong_count").notNull().default(0),
  unansweredCount: integer("unanswered_count").notNull().default(0),
  score: numeric("score", { precision: 8, scale: 2 }).notNull().default("0"),
  percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  passed: boolean("passed"),
  status: text("status").notNull().default("in_progress"), // in_progress | submitted | auto_submitted
  resultsReleasedAt: timestamp("results_released_at", { withTimezone: true }),
  ...timestamps,
});

export const examAnswersTable = pgTable("med_exam_answers", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull(),
  mcqId: integer("mcq_id").notNull(),
  selectedAnswer: text("selected_answer"),
  correct: boolean("correct"),
  ...timestamps,
}, (table) => ({ attemptMcqIdx: uniqueIndex("med_exam_answers_attempt_mcq_idx").on(table.attemptId, table.mcqId) }));

// ---------------------------------------------------------------------------
// MCQ bulk import (file uploads → parsed MCQs)
// ---------------------------------------------------------------------------

export const mcqImportProfilesTable = pgTable("med_mcq_import_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Each pattern is a JS regex source string (no slashes), applied with the
  // "gmi" flags. Admins can tune these per-college/per-source without a
  // code change. Defaults cover the most common numbered-question formats.
  questionPattern: text("question_pattern").notNull(),
  optionPattern: text("option_pattern").notNull(),
  answerPattern: text("answer_pattern").notNull(),
  explanationPattern: text("explanation_pattern").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Student personal tools: notebook, saved sessions, flagged MCQs, feedback
// ---------------------------------------------------------------------------

export const notebookEntriesTable = pgTable("med_notebook_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  mcqId: integer("mcq_id"),
  title: text("title").notNull().default(""),
  content: text("content").notNull(),
  ...timestamps,
});

export const savedSessionsTable = pgTable("med_saved_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  config: text("config").notNull(), // JSON: { moduleId?, subjectId?, topicId?, pastPaperId? }
  ...timestamps,
});

export const aiVisualizerLogsTable = pgTable("med_ai_visualizer_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull(), // "success" | "error"
  visualizationType: text("visualization_type"), // e.g. "process", "equation" — null on error
  errorMessage: text("error_message"), // null on success
  ...timestamps,
});

export const flaggedMcqsTable = pgTable("med_flagged_mcqs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  mcqId: integer("mcq_id").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("open"), // open | resolved
  ...timestamps,
}, (table) => ({ userMcqIdx: uniqueIndex("med_flagged_user_mcq_idx").on(table.userId, table.mcqId) }));

export const feedbackTable = pgTable("med_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  category: text("category").notNull().default("general"),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | replied | reviewed
  ...timestamps,
});

// A reply thread on a feedback item — either the admin responding, or the
// original student adding more detail / following up on the admin's reply.
export const feedbackRepliesTable = pgTable("med_feedback_replies", {
  id: serial("id").primaryKey(),
  feedbackId: integer("feedback_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorRole: text("author_role").notNull(), // "admin" | "student" — avoids a join just to render "You" vs the team's name
  message: text("message").notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Notifications / audit / settings
// ---------------------------------------------------------------------------

export const notificationsTable = pgTable("med_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("info"),
  read: boolean("read").notNull().default(false),
  ...timestamps,
});

export const auditLogsTable = pgTable("med_audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  metadata: text("metadata"),
  ...timestamps,
});

export const platformSettingsTable = pgTable("med_platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  ...timestamps,
});

export const insertUserSchema = createInsertSchema(usersTable);
export const insertMembershipPlanSchema = createInsertSchema(membershipPlansTable);
export const insertPaymentSchema = createInsertSchema(paymentsTable);
export const insertModuleSchema = createInsertSchema(modulesTable);
export const insertMcqSchema = createInsertSchema(mcqsTable);
export const insertInstitutionSchema = createInsertSchema(institutionsTable);
export const insertProgramSchema = createInsertSchema(programsTable);
export const insertAcademicYearSchema = createInsertSchema(academicYearsTable);
export const insertBatchSchema = createInsertSchema(batchesTable);

export type User = typeof usersTable.$inferSelect;
export type MembershipPlan = typeof membershipPlansTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type Module = typeof modulesTable.$inferSelect;
export type Mcq = typeof mcqsTable.$inferSelect;
export type Institution = typeof institutionsTable.$inferSelect;
export type Program = typeof programsTable.$inferSelect;
export type AcademicYear = typeof academicYearsTable.$inferSelect;
export type Batch = typeof batchesTable.$inferSelect;
export type Book = typeof booksTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

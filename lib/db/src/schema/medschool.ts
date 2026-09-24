import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
  // Which program the college itself is registered under — a real-world
  // MBBS college and a BDS college are different institutions even when
  // students colloquially call both "my college", so this is a property
  // of the institution row, not just the programsTable row underneath it.
  // Free text (default "") so legacy rows created before this column
  // existed don't disappear from anywhere; the admin UI only ever writes
  // "MBBS" or "BDS" into it.
  kind: text("kind").notNull().default(""),
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
    // Admin's free-text note attached to the student's current status —
    // written whenever an admin rejects the account (a reason is required
    // for that transition, same as rejecting a payment) so the student
    // gets told *why*. Kept generic (not "rejectionReason") since nothing
    // stops an admin from also leaving one on other status changes later.
    statusMessage: text("status_message"),
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
    // Per-account cap on simultaneously signed-in devices. NULL = follow the
    // platform default (DEFAULT_MAX_DEVICES setting, 2 out of the box);
    // 0 = unlimited; N = at most N. Set by an admin from the student drawer.
    maxDevices: integer("max_devices"),
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

// One row per signed-in device/browser. The JWT carries `sid` (token_id); the
// auth middleware only accepts a token whose row is still active, which is
// what makes the device limit enforceable and lets an admin sign a device out.
export const userSessionsTable = pgTable(
  "med_user_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    tokenId: text("token_id").notNull(),
    deviceLabel: text("device_label").notNull().default("Unknown device"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({ tokenIdx: uniqueIndex("med_user_sessions_token_idx").on(table.tokenId) }),
);

export const emailVerificationTokensTable = pgTable("med_email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  newEmail: text("new_email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  // Failed check attempts against this specific code — a 6-digit OTP has
  // only 1M combinations, so unlike the old click-a-link token this needs
  // its own brute-force counter. See MAX_OTP_ATTEMPTS in routes/auth.ts.
  attempts: integer("attempts").notNull().default(0),
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
  // Set when a med_coupons code was applied at submission time (see
  // lib/coupons.ts's validateCoupon(), used by both POST /auth/register and
  // POST /payments) — couponCode for admin visibility on the payment record,
  // discountAmount is how much was knocked off the plan's list price to
  // produce `amount` above. Both null when no coupon was used.
  couponCode: text("coupon_code"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
  ...timestamps,
});

// Membership-plan discount codes (client request: "coupon codes", scoped to
// plans only — never to books, which have no purchase flow of their own).
// Since there's no live payment gateway here — payment is a manual proof
// upload the admin reviews (see POST /payments and /payments/:id/approve) —
// applying a coupon just discounts the `amount` the student is told to pay
// and records the code on their med_payments row; it's still on the admin
// to notice a mismatched proof-of-payment during review, same as any other
// manual payment discrepancy today.
export const couponsTable = pgTable("med_coupons", {
  id: serial("id").primaryKey(),
  // Always stored/compared uppercase (see lib/coupons.ts) so lookups are
  // case-insensitive without needing a functional index.
  code: text("code").notNull(),
  discountType: text("discount_type").notNull(), // 'percent' | 'fixed'
  discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  maxUses: integer("max_uses"), // null = unlimited
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({ codeIdx: uniqueIndex("med_coupons_code_idx").on(table.code) }));

// Per-book purchases (client decision, superseding the earlier "any active
// membership unlocks paid books" approach): a paid book now requires its
// OWN approved purchase, reviewed by an admin independently of the
// membership-payment queue (med_payments) above. Deliberately mirrors
// paymentsTable's proof-review shape (method/reference/proof/status/
// reviewedBy) rather than reusing that table directly — a book purchase
// has no plan/duration and isn't a subscription, so bolting it onto
// paymentsTable would mean nullable plan fields everywhere that don't
// apply here. See routes/books.ts for the submit/approve/reject routes.
export const bookPurchasesTable = pgTable("med_book_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bookId: integer("book_id").notNull(),
  bookTitle: text("book_title").notNull(), // snapshotted at purchase time, same reason med_payments snapshots plan_name
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  method: text("method").notNull(),
  reference: text("reference").notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  proofPath: text("proof_path"),
  proofMimeType: text("proof_mime_type"),
  status: text("status").notNull().default("PAYMENT_PENDING_REVIEW"), // PAYMENT_PENDING_REVIEW | approved | rejected
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
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
  // Admin-granted trial access (no payment) — same ACTIVE/expiresAt shape
  // as a paid membership so access checks don't need to special-case it,
  // just tagged so the admin UI can label/revoke it distinctly. See
  // POST /students/:id/trial and DELETE /students/:id/trial.
  isTrial: boolean("is_trial").notNull().default(false),
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

// Top-level curriculum grouping above Modules, e.g. "Block A" containing
// "Foundation II", "Blood", etc. Nullable FK on modulesTable.blockId means
// existing/ungrouped modules keep working, shown under "Unassigned".
export const blocksTable = pgTable("med_blocks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  // Mirrors modulesTable's targeting columns exactly, same semantics.
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  // Optional thumbnail, resolved the same way as other storagePath-style
  // columns via resolveFileUrl() in api-server/src/lib/storage.ts.
  iconPath: text("icon_path"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const modulesTable = pgTable("med_modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull(),
  // Nullable — modules with no block show up under "Unassigned modules"
  // until an admin assigns them to a Block.
  blockId: integer("block_id"),
  // Optional module-level thumbnail (round 3, item 7) — same Cloudinary
  // storage-path convention as med_blocks.iconPath, resolved to a URL by
  // resolveFileUrl() the same way. Nullable: most existing modules have no
  // thumbnail yet, and it stays optional going forward (falls back to the
  // plain icon+label card style when absent).
  iconPath: text("icon_path"),
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
  // Optional thumbnail, resolved the same way as blocksTable/modulesTable's
  // storagePath-style columns via resolveFileUrl() in api-server/src/lib/storage.ts.
  iconPath: text("icon_path"),
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
  // A short nudge shown to a student who's stuck, before they see the full
  // explanation/correct answer (round 3, item 4b) — separate from
  // `explanation` (which reveals the reasoning/answer) since a hint is
  // meant to be usable mid-attempt without spoiling the question. Nullable:
  // most existing MCQs have no hint yet, and it's optional going forward.
  hint: text("hint"),
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
  // Nullable: MCQs imported under a past paper (pastPaperId set) or
  // directly attached to an exam (examId set) are organized by that
  // source, not by curriculum placement — the admin can optionally also
  // tag one under a module/subject/topic, but it isn't required. MCQs in
  // the main question bank (no pastPaperId and no examId) are still
  // expected to carry all three — enforced by the API layer (CommitBody's
  // .refine() in mcq-import.ts), not by the DB anymore.
  moduleId: integer("module_id"),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  pastPaperId: integer("past_paper_id"),
  examId: integer("exam_id"),
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
  // Simple targeting mirroring modulesTable/pastPapersTable's
  // programTargetKind + yearTargetNumber — the admin "Add book" form now
  // picks a Degree (MBBS/BDS) + Year directly instead of a Module/Subject/
  // Topic, same reasoning as pastPapersTable: that tree requires curriculum
  // structure to already exist, which most admins never set up for books.
  // Null on either axis means "all programs" / "all years" on that axis,
  // same convention. moduleId/subjectId/topicId above are kept only for
  // books created before this picker existed.
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  storagePath: text("storage_path").notNull(),
  coverImagePath: text("cover_image_path"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  // Free/paid split: a free book (isFree=true) is visible to any logged-in
  // student regardless of membership status — it deliberately bypasses
  // requireActiveMembership in books.ts. A paid book (isFree=false, the
  // default) is unchanged from the original behavior: gated behind ANY
  // active membership, same as every other study-tools resource. There is
  // deliberately no separate per-book purchase — price below is shown to
  // students as informational context on a locked paid book, never itself
  // a paywall.
  isFree: boolean("is_free").notNull().default(false),
  price: numeric("price", { precision: 12, scale: 2 }),
  currency: text("currency"),
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
// Friend challenges — a student finds another student (search by name,
// email, phone, or roll number — see GET /students/find) and challenges them
// to the same fixed set of MCQs. Each side plays it once and gets scored
// independently in med_challenge_attempts; once both have a completed
// attempt the challenge is COMPLETED and both get a result notification.
// ---------------------------------------------------------------------------

export const challengesTable = pgTable("med_challenges", {
  id: serial("id").primaryKey(),
  challengerId: integer("challenger_id").notNull(),
  opponentId: integer("opponent_id").notNull(),
  // Optional scope narrowing, same null-means-"whole bank" convention as
  // moduleId/subjectId/topicId below. Recorded even though the MCQ set is
  // already fixed at creation time, so the challenge list/history can show
  // what scope a challenge was drawn from.
  blockId: integer("block_id"),
  moduleId: integer("module_id"),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  // Fixed at creation time so both players answer the exact same questions
  // in the exact same order.
  mcqIds: integer("mcq_ids").array().notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | DECLINED | COMPLETED | EXPIRED
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const challengeAttemptsTable = pgTable(
  "med_challenge_attempts",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id").notNull(),
    userId: integer("user_id").notNull(),
    correctCount: integer("correct_count").notNull().default(0),
    totalQuestions: integer("total_questions").notNull().default(0),
    scorePercent: numeric("score_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    durationSeconds: integer("duration_seconds"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({ challengeUserIdx: uniqueIndex("med_challenge_attempts_challenge_user_idx").on(table.challengeId, table.userId) }),
);

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
  // Simple targeting mirroring modulesTable/blocksTable's programTargetKind +
  // yearTargetNumber, added alongside the older institutionId/programId/
  // academicYearId FK trio above. Those FKs require an admin to have set up
  // Colleges & courses first (most don't — see AdminPastPapers' "No programs
  // set up yet" notice), so in practice they were almost always left null,
  // which meant every paper stayed visible to every program/year regardless
  // of the "Degree/Year" label shown on it. These two columns are instead
  // derived automatically from that same Degree + Year picker at save time —
  // no separate setup required — the same way a module or block is targeted.
  // Null means "all programs" / "all years" on that axis, same convention.
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
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
  // One of TEAM_CATEGORIES (reviewer/question_setter/ownership) — which
  // group this member is shown under on Profile's "Our Academic Team".
  category: text("category").notNull().default("reviewer"),
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
  // Nullable — profiles saved before hint/reference text-pattern parsing
  // existed fall back to DEFAULT_IMPORT_PATTERNS in mcqParser.ts.
  hintPattern: text("hint_pattern"),
  referencePattern: text("reference_pattern"),
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

// A student's own highlights inside the secure book reader. Text highlights
// are stored as a word range (start/end index into that page's word list from
// GET /books/:id/pages/:n/words — the reader never receives the words' text,
// only their boxes), area highlights as a normalised rectangle. `fileKey`
// fingerprints the book file the indices were made against, so replacing the
// PDF can't paint highlights over the wrong words.
export const bookHighlightsTable = pgTable("med_book_highlights", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bookId: integer("book_id").notNull(),
  fileKey: text("file_key").notNull(),
  page: integer("page").notNull(),
  kind: text("kind").notNull().default("words"), // words | area
  startWord: integer("start_word"),
  endWord: integer("end_word"),
  rect: text("rect"), // JSON {x,y,w,h} in 0..1 page coordinates, area highlights only
  color: text("color").notNull().default("yellow"),
  note: text("note"),
  ...timestamps,
});

export const bookReadingProgressTable = pgTable("med_book_reading_progress", {
  userId: integer("user_id").notNull(),
  bookId: integer("book_id").notNull(),
  page: integer("page").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.bookId] }) }));

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
  // Raw (truncated/invalid) text the AI provider returned when generation
  // failed, so an admin can diagnose a bad prompt/response from the admin
  // UI directly instead of needing DevTools access to a student's session.
  // Null on success. Capped in application code before insert (see
  // aiVisualizer.ts) — this column has no length limit itself.
  rawResponse: text("raw_response"),
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
  rating: integer("rating"), // optional 1-5 star rating, null if not given
  // Admin-curated flag: true means this entry has been picked to display
  // as a public testimonial on the marketing site (see GET /feedback/featured,
  // an unauthenticated endpoint — only feedback explicitly marked here, and
  // only 5-star entries, are ever exposed publicly; everything else in this
  // table stays admin/owner-only).
  featured: boolean("featured").notNull().default(false),
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

// Per-user "hide this" record for a notification the user doesn't own
// outright — i.e. a broadcast row (notificationsTable.userId IS NULL) that
// is shared across every student. A student's own "Clear all" can't just
// delete those rows (that would erase the announcement for every other
// student too), so it records a dismissal here instead; GET /notifications
// excludes any notification the requesting user has dismissed. Rows the
// user actually owns (userId = them) are hard-deleted by "Clear all"
// instead of dismissed, so this table only ever holds dismissals of
// broadcasts. An admin's "Clear all" is a different, global action (see
// DELETE /admin/notifications/clear-all) that deletes the underlying
// med_notifications rows entirely, which is what actually removes them for
// students too — this table is just the per-student "hide" mechanism for
// the student-facing button.
export const notificationDismissalsTable = pgTable("med_notification_dismissals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  notificationId: integer("notification_id").notNull(),
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

// ---------------------------------------------------------------------------
// OSPE / OSCE practical exams — a separate curriculum namespace (its own
// Blocks/Modules) from the MCQ blocksTable/modulesTable above, since a
// practical station is organized around a photo/specimen/scenario plus
// either an MCQ-style selectable answer or a written answer, not a plain
// MCQ. Every row here carries examType ('OSPE' | 'OSCE') so both practical
// exam types share one set of tables/routes/admin screens but stay
// filterable — an admin picks OSPE or OSCE when creating a block, and it's
// inherited by everything under it. programTargetKind/yearTargetNumber
// follow the exact same null-means-everyone convention as
// blocksTable/modulesTable/examsTable above.
// ---------------------------------------------------------------------------

export const ospeBlocksTable = pgTable("med_ospe_blocks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  examType: text("exam_type").notNull().default("OSPE"), // OSPE | OSCE
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  iconPath: text("icon_path"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const ospeModulesTable = pgTable("med_ospe_modules", {
  id: serial("id").primaryKey(),
  // Nullable — a module with no block shows under "Unassigned", same
  // convention as modulesTable.blockId.
  blockId: integer("block_id"),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  examType: text("exam_type").notNull().default("OSPE"),
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  iconPath: text("icon_path"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

// Learning material: admin-uploaded photo/text/file/link that students
// browse freely to study before being tested — no marking, no attempt
// tracking. The "study" counterpart to med_ospe_stations below (the
// "test" side). Mirrors resourcesTable's storagePath/externalUrl pattern.
export const ospeLearningMaterialsTable = pgTable("med_ospe_learning_materials", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  // Optional direct link to a block (med_ospe_blocks) so content can live
  // under a block with no module layer at all. Null = not filed under a block.
  blockId: integer("block_id"),
  examType: text("exam_type").notNull().default("OSPE"),
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  imagePath: text("image_path"),
  attachmentPath: text("attachment_path"),
  externalUrl: text("external_url"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

// A single practical station — a photo/specimen/scenario plus either an
// MCQ-style selectable answer (answerType="MCQ", graded automatically
// against correctAnswer) or a written/structured answer (answerType=
// "WRITTEN", graded by the student self-assessing against modelAnswer once
// revealed, since free text can't be auto-graded). Lives in the bank until
// attached to a med_ospe_exams paper via med_ospe_exam_stations — same
// bank -> paper split as MCQs/med_exam_questions.
export const ospeStationsTable = pgTable("med_ospe_stations", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  // Optional direct link to a block (med_ospe_blocks) so content can live
  // under a block with no module layer at all. Null = not filed under a block.
  blockId: integer("block_id"),
  examType: text("exam_type").notNull().default("OSPE"),
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  title: text("title").notNull(),
  instructions: text("instructions").notNull().default(""),
  imagePath: text("image_path"),
  attachmentPath: text("attachment_path"),
  answerType: text("answer_type").notNull().default("WRITTEN"), // MCQ | WRITTEN | LABELING
  options: text("options").array(),
  correctAnswer: text("correct_answer"),
  modelAnswer: text("model_answer"),
  // Only for answerType="LABELING" (identification/pin-the-label stations):
  // numbered points pinned onto imagePath, each an { id, x, y, label,
  // marks? } object serialized as JSON. x/y are percentages (0-100) of the
  // image's width/height so a point stays correctly placed regardless of
  // how large the image renders on the viewer's screen. `label` is the
  // correct answer for that point — stripped out before the station is
  // ever sent to a student (see getExamStationsForStudent in ospe.ts).
  labelPoints: jsonb("label_points"),
  marks: numeric("marks", { precision: 6, scale: 2 }).notNull().default("1"),
  timeLimitSeconds: integer("time_limit_seconds"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const ospeExamsTable = pgTable("med_ospe_exams", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  examType: text("exam_type").notNull().default("OSPE"),
  programTargetKind: text("program_target_kind"),
  yearTargetNumber: integer("year_target_number"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  maxAttempts: integer("max_attempts").notNull().default(1),
  passingPercent: numeric("passing_percent", { precision: 5, scale: 2 }),
  resultReleaseMode: text("result_release_mode").notNull().default("immediate"), // immediate | after_end | manual
  showMarks: boolean("show_marks").notNull().default(true),
  showPercentage: boolean("show_percentage").notNull().default(true),
  showCorrectAnswers: boolean("show_correct_answers").notNull().default(true),
  status: text("status").notNull().default("draft"), // draft | published | archived
  ...timestamps,
});

export const ospeExamStationsTable = pgTable("med_ospe_exam_stations", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull(),
  stationId: integer("station_id").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
}, (table) => ({ examStationIdx: uniqueIndex("med_ospe_exam_stations_exam_station_idx").on(table.examId, table.stationId) }));

export const ospeExamAttemptsTable = pgTable("med_ospe_exam_attempts", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull(),
  userId: integer("user_id").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  totalStations: integer("total_stations").notNull().default(0),
  totalMarks: numeric("total_marks", { precision: 8, scale: 2 }).notNull().default("0"),
  obtainedMarks: numeric("obtained_marks", { precision: 8, scale: 2 }).notNull().default("0"),
  percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  passed: boolean("passed"),
  status: text("status").notNull().default("in_progress"), // in_progress | submitted | auto_submitted
  resultsReleasedAt: timestamp("results_released_at", { withTimezone: true }),
  ...timestamps,
});

export const ospeExamAnswersTable = pgTable("med_ospe_exam_answers", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull(),
  stationId: integer("station_id").notNull(),
  selectedAnswer: text("selected_answer"),
  writtenAnswer: text("written_answer"),
  // For answerType="LABELING" stations only: { [pointId]: student's text
  // for that pin }. Graded deterministically against labelPoints, same
  // spirit as MCQ's correctAnswer compare — see gradeAndSubmit in ospe.ts.
  labelAnswers: jsonb("label_answers"),
  correct: boolean("correct"),
  // Set by an AI grading pass (see lib/aiExplain.ts gradeWrittenAnswer) —
  // only meaningful for answerType="WRITTEN" stations, which can't be
  // graded automatically like MCQ. Null until grading has run (either at
  // submit time or via the student-triggered re-grade endpoint);
  // 'correct' | 'partial' | 'incorrect' once graded.
  aiVerdict: text("ai_verdict"),
  aiFeedback: text("ai_feedback"),
  aiGradedAt: timestamp("ai_graded_at", { withTimezone: true }),
  marksObtained: numeric("marks_obtained", { precision: 6, scale: 2 }),
  ...timestamps,
}, (table) => ({ attemptStationIdx: uniqueIndex("med_ospe_exam_answers_attempt_station_idx").on(table.attemptId, table.stationId) }));

export const insertUserSchema = createInsertSchema(usersTable);
export const insertMembershipPlanSchema = createInsertSchema(membershipPlansTable);
export const insertPaymentSchema = createInsertSchema(paymentsTable);
export const insertModuleSchema = createInsertSchema(modulesTable);
export const insertBlockSchema = createInsertSchema(blocksTable);
export const insertMcqSchema = createInsertSchema(mcqsTable);
export const insertInstitutionSchema = createInsertSchema(institutionsTable);
export const insertProgramSchema = createInsertSchema(programsTable);
export const insertAcademicYearSchema = createInsertSchema(academicYearsTable);
export const insertBatchSchema = createInsertSchema(batchesTable);

export type User = typeof usersTable.$inferSelect;
export type MembershipPlan = typeof membershipPlansTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type Module = typeof modulesTable.$inferSelect;
export type Block = typeof blocksTable.$inferSelect;
export type Mcq = typeof mcqsTable.$inferSelect;
export type Flashcard = typeof flashcardsTable.$inferSelect;
export type Institution = typeof institutionsTable.$inferSelect;
export type Program = typeof programsTable.$inferSelect;
export type AcademicYear = typeof academicYearsTable.$inferSelect;
export type Batch = typeof batchesTable.$inferSelect;
export type Book = typeof booksTable.$inferSelect;
export type Coupon = typeof couponsTable.$inferSelect;
export type BookPurchase = typeof bookPurchasesTable.$inferSelect;
export type OspeBlock = typeof ospeBlocksTable.$inferSelect;
export type OspeModule = typeof ospeModulesTable.$inferSelect;
export type OspeLearningMaterial = typeof ospeLearningMaterialsTable.$inferSelect;
export type OspeStation = typeof ospeStationsTable.$inferSelect;
export type OspeExam = typeof ospeExamsTable.$inferSelect;
export type OspeExamAttempt = typeof ospeExamAttemptsTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

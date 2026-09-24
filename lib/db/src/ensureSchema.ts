import { pool } from "./index";

// See ../ensure-schema.sql for the full explanation of *why* this exists —
// short version: nothing in this deploy pipeline ever ran
// drizzle-kit push against a fresh database, so on a brand-new Postgres
// (a fresh Railway Postgres plugin, for example) every table is missing on
// first boot. This runs a hand-written copy of the schema (CREATE
// TABLE/INDEX IF NOT EXISTS, plus a small additive-migrations block of
// ALTER ... ADD COLUMN IF NOT EXISTS / DROP NOT NULL further down for
// columns added after a table already existed in production — see that
// block's own comment) before anything else touches the database, so both
// a brand-new deploy and an existing one missing a newer column work
// without a manual step.
//
// The SQL is inlined here (rather than read from ensure-schema.sql at
// runtime) because api-server's build bundles @workspace/db straight into
// a single dist/index.mjs — a relative readFileSync from this file would
// resolve against the bundled file's location, not this source file's,
// and silently fail to find the .sql file after a build. Keep this in sync
// with ensure-schema.sql (which stays as the human-readable/manually
// runnable copy — e.g. to run by hand via psql — and is not itself read
// by any code path).
//
// Safe to run on every boot — every statement here is a no-op once already
// applied. Does not replace pnpm run db:push / manual-migration.sql for
// schema changes in general — only the specific columns the
// additive-migrations block below names are covered automatically; a truly
// new column still needs to be added to that block by hand.
const ENSURE_SCHEMA_SQL = `
BEGIN;

CREATE TABLE IF NOT EXISTS med_institutions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_programs (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_academic_years (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  year_number INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_batches (
  id SERIAL PRIMARY KEY,
  academic_year_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  institution_id INTEGER,
  program_id INTEGER,
  academic_year_id INTEGER,
  batch_id INTEGER,
  roll_number TEXT,
  phone TEXT,
  profile_picture_path TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_practice_date DATE,
  institution TEXT,
  program TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS med_users_email_idx
  ON med_users (email);

CREATE TABLE IF NOT EXISTS med_email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  new_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_student_documents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_membership_plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL,
  duration INTEGER NOT NULL,
  duration_unit TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  eligibility TEXT,
  original_price NUMERIC(12, 2),
  discount_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  plan_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL,
  duration INTEGER NOT NULL,
  duration_unit TEXT NOT NULL,
  method TEXT NOT NULL,
  reference TEXT NOT NULL,
  payment_date DATE NOT NULL,
  proof_path TEXT,
  proof_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING_REVIEW',
  rejection_reason TEXT,
  reviewed_by INTEGER,
  reviewed_at TIMESTAMPTZ,
  gateway_provider TEXT,
  gateway_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_memberships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  payment_id INTEGER,
  plan_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  suspended_reason TEXT,
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_payment_webhook_events (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS med_webhook_event_idx
  ON med_payment_webhook_events (provider, event_id);

CREATE TABLE IF NOT EXISTS med_blocks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  program_target_kind TEXT,
  year_target_number INTEGER,
  icon_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_modules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  block_id INTEGER,
  program_target_kind TEXT,
  year_target_number INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_subjects (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  icon_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_topics (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_mcqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  correct_answer TEXT,
  explanation TEXT,
  explanation_status TEXT NOT NULL DEFAULT 'PENDING',
  reference TEXT,
  difficulty TEXT NOT NULL DEFAULT 'moderate',
  tags TEXT[] NOT NULL DEFAULT '{}',
  image_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'manual',
  module_id INTEGER,
  subject_id INTEGER,
  topic_id INTEGER,
  past_paper_id INTEGER,
  exam_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_flashcards (
  id SERIAL PRIMARY KEY,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  module_id INTEGER,
  subject_id INTEGER,
  topic_id INTEGER,
  module TEXT NOT NULL,
  topic TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_resources (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL,
  module_id INTEGER,
  institution_id INTEGER,
  program_id INTEGER,
  academic_year_id INTEGER,
  module TEXT NOT NULL,
  size TEXT NOT NULL,
  storage_path TEXT,
  external_url TEXT,
  protected BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  module_id INTEGER,
  subject_id INTEGER,
  topic_id INTEGER,
  program_target_kind TEXT,
  year_target_number INTEGER,
  storage_path TEXT NOT NULL,
  cover_image_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_practice_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  module_id INTEGER,
  subject_id INTEGER,
  topic_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'untimed',
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  score_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_practice_answers (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL,
  mcq_id INTEGER NOT NULL,
  selected_answer TEXT,
  correct BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_student_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  module_id INTEGER NOT NULL,
  topics_completed INTEGER NOT NULL DEFAULT 0,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS med_progress_user_module_idx
  ON med_student_progress (user_id, module_id);

CREATE TABLE IF NOT EXISTS med_past_papers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  exam_board TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  institution_id INTEGER,
  program_id INTEGER,
  academic_year_id INTEGER,
  program_target_kind TEXT,
  year_target_number INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_team_members (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'reviewer',
  bio TEXT NOT NULL DEFAULT '',
  achievement_badge TEXT NOT NULL DEFAULT '',
  photo_path TEXT,
  linkedin_url TEXT NOT NULL DEFAULT '',
  instagram_url TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_exams (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  program_target_kind TEXT,
  year_target_number INTEGER,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  negative_marking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  negative_mark_per_wrong NUMERIC(5, 2) NOT NULL DEFAULT 0,
  passing_percent NUMERIC(5, 2),
  result_release_mode TEXT NOT NULL DEFAULT 'immediate',
  show_marks BOOLEAN NOT NULL DEFAULT TRUE,
  show_percentage BOOLEAN NOT NULL DEFAULT TRUE,
  show_correct_answers BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_exam_questions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  mcq_id INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS med_exam_questions_exam_mcq_idx
  ON med_exam_questions (exam_id, mcq_id);

CREATE TABLE IF NOT EXISTS med_exam_attempts (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(8, 2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  passed BOOLEAN,
  status TEXT NOT NULL DEFAULT 'in_progress',
  results_released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_exam_answers (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL,
  mcq_id INTEGER NOT NULL,
  selected_answer TEXT,
  correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS med_exam_answers_attempt_mcq_idx
  ON med_exam_answers (attempt_id, mcq_id);

CREATE TABLE IF NOT EXISTS med_mcq_import_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  question_pattern TEXT NOT NULL,
  option_pattern TEXT NOT NULL,
  answer_pattern TEXT NOT NULL,
  explanation_pattern TEXT NOT NULL,
  hint_pattern TEXT,
  reference_pattern TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hint/Reference line parsing for text-pattern MCQ imports (see mcqParser.ts) —
-- nullable so existing saved profiles fall back to DEFAULT_IMPORT_PATTERNS.
ALTER TABLE med_mcq_import_profiles ADD COLUMN IF NOT EXISTS hint_pattern TEXT;
ALTER TABLE med_mcq_import_profiles ADD COLUMN IF NOT EXISTS reference_pattern TEXT;

CREATE TABLE IF NOT EXISTS med_notebook_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  mcq_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_book_highlights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  file_key TEXT NOT NULL,
  page INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'words',
  start_word INTEGER,
  end_word INTEGER,
  rect TEXT,
  color TEXT NOT NULL DEFAULT 'yellow',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS med_book_highlights_user_book_idx ON med_book_highlights (user_id, book_id);

CREATE TABLE IF NOT EXISTS med_book_reading_progress (
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS med_saved_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_ai_visualizer_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  visualization_type TEXT,
  error_message TEXT,
  raw_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_flagged_mcqs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  mcq_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS med_flagged_user_mcq_idx
  ON med_flagged_mcqs (user_id, mcq_id);

CREATE TABLE IF NOT EXISTS med_feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  rating INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE med_feedback ADD COLUMN IF NOT EXISTS rating INTEGER;
-- Admin-curated "show this on the public homepage" flag — see GET
-- /feedback/featured (public, unauthenticated) and the admin toggle in
-- AdminFeedback.tsx. Only 5-star entries an admin has explicitly marked
-- featured=true are ever returned from that endpoint.
ALTER TABLE med_feedback ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS med_feedback_replies (
  id SERIAL PRIMARY KEY,
  feedback_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  author_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_challenges (
  id SERIAL PRIMARY KEY,
  challenger_id INTEGER NOT NULL,
  opponent_id INTEGER NOT NULL,
  block_id INTEGER,
  module_id INTEGER,
  subject_id INTEGER,
  topic_id INTEGER,
  mcq_ids INTEGER[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS med_challenges_challenger_idx ON med_challenges (challenger_id);
CREATE INDEX IF NOT EXISTS med_challenges_opponent_idx ON med_challenges (opponent_id);

CREATE TABLE IF NOT EXISTS med_challenge_attempts (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  score_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS med_challenge_attempts_challenge_user_idx
  ON med_challenge_attempts (challenge_id, user_id);

CREATE TABLE IF NOT EXISTS med_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_notification_dismissals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  notification_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS med_notification_dismissals_user_id_idx ON med_notification_dismissals (user_id);

CREATE TABLE IF NOT EXISTS med_audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Additive migrations for columns added to the Drizzle schema AFTER a
-- table already existed in production. CREATE TABLE IF NOT EXISTS above
-- is a no-op on a table that's already there, so a brand-new column never
-- reaches an existing deployment on its own — these ALTER ... ADD COLUMN
-- IF NOT EXISTS / DROP NOT NULL statements are what actually apply it,
-- and are safe to rerun every boot (each is a no-op once applied). This
-- mirrors lib/db/manual-migration.sql, which covered the same changes but
-- was written to be run by hand and, in practice, never was — hence
-- "column does not exist" errors in production (option_explanations on
-- med_mcqs, original_price/discount_label on med_membership_plans) despite
-- both columns being in the Drizzle schema and in a CREATE TABLE above.
-- Keep this in sync with manual-migration.sql and ensure-schema.sql.
-- ---------------------------------------------------------------------

-- med_mcqs: curriculum placement became optional once MCQs could be
-- imported straight into a past paper (no module/subject/topic needed).
ALTER TABLE med_mcqs ALTER COLUMN module_id DROP NOT NULL;
ALTER TABLE med_mcqs ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE med_mcqs ALTER COLUMN topic_id DROP NOT NULL;

-- med_mcqs: per-option explanations (why each specific option is right or
-- wrong), index-aligned with the "options" array. explanation_status
-- tracks whether those per-option explanations have been generated yet
-- (PENDING/GENERATED/etc) — both columns were added to the Drizzle schema
-- and the CREATE TABLE above at the same time, but only
-- option_explanations ever got its ADD COLUMN statement here, so
-- explanation_status was still missing on any database whose med_mcqs
-- table predated this change — hence the "column \"explanation_status\" of
-- relation "med_mcqs" does not exist" import failures alongside the
-- option_explanations ones.
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS option_explanations TEXT[];
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS explanation_status TEXT NOT NULL DEFAULT 'PENDING';

-- Round 3, item 4b: short student-facing hint, separate from the
-- answer-revealing explanation field. Nullable/optional, same
-- idempotent-ALTER pattern as the two columns above.
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS hint TEXT;

-- med_mcqs: MCQs can now attach directly to an exam (exam_id) the same
-- way they already attach to a past paper (past_paper_id) — imported
-- exam questions no longer need a module/subject/topic home either.
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS exam_id INTEGER;

-- med_ai_visualizer_logs: raw (truncated/invalid) AI response text, kept
-- for admin diagnosis of generation failures. Added after the table's
-- initial CREATE TABLE ran in production.
ALTER TABLE med_ai_visualizer_logs ADD COLUMN IF NOT EXISTS raw_response TEXT;

-- med_membership_plans: optional promotional pricing/eligibility text and
-- auto-renew flag, all added after the table's initial CREATE TABLE ran
-- in production.
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS eligibility TEXT;
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS original_price NUMERIC(12, 2);
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS discount_label TEXT;

-- med_modules: optional Block grouping (added after med_modules' initial
-- CREATE TABLE ran in production) — nullable so existing modules keep
-- working ungrouped ("Unassigned modules") until an admin assigns one.
ALTER TABLE med_modules ADD COLUMN IF NOT EXISTS block_id INTEGER;

-- Round 3, item 7: optional module thumbnail (see schema/medschool.ts).
ALTER TABLE med_modules ADD COLUMN IF NOT EXISTS icon_path TEXT;

-- Optional subject thumbnail, same pattern as blocks/modules above.
ALTER TABLE med_subjects ADD COLUMN IF NOT EXISTS icon_path TEXT;

-- Team member category (reviewer / question_setter / ownership) — existing
-- rows default to 'reviewer' so they don't disappear from every group.
ALTER TABLE med_team_members ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'reviewer';

-- med_institutions: MBBS vs BDS college split (see schema/medschool.ts).
-- Existing rows default to '' — they still show up (grouped as "Unset" in
-- the admin UI) until someone assigns them a kind; nothing gets hidden by
-- this column showing up on an existing database.
ALTER TABLE med_institutions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT '';

-- Past papers: simple program/year targeting (see schema/medschool.ts's
-- comment on pastPapersTable) — derived automatically from the existing
-- Degree + Year picker in AdminPastPapers, same columns/semantics as
-- med_modules/med_blocks already have.
ALTER TABLE med_past_papers ADD COLUMN IF NOT EXISTS program_target_kind TEXT;
ALTER TABLE med_past_papers ADD COLUMN IF NOT EXISTS year_target_number INTEGER;

-- Books: same simple program/year targeting as med_past_papers above,
-- replacing the Module/Subject/Topic picker in the admin "Add book" form
-- with a direct Degree + Year selector (see schema/medschool.ts's comment
-- on booksTable).
ALTER TABLE med_books ADD COLUMN IF NOT EXISTS program_target_kind TEXT;
ALTER TABLE med_books ADD COLUMN IF NOT EXISTS year_target_number INTEGER;

-- Free/paid books (client request): a free book bypasses the membership
-- gate entirely in books.ts; a paid book keeps the original "any active
-- membership" gate. price/currency are informational only — there is no
-- per-book purchase flow. See schema/medschool.ts's comment on booksTable.
ALTER TABLE med_books ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE med_books ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2);
ALTER TABLE med_books ADD COLUMN IF NOT EXISTS currency TEXT;

-- Membership-plan coupon codes (client request, plans only — not books).
-- See schema/medschool.ts's comment on couponsTable/med_payments.coupon_code
-- for how these apply given payment here is a manual proof-review flow,
-- not a live gateway.
CREATE TABLE IF NOT EXISTS med_coupons (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC(12, 2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS med_coupons_code_idx ON med_coupons (code);
ALTER TABLE med_payments ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE med_payments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2);

-- Per-book purchases: a paid book requires its own approved purchase now,
-- reviewed by an admin independently of the membership-payments queue
-- (med_payments) above. See schema/medschool.ts's comment on
-- bookPurchasesTable and routes/books.ts for the submit/approve/reject
-- routes.
CREATE TABLE IF NOT EXISTS med_book_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  book_title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  reference TEXT NOT NULL,
  payment_date DATE NOT NULL,
  proof_path TEXT,
  proof_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING_REVIEW',
  rejection_reason TEXT,
  reviewed_by INTEGER,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trial mode: an admin can grant a student temporary access for a set
-- number of days without a payment, and revoke it early. Reuses the
-- existing med_memberships grant mechanism (same ACTIVE/expires_at shape
-- as a paid membership, so every access check that already reads
-- memberships "just works" for a trial too) — this column only tags a row
-- as a trial so the admin UI can show/label/revoke it distinctly from a
-- real paid membership. See routes/medschool.ts's /students/:id/trial
-- endpoints and AdminStudents.tsx's "Trial access" panel.
ALTER TABLE med_memberships ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE;

-- Registration switched from a click-a-link email verification token to a
-- 6-digit OTP (see routes/auth.ts) — existing rows on an already-deployed
-- database need this counter added.
ALTER TABLE med_email_verification_tokens ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- Challenge a friend: scope challenges to a Block, not just Module/Subject/
-- Topic (see routes/challenges.ts).
ALTER TABLE med_challenges ADD COLUMN IF NOT EXISTS block_id INTEGER;

-- Admin account-rejection flow: an admin rejecting a student's account
-- (PATCH /students/:id/status with status=REJECTED) now requires a message,
-- stored here so it can be shown back in the admin UI and emailed to the
-- student. See routes/medschool.ts.
ALTER TABLE med_users ADD COLUMN IF NOT EXISTS status_message TEXT;

-- Device limit: per-account cap (NULL = platform default, 0 = unlimited) and
-- one row per signed-in device. See api-server/src/lib/deviceSessions.ts.
ALTER TABLE med_users ADD COLUMN IF NOT EXISTS max_devices INTEGER;

CREATE TABLE IF NOT EXISTS med_user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_id TEXT NOT NULL,
  device_label TEXT NOT NULL DEFAULT 'Unknown device',
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS med_user_sessions_token_idx
  ON med_user_sessions (token_id);
CREATE INDEX IF NOT EXISTS med_user_sessions_user_idx
  ON med_user_sessions (user_id);

-- ---------------------------------------------------------------------
-- OSPE / OSCE practical exams — see lib/db/src/schema/medschool.ts for the
-- full design comment. Own Blocks/Modules namespace (med_ospe_blocks/
-- med_ospe_modules), learning material (med_ospe_learning_materials),
-- a station bank (med_ospe_stations) attached to scheduled papers
-- (med_ospe_exams -> med_ospe_exam_stations), with attempts/answers
-- mirroring med_exam_attempts/med_exam_answers.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS med_ospe_blocks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  exam_type TEXT NOT NULL DEFAULT 'OSPE',
  program_target_kind TEXT,
  year_target_number INTEGER,
  icon_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_ospe_modules (
  id SERIAL PRIMARY KEY,
  block_id INTEGER,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  exam_type TEXT NOT NULL DEFAULT 'OSPE',
  program_target_kind TEXT,
  year_target_number INTEGER,
  icon_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_ospe_learning_materials (
  id SERIAL PRIMARY KEY,
  module_id INTEGER,
  exam_type TEXT NOT NULL DEFAULT 'OSPE',
  program_target_kind TEXT,
  year_target_number INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  attachment_path TEXT,
  external_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_ospe_stations (
  id SERIAL PRIMARY KEY,
  module_id INTEGER,
  exam_type TEXT NOT NULL DEFAULT 'OSPE',
  program_target_kind TEXT,
  year_target_number INTEGER,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  attachment_path TEXT,
  answer_type TEXT NOT NULL DEFAULT 'WRITTEN',
  options TEXT[],
  correct_answer TEXT,
  model_answer TEXT,
  marks NUMERIC(6, 2) NOT NULL DEFAULT 1,
  time_limit_seconds INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE med_ospe_stations ADD COLUMN IF NOT EXISTS label_points JSONB;
-- Stations & learning material can be filed straight under a block (no module needed).
ALTER TABLE med_ospe_stations ADD COLUMN IF NOT EXISTS block_id INTEGER;
ALTER TABLE med_ospe_learning_materials ADD COLUMN IF NOT EXISTS block_id INTEGER;

CREATE TABLE IF NOT EXISTS med_ospe_exams (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  exam_type TEXT NOT NULL DEFAULT 'OSPE',
  program_target_kind TEXT,
  year_target_number INTEGER,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  passing_percent NUMERIC(5, 2),
  result_release_mode TEXT NOT NULL DEFAULT 'immediate',
  show_marks BOOLEAN NOT NULL DEFAULT TRUE,
  show_percentage BOOLEAN NOT NULL DEFAULT TRUE,
  show_correct_answers BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_ospe_exam_stations (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  station_id INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS med_ospe_exam_stations_exam_station_idx
  ON med_ospe_exam_stations (exam_id, station_id);

CREATE TABLE IF NOT EXISTS med_ospe_exam_attempts (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  total_stations INTEGER NOT NULL DEFAULT 0,
  total_marks NUMERIC(8, 2) NOT NULL DEFAULT 0,
  obtained_marks NUMERIC(8, 2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  passed BOOLEAN,
  status TEXT NOT NULL DEFAULT 'in_progress',
  results_released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_ospe_exam_answers (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL,
  station_id INTEGER NOT NULL,
  selected_answer TEXT,
  written_answer TEXT,
  correct BOOLEAN,
  ai_verdict TEXT,
  ai_feedback TEXT,
  ai_graded_at TIMESTAMPTZ,
  marks_obtained NUMERIC(6, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS med_ospe_exam_answers_attempt_station_idx
  ON med_ospe_exam_answers (attempt_id, station_id);
ALTER TABLE med_ospe_exam_answers ADD COLUMN IF NOT EXISTS label_answers JSONB;

COMMIT;
`;

// Tracks whether the most recent ensureSchema() call succeeded. api-server's
// /healthz reads this (see routes/health.ts) so a broken DB connection at
// boot — e.g. the Supabase 28P01 auth failure this was written for —
// can't silently report itself as "healthy" while every schema-dependent
// request fails behind it. Starts false (not yet run) rather than true,
// so a host that checks health before main()'s ensureSchema() call
// resolves doesn't get a false "ok" either.
let lastEnsureSchemaSucceeded = false;

export function isSchemaHealthy(): boolean {
  return lastEnsureSchemaSucceeded;
}

export async function ensureSchema(): Promise<void> {
  try {
    await pool.query(ENSURE_SCHEMA_SQL);
    lastEnsureSchemaSucceeded = true;
  } catch (err) {
    lastEnsureSchemaSucceeded = false;
    throw err;
  }
}

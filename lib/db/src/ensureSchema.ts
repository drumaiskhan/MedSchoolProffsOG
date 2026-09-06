import { pool } from "./index";

// See ../ensure-schema.sql for the full explanation of *why* this exists —
// short version: nothing in this deploy pipeline ever ran
// `drizzle-kit push` against a fresh database, so on a brand-new Postgres
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
// resolve against the *bundled* file's location, not this source file's,
// and silently fail to find the .sql file after a build. Keep this in sync
// with ensure-schema.sql (which stays as the human-readable/manually
// runnable copy — e.g. to run by hand via `psql` — and is not itself read
// by any code path).
//
// Safe to run on every boot — every statement here is a no-op once already
// applied. Does not replace `pnpm run db:push` / manual-migration.sql for
// schema changes in general — only the specific columns the
// additive-migrations block below names are covered automatically; a truly
// new column still needs to be added to that block by hand.
const ENSURE_SCHEMA_SQL = `
BEGIN;

CREATE TABLE IF NOT EXISTS med_institutions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
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
CREATE UNIQUE INDEX IF NOT EXISTS med_users_email_idx ON med_users (email);

CREATE TABLE IF NOT EXISTS med_email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  new_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
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
CREATE UNIQUE INDEX IF NOT EXISTS med_webhook_event_idx ON med_payment_webhook_events (provider, event_id);

CREATE TABLE IF NOT EXISTS med_modules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS med_progress_user_module_idx ON med_student_progress (user_id, module_id);

CREATE TABLE IF NOT EXISTS med_past_papers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  exam_board TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  institution_id INTEGER,
  program_id INTEGER,
  academic_year_id INTEGER,
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
CREATE UNIQUE INDEX IF NOT EXISTS med_exam_questions_exam_mcq_idx ON med_exam_questions (exam_id, mcq_id);

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
CREATE UNIQUE INDEX IF NOT EXISTS med_exam_answers_attempt_mcq_idx ON med_exam_answers (attempt_id, mcq_id);

CREATE TABLE IF NOT EXISTS med_mcq_import_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  question_pattern TEXT NOT NULL,
  option_pattern TEXT NOT NULL,
  answer_pattern TEXT NOT NULL,
  explanation_pattern TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_notebook_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  mcq_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE UNIQUE INDEX IF NOT EXISTS med_flagged_user_mcq_idx ON med_flagged_mcqs (user_id, mcq_id);

CREATE TABLE IF NOT EXISTS med_feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS med_feedback_replies (
  id SERIAL PRIMARY KEY,
  feedback_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  author_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
-- wrong), index-aligned with the "options" array.
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS option_explanations TEXT[];

-- med_membership_plans: optional promotional pricing/eligibility text and
-- auto-renew flag, all added after the table's initial CREATE TABLE ran
-- in production.
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS eligibility TEXT;
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS original_price NUMERIC(12, 2);
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS discount_label TEXT;

COMMIT;
`;

export async function ensureSchema(): Promise<void> {
  await pool.query(ENSURE_SCHEMA_SQL);
}

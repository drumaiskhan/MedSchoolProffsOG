-- Idempotent baseline schema bootstrap.
--
-- Why this exists: the only way this schema ever reached a real database
-- was `pnpm run db:push` (drizzle-kit push), run by hand. On Railway (and
-- any other Dockerfile/CMD-based deploy), the container just runs
-- `node dist/index.mjs` — nothing ever pushes the schema first. On a fresh
-- Postgres (a brand-new Railway Postgres plugin, for example), that means
-- every table is missing on first boot, so the very first queries the app
-- makes — normalizeLegacyRoles()'s UPDATE and seedDefaultAdmin()'s
-- SELECT/INSERT, both against med_users — fail with
-- "relation \"med_users\" does not exist", exactly as seen in the Railway
-- deploy logs. The server still starts (both failures are caught and
-- logged, not fatal — see index.ts), so the symptom looks like a broken
-- migration rather than a missing table, but a missing table is exactly
-- what it is.
--
-- This file is mostly CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS — purely additive, safe to run on every boot: a no-op once the
-- schema already exists, and it fills in a table on its own if only *some*
-- tables are missing (e.g. a partially-applied deploy). It is run
-- automatically by lib/db/src/ensureSchema.ts before any other query, in
-- api-server's index.ts.
--
-- It also includes a small, explicit "additive migrations" block at the
-- end (ALTER TABLE ... ADD COLUMN IF NOT EXISTS / DROP NOT NULL) for
-- columns added to the schema after their table had already been created
-- in production — CREATE TABLE IF NOT EXISTS alone can't add a column to
-- an existing table, so without this block those columns would exist in
-- the Drizzle schema and never reach a real deployment (see that block's
-- own comment for the specific columns and the bug this caused). Every
-- statement there is idempotent/safe to rerun — never a destructive ALTER
-- or DROP.
--
-- This does NOT replace `pnpm run db:push` / manual-migration.sql for
-- schema *changes* later on (new columns, altered types, etc.) — those
-- still need a real migration, same as before. This only guarantees the
-- tables (and the specific columns called out in the additive-migrations
-- block below) exist in the first place.

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
  coupon_code TEXT,
  discount_amount NUMERIC(12, 2),
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
CREATE UNIQUE INDEX IF NOT EXISTS med_webhook_event_idx ON med_payment_webhook_events (provider, event_id);

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
  option_explanations TEXT[],
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
  storage_path TEXT NOT NULL,
  cover_image_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_free BOOLEAN NOT NULL DEFAULT FALSE,
  price NUMERIC(12, 2),
  currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Membership-plan coupon codes (plans only, not books — see the matching
-- comment in ensureSchema.ts, which is what actually runs at boot).
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

-- Per-book purchases — see the matching comment in ensureSchema.ts, which
-- is what actually runs at boot.
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
  -- Which of the three fixed groups this member is shown under on the
  -- Profile page's "Our Academic Team" section — see teamMembersTable.
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

-- Admin-curated "show this on the public homepage" flag — see GET
-- /feedback/featured (public) and the admin toggle in AdminFeedback.tsx.
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
-- Additive migrations for columns added to the schema AFTER a table
-- already existed in production. CREATE TABLE IF NOT EXISTS above is a
-- no-op on a table that's already there, so on an existing deployment
-- these ALTER statements are what actually apply the column — safe to
-- rerun any time (each is a no-op once applied). Mirrors the same block
-- in ensureSchema.ts (which is what actually runs on every boot) and
-- manual-migration.sql — keep all three in sync.
-- ---------------------------------------------------------------------
ALTER TABLE med_mcqs ALTER COLUMN module_id DROP NOT NULL;
ALTER TABLE med_mcqs ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE med_mcqs ALTER COLUMN topic_id DROP NOT NULL;
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS option_explanations TEXT[];
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS explanation_status TEXT NOT NULL DEFAULT 'PENDING';
-- Round 3, item 4b: short student-facing hint field (see ensureSchema.ts).
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS hint TEXT;
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS exam_id INTEGER;

ALTER TABLE med_ai_visualizer_logs ADD COLUMN IF NOT EXISTS raw_response TEXT;

ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS eligibility TEXT;
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS original_price NUMERIC(12, 2);
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS discount_label TEXT;

ALTER TABLE med_modules ADD COLUMN IF NOT EXISTS block_id INTEGER;
-- Round 3, item 7: optional module thumbnail (see schema/medschool.ts).
ALTER TABLE med_modules ADD COLUMN IF NOT EXISTS icon_path TEXT;
-- Optional subject thumbnail, same pattern as blocks/modules above.
ALTER TABLE med_subjects ADD COLUMN IF NOT EXISTS icon_path TEXT;

-- Team member category (reviewer / question_setter / ownership) — existing
-- rows default to 'reviewer' so they don't disappear from every group.
ALTER TABLE med_team_members ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'reviewer';

-- Past papers: simple program/year targeting, derived automatically from
-- the existing Degree + Year picker in AdminPastPapers — same columns/
-- semantics as med_modules/med_blocks already have.
ALTER TABLE med_past_papers ADD COLUMN IF NOT EXISTS program_target_kind TEXT;
ALTER TABLE med_past_papers ADD COLUMN IF NOT EXISTS year_target_number INTEGER;

-- Trial mode: admin-granted temporary access, tagged distinctly from a
-- real paid membership so it can be shown/revoked separately. See
-- routes/medschool.ts's /students/:id/trial endpoints.
ALTER TABLE med_memberships ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE;

-- Registration switched from a click-a-link email verification token to a
-- 6-digit OTP (see routes/auth.ts) — existing rows on an already-deployed
-- database need this counter added.
ALTER TABLE med_email_verification_tokens ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- Friend challenges: a student finds another student (search by name,
-- email, phone, or roll number) and challenges them to the same fixed set
-- of MCQs. See schema/medschool.ts's challengesTable/challengeAttemptsTable
-- comment for the full rationale.
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

-- Challenge a friend: scope challenges to a Block, not just Module/Subject/
-- Topic (see routes/challenges.ts). Additive migration for databases where
-- med_challenges already existed before block_id was added above.
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

COMMIT;

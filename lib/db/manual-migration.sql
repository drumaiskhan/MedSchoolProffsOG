-- Manual migration covering every schema change made in this round of work.
-- Drizzle-kit wasn't available in the sandbox this was built in (no network
-- access to install it, no DB connection to introspect against), so this
-- was hand-written directly from lib/db/src/schema/medschool.ts instead of
-- generated. Review before running — in particular the mcqsTable ALTERs
-- assume there are no existing rows with NULL in a column that's about to
-- become nullable (there won't be, since the columns are being loosened,
-- not tightened) and that "med_mcqs" is in fact the deployed table name.
--
-- Safe to run as a single transaction; every statement is idempotent-ish
-- (IF NOT EXISTS / IF EXISTS) except the mcqsTable ALTER COLUMN ... DROP
-- NOT NULL, which errors harmlessly if already applied (Postgres allows
-- dropping a constraint that isn't there? No — it doesn't. If you're
-- unsure whether this already ran, check with:
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_name = 'med_mcqs' AND column_name = 'module_id';
-- ("YES" means this section already applied — skip it.)

BEGIN;

-- ---------------------------------------------------------------------
-- I1: mcqsTable.moduleId/subjectId/topicId are now nullable — an MCQ
-- imported straight into a past paper no longer needs a curriculum
-- placement. The API layer (mcq-import.ts's CommitBody) still requires
-- either a pastPaperId or the full trio; this just stops the DB from
-- enforcing NOT NULL on its own.
-- ---------------------------------------------------------------------
ALTER TABLE med_mcqs ALTER COLUMN module_id DROP NOT NULL;
ALTER TABLE med_mcqs ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE med_mcqs ALTER COLUMN topic_id DROP NOT NULL;

-- ---------------------------------------------------------------------
-- H3: optional promotional pricing on membership plans.
-- ---------------------------------------------------------------------
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS original_price NUMERIC(12, 2);
ALTER TABLE med_membership_plans ADD COLUMN IF NOT EXISTS discount_label TEXT;

-- ---------------------------------------------------------------------
-- F: Books library (new table).
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- J: Feedback reply threads (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS med_feedback_replies (
  id SERIAL PRIMARY KEY,
  feedback_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  author_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- feedbackTable.status previously only allowed 'open' | 'reviewed' at the
-- application layer (no DB-level CHECK constraint exists, so no ALTER is
-- needed here) — 'replied' is just a new string value the column already
-- accepts.

-- ---------------------------------------------------------------------
-- K: Per-option MCQ explanations — why each wrong option is wrong, not
-- just why the correct one is right. Index-aligned with med_mcqs.options.
-- explanation_status tracks whether those explanations have been
-- generated yet; it shipped in the same schema change as
-- option_explanations but was missing its own ALTER statement here and in
-- ensureSchema.ts/ensure-schema.sql, which is why "column
-- \"explanation_status\" does not exist" kept appearing in production
-- even after option_explanations was added.
-- ---------------------------------------------------------------------
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS option_explanations TEXT[];
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS explanation_status TEXT NOT NULL DEFAULT 'PENDING';
-- Round 3, item 4b: short student-facing hint field (see ensureSchema.ts).
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS hint TEXT;

-- Hint/Reference line parsing for text-pattern MCQ imports (see mcqParser.ts) —
-- nullable so existing saved import profiles fall back to
-- DEFAULT_IMPORT_PATTERNS' own hintPattern/referencePattern.
ALTER TABLE med_mcq_import_profiles ADD COLUMN IF NOT EXISTS hint_pattern TEXT;
ALTER TABLE med_mcq_import_profiles ADD COLUMN IF NOT EXISTS reference_pattern TEXT;

-- MCQs can now attach directly to an exam (exam_id), the same way they
-- already attach to a past paper (past_paper_id) — imported exam
-- questions no longer need a module/subject/topic home either.
ALTER TABLE med_mcqs ADD COLUMN IF NOT EXISTS exam_id INTEGER;

-- ---------------------------------------------------------------------
-- L: AI Visualizer failure diagnostics — raw (truncated/invalid) response
-- text kept alongside the existing error_message so admins can diagnose
-- generation failures from the admin UI without needing DevTools access
-- to a student's session.
-- ---------------------------------------------------------------------
ALTER TABLE med_ai_visualizer_logs ADD COLUMN IF NOT EXISTS raw_response TEXT;

-- ---------------------------------------------------------------------
-- M: Block tier above Modules (Block -> Module -> Subject -> Topic), plus
-- manual display ordering and a thumbnail image.
-- ---------------------------------------------------------------------
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

-- Nullable — existing modules keep working ungrouped ("Unassigned
-- modules") until an admin assigns them to a block.
ALTER TABLE med_modules ADD COLUMN IF NOT EXISTS block_id INTEGER;
-- Round 3, item 7: optional module thumbnail (see schema/medschool.ts).
ALTER TABLE med_modules ADD COLUMN IF NOT EXISTS icon_path TEXT;

COMMIT;

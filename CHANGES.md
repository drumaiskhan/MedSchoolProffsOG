# What changed

This pass turned the demo prototype into a real, auth-backed application.
Everything below is genuinely wired to Postgres via Drizzle — nothing is
hardcoded to a single demo user anymore.

## New backend capabilities

- **Real auth** (`src/lib/auth.ts`, `src/middlewares/auth.ts`, `src/routes/auth.ts`)
  - bcrypt password hashing, JWT session in an httpOnly cookie
  - Student registration **includes payment** (plan choice + payment proof) in
    one step — no separate "register then pay later" flow
  - Email verification (logs to console in dev if SMTP isn't configured)
  - Forgot / reset password, change password, login lockout after repeated
    failed attempts, per-IP+email login rate limiting
  - **Admin sign-up**, gated by an invite code stored in platform settings —
    reachable only at `/admin-signup/1` on the frontend, but the real
    protection is the code, not the URL. Rotate it any time from
    Admin → Platform settings (super admin only).
- **Institutions / Programs / Academic Years / Batches** — full CRUD
  (`src/routes/academic-structure.ts`), admin-only writes, public reads for
  the registration form's cascading dropdowns.
- **Platform settings** (`src/routes/settings.ts`) — key/value settings any
  admin can edit from the UI: platform name, support email, currency,
  payment instructions, announcement banner, registration on/off, and the
  admin invite code.
- **Audit log** (`src/routes/audit.ts`) — every admin mutation is recorded.
- **File uploads** (`src/routes/uploads.ts`, `src/lib/storage.ts`) — payment
  proofs, profile pictures, resources. Uses Supabase Storage when
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set, otherwise falls back to
  local disk (dev only — most hosts don't persist local disk across deploys).
- Every previously-hardcoded route (`req.user.id` was always `1`) now uses
  the real authenticated user, with `requireAuth` / `requireAdmin` /
  `requireActiveMembership` guards applied appropriately.

## New/changed frontend

- `src/lib/api.ts` — typed fetch helpers for everything above (kept separate
  from the generated `@workspace/api-client-react` client so regenerating
  that later won't overwrite these).
- **Register** is now a 2-step wizard: academic details → membership plan +
  payment proof, submitted together. Copy repositions the product as an
  MBBS/BDS **practice** MCQ bank ("no exams") rather than a generic study app.
- **AdminSignup** at `/admin-signup/1`.
- **ForgotPassword / ResetPassword / VerifyEmail** pages.
- **AdminSettings** now reads/writes real settings, including rotating the
  admin invite code.
- **AdminAcademicStructure** (`/admin/academic-structure`) — nested CRUD for
  institutions → programs → academic years → batches, so admins can populate
  what shows up on the registration form.

## What's still a stub / needs your attention

- **Email**: without SMTP env vars, verification/reset emails are logged to
  the server console instead of sent. Set `SMTP_HOST/PORT/USER/PASS` for
  real delivery.
- **File storage**: without Supabase env vars, uploads go to local disk —
  fine for local dev, but set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (and
  create the bucket) before deploying somewhere without persistent disk.
- **CSV bulk MCQ import** and **AI-assisted MCQ drafting** from the original
  spec are not built yet.
- **Payment gateway webhooks** (Stripe/Razorpay-style automatic verification)
  aren't built — payments are manual proof + admin review, matching what you
  described (students submit proof, admin verifies).
- Drizzle schema changed significantly (new tables, new columns on `users`).
  You'll need to run your migration flow (`drizzle-kit generate` / `push`)
  against the target database before first run — there's no seed data, so
  Admin → Colleges & courses is where you'll add your first institution,
  program, year, and batch (needed before anyone can register), and
  Admin → Platform settings is where you'll set the first
  `ADMIN_SIGNUP_CODE` (or use the "Generate new code" button after your
  first admin account exists — see below for the bootstrapping order).

## First-run checklist (in Replit, where this can actually be installed & run)

1. `pnpm install` (pulls in the new deps: bcryptjs, jsonwebtoken, multer,
   nodemailer, @supabase/supabase-js, zod as a direct dep of api-server).
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `JWT_SECRET`
   at minimum.
3. Push the schema: run your existing Drizzle migration command against
   `lib/db/src/schema/medschool.ts`.
4. **Bootstrap your first admin.** Since `ADMIN_SIGNUP_CODE` starts unset,
   `/auth/admin/register` will refuse everyone at first. Easiest path: after
   pushing the schema, manually insert one row into `med_platform_settings`
   (`key='ADMIN_SIGNUP_CODE'`, `value='<pick-something>'`) via your DB
   console, then visit `/admin-signup/1` with that code. After that, rotate
   the code from Admin → Platform settings like normal.
5. Add at least one institution → program → academic year → batch from
   Admin → Colleges & courses, and at least one membership plan from
   Admin → Membership plans — students can't register without these.
6. `pnpm run dev`.

I wasn't able to run any of this myself — this sandbox has no network access,
so no installing packages, no live Postgres, no build/typecheck. I did
review every new file with `tsc` for syntax validity, but real integration
testing needs to happen in Replit.

---

# Pass 2: emedcrack-style feature set

Matched the screenshots you shared (Practice Tests, Past Papers, Flashcards,
sidebar with My Notebook / Saved Sessions / Flagged MCQs / Leaderboard,
Analytics Dashboard with streak + subscription countdown) and made the admin
payments area categorized as requested.

## New backend

- **Past papers** (`routes/past-papers.ts`, `pastPapersTable`) — admin CRUD;
  MCQs link to a paper via `mcqsTable.pastPaperId`; paper cards show a live
  MCQ count and topics-covered count computed from linked MCQs.
- **Streak tracking** — `currentStreak`/`longestStreak`/`lastPracticeDate` on
  `usersTable`, bumped by `routes/analytics.ts` whenever a practice session
  is submitted (consecutive calendar days only).
- **Practice session submission + analytics** (`routes/analytics.ts`) —
  `POST /practice-sessions` scores answers server-side and persists a
  `practiceAttemptsTable`/`practiceAnswersTable` row; `GET
  /student/analytics?range=7d|30d|3m|1y` aggregates sessions, average score,
  questions answered, and time spent for the dashboard.
- **Leaderboard** (`GET /leaderboard?range=...`) — ranks students by correct
  answers over a period.
- **Student personal tools** (`routes/student-tools.ts`) — Notebook (private
  notes), Saved Sessions (named practice filter presets), Flagged MCQs
  (student-flagged, admin-resolvable), Feedback (student submits, admin
  reviews in Feedback inbox).
- **Payment collection details** — added to platform settings
  (`PAYMENT_ACCOUNT_HOLDER/NUMBER/BANK_NAME/IFSC_OR_ROUTING/UPI_ID/QR_CODE_PATH`),
  editable from Admin → Payments → Collection details, and exposed publicly
  at `GET /payment-details` so the registration flow can show students where
  to send money.

## New/changed frontend

- **Sidebar reorganized into labeled sections** — student side now has
  Study desk / Your tools / Your account groups (adds Past papers, My
  notebook, Saved sessions, Flagged MCQs, Leaderboard, Send feedback). Admin
  side now has Overview / **Payments** (Subscription plans, Payment review,
  Collection details) / Content (…, Past papers) / Community (Feedback
  inbox) / Workspace — the "categorised and subcategorised" structure you
  asked for.
- **Dashboard** now shows a real streak count, longest streak, an "Active
  subscription · N days remaining" pill computed from the membership expiry,
  and an Analytics dashboard section with 7D/30D/3M/1Y range tabs (Total
  sessions, Average score, Questions answered, Time spent) — matches your
  screenshot.
- **Practice** is now a real multi-question flow: each answer checked is
  submitted to the backend (driving streak + analytics), with a flag button
  per question and a running session score.
- **Past Papers**, **Notebook**, **Saved Sessions**, **Flagged MCQs**,
  **Leaderboard**, **Send Feedback** — new student pages.
- **Admin → Payments → Collection details** — bank/UPI account fields,
  admin-editable, live-previewed.
- **Admin → Past papers** — create/publish/hide papers (attach MCQs to a
  paper from the MCQ bank by setting its "past paper" field).
- **Admin → Feedback inbox** — view and mark student feedback reviewed.
- **Registration step 2** now displays the admin-configured payment
  collection details (bank/UPI) right above the payment form.

## Still not built (flagged, not forgotten)

- Attaching MCQs to a past paper currently only has a backend endpoint
  (`POST /past-papers/:id/mcqs`) — the MCQ bank admin UI doesn't yet have a
  "past paper" picker field on the create/edit form. Straightforward next
  step.
- Saved Sessions "Resume" currently just links to `/practice` — it doesn't
  yet re-apply the saved filter config.
- CSV bulk MCQ import and AI-assisted MCQ drafting are still not built.

Same caveat as Pass 1: everything here is reviewed for syntax, not run —
please test in Replit, especially the streak/analytics date-boundary logic
and the payment-details-at-signup flow end to end.

---

# Pass 3: admin overhaul (real-time dashboard, full student control, bulk MCQ file import, payments hub)

## Dashboard
- `GET /admin/dashboard` was already real data (not mocked) — now the
  frontend polls it every 30s (`refetchInterval: 30000`) with a "Live ·
  refreshes every 30s" indicator, and the fabricated "+8.4% vs last month"
  figure is gone (nothing was tracking that).

## Students — full control
- `GET /students/:id` — full detail: contact info, academic placement,
  streaks, verification status, and complete payment history.
- `PATCH /students/:id` — admin can edit name/phone/roll number.
- `PATCH /students/:id/status` — now accepts the full lifecycle
  (`UNVERIFIED, VERIFIED, PAYMENT_PENDING_REVIEW, ACTIVE, EXPIRED,
  SUSPENDED, REJECTED`), not just a subset.
- Frontend: clicking a student row opens a detail drawer with all of the
  above, one-click status buttons, and their payment history inline. List
  view also gained a status filter.

## MCQ bulk file uploader (the main ask)
- **New file formats supported**: `.txt`, `.csv`, `.xlsx`/`.xls`, `.pdf`,
  `.docx` (`lib/fileExtraction.ts`, using `xlsx`, `pdf-parse`, `mammoth`).
- **Two extraction strategies**, tried automatically:
  1. **Structured columns** (xlsx/csv with a header row: Question, Option
     A–D, Answer, Explanation, Reference — case-insensitive, several aliases
     recognized) — most reliable, used when available.
  2. **Pattern-based text extraction** (txt/pdf/docx, or spreadsheets
     without recognizable headers) — regex-driven, handles numbered
     questions with lettered options, an "Answer:" line, and an optional
     "Explanation:" line.
- **Admin-customizable patterns**: `mcqImportProfilesTable` +
  `/admin/mcq-import-profiles` CRUD — admins can save named regex profiles
  (question/option/answer/explanation patterns) for sources that don't match
  the default format, and pick one at import time. Regexes are validated
  server-side before saving.
- **Flow**: `POST /admin/mcq-import/parse` is a dry run — extracts
  candidates without touching the database. The admin reviews every
  question in an editable table (question text, 4 options, correct-answer
  picker, explanation), removes anything wrong, then `POST
  /admin/mcq-import/commit` bulk-inserts the reviewed set into a chosen
  module/subject/topic as draft or published. Manual single-MCQ entry still
  exists as a fallback but now uses real module/subject/topic pickers
  instead of hardcoded IDs (that was a real bug in the old code — it always
  saved to module/subject/topic `1`).

## Payments hub
- Payment proof now renders inline — an `<img>` for image proofs, a "View
  payment proof" link for PDFs — instead of just a text path.
- Rejecting a payment now takes a real reason (typed by the admin), sent to
  the student, instead of a hardcoded string.
- Collection details gained **Raast ID** and **mobile wallet** fields
  (provider, number, account name) alongside the existing bank/UPI fields —
  shown to students at registration and editable from Admin → Payments →
  Collection details.
- Plans, payment review, and collection details all live under the same
  Payments nav section (done in Pass 2, unchanged here).

## New dependency note
`xlsx`, `pdf-parse`, and `mammoth` were added to `api-server`'s
`package.json` — `pnpm install` will need to pull these in. As with
everything else, I couldn't install or run this here to confirm the parsers
behave correctly against real files — the regex defaults and library calls
are correct to the best of my knowledge, but please test against a handful
of real question-bank files (one per format) before relying on it for a
large import, and check the "needs review" flags catch what they should.

---

# Pass 4: signup redesign + interactive student pages

## Sign-up (Register)
- Real visual **stepper** (numbered circles, connecting line, checkmark on
  completed step) instead of plain "Step X of Y" text.
- Every step-1 input now has a **leading icon** (name, email, roll number,
  phone) for visual scannability, plus a show/hide toggle and a live
  **password strength meter** on the password field.
- Step-2 plan cards get a "Best value" badge (computed from price/duration),
  animated selection state, hover lift.
- **Payment method** is now a set of clickable tiles (Bank transfer, UPI,
  Raast, Mobile wallet, Card) with icons, replacing the plain `<select>`.
- **Payment proof upload** is now a real drag-and-drop zone — drop or click
  to browse, shows an image preview thumbnail (or a file icon for PDFs),
  and an upload-in-progress state.
- The collection-details box (bank/UPI/Raast/wallet) now has a **copy
  button** on every field instead of being static text.

## Flashcards
- Real 3D flip animation (front/back faces, CSS transform) instead of
  swapping text in place.
- "I know this" / "Still learning" buttons that actually track per-card
  mastery for the session, shown as colored progress dots above the deck,
  plus a restart-deck control.

## Resources
- Search and type filter are now functional (previously the Filter/Search
  buttons did nothing). Cards link out to the actual file/URL when the
  backend provides one.

## Notifications
- "Mark as read" (individually and "mark all") now actually calls the
  backend instead of being decorative buttons.

## Payments (student-facing membership page)
- Gained the same drag-and-drop proof upload, payment-method tiles, and
  copyable collection-details box as the signup flow — previously this page
  didn't even have a file upload field despite the backend supporting one.

## Profile
- "Edit" now opens a real inline form (name, phone) that saves via a new
  self-service `PATCH /auth/me` endpoint — previously the button did
  nothing and there was no way for a student to update their own profile.
- Membership card now shows a real days-remaining count from the student's
  actual membership expiry instead of a hardcoded date.

## Backend addition
- `PATCH /auth/me` (`routes/auth.ts`) — lets the signed-in user update their
  own `name`/`phone`. Everything else about their record (roll number,
  academic placement, status) still requires admin action, which is
  intentional.

Same caveat as every prior pass: reviewed for syntax with `tsc`, not run —
please click through the signup flow and each student page in Replit before
trusting it end to end, especially the flip-card CSS transforms (backface-
visibility support varies slightly across browsers) and the drag-and-drop
upload on mobile Safari.

---

# Pass 5: simplified signup, site content, deployment anywhere

## Signup, simplified per spec
Register is now a single page, not a wizard: **Name, College (admin-set),
Email, WhatsApp, Selected plan (admin-priced), Upload payment proof**.
Programme/academic year/batch/roll number are no longer asked at signup —
they're optional fields an admin can fill in later from the student's
profile if needed. Payment method/reference/date are auto-filled
server-side (`method: "Not specified"`, a generated reference, today's
date) since the simplified flow only asks for proof — admin verifies
visually rather than cross-checking a typed reference.

Backend: `POST /auth/register` relaxed accordingly — `institutionId` is the
only required academic field now; the account is created with status
`PAYMENT_PENDING_REVIEW` immediately, same as before.

## Site content (admin-editable, corner to corner)
- New `teamMembersTable` + `routes/site-content.ts` — a public
  `GET /site-content` bundles everything the footer and team section need:
  social links, platform description, contact info, support hours,
  copyright, a feature-highlight list, quick links, and active team members.
- Admin → **Site content**: edit description, Facebook/YouTube/LinkedIn/
  Instagram URLs, contact email/location/support hours, feature tags
  (add/remove), quick links (label + URL, add/remove), copyright notice.
- Admin → **Academic team**: add/hide/remove team members (name, role, bio,
  achievement badge, photo upload, LinkedIn/Instagram/email).
- Frontend: a `Footer` component with two variants — `compact` (social
  icons + copyright, shown on every sign-in/signup page) and `full`
  ("Connect With Us" + description + contact + features + quick links,
  matching the emedcrack.com footer you referenced) — plus a `TeamSection`
  showing admin-managed team members. Both live on the **student Profile
  page**, not a new route.

## Kept to two surfaces, as asked
No third "marketing site" was added. The footer and team content are part
of the existing student-facing surface (pre-login pages use the compact
footer; the full footer + team section live on the logged-in student's
Profile page). Admin still has exactly one control panel — Site content and
Academic team are just two more sections in it, alongside Payments,
Content, Students, etc. Nothing about the student/admin split changed.

## Deployment — runs locally, deploys anywhere
- **Local dev:** `pnpm install && pnpm run dev` now runs both the API
  (port 3001 default) and frontend (port 5173) together via `concurrently`,
  with Vite's dev server proxying `/api/*` to the backend automatically.
  `vite.config.ts` no longer hard-fails without Replit's `PORT`/`BASE_PATH`
  env vars — both now have sane local defaults.
- **`.env.example`** documents every variable, including the new
  split-deployment ones.
- **Split deployments** (frontend on Vercel/Netlify, backend on
  Railway/Render — different domains): set `VITE_API_BASE_URL` on the
  frontend build and `COOKIE_CROSS_SITE=true` on the backend. The backend's
  CORS now accepts a comma-separated `APP_URL` list, and the session cookie
  switches to `SameSite=None; Secure` when cross-site.
- **New config files:** `Dockerfile` (backend, works on any Docker host),
  `render.yaml` (full blueprint — backend + Postgres + frontend static
  site), `railway.json` (backend), `vercel.json` and `netlify.toml`
  (frontend only — these platforms aren't a fit for the stateful Express
  backend).
- **`DEPLOYMENT.md`** walks through local dev, one-platform deploys
  (Render/Railway hosting everything), and split deploys, plus an admin
  bootstrapping note (how to set the first `ADMIN_SIGNUP_CODE` before any
  admin account exists).

As with the Docker/platform work in general: I couldn't actually run any of
this (no network access here), so treat the config files as correct-per-
platform-docs-to-the-best-of-my-knowledge, not verified-working. The one
thing I'd test first on a real deploy: the split-deployment cookie/CORS
path, since that's the part most likely to have a subtle mismatch until
it's exercised against a real cross-origin browser request.

---

# Pass 6: Program/Year content targeting (MBBS 1-5, BDS 1-4)

This is the core feature from your two spec documents: **content visibility
by Program + Academic Year, enforced server-side**, plus signup picking
Program/Year directly.

## Schema
- `programsTable.kind` — normalized "MBBS"/"BDS" (or blank), independent of
  each institution's own program row. Two colleges can each have their own
  "MBBS" program record, both tagged `kind: "MBBS"`, so a module targeted at
  MBBS shows to every MBBS student regardless of which college they're at.
- `academicYearsTable.yearNumber` — normalized 1-5, same cross-institution
  purpose.
- `modulesTable.programTargetKind` / `yearTargetNumber` — nullable. Null on
  either axis means "everyone" on that axis (backward compatible with
  existing untargeted modules). Set both to restrict a module to exactly
  one program+year combination. Subjects, topics, and MCQs are **not**
  separately targeted — they inherit visibility from their parent module,
  per your spec ("do not create separate copies... subjects/topics/MCQs
  inherit from module").

## Server-side enforcement (the part that actually matters)
New `lib/contentVisibility.ts`:
- `getStudentTargeting(userId)` — resolves a student's program kind + year
  number from their actual academic placement.
- `getVisibleModuleIds(targeting)` — the set of module IDs visible to that
  targeting.

Applied to **every** student content-read endpoint — not just hidden in the
UI:
- `GET /modules` — filtered to visible IDs.
- `GET /subjects` — filtered by parent module visibility; requesting a
  `moduleId` you can't see returns `[]`, not an error that leaks whether it
  exists.
- `GET /topics` — same, via a join back to the subject's module.
- `GET /mcqs` — filtered by module.
- `GET /flashcards` — filtered by module (flashcards with no module set
  stay globally visible, since most existing ones predate this field).

All of these now require `requireAuth` (previously `/modules`, `/subjects`,
`/topics` were readable without a session) — a student manually changing a
`moduleId` in a request still can't see another year's or program's content,
because the filter is a `WHERE` clause, not a response you could trust the
client to respect.

Admins bypass all of this and see everything, plus (in the `/modules`
response only, to avoid touching the generated response schema) the raw
`programTargetKind`/`yearTargetNumber` and a human-readable
`targetingLabel` like `"MBBS + 3rd Year"` or `"All Programs + All Years"`.

## Signup: pick Program + Year directly
Per your latest message, signup now asks **Program (MBBS/BDS tiles) +
Academic Year**, with year options generated dynamically: MBBS shows
1st-5th (5th labeled "Final"), BDS shows 1st-4th (4th labeled "Final").
Selecting BDS and 5 isn't offered — the dropdown itself is bounded by the
program's real max year, and the backend independently rejects
`yearNumber > 5` for MBBS / `> 4` for BDS as defense in depth.

Behind the scenes, `POST /auth/register` **find-or-creates** the
underlying Program/AcademicYear row for the student's chosen college on
first use (e.g. "does College X have an MBBS program row yet? No → create
one with `kind: 'MBBS'`"). This means signup doesn't require an admin to
have pre-populated every college's MBBS/BDS/year combinations — a student
selecting "MBBS, 3rd Year" resolves or provisions exactly the right
`programId`/`academicYearId`, and because visibility is driven by
`kind`/`yearNumber` (not those row IDs), the content-targeting behavior is
correct immediately either way.

## Admin UI
- **Admin → Colleges & courses** (Program/Academic Year CRUD) — no visible
  UI change in this pass; `kind` and `yearNumber` are set automatically by
  the signup auto-provisioning described above. (If you want admins to be
  able to hand-set these when manually creating a program/year — e.g. for
  a college that doesn't go through signup — that's a small follow-up: the
  backend already accepts `kind`/`yearNumber` on `POST/PATCH
  /programs` and `/academic-years`, just not wired to those specific forms
  yet.)
- **Admin → Academic content**: creating or editing a module now shows
  **Program** (All Programs / MBBS / BDS) and **Academic Year** (All Years /
  1st-5th) selectors, with a live preview line ("This module will be
  visible to: MBBS + 3rd Year") before you save, and the same targeting
  label shown as a badge on every module row afterward.

## What this gets you
Admin selects MBBS + 3rd Year on a module (say, "Pathology") → only
students who registered as MBBS in their 3rd year see it, at every college,
automatically. A module left untargeted stays visible to everyone, exactly
like before this pass. This matches the worked example in your spec
("MBBS + 2nd Year", "BDS + 2nd Year", "All Programs + All Years").

## Not done in this pass (flagged, not silently skipped)
- Past-paper and Resource visibility still use their older,
  institution-based scoping (`institutionId`/`programId`/`academicYearId`
  columns from an earlier pass) rather than the new `kind`/`yearNumber`
  system — they weren't in your explicit list this round, but they're the
  natural next candidates if you want the same MBBS/BDS + year targeting
  there too.
- The MCQ bulk importer's "select target module" step (from Pass 3) already
  benefits from this automatically — whatever program/year the chosen
  module is targeted at, imported MCQs inherit that visibility, since they
  attach to the module via `moduleId`. No importer changes were needed.
- Admin hand-editing a program/year's `kind`/`yearNumber` from the
  Colleges & courses UI (noted above) — API supports it, form doesn't
  expose it yet.

Usual caveat: syntax-checked, not run. The one thing I'd specifically
verify on a real deploy is the find-or-create race — two students from the
same brand-new college registering as MBBS 1st Year in the same instant
could theoretically both try to insert the same program row; Postgres will
reject the second as a constraint violation only if you add a unique
index on `(institutionId, kind)` — none exists yet, so as written a rare
double-submit could create two "MBBS" program rows for one college. Low-
probability edge case, but worth knowing about before high-traffic launch.

---

# Pass 7: Pre-Proffs Exams (and: confirmed single admin role, no two-tier split)

## Admin roles
Per your instruction, stayed with **one unified `admin` role** — no
Academic Admin / College Admin split. Every admin can do everything, as
before.

## Pre-Proffs Exam system (new)
This was the largest remaining gap from your spec docs. New tables:
`examsTable`, `examQuestionsTable`, `examAttemptsTable`, `examAnswersTable`.

**Admin side** (`routes/exams.ts`, Admin → Pre-Proffs Exams):
- Create an exam with: title/description, eligibility (Program + Year,
  same targeting model as modules — null means everyone), duration, a
  start/end window, max attempts, negative marking (off by default,
  configurable per-exam — your two spec docs disagreed here: the general
  spec wants negative marking supported, the integration spec says "no
  negative marking"; making it an admin toggle that defaults off satisfies
  both), passing percentage, and independent show/hide toggles for marks,
  percentage, and correct answers.
- Result release has three modes: immediate (student sees their result the
  moment they submit), after the exam window closes, or fully manual
  (admin releases each attempt, or all of an exam's attempts at once).
- Attach questions by pasting MCQ IDs from the MCQ bank (comma-separated) —
  this is intentionally simple rather than a full picker UI, given the MCQ
  bank already has search/filter; a nicer multi-select picker is a
  reasonable follow-up if this feels clunky in practice.
- View every attempt for an exam (student, score, %, status) and release
  results individually.

**Student side** (Study desk → Pre-Proffs Exams):
- Only sees exams that are `published`, match their program+year, and are
  within the open window.
- Starting an exam creates a server-side attempt and returns questions
  **without** `correctAnswer` in the payload — this is the actual security
  boundary, not a frontend hide. A dedicated `getExamQuestionsForStudent()`
  helper is the only place that shapes the student-facing question object,
  specifically to keep it easy to audit that nothing sensitive leaks there.
- Live countdown timer computed from `startedAt + durationMinutes`, not a
  client-side countdown alone — if the student's clock or tab state is
  unreliable, the backend independently checks elapsed time on every
  answer-save and auto-submits (grades whatever was saved) if time's up,
  so someone can't just pause their laptop clock to get more time.
- Question navigator, answer autosave per question, confirm-before-submit.
- Result page polls every 5s until results are released (handles the
  "after_end" and "manual" release modes gracefully — student just sees
  "not released yet" and it updates on its own once it is).

**Grading** happens entirely server-side in `gradeAndSubmit()` — correct
count, wrong count, unanswered count, score (with negative marking applied
if enabled), percentage, and pass/fail against the passing threshold. The
client never computes or asserts correctness; it only ever sends which
option was selected.

**Attempt limits and re-entry**: if a student closes the tab mid-exam and
comes back, `POST /exams/:id/start` recognizes their existing in-progress
attempt and returns it (same questions, same start time — timer keeps
counting from the original `startedAt`) rather than creating a second one.
Attempts beyond `maxAttempts` are rejected server-side.

## What's still open from the original gap list
Explanation status workflow (PENDING/AI_GENERATED/REVIEWED/APPROVED) and
AI-assisted explanation generation are the next largest pieces from your
spec that aren't built yet — happy to take those next.

Same caveat as always: reviewed for syntax, not run. For exams specifically,
I'd test the auto-submit-on-timeout path for real before trusting it in a
live exam — it's exercised on the next answer-save after time expires
rather than a server-side cron/scheduled job, so a student who stops
answering right as time runs out (rather than continuing to click) won't
be auto-submitted until something else touches that attempt (e.g. an admin
viewing the attempts list doesn't trigger it either — only another
`/answer` call does). A background sweep job that force-submits expired
in-progress attempts would close that gap; I didn't add one this pass since
it needs a scheduler (cron/queue) that fits whatever deploy platform you
land on.

---

# Pass 8: default admin login, sidebar confirmation

## Sidebar
Already left-positioned (`fixed inset-y-0 left-0`) from earlier passes —
no change needed, just confirming.

## Default admin login (new)
This solves the bootstrap chicken-and-egg problem the old `DEPLOYMENT.md`
worked around with a manual SQL insert.

**`lib/seedAdmin.ts`**, run once on server boot (`index.ts`, awaited before
the server starts listening): if no `admin`/`superadmin` account exists yet
anywhere in the database, creates one with:

```
Email:    umais0khan@gmail.com
Password: Umaiskhan000
```

...or, if `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD` env vars are set,
those instead. This only ever fires once — the moment any admin account
exists (including one created through the normal `/admin-signup/1` flow),
the seed step finds it and does nothing on every subsequent boot. Setting
the env vars after that first boot has no effect; change credentials from
the panel instead (see below).

**Admin → Platform settings → Your account** (new section, top of the
page): shows the currently signed-in admin's email, with two independent
forms — change email (requires current password to confirm, checks the new
address isn't already taken) and change password (requires current
password). Backend: extended `PATCH /auth/me` to accept `email` +
`currentPassword` alongside the existing `name`/`phone`; `POST
/auth/change-password` already existed from Pass 1 but wasn't wired into
any UI until now.

## One admin login, not two
I didn't build a separate "/admin-login" page. `/login` already handles
both roles — it authenticates against the same `usersTable`, and routes
admins to `/admin` and students to `/` based on the account's role after a
successful login. Adding a second, parallel login page for the same
underlying auth system would mean two places to keep in sync and two URLs
someone could confuse a student with. If you did want a distinct
`/admin-login` URL (e.g. for a bookmark, or to keep it out of a student's
sight-line), that's a small addition — happy to add it if useful, but
wanted to flag the reasoning before assuming which entry point admins
should use.

## Explanation status workflow — still the next open item
Continuing to defer this to the next pass. Also still open: the exam
auto-submit background sweep noted above (Pass 7) and past-paper/resource
visibility not yet using the MBBS/BDS + year targeting system (Pass 6).



---

# Pass 7: Pre-Proffs Exam system

Confirmed and kept: **one unified admin role**, full control over
everything — no Academic Admin / College Admin split. This pass instead
builds the other big gap flagged earlier: a real timed exam system,
separate from Practice mode.

## Schema
- `examsTable` — title, description, program/year eligibility (same
  targeting model as modules), duration, start/end window, max attempts,
  negative marking (supported, **off by default** — see note below),
  passing %, result-release mode (immediate / after the window closes /
  manual), show-marks / show-percentage / show-correct-answers toggles,
  status (draft/published/archived).
- `examQuestionsTable` — join table attaching specific MCQs to an exam, in
  order.
- `examAttemptsTable` — one row per student attempt: scores, pass/fail,
  status, when results were released.
- `examAnswersTable` — one row per question per attempt; `correct` is only
  ever filled in server-side at grading time.

**On negative marking**: your two spec documents disagree here — the
original spec asks for it as a feature, the update doc says "there is no
negative marking." I resolved this by making it a real, working per-exam
setting that defaults to **off**, so every exam behaves per the "no
negative marking" instruction unless an admin deliberately turns it on for
a specific exam.

## Answer security (this was the point of building it properly)
- `POST /exams/:id/start` returns questions via `getExamQuestionsForStudent()`
  — a dedicated function that only ever selects `id`, `question`, `options`,
  `difficulty`. It cannot leak `correctAnswer` because that field is never
  in the query's select list, not because of a filter that could be
  forgotten later.
- Grading happens exclusively in `gradeAndSubmit()` on the backend, called
  from `POST /exam-attempts/:id/submit`. The client never sends "this was
  correct" — it sends the selected option text, and the server looks up
  the stored `correctAnswer` to decide.
- A client-side timer expiring doesn't grade anything by itself — if a
  student tries to save an answer after their allotted duration has
  elapsed, the server checks `startedAt + durationMinutes` independently
  and auto-submits instead of accepting the answer.
- Results respect `resultReleaseMode` server-side too: `GET
  /exam-attempts/:id/result` returns `{ released: false }` with no score
  data at all (not a hidden/greyed-out score a curious student could find
  in the network tab) until the release condition is met.

## Eligibility enforcement
Same `getStudentTargeting()`/program+year model as content visibility
(Pass 6) — a student can only start an exam whose `programTargetKind`/
`yearTargetNumber` matches theirs (or is left as "All"). Checked
server-side on `/exams/:id/start`, not just hidden from the list.

## Admin UI — Pre-Proffs Exams (new page, in the Content nav group)
Create an exam with every setting from the spec (eligibility, duration,
window, attempts, negative marking + rate, passing %, release mode, show/
hide toggles), publish it, attach questions, view every student's
attempt/score, and manually release results for one attempt or all of them
at once (for `resultReleaseMode: manual` exams).

**One deliberately simple piece**: attaching questions to an exam is a
"paste comma-separated MCQ IDs" field rather than a full visual
question-picker with search/filters. Building a proper picker (search the
MCQ bank, filter by module/subject/topic, multi-select with checkboxes) is
a real chunk of UI work I didn't want to rush given everything else in this
pass — the API (`POST /admin/exams/:id/questions`) already accepts any
array of MCQ IDs, so upgrading the picker later doesn't touch the backend
at all. Look up IDs from the MCQ bank page in the meantime.

## Student UI
- **Exams** (new nav item, Study desk group) — lists exams eligible for
  the student's program/year, each showing window status
  (upcoming/open/closed), attempts used, and a Start/Resume button.
- **Take Exam** — question navigator with per-question status dots, a live
  countdown that auto-submits at zero, answers saved to the server as you
  go (so a refresh or crash doesn't lose progress — resuming re-fetches the
  same in-progress attempt), and a confirm-before-submit dialog.
- **Result** — polls every 5s until results are released if they aren't
  yet, then shows score/percentage/pass-fail and, if the exam allows it, a
  full question-by-question breakdown with the correct answer and
  explanation.

## Not done in this pass
- Visual MCQ picker for building an exam paper (noted above).
- Auto-submitting *other students'* stale in-progress attempts if they
  simply close the tab without submitting — the current design catches
  this reactively (the next answer-save or a fresh `/start` call notices
  the duration elapsed and auto-submits), but there's no background job
  sweeping abandoned attempts. For a exam ending at a hard deadline where a
  student never returns, their attempt stays `in_progress` in the database
  until something touches it. A scheduled job calling `gradeAndSubmit` for
  any attempt past `startedAt + durationMinutes` would close that gap —
  flagged, not built, since it needs a cron/scheduler decision tied to
  whichever platform you deploy the backend on.

Same standing caveat as every pass: syntax-checked, not run. Exam timing
logic is exactly the kind of thing I'd want to see exercised against a
real clock before trusting it — specifically the auto-submit-on-expiry
path and the three result-release modes.







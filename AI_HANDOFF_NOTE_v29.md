# AI Handoff Note v29 (for the next AI/dev)

Scope: 2 requested features — (1) General Trial Mode overhaul, (2) admin panel
modernisation + multiple Brevo API slots + duplicate-settings cleanup. The
student "Progress" sidebar and secured paid-PDF reading were requested too but
explicitly deferred — NOT started (see "Not done").

Verification actually performed (no DB / browser / login available):
- `tsc --noEmit` per artifact: no new errors vs. the uploaded zip's baseline
  (that baseline already has ~50 pre-existing errors — duplicate `GraduationCap`
  imports in admin pages, a few Drizzle/orval typing errors; untouched).
- `vite build` succeeds for frontend-admin and frontend-student.
- Trial logic (`lib/trial.ts`) and Brevo slot logic (`lib/email.ts`) unit-tested
  with stubbed settings/`fetch` (scope, multi-year, legacy single year, feature
  lists, end date, failover, round robin, per-slot test, all-fail message).
- Every Settings tab + Site content SSR-rendered with seeded data without
  throwing (the Security tab only fails under SSR because it reads
  `window.location`; fine in a browser).
- NOT verified: real browser rendering/visual polish, real Brevo sends, real
  route gating against a DB. Run `pnpm install && pnpm dev` and click through.

## 1. General Trial Mode

New `api-server/src/lib/trial.ts` owns the configuration; the access gate, the
books listing, `/site-content` and the admin page all use it.

Settings keys (plain strings in `platform_settings`, no migration):
- `GLOBAL_TRIAL_MODE` "true" = on (unchanged).
- `GLOBAL_TRIAL_PROGRAM` "" | MBBS | BDS (unchanged).
- `GLOBAL_TRIAL_YEARS` NEW — comma list "1,2,3", empty = every year. Legacy
  `GLOBAL_TRIAL_YEAR` is still read as a fallback when YEARS is empty; the admin
  UI writes YEARS and blanks YEAR on save.
- `GLOBAL_TRIAL_FEATURES` NEW — JSON array of feature keys. Blank = default set
  (everything membership-gated EXCEPT paid books). "[]" = unlocks nothing.
- `GLOBAL_TRIAL_ENDS_AT` NEW — optional "YYYY-MM-DD"; trial stops after the end
  of that day (UTC).

Feature keys: mcqs, past_papers, exams, flashcards, resources, ai_explain,
ai_visualizer, challenges, books. `TRIAL_FEATURE_OPTIONS` in trial.ts is the
single source of truth (sent to the admin UI as JSON on GET /admin/settings).

Gate: `requireActiveMembership` is now `requireMembershipFor(feature?)`
(middlewares/auth.ts). Routes: /exams* → exams; /mcqs → past_papers when
`?pastPaperId=` (past-paper practice loads through it), any of
mcqs/past_papers/exams when `?mcqId=`, else mcqs; /past-papers/:id/mcqs →
past_papers; /practice-sessions → mcqs OR past_papers; /flashcards → flashcards;
/resources → resources; ask-ai routes → ai_explain; /ai/visualizer* →
ai_visualizer; challenge routes → challenges. `requireActiveMembership` still
exists (feature-agnostic: only a full default trial opens such routes).
Books: `GET /books` unlocks paid books for in-scope trial students only when
the `books` feature is on (default off). Note book files are direct Cloudinary
URLs — a trial student can keep the link. That is exactly what the (deferred)
secure-PDF work should fix; do it before turning trial books on in production.

Public: `/site-content` now returns `trial: { active, program, years, features,
endsAt }` (defaults applied, expiry honoured). Student banner (Shell), Register
banner and sidebar all read that. Sidebar shows a lock (→ /payments) on
sections a feature-limited trial doesn't include, only for non-admin students
without an ACTIVE membership; purely cosmetic — the API is the enforcement.

## 2. Admin panel

- `frontend-admin/src/lib/admin-ui.tsx` (new): Panel, Field, TextInput,
  SelectInput, SecretInput, ToggleRow/Switch, Chip, OptionCard, Callout,
  StatusPill, Button, SaveBar.
- `AdminSettings.tsx` rebuilt: section rail (Branding / Access & trial /
  Security etc.; old `?tab=features` maps to access), sticky unsaved-changes bar,
  trial controls (program, multi-year chips, feature cards + presets, end date,
  live summary), Brevo slots UI.
- `AdminSiteContent.tsx` rebuilt; keeps SEO, social, contact, feature
  highlights, quick links, copyright.
- Shell (`lib/shared.tsx`): sidebar with tinted icon tiles, active indicator,
  "Free trial is live" chip when a trial is on, real page titles in the header,
  settings shortcut.

Duplicates removed: Design & branding (colours/theme/dashboard photo) and
Platform description moved from Site content into Settings (Branding/General),
next to favicon/name/tagline. "Support email" (`SUPPORT_EMAIL`) removed from the
UI and admin types — nothing ever read it; the footer uses `CONTACT_EMAIL`.
The key is still accepted by PATCH /admin/settings (harmless; delete when
convenient). The account (email/password) card now shows only on Security.

## 3. Brevo slots

`lib/email.ts`: up to 5 accounts (`BREVO_API_KEY`, `_2`..`_5`; slots 2–5 may
carry `BREVO_SENDER_EMAIL_n`). `BREVO_SLOT_STRATEGY` = failover (default) |
round_robin. Only throws when every slot failed, listing each reason. Env vars
`BREVO_API_KEY_2..5` work too. `POST /admin/settings/test-email` accepts
optional `{ slot }` to test one key with no failover. Secret keys can now be
deleted by sending `"__CLEAR__"` (blank still means "unchanged").

## Not done
- Student Progress sidebar linked to the dashboard Progress quick link.
- Secured paid-PDF reader (no screenshots/downloads, read + highlight only).
  Be honest with users: a browser can't fully prevent screenshots; realistic
  approach is a canvas/PDF.js reader, short-lived signed URLs, per-user
  watermark, disabled download/print/context menu, plus server-side page
  rendering to images for the strongest protection.

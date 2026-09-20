# AI Handoff Note v30 (for the next AI/dev)

Builds on v29 (trial mode, admin modernisation, Brevo slots — still accurate,
read it too). This round: the MCQ-shuffle bug, student My Progress, the secure
paid-book reader, and the rest of the admin polish.

## Verification actually performed
A local Postgres 16 + the built API were used (not a browser):
- `tests/integration/*.mjs` (added) — 40+ assertions over real HTTP + SQL:
  shuffle keeps per-option explanations; trial gating; Brevo slot settings;
  progress endpoint (incl. unreleased Pre-Proff scores hidden); secure reader
  (access, watermark differs per reader, no file URL ever sent, highlights,
  isolation between students, non-PDF 415, trial "Paid books").
- jsdom drove the real `BookReader` and `Progress` React pages against that API:
  pages fetched with the session cookie and painted on canvas, no `<img>`/file
  URL in the DOM, context-menu/Ctrl+S/P/C/copy blocked, blur veils pages,
  drag-select saved a word-range highlight, area highlight, note, delete.
- `tsc --noEmit`: no new errors vs the uploaded zip's baseline (fewer, actually:
  the duplicate `GraduationCap` import errors in two admin pages are gone).
  `vite build` OK for both frontends; API bundle builds.
- NOT verified: real-browser look/feel (never seen in Chrome/Safari/mobile),
  real Cloudinary/Brevo, load/performance of rendering under many readers.

## 1. MCQ shuffle wiped per-option explanations — FIXED
`POST /admin/mcqs/shuffle-options` batches its UPDATE through
`jsonb_to_recordset(...) AS v(id, options, option_explanations)`. The payload
key was `optionExplanations` (camelCase), the column `option_explanations`, so
Postgres found no match, read NULL and overwrote every shuffled question's
explanations. Fix: send `option_explanations`. Reproduced and verified in real
Postgres. **Questions shuffled before this fix already lost their per-option
explanations in the database — the code can't recover them; re-import or
restore from an MCQ backup.**

## 2. My Progress (student)
`GET /student/progress-overview` (routes/student-progress.ts, own data only, no
membership gate so lapsed students still see history). Page
`frontend-student/src/pages/Progress.tsx` at `/progress`, sidebar item "My
progress", dashboard quick tile + "Full progress" link. Tabs: Overview, MCQs
(per-subject accuracy + recent sessions), Past papers (derived from answers to
MCQs that belong to a paper: coverage + accuracy), Improvement (8-week accuracy
chart, most-improved / needs-work topics, needs >=3 answers each side for a
delta), Pre-Proffs (respects `resultReleaseMode`/`showPercentage`/`showMarks`
exactly like `/exam-attempts/:id/result`).

## 3. Secure paid-book reader
Design: a student never receives a paid book's PDF.
- `lib/bookReader.ts` fetches the file server-side, parses it with pdf.js,
  renders single pages to JPEG with `@napi-rs/canvas`, baking a diagonal
  watermark (email + user id) and a footer (name, email, id, date) into the
  pixels. Word boxes (no text) power highlighting. Documents cached in memory
  (`BOOK_CACHE_MB`, default 200, 20-min idle); rendered pages cached per user
  for 10 min; max 3 concurrent renders.
- `routes/book-reader.ts`: `GET /books/:id/reader`, `/pages/:n/image?w=`,
  `/pages/:n/words`, highlights CRUD, `PUT /books/:id/progress`. Access via
  `lib/bookAccess.ts` (same rules as the library: visible to program/year, free,
  approved purchase, or trial "Paid books"). Rate limits: 90 pages/min and 4000
  pages/day per user+book, 60 opens/hour. Audit action `BOOK_READER_OPENED`.
- `GET /books` no longer sends a file URL for paid books a student has
  unlocked (`storagePath: null`, `secureReader: true`). FREE books keep the
  direct link. Admins still get the URL.
- Frontend `pages/BookReader.tsx` (`/books/:id/read`): pages painted on
  `<canvas>` (no object URL kept), text/area highlighting with colours + notes,
  highlights panel, zoom, page jump, resume position. Best-effort guards: no
  context menu/copy/cut/drag, Ctrl/Cmd+S/P/C/X/A/U and F12/devtools shortcuts
  swallowed, print CSS hides the reader, pages veiled when the window loses focus
  or PrintScreen is pressed. Geometry in `lib/reader-geometry.ts` (unit-tested).
- DB: `med_book_highlights`, `med_book_reading_progress` (in `ensureSchema.ts`
  + `ensure-schema.sql`; created automatically on boot). Highlights carry a
  `file_key` so replacing a book's PDF hides highlights made on the old file.
- New deps in api-server: `pdfjs-dist@4.10.38`, `@napi-rs/canvas@0.1.100`
  (pinned to the version pdf.js resolves — two copies break rendering with
  "Value is none of these types String, Path"). Both are `external` in
  `build.mjs`, so a deploy must run `pnpm install` (lockfile updated). Watermark
  font: `api-server/assets/fonts/DejaVuSans.ttf` (licence file alongside) — a slim
  server image has no system fonts and the watermark would silently vanish.

### Honest limits (say this to the client)
No web page can stop the OS capturing the screen (PrintScreen, Snipping Tool,
phone camera, screen recorders). This makes downloading/sharing the file
impossible, casual copying impractical, and every leaked page traceable to a
student — it does not make capture impossible. The guards are deterrents.
- Paid books must be PDFs; anything else shows a 415 in the reader. A PDF
  needing a password can't be opened.
- Rendering costs CPU/RAM on the API host; watch it if many students read at once.
- The Cloudinary URL itself is still public/unauthenticated (students never see
  it, admins do). For defence in depth, move book uploads to Cloudinary
  "authenticated" delivery later.
- Word boxes are estimated from text-run widths, so highlights can be off by a
  few pixels on unusual fonts; scanned (image-only) PDFs have no words — use the
  "area" highlighter there.

## 4. Admin polish
Shared `SectionHeader`/`EmptyState`, table hover, thin scrollbars and focus
rings (`index.css`, scoped to `.admin-shell`) lift every admin page; Overview
gets a time-of-day greeting with the admin's first name and a Quick actions row.
The individual admin pages were NOT rebuilt one by one (Students, Payments, MCQs,
Books, Exams, ... keep their existing layouts) — that is the obvious next step
if the client wants more.

## Not done / ideas
- Admin "preview as student" for the secure reader (the reader lives in the
  student app; admins can open `/books/:id/read` there).
- Rebuild the remaining admin pages on the `lib/admin-ui.tsx` primitives.
- Cloudinary authenticated delivery; per-book "max concurrent devices".

## v31 — Admin panel: duplicate-import bug fix + button/UI polish

**Duplicate settings/identifiers found and removed:** every admin page file
(21 files, including `App.tsx`) imported `GraduationCap` from `lucide-react`
**twice** in the same import statement — leftover from how these files were
auto-extracted from one monolithic `App.tsx`. A duplicate named import is a
TypeScript "Duplicate identifier" error, so this was a real build-breaker
sitting latent in every one of those files (the v30 note mentioned this exact
bug had been cleared from "two admin pages" — it had only been fixed in the
two that were rebuilt for the modernisation pass; the other 19 auto-extracted
pages still carried it). Fixed by de-duplicating each file's `lucide-react`
import list in place — no other imports, logic, or markup touched.

Files fixed: `App.tsx`, `AdminAcademicStructure`, `AdminAiVisualizerLogs`,
`AdminContent`, `AdminExams`, `AdminFeedback`, `AdminFlashcards`, `AdminMcqs`,
`AdminOverview`, `AdminPaymentsHub`, `AdminPlans`, `AdminSignup`,
`AdminSubjectsPage`, `AdminTeam`, `AdminTopicsPage`, `ForgotPassword`,
`Login`, `Notifications`, `Profile`, `ResetPassword`, `VerifyEmail`.

Also checked and confirmed clean (no fix needed): admin nav (`adminGroups` in
`lib/shared.tsx`) has no duplicate hrefs, `App.tsx` has no duplicate
`<Route path>` entries, and `AdminSettings.tsx` / `AdminSiteContent.tsx`
already keep each setting in exactly one place (per their own existing
comments from the v29/v30 branding-settings consolidation).

**Button / UI polish (CSS-only, additive):** added a few rules to
`frontend-admin/src/index.css`, scoped to `.admin-shell` so they can't touch
the sign-in pages:
- Every filled `bg-primary` / `bg-destructive` button now carries a resting
  shadow (not just on hover), so primary actions read as raised/clickable at
  a glance across every admin page, not only the pages already rebuilt on
  the `lib/admin-ui.tsx` `Button` component.
- Icon-only square/round buttons (`grid ... place-items-center rounded-*`,
  the edit/delete/settings/notification icon pattern used everywhere) get a
  visible tinted hover background as a fallback, even on the many older
  pages that never added their own `hover:bg-*` class.
- Active/selected pills and tabs (`aria-pressed`, `aria-current`,
  `aria-checked`) get a subtle primary-tinted ring so the current selection
  is unmistakable on the brand's low-contrast tan palette.
- `button:disabled` now gets `cursor: not-allowed` globally (previously only
  `opacity-50`, with no cursor change, on most buttons).

None of this touched component logic, so it carries the same "not verified
in a real browser" caveat as the rest of the admin polish in v30 — see that
section above. `tsc --noEmit` was not re-run in this pass (no network/
`node_modules` available in this environment) — the duplicate-import fix is
mechanical (removed only the second occurrence of an already-unused-twice
name) and was verified by re-scanning every import statement in both
frontends for repeated identifiers; only `GraduationCap` in the 21 files
above matched, and none remain after the fix.

## Not done / ideas (carried over, still true)
- Full rebuild of Students, Payments, MCQs, Books, Exams onto the
  `lib/admin-ui.tsx` primitives (Panel/Button/Field/etc.) — they still use
  their original hand-rolled markup; only the shared CSS/table/scrollbar
  polish and now the button-shadow/hover polish above reach them.
- Everything else listed in v30's "Not done" section.

## v32 — Landing page team photos + leaderboard colleges

**Landing page now shows real Academic Team photos.** `Home.tsx` (public
`/`) and `About.tsx` (public `/about`) each had their own stripped-down
team card that only ever rendered initials, even for a team member with a
photo uploaded in Admin → Site content → Team. Both now import and use
`TeamPhoto` from `lib/shared.tsx` — the same component the signed-in
Profile page's Academic Team section already uses — so an uploaded photo
actually shows on the public pages too, falling back to initials only when
there's no photo on file. Also surfaced each member's achievement badge
(if set) on both pages, matching what Profile already shows. No data model
or admin-side changes needed — this was purely "the public pages weren't
using the richer component that already existed."

**Leaderboard now shows each player's college.** `LeaderboardRow` had no
institution field at all. Added it end to end:
- `api-server/src/routes/analytics.ts` — the `/leaderboard` handler already
  loads each ranked user's full row (to filter to real, active students);
  it now also passes through `institution` (the same `usersTable.institution`
  free-text field `userView`/`paymentView` already surface elsewhere in
  `routes/medschool.ts` — no join or schema change needed), or `null` if
  the student hasn't set one.
- `frontend-student/src/lib/api.ts` — `LeaderboardRow` gets an
  `institution: string | null` field.
- `frontend-student/src/lib/shared.tsx` — `Podium` (the top-3 stand) shows
  the college in small text under the name.
- `frontend-student/src/pages/Leaderboard.tsx` — the ranked list below the
  podium shows the college in small text under each name (row now truncates
  long names/colleges instead of overflowing on narrow phones).

Not touched: `frontend-admin`'s own `LeaderboardRow` type/`analyticsApi.leaderboard`
call — grepped and confirmed no admin route actually mounts a `/leaderboard`
page (the nav entry pointing at it is unused/vestigial), so there was nothing
there to update.

Neither change touched a build/test pipeline (no network/`node_modules` in
this environment, same limitation as v31) — verified by hand: re-read every
edited file, re-ran the duplicate-import scan across the whole repo (clean),
and traced the new `institution` field from the DB column through the API
response, the TS interface, and both render sites.

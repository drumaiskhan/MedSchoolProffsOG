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

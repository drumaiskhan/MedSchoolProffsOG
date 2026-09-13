# Handoff note — v16 changes (for the next AI/dev)

Not build-tested (no network access to `pnpm install`) — only syntax-checked
each touched file in isolation with `tsc --noEmit` (module-resolution and
cross-package type errors are expected/ignored here, same caveat as v11's
note). **Run `pnpm dev` / a full build before trusting this in prod.**

## 1. Whole-bank MCQ backup + restore

New, separate from the existing `mcq-import.ts` (which parses loosely
formatted question papers into drafts for one module/subject/topic at a
time). This is an exact snapshot/restore of the entire bank instead.

- `artifacts/api-server/src/lib/mcqBackup.ts` — `buildMcqBackup()` selects
  every row from `mcqsTable` (main tree + past-paper + exam questions
  alike, every column) into a versioned JSON payload;
  `restoreMcqBackup(mcqs)` batch-inserts a validated backup back in (500
  rows/insert to stay well under Postgres's bound-parameter ceiling).
  `McqBackupFileSchema` (Zod) validates an uploaded file's shape before
  anything touches the DB.
- `artifacts/api-server/src/routes/mcq-backup.ts` —
  `GET /admin/mcq-backup/export` streams the JSON as a download;
  `POST /admin/mcq-backup/import?mode=append|replace` restores one.
  `replace` hard-deletes every existing MCQ first via the same
  `deleteMcqsEverywhere` cascade `past-papers.ts`/`exams.ts` already use
  (so practice history / exam attachments don't dangle), then inserts the
  backup. Both routes are `requireAdmin`. Import rejects a backup whose
  `formatVersion` is newer than `MCQ_BACKUP_FORMAT_VERSION` rather than
  guessing at an unknown shape. Logs `MCQS_BACKUP_RESTORED` to
  `auditLogsTable`.
- Registered in `routes/index.ts`.
- Frontend: `mcqBackupApi` in `frontend-admin/src/lib/api.ts`
  (`downloadBackup()` fetches-as-blob and triggers a save, since it needs
  the admin's session cookie, not a bare `<a href>`; `importBackup(file,
  mode)` posts the file). UI lives in `AdminMcqs()` (`App.tsx`) — a
  "Backup / restore" toggle next to "Add multiple" in the Question Bank
  header opens a panel with a Download button and a file-picker + mode
  select (append/replace) + Import button. `replace` is gated behind
  `ConfirmDialog` with an explicit "can't be undone" warning.
- Restored rows always get a fresh `id` (serial) and `source: "import"` —
  reusing old ids from the backup file isn't safe (they could now belong
  to different rows, or collide) and the DB just reassigns them anyway.

## 2. "My Progress" quick link was dead

`frontend-student/src/App.tsx`'s dashboard "Quick links" row rendered
every tile through wouter's `<Link>`, including the "My Progress" tile
whose `href` was `#progress-profile` — an in-page anchor, not a route.
wouter's `<Link>` does client-side route navigation, so a `"#..."` href
just pushed that literal string as a path (no route matches it) instead
of scrolling anywhere. The tile looked clickable and did nothing.

Fixed the same way the adjacent "Search" tile already special-cases
`OPEN_SEARCH_HREF`: added `PROGRESS_ANCHOR_HREF` and render that tile as a
`<button>` that calls `scrollIntoView({behavior:'smooth'})` on the
`#progress-profile` section, plus a brief `ring-2` flash (900ms) so
landing on a section that can be a full screen below the fold reads as
"you arrived" instead of an unexplained jump. Added `scroll-mt-24` to the
target section so the sticky header doesn't cover it after scrolling.

## 3. Animation / interactivity pass

- `ConfirmDialog` (`frontend-admin/src/App.tsx`, used everywhere —
  deletes, the new backup restore, etc.) now fades/zooms in on open
  (`animate-in fade-in zoom-in-95 slide-in-from-bottom-2`) instead of
  appearing instantly, and its buttons get a tactile `active:scale-95`.
  This is a global change: every existing confirm dialog in the admin app
  picks it up, not just the new one.
- Quick-link tiles (`frontend-student`) now scale/tilt their icon on
  hover (`group-hover:scale-110 group-hover:-rotate-3`) and squash
  slightly on tap (`active:scale-95`).
- The new backup/restore panel slides/fades in when toggled open
  (`animate-in fade-in slide-in-from-top-2`), its "Backup / restore"
  toggle button's icon rotates 180° when open, and both action buttons
  show a spinning `Loader2` + scale on hover/press while
  downloading/restoring instead of just a disabled state.

All animation classes come from `tw-animate-css`, already imported in
both frontends' `index.css` (no new dependency).

## Files touched (full list)
- `artifacts/api-server/src/lib/mcqBackup.ts` — new
- `artifacts/api-server/src/routes/mcq-backup.ts` — new
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/frontend-admin/src/lib/api.ts`
- `artifacts/frontend-admin/src/App.tsx`
- `artifacts/frontend-student/src/App.tsx`
- this file (new)

## Verification done
- `tsc --noEmit` in isolation on every touched file — no parse (TS1xxx)
  errors on the two large `App.tsx` files (compared line-for-line against
  an unedited baseline copy to confirm my edits, not pre-existing
  workspace-config gaps, were the thing being checked), and only expected
  "cannot find module" noise on the backend files (no `node_modules`
  installed in this environment).
- **Not done**: `pnpm install` / `pnpm dev` / production build, no real DB
  to test an actual export→import round trip against. Please smoke-test
  backup→restore (both append and replace) and click through the fixed
  quick link before trusting this in prod.

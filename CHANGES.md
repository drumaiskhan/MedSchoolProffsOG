# What changed, by file

## 1. Flagged & Saved questions (were dead features — no bug in the backend)

The backend routes for both features were already correct. The problem was
that nothing in the student UI ever called the "create" endpoints, so both
list pages were permanently empty.

- **`artifacts/frontend-student/src/App.tsx` — `Practice()`**
  - The flag icon on a question only toggled local UI state before. Now,
    turning a flag *on* also calls `flaggedMcqsApi.create(...)` so it's
    persisted and shows up on the Flagged MCQs page (and for admins).
    Turning it off only clears the in-session highlight, matching how a
    real exam engine's flag works.
  - Added a **"Save this filter for later"** button on the practice
    setup screen, wired to `savedSessionsApi.create(...)`.
  - Added missing `onError` toasts to the flag/session mutations (repo
    convention — see PROJECT-BRIEF's "never swallow mutation errors").
- **`SavedSessions()`** — "Resume" now rebuilds the actual `/practice?...`
  query string from the saved config instead of linking to a bare
  `/practice`.

## 2. Books / Cloudinary

Found one bug beyond what the diagnostic doc described, and implemented the
backward-compat piece it flagged but left as a to-do.

- **New bug found:** `books.ts`, `medschool.ts`, and `site-content.ts` all
  fell back to the *raw* internal storage key (`cloudinary:image/books/xyz.pdf`)
  whenever `resolveFileUrl()` returned `null` (e.g. right after a server
  restart, before the Cloudinary cloud-name cache warms up). The frontend's
  `resolveUploadUrl()` then treated that string as a relative path and built
  a request to the API server's own origin — which is exactly what produces
  "This site can't be reached" rather than a Cloudinary error. Fixed by
  removing the `?? row.storagePath`-style fallbacks in `books.ts`,
  `medschool.ts` (payment proof, resources), and `site-content.ts` (team
  photos). A resolution failure now correctly surfaces as "no file" instead
  of a broken pseudo-URL.
- **`artifacts/frontend-student/src/App.tsx` — `Books()`** — shows a clear
  "Unavailable right now" state instead of a dead link when a book's file
  can't be resolved.
- **Backward compatibility for books uploaded before the extension fix:**
  added `reresolveLegacyCloudinaryPath()` in `storage.ts`, which looks up an
  extension-less legacy `cloudinary:` path via Cloudinary's Admin API and
  rewrites it with the real format. Wired to a new admin-only endpoint
  `POST /admin/books/backfill-links`, and a **"Fix broken links"** button on
  Admin → Books library that reports how many it fixed/skipped/failed. Safe
  to click more than once.
- **Not done / needs your input:** I could not test any of this against a
  live Cloudinary account (no credentials in this environment). If a book
  is still broken after clicking "Fix broken links," the remaining likely
  cause is the account-level **"Allow delivery of PDF and ZIP files"**
  setting under Cloudinary → Settings → Security — that's not something
  fixable from the codebase.

## 3. AI Visualizer — `shapeType` validation failures

Confirmed the diagnosis in your doc was accurate. Implemented all three
fixes in `artifacts/api-server/src/lib/aiVisualizer.ts`:

1. **Prompt tightened** — added an explicit "SHAPE RULE" stating
   `shapeType` must be exactly `"circle"`, `"rect"`, or `"ellipse"`, with a
   reminder repeated in the process/cycle and anatomy sections (the two
   types your failing prompts — neuron structure, muscle contraction,
   nephron — mapped to).
2. **Normalization pass** added before schema validation: walks every
   `elements` / `steps[].elements` array and remaps common aliases
   (`square`, `oval`, `diamond`, `triangle`, `line`, `polygon`, `path`,
   `star`, etc.) onto the three real primitives, defaulting anything
   unrecognized to `"rect"` rather than dropping the element. This is a
   string-enum remap only — no `eval`, no schema widening, no new render
   capability, per your "do not weaken" note.
3. **Retry on validation failure, not just truncation** — if normalization
   still leaves a schema error, `generateVisualization()` now retries once
   with the real Zod issues fed back to the model, same pattern already
   used for the truncation retry. Only 502s if the retry also fails.

I did not find a separate frontend rendering bug — `DiagramCanvas.tsx`
already handles all three shape types with sensible fallback dimensions,
and `VisualizationRenderer.tsx` dispatches every spec type correctly. The
"it only gives explanations" experience was very likely just the practical
effect of ~16/16 process/anatomy prompts 502ing in your logs — the
step/explanation text panel always renders, but there was rarely a
successful `spec` for the diagram canvas to draw. That should now largely
resolve once most of those prompts stop failing validation.

## What I verified vs. what I didn't

- Ran `esbuild` syntax checks on every edited file (both frontends' full
  `App.tsx`, both `lib/api.ts`, and all touched backend route/lib files) —
  all pass.
- **Not run:** the actual dev server, a real DB, or a real Cloudinary/AI
  provider — I don't have credentials or a running Postgres instance here,
  so none of this has been exercised end-to-end. Please `pnpm install &&
  pnpm dev` and smoke-test the three flows (flag a question in Practice →
  check it shows on Flagged MCQs; upload a new book → open it; try one of
  the previously-failing visualizer prompts like "neuron structure") before
  shipping.

## Not touched

Sections 1 (Blocks tier), 4–9 (flashcard redesign, swipe navigation, module
ordering, completion-percentage bug, sidebar/mobile layout, payment method
selector) from your fix-brief doc — you only asked for the flagged/saved,
Cloudinary, and AI Visualizer fixes this round, so I left those alone.

---

# Round 2: sections 1, 4–9 from the fix-brief

## 1 & 6. Block tier above Modules, with thumbnail + manual ordering

- **Schema** (`lib/db/src/schema/medschool.ts`, `ensureSchema.ts`,
  `ensure-schema.sql`, `manual-migration.sql` — all four kept in sync per
  PROJECT-BRIEF): new `med_blocks` table (`name`, `subtitle`, `iconPath`,
  targeting fields, `displayOrder`); nullable `block_id` added to
  `med_modules` so existing/ungrouped modules keep working, surfaced as
  "Unassigned modules".
- **Backend** (`artifacts/api-server/src/routes/medschool.ts`): full
  `/blocks` CRUD mirroring `/modules` 1:1 (list/create/PATCH/soft-delete/
  permanent-delete, admin-only for mutations; permanent-delete un-assigns
  rather than deletes any modules in the block). `GET /modules` now returns
  `blockId`/`blockName`/`displayOrder`; module create/update accept
  `blockId` + `displayOrder`.
- **Admin** (`artifacts/frontend-admin/src/App.tsx`): `AdminContent`
  reworked to group modules into collapsible block sections plus an
  "Unassigned" bucket, with "Add block"/scoped "+ Module" buttons,
  thumbnail upload (reusing the existing `AdminImageUpload` "resource"
  path — same one Payment QR code uses), and up/down reorder buttons for
  both blocks and modules (swaps `displayOrder` between the two rows and
  PATCHes both).
- **Student** (`artifacts/frontend-student/src/App.tsx`, `Modules()`):
  groups modules under their block (icon + name headers), falling back to
  the old flat grid if no blocks exist yet.

## 7. Module completion-percentage bug

Root cause confirmed: progress was topic-attempted / topic-count, so a
module with 1 topic and 30 questions hit 100% after a single answer. Fixed
in both `GET /student/dashboard` and `GET /modules`
(`artifacts/api-server/src/routes/medschool.ts`) to compute distinct MCQs
actually answered (via `practiceAnswersTable`, joined through
`practiceAttemptsTable` for the user and `mcqsTable` for `moduleId`)
divided by the module's published question count — question-level, not
topic-level.

## 9. Payment methods: real account details instead of generic text

- `PaymentMethodConfig` (both frontends' `lib/api.ts`) extended with
  `accountNumber`/`accountName`.
- Admin `PaymentMethodsTab` writes those onto the method object itself
  (`PAYMENT_METHODS_CONFIG`, already public) instead of the old scattered
  `PAYMENT_<KEY>_NUMBER`/`_ACCOUNT_NAME` settings keys — no backend
  whitelist change needed.
- One-time backfill (`backfillMethodAccounts` in
  `artifacts/api-server/src/routes/settings.ts`, and the equivalent in the
  admin's `parseMethods`) reads the old per-method keys once per request
  and copies them onto the new fields without overwriting anything already
  saved the new way — nothing already configured is lost.
- Student `PaymentDestinationCard` rewritten with an actual method
  selector (bank accounts + enabled wallets/cash as tabs, defaulting to
  the primary account), rendering real `CopyRow`s for account number/name
  per method, with `instructions` shown underneath as supplementary text
  instead of being the only thing shown. Shared between sign-up and
  renewal, so fixing it once fixes both.

## 8. Focus mode, difficulty consistency, mobile layout

- **Sidebar:** added a `FocusModeContext` (lifted above `Shell` in `App()`)
  that `Practice()` turns on for the duration of an active session (mode
  chosen, not yet finished) and `TakeExam()` turns on for its whole mount;
  `Shell` renders a slim exit-only top bar instead of the full sidebar
  while it's on. Cleanup on unmount (via the `useFocusMode` hook's
  `useEffect` return) covers navigating away mid-session.
- **Difficulty:** the admin UI already had editable difficulty `<select>`s
  (not literally hardcoded) — the real bug was the DB default
  (`"moderate"`) not matching the frontend's default/fallback (`'medium'`).
  Standardized on `easy | moderate | hard` everywhere (admin App.tsx,
  AI-generated MCQs). Practice-page difficulty badge now varies tone by
  value (green/blue/red) instead of always blue. AI MCQ generation
  (`aiExplain.ts`) now has the model assign a difficulty per question
  instead of every AI-generated question silently defaulting the same way.
- **Mobile layout:** Practice's question/control-panel grid was
  `xl:grid-cols-[280px_1fr]` (1280px breakpoint — much wider than the rest
  of the app's `lg:` convention) with the control panel/number-grid
  appearing *before* the question in DOM order below that breakpoint.
  Changed the breakpoint to `lg:` and swapped DOM order (`order-2
  lg:order-1` / `order-1 lg:order-2`) so the question renders first and
  the Pause/Save/Exit buttons + number grid stack below it on anything
  narrower than a laptop.

## 4 & 5. Flashcards: unified design + Prev/Next + swipe

- Grid card back badge fixed from a bare `"Answer"` to `` `Answer ${i+1}` ``
  to match the front's `` `Question ${i+1}` ``.
- Study-mode card front/back restyled to reuse the same badge row,
  `TopicBadge`/`Badge` pills, and "Click to reveal the answer"/"Click to
  flip back" footer copy the grid card uses, at single-card scale — plus
  low-opacity decorative shapes on both grid and study cards (optional
  polish item) so the two views read as one design language.
- Added explicit Previous/Next buttons (flanking the card on `sm:`+, a row
  below it on mobile) that move through the deck independent of the
  known/learning rating buttons; Previous disabled on the first card
  (no wraparound, matching what the dot-progress row above already
  implies), Next wraps via `% cards.length` like `advance()` already did.
- Added a small inline swipe handler (`onTouchStart`/`onTouchEnd`, ~50px
  horizontal threshold) on the card container — left swipe = Next, right
  swipe = Previous. No new dependency.

## What I verified vs. what I didn't (round 2)

- Ran `esbuild` syntax checks on every edited file after every batch of
  changes — all pass.
- **Not run:** the actual dev server, a real DB, or a real Cloudinary/AI
  provider, same caveat as round 1 — please `pnpm install && pnpm dev` and
  smoke-test: create a Block and drag a module into it; answer a handful
  of questions in a large module and confirm progress isn't 100%
  immediately; enable a wallet payment method with a number/account name
  and confirm a student sees it; start a Practice session and confirm the
  sidebar disappears; flip through flashcards with Prev/Next and a swipe
  on a touch device.

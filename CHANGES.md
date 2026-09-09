# Round 3 — what changed, by file

**Verification caveat that applies to this whole document:** this pass was
done without a live dev environment, database, or Cloudinary account —
network access wasn't available at all in this session (no `pnpm install`,
no way to reach a real Postgres/Cloudinary). Everywhere below, "verified"
means read the actual code paths end-to-end and confirmed the logic is
correct, plus ran `tsc` structural syntax checks on every touched file
(clean on all of them). It does NOT mean "ran the app and clicked through
it." Anywhere that distinction matters, it's called out explicitly.

## New requests (handled first, since they were the most recent asks)

### Payments — removed from scope
You said this is already fixed, so item 3 below (from the round-3 brief)
was left untouched. Nothing in `PaymentDestinationCard`,
`PaymentMethodsTab`, or `settings.ts`'s payment-details route was touched
this round.

### Leaderboard visuals — reverted to the site's light theme
- **`artifacts/frontend-student/src/App.tsx` — `Podium()` / `Leaderboard()`**
  — these had been given a dark navy/gold "game card" palette. Reverted
  both back to the same light theme + design tokens (`bg-card`,
  `border-border`, `text-foreground`, `text-muted-foreground`, `primary`)
  every other page uses, so Leaderboard no longer looks like a different
  app. Kept gold/silver/bronze as accent colors on the podium (they're
  meaningful — 1st/2nd/3rd), just re-picked to sit on a light background
  instead of a dark one.
  - **Verified:** read through the full component — colors are the only
    thing that changed, no logic/data-fetching touched.
  - **Not verified:** haven't rendered it (no dev server here). Worth a
    quick visual check that the gold "you're doing better than X%" banner
    and the podium's medal rings read clearly on white.

### Pre-Proff exam couldn't be deleted
- **Root cause found:** `DELETE /admin/exams/:id/permanent`
  (`artifacts/api-server/src/routes/exams.ts`) unconditionally 409'd if the
  exam had *any* recorded attempts, with no way to proceed short of leaving
  it archived forever. Since a real exam that students had actually sat
  necessarily has attempts, "Delete permanently" was permanently blocked
  in practice for exactly the exams an admin would want to delete — not
  just gated until archived, as the button's own disabled-tooltip implied.
- **Fix:** added an opt-in `?force=true` on the same route. Without it,
  behavior is unchanged (still 409s on attempts, still requires archived
  first). With it, the route now cascades: deletes `examAnswersTable` rows
  for every attempt on that exam, then the attempts, then the exam
  questions, then the exam itself, in an audit-logged transaction-free but
  ordered sequence (answers → attempts → questions → exam, respecting FKs).
- **`artifacts/frontend-admin/src/App.tsx` — `AdminExams`** — the delete
  flow is now two-step: the normal "Delete this exam permanently?" dialog
  first; if the backend refuses because of recorded attempts, a *second*,
  more explicit dialog opens ("This exam has recorded attempts — N student
  attempts... will be permanently erased... Delete anyway?") before
  retrying with `force=true`. This is deliberate friction — force-deleting
  student attempt history should require an extra, explicit click, not
  happen from a single generic "yes."
- **`artifacts/frontend-admin/src/lib/api.ts`** — `examsAdminApi.removePermanent`
  now takes an optional `force` boolean.
- **Verified:** traced the full delete path (route → FK order → audit log →
  frontend mutation → both dialogs) by reading the code. **Not verified:**
  never ran this against a real exam with real attempts — please test on a
  staging exam with a couple of dummy attempts before relying on this in
  production, given it's a genuinely destructive path.

### Book deletion now also deletes the file from Cloudinary
- **New `deleteFromCloudinary()` in `artifacts/api-server/src/lib/storage.ts`**
  — parses a `cloudinary:<resourceType>/<publicId>` storage path and calls
  Cloudinary's `uploader.destroy()`. Never throws — a failed remote delete
  (bad credentials, already gone, network blip) is logged and swallowed so
  it never blocks the DB row from being removed, since that's the part the
  admin is actually waiting on.
- **`DELETE /admin/books/:id/permanent`** (`routes/books.ts`) — now calls
  `deleteFromCloudinary()` for both the book's file and its cover image
  (if set) before removing the DB row. If either remote delete fails, the
  book is still deleted but the response carries a `warning` string, which
  the admin UI now surfaces as a toast description instead of a plain
  "Book deleted" that would otherwise imply everything went cleanly. Also
  logged into the existing audit-log entry's metadata
  (`cloudinaryFileDeleted` / `cloudinaryCoverDeleted`).
- **Not done / out of scope:** the *soft*-archive route for books was left
  alone on purpose — archiving is meant to be reversible, so it shouldn't
  touch the underlying Cloudinary asset. Only permanent delete does.
- **Not verified:** no live Cloudinary account here to actually confirm a
  `destroy()` call round-trips and the asset disappears. The parsing logic
  (splitting `cloudinary:<type>/<publicId>` and calling `destroy` with the
  right `resource_type`) mirrors the same convention `resolveFileUrl()` and
  `reresolveLegacyCloudinaryPath()` already use elsewhere in this file, so
  it should be consistent, but this needs a real test against Cloudinary.

## Round-3 brief items (in the requested order)

### 1. Browser tab title
- **`artifacts/frontend-student/index.html`** — `<title>` changed from
  "MedschoolProffs Student" to "MedschoolProffs". Admin's title left alone
  as instructed.
- **Verified:** trivial, direct read of the diff.

### 2 / 6 / 8. Cloudinary root cause (uploads "isn't loading back", books 404ing)
Traced `resolveFileUrl()` (`artifacts/api-server/src/lib/storage.ts`) end
to end and found the actual bug, which is different from (and upstream of)
what round 2 already fixed:

- **Root cause:** the in-memory `cachedCloudinaryCloudName` used by
  `resolveFileUrl()` was populated *only* by a fire-and-forget async
  refresh (`refreshConfigCacheIfStale()`), while `resolveFileUrl()` itself
  is synchronous. On any boot where `CLOUDINARY_CLOUD_NAME` lives in the DB
  (the "Admin → Settings" path this feature exists for) rather than an env
  var, the cache started empty and every request in the window before that
  first background promise resolved got `null` back for every Cloudinary
  URL — which is exactly the "Uploaded, but the file isn't loading back"
  message, and would affect *any* resource type (thumbnails, payment
  QR/proof images, and book files alike), not just books.
- **Fix, two parts:**
  1. `warmStorageConfigCache()` (new, `storage.ts`) — awaited once in
     `index.ts`'s `main()`, **before** `app.listen()`. The server now
     doesn't start accepting requests until the Cloudinary cloud name is
     actually loaded, so there's no cold-cache window at all on a normal
     boot.
  2. `setCachedCloudinaryCloudName()` (new, `storage.ts`), called
     synchronously from `PATCH /admin/settings` (`routes/settings.ts`) the
     moment an admin saves a new `CLOUDINARY_CLOUD_NAME`, instead of
     waiting up to 15s for the next lazy refresh. This is the fix for "I
     just saved my Cloudinary settings and it's still broken" specifically.
- **Books 404 (item 8):** confirmed the round-2 fix (extension preserved in
  `publicId`, no `?? row.storagePath` fallback in `books.ts` /
  `medschool.ts` / `sitecontent.ts`) is still in place and correct — did
  not need to touch it again. The remaining two causes the brief flagged
  (the Cloudinary account's "Allow delivery of PDF and ZIP files" toggle,
  and resource-type mismatches for PDFs) are account/data issues, not code
  — there's nothing in the codebase to fix for those. **Could not verify
  against a real account or run the "Fix broken links" backfill button** —
  no live Cloudinary credentials in this session. If a book still 404s
  after the cache fix above, the next step is exactly what the brief says:
  grab the literal `res.cloudinary.com` URL that 404s and check whether
  it's the PDF/ZIP security toggle or a resource-type (`image` vs `raw`)
  mismatch.
- **AdminImageUpload round-trip (thumbnails):** with the cache-warm fix,
  `resolveFileUrl()` should no longer return `null` right after a
  save/restart — that was the actual mechanism behind the "isn't loading
  back" warning being a steady-state experience rather than a one-off.
  **Not verified live** (no Cloudinary account here), but the mechanism is
  now understood and fixed at its source rather than papered over in the
  UI.

### 3. Payment method account details — skipped (see "New requests" above)

### 4a. AI Visualizer diagram quality
- **`artifacts/api-server/src/lib/aiVisualizer.ts`** — the generation
  prompt only validated `shapeType` values, with no guidance at all on
  layout/spacing, which is exactly what the nephron screenshot (everything
  stacked at one point) points to. Added two new prompt sections:
  - **LAYOUT RULE** — explicit minimum-spacing requirement (~12 units on
    the 0-100 canvas), sizing shapes to fit their own label, spreading
    elements across the full canvas instead of clustering at center, and
    keeping a recurring structure's position consistent across a
    multi-step process/cycle.
  - **TYPE CHOICE RULE** — tells the model to use `anatomy`/`process`/
    `cycle` (which have real diagram elements) rather than `equation`
    (formula + slider only, no diagram) when the request is for a
    structure/diagram, reserving `equation` for requests that are
    genuinely about a numeric formula. This directly targets the "heart
    and body fluids, interactive" case turning into a bare
    slider-calculator instead of a diagram.
  - **Defense in depth:** added `declutterPositions()` / mechanical
    de-overlap pass, wired into the existing `normalizeShapeTypes()` step
    (renamed in comments, not in export name, to reflect it now also
    declutters). This nudges any two positioned elements closer than the
    minimum distance apart along their connecting line, run for a few
    passes so a cluster of 3+ overlapping elements fans out rather than
    just swapping two of them. Never invents elements or changes anything
    but x/y, and clamps to the 0-100 canvas. This is a safety net for when
    the model doesn't fully follow the prompt, not a replacement for it.
- **`frontend-student/src/components/visualizer/DiagramCanvas.tsx`** —
  re-checked (round 2 also looked at this) for the "defaults missing
  coordinates to 0,0/center" theory. **Confirmed again this is not a
  frontend bug**: `x`/`y` are non-optional in the schema, so there's no
  fallback-to-origin code path; only `radius`/`width`/`height` have
  fallback sizing, which is expected/correct behavior. The overlap issue
  is entirely a generation-side problem, now addressed above.
- **Not verified:** could not actually call an AI provider from this
  sandbox (no network/API keys) to test the two specific failing prompts
  ("heart", "body fluids interactive") end-to-end. The prompt and
  declutter-pass changes are logically sound but need a real generation
  run to confirm the visual output is actually legible now — please test
  those two exact prompts before considering this closed.

### 4b. Auto-generate explanations & hints on MCQ import
- **New `hint` column on `med_mcqs`** — mirrored in all four schema files
  (`lib/db/src/schema/medschool.ts`, `src/ensureSchema.ts`,
  `ensure-schema.sql`, `manual-migration.sql`), nullable, separate from
  `explanation` since a hint must not reveal the answer.
- **New settings:** `AI_AUTO_EXPLAIN_ON_IMPORT` (boolean-ish string, same
  pattern as `REGISTRATION_ENABLED`) and `AI_AUTO_EXPLAIN_MODEL` (optional
  override model string) added to `EDITABLE_KEYS` in `routes/settings.ts`.
  Per the brief's explicit instruction, went with the **shared-key +
  optional-model-override** approach rather than a second full
  provider/key config — reuses `AI_PROVIDER`/`AI_API_KEY` above.
- **`artifacts/frontend-admin/src/App.tsx`** — added the toggle + optional
  model-override input to the existing AI provider settings card.
- **`artifacts/api-server/src/lib/aiExplain.ts`** — `resolveProvider()`,
  `runPrompt()`, and `generateExplanation()` all now take an optional
  `modelOverride` parameter (falls back to `AI_MODEL`/default when unset,
  so every other caller is unaffected). Added `generateHint()` — a
  separate, shorter prompt that explicitly must not reveal or point at the
  correct option, since it's meant to be usable mid-attempt.
- **`artifacts/api-server/src/routes/mcq-import.ts`** — added
  `queueAutoExplain()`, called fire-and-forget (`void queueAutoExplain(...)`,
  never awaited) right after the commit response is prepared, so a bulk
  import of hundreds of MCQs doesn't hang the HTTP response. Runs
  **sequentially**, not in parallel, on purpose — a few hundred
  simultaneous calls to whatever AI provider is configured would likely
  hit its rate limit and fail most of them; one at a time finishes
  reliably even if slower in wall-clock time. Skips any question that
  already has an explanation from the import file (doesn't overwrite).
  Lands as `AI_GENERATED` — same status the existing on-demand "Ask AI to
  explain" flow (`explanations.ts`) already uses for a freshly-drafted
  explanation, i.e. awaiting admin review, never silently approved. This
  applies to every imported question regardless of which
  module/subject/topic or exam/past-paper it's attached to — not scoped to
  one section.
- **Verified:** read the full path (setting → commit route → queue
  function → DB update) and the existing on-demand flow it mirrors.
  **Not verified:** no AI provider credentials in this sandbox to actually
  run a generation and confirm real explanation/hint text comes back and
  lands correctly.

### 5. Difficulty control on MCQ upload (segmented Easy/Medium/Hard)
- **Found the picker was genuinely missing, not just the wrong widget** —
  contrary to the brief's "may already be partially done" caveat, the
  *file-import* pipeline (`mcqParser.ts` → `McqCandidate` →
  `/admin/mcq-import/commit`) never had a `difficulty` field at all. It
  existed on the manual form, bulk-add rows, and edit form, but was
  silently dropped for anything that went through file-based import.
- **`artifacts/api-server/src/lib/mcqParser.ts`** — added
  `difficulty: "easy" | "moderate" | "hard"` to `ParsedMcqCandidate`,
  defaulting every parsed candidate to `"moderate"` (the parser has no
  reliable signal for this from raw file text — the admin adjusts it
  per-question in review before committing, same default the DB column
  itself uses).
- **`artifacts/api-server/src/routes/mcq-import.ts`** — added `difficulty`
  (optional, defaults to `"moderate"`) to the commit body's zod schema and
  wired it into the actual `mcqsTable` insert — previously even an
  AI-suggested or admin-edited difficulty from this flow would have been
  silently discarded at commit time.
- **New `DifficultyPicker` component** (`frontend-admin/src/App.tsx`) — the
  compact segmented Easy/Medium/Hard control (colored dot + label pill,
  one highlighted), styled after the emedcrack.com reference. Swapped in
  for the `<select>` in three places, all "MCQ renders as a tile/row during
  bulk upload/review" contexts per the brief's scope:
  - the main file-import candidate review list (where it didn't exist at
    all before — now added, as the brief's fallback instruction says to)
  - each bulk-add row (was a `<select>`, now the segmented control)
  - the exam-import candidate review list (same missing-field issue as the
    main import, now fixed the same way)
  Left the single manual "Add MCQ" form and the MCQ edit form's dropdowns
  alone — those are single-item forms, not per-tile rows during bulk
  review, which is what the brief's UI-swap instruction was scoped to.
- **`frontend-admin/src/lib/api.ts`** — `McqCandidate` type now includes
  `difficulty`.
- **Verified:** read the full data flow from parser default → review UI →
  commit schema → DB insert; `tsc` clean on all touched files.

### 6. Sidebar: Blocks as the primary top-level nav
- **New `Blocks()` component** (`frontend-student/src/App.tsx`) — the
  `/blocks` landing page. Each Block renders as a full-bleed hero card
  (see item 7) showing its module count; an "Other modules" hero tile
  appears alongside if any modules have no block. If no blocks are
  configured at all yet, falls back to the plain flat modules grid
  (exactly what the old page showed), so a deployment that hasn't set up
  Blocks isn't left with an empty page.
- **New `BlockDetail()` component** — `/blocks/:id` (or the literal
  `/blocks/other` for unassigned modules) shows that block's modules using
  the existing `ModuleCard`, with a "← Blocks" breadcrumb back to the
  landing page. Clicking a module still goes to the existing
  `/modules/:id` → `Subjects()` drill-down, completely unchanged, per the
  brief's "only what feeds into it changes" instruction.
- **`/modules` kept working as a redirect** — new `ModulesRedirect()`
  component (`useLocation`'s `navigate` + `useEffect`, replacing history
  so it doesn't leave a redirect entry in back-history) sends any old
  link/bookmark straight to `/blocks`. The old flat "Modules" page
  component was removed outright rather than kept as unreachable dead
  code, since it's now fully superseded by `Blocks()`/`BlockDetail()`.
- **Sidebar nav** — renamed `Modules` → `Blocks`, `/modules` → `/blocks`,
  icon unchanged (`BookOpen`).
- **Back-links updated** — both `Subjects()` breadcrumbs (topics view and
  subjects view) and both `Practice()` back-links (empty-state action and
  the session-complete result card's back button/label) now point to
  `/blocks` / say "Blocks" instead of `/modules` / "Modules", per the
  brief's explicit instruction not to strand students on a renamed page.
  Left the dashboard's "Continue practice" / "View all" / sidebar "Start a
  review" shortcuts pointing at `/modules` — since that now redirects
  instantly to `/blocks`, there's no user-visible difference, and touching
  every incidental link across the dashboard felt like more surface area
  than the brief asked for.
- **Verified:** read the full routing table and every affected component;
  `tsc` clean; manually traced the redirect/back-link chain by hand.
  **Not verified live** — no dev server here to click through the actual
  navigation flow end to end.

### 7. Module thumbnails + Block card hero redesign + remove Subtitle
- **New `icon_path` column on `med_modules`** — mirrored in all four
  schema files, nullable, same Cloudinary-storage-path convention as
  `med_blocks.icon_path`.
- **`artifacts/api-server/src/routes/medschool.ts`** — `ModuleTargetingFields`
  now accepts `iconPath`; module create/update/list responses all resolve
  and return `iconUrl` the same way blocks already did.
- **`artifacts/frontend-admin/src/App.tsx` — `AddModuleForm`** — added the
  same optional-thumbnail `AdminImageUpload` blocks already had (modules
  previously had no thumbnail upload at all). **Removed the Subtitle
  input** from both `AddModuleForm` and `BlockForm` — name + thumbnail
  only, per the brief. Existing rows that already have a subtitle keep it
  (it's just no longer editable from the create form); nothing downstream
  displays block/module subtitle on the student side, so nothing needed
  updating there. Made `CreateModuleBody.subtitle`
  (`lib/api-zod/src/generated/api.ts`) optional (was a hard `zod.string()`
  requirement) since the form no longer sends one — server defaults to
  `""` when omitted.
- **`ModuleRow`** (admin content list) — now shows the module's thumbnail
  in its icon tile when one is set, falling back to the plain `BookOpen`
  icon otherwise.
- **Student `ModuleCard`** (`frontend-student/src/App.tsx`) — when a
  module has a thumbnail, renders the same "full-bleed cover image, name
  overlaid bottom-left over a gradient scrim" hero treatment as the new
  Block cards, instead of the small icon-tile + label row. Falls back to
  the original layout when no thumbnail is set, so existing modules look
  exactly as before until an admin adds one.
- **New `BlockHeroCard`** (`frontend-student/src/App.tsx`) — the Blocks
  landing page's hero tile: full-bleed thumbnail (or a gradient
  placeholder if none is set) behind the whole card, block name overlaid
  with a gradient scrim, module count + arrow below it.
- **Verified:** read the full path from upload → storage → API response →
  card rendering; confirmed no other code reads `block.subtitle` /
  `module.subtitle` for display. **Not verified:** haven't rendered the
  actual hero cards to confirm the gradient scrim reads well over a real
  photo, or that an upload round-trips through a real Cloudinary account.

### 9. Add Block filter to Flashcards
- **`artifacts/frontend-admin/src/App.tsx` — `AdminFlashcards`** — added a
  Block `<select>` ahead of the existing Module dropdown, in both the
  manual "Add flashcard" row and the "Generate with AI" row. Selecting a
  Block filters the Module dropdown to that block's modules (matching
  `m.blockId`), same cascading pattern Module→Subject→Topic already uses;
  clearing it ("All blocks") shows every module again. Purely a
  filter — flashcards are still homed by module/subject/topic exactly as
  before, never by block directly, per the brief.
- **Verified:** read the filter logic and both call sites; `tsc` clean.

### 10. Performance
Did **not** do a speculative rewrite — per the brief's own instruction to
profile first and this being explicitly the lowest-priority item. Without
a live deployment, browser DevTools, or Lighthouse available in this
sandbox, real profiling numbers aren't possible this round. Instead, found
and fixed two concrete, low-risk issues that the code itself makes obvious
without needing to profile:

- **Over-fetching — real bug, not just a hypothesis.** Both
  `frontend-student/src/App.tsx` and `frontend-admin/src/App.tsx` had
  `new QueryClient()` with **zero options**, meaning every single query
  defaulted to `staleTime: 0` and refetched on both every component mount
  and every browser-tab refocus. Set sensible defaults
  (`staleTime: 30_000, refetchOnWindowFocus: false`) on both. Queries that
  need to react faster (the leaderboard's `refetchInterval: 10_000`,
  mutations that call `invalidateQueries` after a save) already set their
  own options, which override these defaults per-query, so nothing that
  needed fresh data loses it — this only removes redundant background
  refetches of data nothing has touched.
- **Images shipped at full resolution.** `resolveFileUrl()`
  (`api-server/src/lib/storage.ts`) now accepts an optional
  `{ transform: string }` that injects a Cloudinary delivery
  transformation (`w_600,q_auto,f_auto` — new `THUMBNAIL_TRANSFORM`
  constant) right after `/upload/`, for `image`-resource-type paths only
  (never applied to `raw`/`auto` resources like book PDFs, where
  transforms don't apply the same way and could interfere with exact
  delivery). Applied it to block icons, module icons, and book cover
  images — the three thumbnail-ish image call sites in `medschool.ts` and
  `books.ts`.
- **Not done:** route-based code-splitting (`React.lazy`/`Suspense` per
  route). This is the biggest likely lever per the brief's own ordering
  ("Bundle size... roughly in order of likely impact"), but it's a real
  structural refactor of both monolithic `App.tsx` files (1,300–1,900+
  lines each, every page in one file per PROJECT-BRIEF's architecture),
  and attempting it without a dev server to verify each route still lazy-
  loads and renders correctly felt too risky to bundle in with everything
  else this round. Recommend this as a focused follow-up on its own,
  ideally with Lighthouse/Network-tab numbers from a real deployment to
  confirm bundle size is actually the top offender before restructuring
  around it.
- **Not investigated this round:** the "AI Visualizer / MCQ import
  polling synchronously" concern — didn't find evidence of this while
  reading `aiVisualizer.ts`/`mcq-import.ts` for the items 4a/4b work, but
  wasn't specifically profiling for it either.

## Environment / verification summary

No network access, no `node_modules` (so no `pnpm install`), no live
database, no Cloudinary account, no AI provider credentials, and no dev
server in this sandbox. What "verified" means throughout this document:
full manual trace of the affected code paths, plus a global TypeScript
`tsc --noEmit` structural syntax check on every single touched file
(clean — the only real bug the check itself caught, a `difficulty:
"moderate"` literal widening to `string` instead of the union type in
`mcqParser.ts`, was found and fixed before this was written). A real
`pnpm install && pnpm run typecheck` against the actual monorepo — which
resolves real dependency types instead of the sandbox's bare-bones
approximation — is still worth running before deploying this.

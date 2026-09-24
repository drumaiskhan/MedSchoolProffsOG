## v58 — OSPE/OSCE stations & learning material can sit under a Block (no Module needed)
- New nullable `block_id` on `med_ospe_stations` and `med_ospe_learning_materials` (added by `ensureSchema.ts` on boot; also in `schema/medschool.ts`). API accepts/saves `blockId` on create + update.
- Admin station and learning-material forms: a **Block** dropdown plus an optional **Module** dropdown (`BlockModulePicker`). Picking a module fills its block; changing the block clears a module from a different block. Rows show "Block › Module".
- Deleting a block un-files any stations/material directly under it (not deleted), same as modules.

## v57 — practice sets are a random sample, not the first N
- Practice setup (`Practice.tsx`): choosing e.g. 10 questions always gave the first 10 of the (difficulty-filtered) pool. It now draws a fresh random sample of that size each time Start is pressed (also applies to the trial daily cap). The sample keeps syllabus order unless "Shuffle question order" is on.

## v56 — moon after sunset on the dashboard greeting
- `dayPartForHour`: the sunset ("evening") glyph now covers 17:00-18:00 only; from 18:00 the hero shows the night glyph (greeting text stays "Good evening"). Previously it stayed a sun until 21:00.
- `DayPartIcon`: night is now a proper crescent moon with stars instead of a dimmed sun-like disc.

# Round 18 (v37) — 3D student UI, leaderboard + streaks, admin curriculum pages

See AI_HANDOFF_NOTE_v37.md and REMAINING_THINGS.md. Student app gets a GPU-safe
"3D" depth system (no real 3D transforms — see v34); the Leaderboard is rebuilt
(podium, streak flame + 14-day coins, rank by points/accuracy/streak/questions,
search, floating "your place" dock). Streaks are now "live" (0 after a missed day)
and a bug that made the progress-page streak always 0 is fixed. Admin: Academic
content, Subjects and Topics rebuilt (summary tiles, search, filters, in-place add,
bulk topic add, reorder that actually works with equal order numbers, thumbnail URL
fix); MCQ bank gets overview tiles and difficulty/published filters.
NOTE: written without node_modules — run install/typecheck/build first.

v37.1: fixed the blank band at the bottom of the Leaderboard (`.page-enter` transform trapped the fixed dock; dock now portalled), and rebuilt the landing page academic-team section as a 3D-style showcase (components/TeamShowcase.tsx).

---

# Round 17 — Device limit (2 per account by default, admin-adjustable)

See AI_HANDOFF_NOTE_v33.md. A student account can now be signed in on at most
2 devices at once. Admins can change the platform default (Settings →
Security) and override it per student, see the signed-in devices, and sign
one or all of them out (Students → student drawer → Devices).

Also: student app UI modernisation (admin-style sidebar/header, unified
headers, card/button/focus polish) — see the note's last section.

Also (v34): automatic per-subject icons, animated landing/sign-in visuals, real dark mode for the student app, phone bottom tab bar — see AI_HANDOFF_NOTE_v34.md.

---

# Round 16 — Shuffle bug fix, My Progress, secure paid-book reader

See AI_HANDOFF_NOTE_v30.md. Fixed MCQ shuffle wiping per-option explanations;
added the student My Progress page (MCQs, past papers, improvement, Pre-Proffs);
paid books now open only in a server-rendered, watermarked reader with
highlighting (no file download, URL never sent); admin shell polish;
integration tests in tests/integration/.

---

# Round 15 — Trial mode overhaul, admin modernisation, Brevo slots

See AI_HANDOFF_NOTE_v29.md for the full breakdown. Summary: multi-year and
per-feature General Trial Mode with optional end date; rebuilt Settings and
Site content admin pages, modernised sidebar/header; up to five Brevo API
slots with failover or round robin and per-key test; duplicate settings
(branding on two pages, unused Support email) consolidated.

---

# Round 14 — admin control for the "Ask AI to explain differently" button

The "Ask AI to explain differently" button (MCQs via `Practice.tsx` — which
past papers also go through, `/practice?pastPaperId=…` — and flashcards via
`Flashcards.tsx`) had no on/off switch; it always showed for every student.
Added `AI_EXPLAIN_ENABLED`, same "false" = off / anything else = on
convention as the existing `AI_VISUALIZER_ENABLED` toggle:

- `api-server/src/routes/settings.ts` — added to `EDITABLE_KEYS`.
- `api-server/src/routes/site-content.ts` — added to `SITE_CONTENT_KEYS` so
  the student app can read it.
- `api-server/src/routes/explanations.ts` — `POST /mcqs/:id/ask-ai` and
  `POST /flashcards/:id/ask-ai` now check the setting and refuse (403) when
  off, same defense-in-depth pattern as `POST /ai/visualizer`.
- `frontend-admin/src/pages/AdminSettings.tsx` (Features tab) — new "Ask AI
  to explain" card with a single checkbox, next to the existing AI
  Visualizer/Registration/Trial Mode toggles.
- `frontend-admin/src/lib/api.ts`, `frontend-student/src/lib/api.ts` — type
  additions for the new key.
- `frontend-student/src/pages/Practice.tsx`, `Flashcards.tsx` — read
  `AI_EXPLAIN_ENABLED` off `/site-content` (same query key `SideNav` already
  uses for `AI_VISUALIZER_ENABLED`, so no extra request) and hide the
  button entirely when it's off.

No DB migration — reuses the existing `platform_settings` key/value table.
No live DB/browser test.

---

# Round 13 — what changed, by file

**Announcement bar improvement.** Two asks: mobile was cutting off long
announcement text, and admin could only ever set one announcement.

1. **Scrolling instead of truncating.** `Shell`'s banner in
   `frontend-student/src/lib/shared.tsx` used a `truncate` span, so on a
   narrow phone most of a longer announcement never showed at all. Now
   renders two identical copies of the text back-to-back in a `w-max`
   track and animates it left by exactly one copy's width (`marquee`
   keyframe in `index.css`, `-50%` translate) — a seamless, continuous
   scroll instead of an ellipsis. Duration scales with text length (short
   announcements don't fly past, long ones don't crawl) and pauses on
   hover/focus so it's readable if someone stops to read it.
2. **More than one announcement.** `ANNOUNCEMENT_BANNER` used to be a
   single plain-text setting. It's now a JSON array of strings — same
   pattern as `FEATURES_LIST` / `QUICK_LINKS` — and the admin Settings
   page (General tab) has a real add/remove list for it instead of one
   input. Multiple announcements are joined into the one scrolling line,
   separated by a dot. A `parseAnnouncements` helper (student `shared.tsx`)
   and the equivalent inline parsing in `AdminSettings.tsx` both fall back
   to treating an already-saved plain-text value as a single-item list, so
   an existing announcement keeps showing/editing instead of vanishing the
   first time either page loads after this change. No backend/schema
   change needed — the setting is still just an opaque string column.

No live DB/browser test.

---

# Round 12 — what changed, by file

Fixed the student "saved MCQs" (Flag icon during practice → persisted to
`flaggedMcqsTable` → shown on the "Flagged MCQs" page, linked from the
dashboard's "Bookmarks / Saved content" tile — see `Practice.tsx`'s
`toggleFlag` comment). Two real bugs:

1. **Didn't open.** `GET /flagged-mcqs` (`student-tools.ts`) only ever
   returned the bare flag row — `{id, userId, mcqId, reason, status,
   createdAt}` — so the page had nothing to show but "MCQ #123" and
   nothing to link to. Now left-joins down to the question text and its
   full Block > Module > Subject > Topic path (left join, not inner — an
   mcq can be hard-deleted after being flagged, and the flag row should
   still list rather than vanish); added `mcqDeleted` so the frontend can
   grey out Open instead of linking to a gone question.
2. **Didn't remove.** `DELETE /flagged-mcqs/:id` deleted-and-ignored the
   result, always responding `{ok:true}` even when zero rows matched (bad
   id, already removed) — a silent no-op that looked identical to success.
   Now uses `.returning()` and 404s on a real miss; also lets admins clear
   any student's flag (matching GET's existing isAdmin scope), not just
   their own.

`FlaggedMcqs.tsx` rewritten to render the path breadcrumb, an "Open"
button (`navigate('/practice?mcqId=...')`, the same mechanism
`Notebook.tsx`'s linked-question button already uses successfully), and a
"Remove" button with a real success/error toast instead of a silent
mutation. `FlaggedMcq` type updated in both frontend `lib/api.ts` files
(`question`, `path`, `mcqDeleted`). Esbuild-clean on all four touched
files; no live DB/browser test.

---

# Round 11 — what changed, by file

Added a **Paper maker** to Admin → Pre-Proffs Exams (`shared.tsx`:
`PaperMakerPanel` + helpers, wired into `ExamManagePanel` above the
existing "Attach questions" section). Lets an admin auto-build an exam's
paper straight from the existing MCQ bank instead of pasting IDs or
uploading a file: pick MBBS/BDS + Year (defaults to the exam's own
targeting, overridable), drill Block > Module > Subject > Topic, set how
many MCQs to pull from each Subject (optionally narrowed to specific
Topics), see a running "Total: N MCQs across M subjects" count, then
"Generate paper" randomly samples that many PUBLISHED bank-owned
questions per subject (never touching MCQs already tied to another exam
or past paper) and hands the id list to the same `setQuestions` endpoint
the manual flow already used — no backend route changes needed, all
client-side using the existing `/blocks`, `/modules`, `/subjects`,
`/topics`, `/admin/mcqs`, and `/admin/exams/:id/questions` endpoints. A
"Replace this exam's current paper" checkbox mirrors the same toggle the
file-upload flow already has. Syntax-checked with esbuild (clean); no
live DB/browser test.

---

# Round 10 — what changed, by file

See `AI_HANDOFF_NOTE.md` for the full writeup. Short version: (1) First
Year past papers showing in Third Year accounts was legacy content never
tagged with real year/degree targeting (`level` text label only) — added
a "Fix year targeting" backfill button in Admin → Past papers
(`past-papers.ts`, `AdminPastPapers.tsx`), same pattern as the existing
books link-fix button; needs an admin to click it once. (2) Student
Profile page not showing MBBS/BDS or year — `/auth/me` was reading legacy
free-text columns registration never writes to, instead of resolving the
real program/year from the foreign keys registration does set
(`auth.ts`'s `userPublicView`); also added a profile picture upload to
`Profile.tsx` (optional — the existing upload endpoint was already wired
up for team photos, just never exposed to students).

---

# Round 9 — what changed, by file

Same method/caveat as prior rounds: read end-to-end, `esbuild` syntax-checked
every touched file (clean), no live DB/browser.

## Organized the whole admin section
Two layers, both in `artifacts/frontend-admin/src/App.tsx`:

**Sidebar nav (`adminGroups`)** — the old "Content" group had grown to 9
unrelated items (colleges/courses down to individual MCQs) and "Community"
mixed feedback/AI-activity logs in with team/site-content, which don't
really relate. Split into:
- **Curriculum**: Colleges & courses, Academic content, Subjects, Topics
- **Question banks**: MCQ bank, Flashcards, Books library, Past papers,
  Pre-Proffs Exams
- **Site & team**: Academic team, Site content
- **Activity**: Feedback inbox, AI Visualizer activity

Overview, Payments, and Workspace (Platform settings) groups are unchanged.

**Platform settings page tabs** — Registration and AI Visualizer's on/off
toggles had both landed in the General tab's "Platform profile" card over
the last two rounds, next to unrelated text fields (platform name, support
email, etc.) just because General was the tab that existed when each was
built. Pulled both into a new **Features** tab — a dedicated home for
site-wide on/off switches, so the next feature toggle has somewhere to go
that isn't "wherever fits." General now holds only the platform-profile
fields it was originally for.

---

# Round 8 — what changed, by file

Same method/caveat as prior rounds: read end-to-end, `esbuild` syntax-checked
every touched file (all clean, including both `vite.config.ts` files and
both `index.html` files' tag balance), no live DB/browser.

## Practice screen — removed the redundant "Leave" button, tightened top gap
The focus-mode header (`Shell` in `frontend-student/src/App.tsx`) already
has its own "← Exit" back-link above the page — the "Leave" button I'd
added to `Practice()` a couple of rounds ago sat right below it doing
almost the same thing, which is exactly the duplication in the screenshot.
Removed it; the breadcrumb (when present) now sits directly above the
"Practice MCQs" heading with no button crowding it, and the progress bar's
margins were trimmed slightly further.

## Past papers Program/Year dropdowns — found the actual bug this time
Previous round concluded (correctly, but incompletely) that the dropdowns
were empty because no Program had been created yet. The part that was
still broken: **creating one didn't fix it**. Root cause —
`frontend-admin/src/App.tsx`'s `AdminAcademicStructure` invalidates the
query key `['admin-programs']` after creating/editing a program, but the
Past Papers form's dropdown reads from a *different* cached query,
`['admin-programs-flat']` (same split for academic years). Those are two
distinct cache entries — invalidating one never refreshed the other, so
the "Add paper" form kept showing its stale empty list until a full page
reload, no matter how many programs got added. Fixed by having every
program/year mutation invalidate both the drill-down cache and the
`-flat` one.

## Animated branded loading screen (wave + MedschoolProffs)
Added in two layers per app:
- **`index.html`** (both `frontend-student` and `frontend-admin`) — a
  static, JS-free version rendered directly in `#root`'s initial HTML, so
  there's no blank white flash during the gap before React/JS has even
  downloaded. Plain CSS `@keyframes` (a `stroke-dashoffset` sweep on an
  SVG pulse-line path, echoing the logo, plus a fading wordmark) — no
  animation library needed.
- **`BrandedLoadingScreen`** (new component, both apps' `App.tsx`) — the
  same look rendered as JSX, swapped in for the top-level
  `userQuery.isLoading` gate (session-restore loading state), so the visual
  doesn't change between the pre-JS and post-JS loading moments.

## Performance: lazy-loaded images + vendor chunk splitting
- Added `loading="lazy" decoding="async"` to every content `<img>` across
  both apps (block/module/subject thumbnails, book covers, team photos,
  payment QR/proof images) — skipped only the couple of file-upload preview
  images (those are the user's own just-picked file, showing immediately
  is the right call there).
- Both `vite.config.ts` files now split `react`/`react-dom`/`wouter`/
  `@tanstack/react-query` into a separate `vendor` build chunk — these
  barely change between deploys, so once cached they don't need
  re-downloading just because app code changed.
- **Honest scope note:** true route-level code-splitting (only loading a
  page's JS when you navigate to it) isn't done here, and doing it properly
  would mean restructuring the single ~2,600-line (admin) / ~1,900-line
  (student) `App.tsx` into separate per-route files — every component in
  each currently lives in one file with a lot of shared inline helpers, so
  splitting it safely is a real refactor, not a config change, and isn't
  something to attempt piecemeal without being able to test it. Flagging
  this as a distinct, larger follow-up rather than quietly skipping it.

---

# Round 7 — what changed, by file

Same method/caveat as prior rounds: read end-to-end, `esbuild` syntax-checked
every touched file (all clean), no live DB/browser.

## Past papers "no MBBS/BDS, no years" — not a bug
Traced it: a Program (MBBS, BDS, etc.) has to belong to an institution, and
none had been created yet under Colleges & courses — so the dropdown was
correctly empty, not broken. Added an inline hint on the Past Papers "Add
paper" form explaining this and linking straight to Colleges & courses,
and pointing out the free-text Level field already covers just labeling a
paper "3rd Year MBBS" without needing Program/Year set up at all.

## "Respiration shows 10 subjects, I only added 4" — real bug, found & fixed
The module/subject tile counts (`getModuleCounts`, plus a duplicate inline
count on the student Blocks route, plus `getSubjectTopicCount`, plus the
per-subject topic-count in `GET /subjects`) never excluded archived
(soft-deleted) rows — same bug class as last round's Subjects/Topics delete
fix, just in four more places I'd missed there. All four now filter
`archived = false`.

## AI Visualizer on/off toggle
New `AI_VISUALIZER_ENABLED` setting (same "true"/"false" string convention
as the existing `REGISTRATION_ENABLED`): admin toggle in Settings, removes
the sidebar link in `frontend-student`'s `SideNav` when off, the
`AiVisualizer` page itself refuses to render when off (covers direct-URL
access or an already-open tab), and `POST /ai/visualizer` refuses server-side
too — not just a UI hide.

## Per-block/module/subject/topic AI difficulty classification
New `POST /admin/mcqs/classify-difficulty` — re-runs the existing
`classifyDifficulty()` AI function (previously only used once at import
time) over already-saved questions, updating `easy`/`moderate`/`hard`.
Capped at 30 questions/call (each is its own AI request); the response
includes how many are left in that scope so the UI can offer "run again."
Exposed as an "AI: classify difficulty" button inside the existing
Analysis panel at the Module/Subject/Topic tree levels (Block level shows
the read-only breakdown only — its filter would need multiple moduleIds at
once, which the endpoint doesn't support, so classify from a module inside
it instead).

## AI-generated easy/moderate/hard difficulty sets
`POST /admin/mcqs/generate` (and the underlying `generateMcqSet`/prompt
builder in `aiExplain.ts`) now accepts an optional `difficulty` — when set,
every question in that batch is pinned to exactly that difficulty instead
of "vary it across the set." The admin "Add multiple" AI panel gained a
difficulty selector (Mixed/Easy/Moderate/Hard) plus a one-click "Full E/M/H
set" button that fires all three difficulties at once and merges the
results into the review list.

## MCQ bank + Flashcards: MBBS/BDS > Year > Block grouping
Both bank trees (`McqBankTree`, `FlashcardBankTree`) now nest the existing
Block > Module > Subject > Topic tree under a Program/Year heading —
Blocks already had `programTargetKind`/`yearTargetNumber` columns and an
edit UI (`BlockForm`) from an earlier round; this was purely a display
grouping using data that already existed. Blocks with no program/year set
land in "Unspecified program · All years" rather than being hidden.

## Practice screen — layout + whitespace
Restructured to match the reference layout: a slim progress bar now sits
right under the header (replacing a whole separate "Timer" card that used
to push the question down by a full card's height), the question/options
moved to the wider left column, and the Question Navigator + Timer/Pause/
Save/Exit moved to a narrower right-hand column (previously a tall stack on
the left) with all its buttons made more compact.

## Not done this round
- Loading screen with the animated wave + MedschoolProffs logo — not
  started; flagged from two rounds ago and still open.
- Program/year grouping is applied above the tree structure, not (yet)
  wired into any bulk-delete or AI-classify scope — those still operate at
  block/module/subject/topic, same as before.

## Addendum — program/year grouping now falls back module-level too
Follow-up within the same round: the grouping above only checked a
*Block's* own `programTargetKind`/`yearTargetNumber`, so a block with none
set (the common case for content uploaded before this feature existed)
landed everything in it under "Unspecified program." Now, for each
block-group, if the block itself has no targeting, it falls back to the
first of its modules that does — and modules with no block at all are
grouped by their own targeting individually instead of one undifferentiated
"Other modules" bucket. This means tagging just the Block (via `BlockForm`)
is enough to move all its modules' worth of already-uploaded MCQs/
flashcards under the right Program/Year — no need to edit every module.

---

# Round 6 — what changed, by file

Same verification method/caveat as prior rounds: read end-to-end, `esbuild`
syntax-checked every touched file (all clean), no live DB/browser.

## Subjects/Topics delete not working + duplicate rows
**Root cause:** `GET /subjects` and `GET /topics` never excluded archived
(soft-deleted) rows — clicking Delete correctly archived the row server-side,
but the list query kept showing it anyway, so the delete button looked
completely broken. Same bug class already fixed for `/admin/mcqs` in an
earlier round; it just hadn't been applied here. This also explains
duplicate-looking subjects in the admin UI (old archived ones sitting
alongside newly re-added ones with the same name). Fixed by excluding
`archived = true` rows in both routes (`artifacts/api-server/src/routes/
medschool.ts`) — applies to both admin and student views, since neither
currently has any "restore an archived subject/topic" UI to justify keeping
them visible.

## Team section — Ownership on top
Reordered `TEAM_CATEGORIES` (`ownership` first) in both frontends'
`lib/api.ts` — this array's order drives the section order on both the
student Profile page and the admin's team management screen, so one small
edit in two files covers both.

## MCQ bank usability (admin)
- **Sticky delete toolbar** — the flat list's Select-all/Delete-selected bar
  is now `sticky top-2`, so bulk-selecting deep into a long list (380+
  questions) doesn't require scrolling back to the top to actually delete.
- **Clickable explanation-status tiles + search** — the Pending/AI
  Generated/Reviewed/Approved tiles now filter the flat list on click; added
  a text search box alongside. Fixed the same underlying "response schema
  strips fields" bug as Round 4's subjects fix, this time for
  `useListMcqs()` — the flat list now sources from the same `/admin/mcqs`
  data the tree view uses, so filtering and the module/subject/topic label
  line actually have real data to work with.
- **Per-scope permanent delete in the tree view** — "delete every question
  in this module/subject/topic" buttons at each tree level (backend already
  supported the `{all:true, filters}` shape; just wasn't exposed anywhere).

## Institutions — Delete permanently
Was already implemented and working, just hidden until an institution was
archived first. Now shown directly on active institutions too — the backend
already safely refuses if programs/students are still attached, so there's
no real reason to force the extra archive step first.

## Flashcards — categorized like the MCQ bank
Brought Flashcards up to the same structure as MCQs: a Module > Subject >
Topic tree (default view, with a Flat list toggle, same as MCQs) instead of
one uncategorized list, each card individually editable (front/back — this
didn't exist before at all) and deletable, plus per-scope "delete all in
this module/subject/topic" buttons at each tree level.
- **New `GET /admin/flashcards`** (raw rows incl. moduleId/subjectId/topicId,
  mirrors `/admin/mcqs`) and **`PATCH /flashcards/:id`** (new — flashcards
  had no edit route at all before).
- **`DELETE /admin/flashcards/bulk`** extended to also accept
  `{all:true, filters}`, not just `{ids}`, for the tree's scoped delete.
- **`artifacts/frontend-admin/src/lib/api.ts`** — `flashcardsAdminApi` grew
  `list()`/`update()`, and `bulkRemove` now takes either shape.
- **`artifacts/frontend-admin/src/App.tsx`** — new `FlashcardBankTree` /
  `FlashcardTreeModule` / `...Subject` / `...Topic` / `...Row` /
  `FlashcardBulkDeleteInScope`, mirroring the MCQ tree components exactly.
  Also switched the module dropdown off the student-facing `useListModules()`
  hook (which doesn't carry `blockId`) onto `moduleAdminApi.listAll()`, so
  the new Block grouping actually groups correctly.

## Practice screen — fit one screen without scrolling
`Practice()` in `artifacts/frontend-student/src/App.tsx`: tightened the
question card's padding, option-row height (`p-4`→`px-3.5 py-2.5`, smaller
letter badges), and the spacing around the hint/explain/references row and
Prev/Next buttons. A 5-option question plus those two rows was taller than
a typical laptop viewport before; this was the single biggest lever without
redesigning the layout.

---

# Round 5 — what changed, by file

Same verification method/caveat as Rounds 3-4: read end-to-end, `esbuild`
syntax-checked every touched file (all clean), no live DB/browser.

## 1. Team member categories (Reviewers / Question setters / Ownership)
A closed 3-value set, not open-ended roles like "Professors" — deliberately
per the ask.
- **New `category` column** on `med_team_members` (default `'reviewer'` so
  existing rows don't vanish from every group) — `lib/db/src/schema/
  medschool.ts`, and both copies of the schema-sync SQL (`lib/db/
  ensure-schema.sql` and the inlined copy in `lib/db/src/ensureSchema.ts`
  that actually runs at boot — same duplication as the subject `icon_path`
  column in Round 4).
- **`artifacts/api-server/src/routes/site-content.ts`** — new exported
  `TEAM_CATEGORIES`/`TeamCategory`, `TeamMemberBody` zod now validates
  `category` against that closed enum (so the API rejects anything else,
  not just the UI).
- **Both frontends' `lib/api.ts`** — `TeamMember` type, `TEAM_CATEGORIES`,
  and a `TEAM_CATEGORY_LABELS` display-label map added identically in
  `frontend-admin` and `frontend-student` (this app doesn't share a
  types package between them for hand-written API clients — see Round 4's
  note on `subjectAdminApi` for why they're duplicated rather than
  imported from one place).
- **Admin "Academic team" page** — add/edit form gets a category `<select>`;
  the member list is now three grouped sections (one per category) instead
  of one flat grid.
- **Student Profile's "Our Academic Team"** and the **admin's internal
  preview of that same section** — both grouped the same way.

## 2. Standalone Subjects & Topics admin pages
Delivers the "separate full settings, like Blocks" ask from Round 4 that
was left open — `/admin/subjects` and `/admin/topics` are now their own
nav items (Content group) and routes, alongside (not replacing) the
nested drill-down inside Academic content, which still works and now
stays in sync with these (see cache note below).
- **`artifacts/frontend-admin/src/lib/api.ts`** — `subjectAdminApi.list`
  and `topicAdminApi.list` had their parent id (`moduleId`/`subjectId`)
  made optional. The backend already supported fetching everything for
  admins when it's omitted (`GET /subjects`, `GET /topics` in
  `medschool.ts` — unchanged); only the frontend wrapper was artificially
  requiring one.
- **`AdminSubjectsPage`/`AdminTopicsPage`** (new, in `frontend-admin/src/
  App.tsx`, right after `TopicsManager`) — flat list grouped by parent
  (module for subjects, subject-and-its-module for topics), each group
  filterable via a dropdown in the header. Per group: rename, thumbnail
  (subjects only), delete, and reorder (same self-healing whole-list
  renumber as institutions/the nested managers). "Add" form requires
  picking the parent from a dropdown, since that's a required field on
  create either way.
- **Cache consistency**: the standalone pages and the nested
  `SubjectsTopicsManager`/`TopicsManager` use different React Query cache
  keys (`['admin-subjects-all']` vs. `['admin-subjects', moduleId]`, same
  split for topics) since they fetch different shapes of the same data.
  Every mutation in all four places now invalidates both keys, so an edit
  made from either surface shows up immediately on the other without
  needing a manual refresh.

---

# Round 4 — what changed, by file

**Same verification caveat as Round 3 below:** no live dev server, database,
or Cloudinary account in this session either. "Verified" means the code
paths were read end-to-end and `esbuild` structural/syntax checks were run
on every touched file (all clean). It does NOT mean the app was run and
clicked through — please smoke-test on staging before relying on any of
this in production, especially the DB schema change.

## 1. Curriculum breadcrumbs showing raw IDs ("Blocks / 4", "Modules / 13")
- **Root cause:** the header title (`artifacts/frontend-student/src/App.tsx`,
  the `Shell` component around line 230) falls back to the raw URL path
  when no page has set a friendly title via `usePageTitle()`/
  `PageTitleContext` — e.g. `/blocks/4` → "Blocks / 4". That mechanism
  already existed (used by the exam pages) but `BlockDetail()` and
  `Subjects()` (which backs both `/modules/:id` and `/subjects/:id`) never
  called it.
- **Fix:** both now call `usePageTitle()` with the actual block/module/
  subject name once it's loaded (falling back to "Blocks"/"Modules …"/
  "Subjects …" placeholders while loading, never a raw numeric id).
  `Subjects()` fetches the module/subject name via the existing
  `useListModules()` / `useListSubjects()` hooks (shared query cache, so
  this doesn't add a real extra request in the common case where the list
  was already loaded getting here).
- **Verified:** read the routing/title logic end-to-end; `esbuild` clean.
  **Not verified:** not rendered in a browser.

## 2. Institutions list — "up/down arrows don't move anything"
- **Root cause found:** `POST /institutions` (`artifacts/api-server/src/
  routes/academic-structure.ts`) defaulted a new institution's
  `displayOrder` to `0` when the request didn't send one — and the "Add
  institution" form never sends one. Every institution created through the
  normal admin UI therefore landed on `displayOrder = 0`. The move-up/down
  buttons swapped two rows' `displayOrder` values — swapping `0` with `0`
  is a no-op, so the arrows looked wired up but visibly did nothing.
- **Fix (`artifacts/frontend-admin/src/App.tsx`, `AdminInstitutionsList`):**
  a move now renumbers the *whole* list to a unique sequential `0..n-1`
  order and persists all of it, instead of swapping just the two neighbors.
  This is self-healing — it doesn't require a data migration, since every
  click leaves the list free of duplicate `displayOrder` values regardless
  of what state it started in.
- **Fix (`artifacts/api-server/.../academic-structure.ts`):** new
  institutions now default to `MAX(displayOrder) + 1` instead of `0`, so
  the collision can't recur going forward either.
- **Verified:** traced the swap logic and confirmed the all-zeros
  scenario reproduces the reported symptom exactly. `esbuild` clean on
  both files. **Not verified:** no live DB to confirm existing production
  rows are actually all at `0` — if they're not, the symptom may have had
  a different trigger, but the self-healing reorder fix covers that case
  too either way.

## 3. Subject thumbnails + parity for Subjects/Topics admin management
Blocks and Modules already had a full management surface (create, rename,
reorder, thumbnail, archive/delete). Subjects and Topics (nested inside a
module's curriculum drawer, `SubjectsTopicsManager`/`TopicsManager`) could
only be created and deleted — no rename, no reorder, no thumbnail. Rather
than build brand-new standalone pages (bigger, riskier change to make
blind without a dev server — happy to do this next if still wanted),
brought these two up to the same *capability* level as Blocks/Modules in
their existing nested UI:

- **New `iconPath`/`iconUrl` column on subjects** — `lib/db/src/schema/
  medschool.ts` (`subjectsTable`), plus the schema-sync SQL in *both*
  places it's duplicated (`lib/db/ensure-schema.sql` for humans and the
  inlined copy in `lib/db/src/ensureSchema.ts` that actually runs at boot
  — see that file's own comment for why it's duplicated). Additive
  (`ADD COLUMN IF NOT EXISTS`), so this is safe to run against the
  existing production DB.
- **`GET/POST/PATCH /subjects` and `/topics`** (`artifacts/api-server/src/
  routes/medschool.ts`) now accept/return `iconUrl` (subjects only) and
  `displayOrder` (both), resolved through the same `resolveFileUrl()` +
  `THUMBNAIL_TRANSFORM` convention blocks/modules already use. Both list
  routes now `ORDER BY display_order`. New rows default to
  `MAX(displayOrder) + 1` within their parent, same fix as institutions.
- **Shared contract** (`lib/api-spec/openapi.yaml`,
  `lib/api-zod/src/generated/api.ts`,
  `lib/api-client-react/src/generated/api.schemas.ts`) updated by hand to
  add the new optional `iconUrl`/`displayOrder` fields to `Subject`/
  `Topic` — these are Orval-generated files (see `.agents/memory/
  zod-generator.md`); hand-edited to match what codegen would produce
  rather than run codegen (no environment to run it in here). Re-running
  the generator later should be a no-op against these edits if the spec
  and generated output ever drift.
- **`artifacts/frontend-admin/src/lib/api.ts`** — `AdminSubject`/
  `AdminTopic` types and `subjectAdminApi`/`topicAdminApi` updated for the
  new fields.
- **`artifacts/frontend-admin/src/App.tsx`** —
  `SubjectsTopicsManager`/`TopicsManager` rewritten: both subjects and
  topics now have move-up/down (same self-healing whole-list-renumber
  reorder as institutions), inline rename, and delete; subjects also get
  an upload-thumbnail control (reusing the existing `AdminImageUpload`
  component) on both the "add subject" form and per-row edit.
- **`artifacts/frontend-student/src/App.tsx`** — the student-facing
  subject cards (`Subjects()`) now show the thumbnail when one's set,
  same treatment Block cards already get, falling back to the existing
  numbered-badge look when there isn't one.
- **Verified:** read every touched route/component end-to-end; `esbuild`
  clean on all files (db schema, ensureSchema, both api routes, both
  generated-type files, both admin/student App.tsx, admin api.ts).
  **Not verified:** no live DB/browser — please test the upload flow and
  a subject rename/reorder on staging, and confirm `ensure-schema.sql`'s
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS med_subjects.icon_path` runs
  cleanly against the real production DB before relying on this.
- **Not done:** standalone top-level Subjects/Topics settings pages (as
  opposed to the upgraded nested drawer above) — flagged as open in case
  that's still wanted.

---

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

## v59 — 3D student profile, membership pass, smoother student panel
- Profile: new `ProfileHero` (aurora gradient card, ringed avatar, count-up streak/progress/days-left) and `MembershipPass` (credit-card style pass with days-left ring, expiry, Manage link) in `components/profile/ProfileVisuals.tsx`; details rows lift on hover.
- Payments: status card replaced by `MembershipPass`; plan cards now use the shared tilt (`TiltDiv`) with a glowing selected state and animated check.
- Whole student panel: staggered entrance for the first blocks of every page, and route chunks are prefetched on hover/focus/touch (`usePrefetchRoutes` in App.tsx) so navigation lands instantly.
- Styles: `src/profile3d.css`. Same rules as v34–v44 (only the small hover tilt is 3D; no preserve-3d); all motion off under prefers-reduced-motion.
- Not run: `pnpm typecheck` / build (no node_modules in the upload) — files were syntax-checked only.

## v60 — Study hub, smarter results, spaced repetition, admin Content Quality Center
No backend / schema / auth changes. New routes are additive front-end pages only: student `/study`, admin `/admin/quality`.
Student
- `/study` (pages/StudyHub.tsx): Daily plan (mistakes + weak topics + resume topic + due cards, tick-off + progress ring), Mistake review (recent / repeated / by topic), Weak areas with 10/20/50 mixed practice.
- Practice: `?set=weak|mistakes&count=10|20|50` builds a mixed set from existing GET /mcqs; every finished session feeds the mistake ledger; "Related questions in this set" appears after answering.
- MCQ results: accuracy by difficulty, weak-concept terms, recommended next actions (components/study/ResultInsights.tsx).
- Flashcards: Again / Hard / Good / Easy with next-interval preview (Leitner boxes).
- lib/study.ts holds the ledger + spaced-repetition state in localStorage (per device) — see limits below.
Admin
- `/admin/quality`: Content health score, invalid / no-explanation / no-reference / reported lists with one-click fixes (draft with AI, resolve flag), near-duplicate finder with side-by-side compare + delete, Draft → Review → Approved → Published board.
- Workflow stages are derived from existing fields: `status` + `explanationStatus` (PENDING/AI_GENERATED = Draft, REVIEWED = Review, APPROVED = Approved, status=published = Published). PATCH /mcqs/:id does not accept `status`/`tags`, so no new column or route was needed.
Limits / not done
- Mistake ledger + flashcard schedule are per device (no server table for per-question history). A read-only `GET /student/mistakes` would make them cross-device and backfill history.
- Not built this round: global-search extension (MCQs stay excluded by design in v40), Student 360 profile, question analytics (needs per-question attempt aggregates the API doesn't expose), bookmarks/notes polish.
- Not run: pnpm typecheck / build / browser. Files were syntax-checked with esbuild only.

## v61 — Student 360° (admin) + review area polish (student)
No backend / schema / route changes.
- Admin: `components/Student360.tsx` mounted inside the existing StudentDrawer (drawer widened to max-w-xl, slides in). Tabs: Overview (membership, last seen, streak, exams, total paid, reports + "Worth a look" flags such as membership ending, paying-but-inactive, pending payments, low exam average) · Exams (trend sparkline + recent attempts) · Payments · Reports (flagged questions + feedback). Exam attempts are fetched once (only exams that have attempts) and cached 5 min.
- Not included: practice-session accuracy per student (no admin endpoint exposes it).
- Student: `components/study/ReviewTabs.tsx` links Flagged · Notes · Saved · Mistakes with live counts, shown on all three pages. Flagged MCQs gets All/Open/Resolved filter, search, and "Practice flagged" (`/practice?set=flagged&count=20`, built in lib/study.ts from existing GET /mcqs?mcqId=). `/study?tab=mistakes` opens the Mistakes tab.
- Not run: typecheck / build / browser (esbuild syntax check only).

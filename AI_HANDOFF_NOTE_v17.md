# AI Handoff Note v17

This pass covered 7 issues reported together (MCQ counts, Past papers,
Flashcard flip, Blocks, Books, a collapsible tree everywhere, and
Notifications not landing). None of these needed a from-scratch feature —
every one turned out to be a real, narrow bug or a missing wire-up in
something that was already mostly built. Root causes and fixes below,
grouped by the 7 items as reported.

## 1) Respiration module: "406 MCQs but shows only 380"

Not a display bug — a publishing-workflow trap. `mcq-import.ts`'s bulk
commit step (`CommitBody.status`) defaulted to `"draft"`, and the frontend's
import-status dropdown (`AdminMcqs`, `importStatus` state) also defaulted to
"Import as draft". A module/subject's question count everywhere *except*
the admin MCQ-bank tree only counts `status: "published"` rows (that's
`getModuleCounts` in `medschool.ts`, unchanged — it's correct, it's what
determines what students can actually practice). The admin tree counts
every status. So a batch imported without explicitly flipping the dropdown
sits invisible to students and to every count except the raw admin tree.

Fixed two ways:
- Both defaults now default to `"published"` (draft is still one click away
  for an admin who actually wants a review pass).
- New `PATCH /admin/mcqs/publish-drafts` (optional `moduleId`) clears an
  existing backlog in one request. Wired into `McqTreeModule` as a
  "Publish N drafts" button that only appears when a module actually has
  drafts sitting in it.

## 2) Past papers not year/degree specific

The Degree + Year picker in `AdminPastPapers`'s "Add paper" form only ever
set a display label (the `level` text field). The actual filter columns
were `institutionId`/`programId`/`academicYearId` — a separate, optional
"advanced targeting" dropdown pair that requires Colleges & courses to be
set up first, which (per the form's own "No programs set up yet — that's
expected, not a bug" notice) almost nobody does. Left null, a paper is
"visible to everyone" on that axis — hence 1st-year papers showing up in
3rd year.

Fixed by adding `programTargetKind`/`yearTargetNumber` columns to
`med_past_papers` — same simple null-means-everyone convention
Modules/Blocks already use — derived automatically from the Degree + Year
picker at save time (see `studyYearToNumber()` in `App.tsx`; position in
`DEGREE_YEAR_OPTIONS` is the year number, so "Final Year" lands on 5 for
MBBS / 4 for BDS without a lookup table to keep in sync). `GET
/past-papers` now filters on this in addition to the older FK trio, which
still works for anyone who has set it up. The old programId/academicYearId
dropdowns are kept in the form as opt-in *extra* narrowing, now clearly
labeled as such.

Also converted the flat "MBBS colleges / 2024 / ..." static list into the
same collapsible tree pattern the MCQ bank uses (new `CollapsibleGroup`
component — degree, then year, both collapsible, year collapsed by
default).

## 3) Flashcard flip — text looked wrong after flipping

The flip markup mixed three things that all wanted to own the
`transform` property on the same button: Tailwind arbitrary-value classes
(`[transform-style:preserve-3d]`, `[backface-visibility:hidden]`), an
inline `style={{transform: ...}}`, and (this was the sneaky one) a global,
**unlayered** `button:active:not(:disabled) { transform: scale(.98) }`
rule in `index.css`. Under CSS Cascade Layers, an unlayered rule always
outranks anything inside `@layer utilities` — including Tailwind's own
transform-composition system — regardless of specificity or source order.
So every tap briefly forced `scale(.98)` onto the flip button instead of
whatever rotation state it should have been mid-transition into, and the
button's own `duration-500` transition was fighting the base rule's
`.16s`. Also missing: `-webkit-backface-visibility`, which some
browsers need to actually hide the unrotated face.

Rebuilt as dedicated CSS classes — `.flip-card` (perspective) >
`.flip-card-inner[.is-flipped]` (does the rotating) > `.flip-card-face` +
`.flip-card-face.flip-card-back` (each face, backface-visibility hidden
with the webkit prefix) — with nothing else touching `transform` on those
elements, and moved the global button rules into `@layer base` so a more
specific class can win the ordinary way again. Applied to both the grid
view and study-mode flashcard in `frontend-student/App.tsx`.

I could not 100% reproduce the original symptom locally (no live
browser), so treat this as "the conflict I found and removed," not a
guaranteed 1:1 match to what was seen — flag it if it's still off.

Flashcard **targeting** (year/MBBS/BDS) was already correct server-side —
`GET /flashcards` already filters by its module's `programTargetKind`/
`yearTargetNumber` via `getVisibleModuleIds`. A flashcard only escapes
that if its `moduleId` is left unset when created.

## 4) Blocks showing in every year

Confirmed, real, narrow bug: `GET /blocks` in `medschool.ts` filtered
`active` for non-admins and did absolutely nothing else — unlike `GET
/modules`, which has always called `getVisibleModuleIds`. A block's
`programTargetKind`/`yearTargetNumber` (set via the already-existing
`BlockForm` + `ModuleTargetingFields`) only ever showed up as an
admin-facing badge; it never affected what students actually saw.

Fixed with a new `getVisibleBlockIds()` in `contentVisibility.ts` (same
null-means-everyone rule, factored out as `isTargetVisible()` so Blocks
and Past papers share the exact logic Modules already used instead of
each re-deriving a slightly different version), wired into `GET /blocks`.

## 5) Books not year/program specific

Also already correct server-side — `GET /books` filters by the book's
module targeting the same way flashcards do. The gap was purely
UI/awareness: the "Add book" form's module/subject/topic pickers are
optional with the hint "Leave unset to make visible to every student",
which is easy to click past without registering.

Didn't change the visibility logic (it's right). Instead grouped
`AdminBooks`' flat grid into the same collapsible tree, keyed off each
book's module's targeting label — books with no module land in their own
"Every student (no module set)" group, which doubles as an at-a-glance
count of how many books are currently global vs. scoped.

## 6) Collapsible Subjects/Modules/Topics/Blocks

Blocks/Modules (`AdminContent`) already had their own working
collapsible-per-block implementation — left it alone. Added the new
`CollapsibleGroup` component (same chevron/rotate visual language as the
MCQ bank's `McqTreeModule`) to `AdminSubjectsPage` (per-module groups) and
`AdminTopicsPage` (per-subject groups), which were previously flat lists
with a static header. Past papers and Books use it too (see #2 and #5).

## 7) "I sent a notification but it didn't send"

The targeted broadcast feature (program/year scoping via
`POST /admin/notifications/broadcast`) was already fully built and
correctly computing `targetedUsers` — that part wasn't broken. The actual
gap: a *targeted* broadcast inserts one row per matching student only —
the admin who sent it is never one of those rows (admins are excluded from
the student match), so it never appears in their own bell. A toast flashes
past and then there's no lasting evidence anything happened, targeted or
not.

Didn't touch the send/matching logic. Instead: the broadcast route now
logs rich metadata (title, scope, recipient count — including the
0-recipients case, which used to return `ok: true` with no other trace)
to the audit log on every send, and `NotificationBroadcastPanel` now shows
a "Recently sent" list pulling from it. If a send matches 0 students, that
now shows up explicitly instead of just silently going nowhere.

## Not done / needs a look next session

- Could not run a real build (no `node_modules`, network scoped to
  package registries only — installing the whole monorepo felt too risky
  time-wise for this pass). Every edit was hand-verified: brace/paren
  balance per file, full diff against the pre-edit zip re-read line by
  line, cross-checked type/import names against their definitions. But
  none of this is a substitute for `tsc`/a real dev server — run both
  before deploying.
- Flashcard flip fix (#3) is a strong, defensible cleanup of a real CSS
  conflict, but wasn't reproduced live — re-check on the actual device/
  browser where it looked wrong.
- `ensure-schema.sql` and `ensureSchema.ts` were kept in sync by hand
  (this repo maintains both) — double check on next schema touch that
  they haven't drifted.
- Migration is additive-only (`ADD COLUMN IF NOT EXISTS`), no backfill:
  existing past papers keep `programTargetKind`/`yearTargetNumber` as
  `NULL` (→ visible to everyone) until each is re-saved through the edit
  form, which now derives and writes them automatically.

# Handoff note — v15 changes (Past papers/Exams classification, edit, student display, favicon)

**Not verified with a real build.** Same limitation as v10–v14: no `pnpm
install` for the workspace packages here, so no `tsc`/`pnpm dev`/browser
test could be run. Every edited `.tsx` file was checked with a standalone
`esbuild` syntax/JSX parse (catches unclosed tags, bad JSX, syntax errors)
— that passed clean on both `App.tsx` files below. **Run `pnpm typecheck`
and `pnpm dev` (both frontends) before trusting this in prod.**

## 1. Past papers & Pre-Proffs Exams classified into MBBS/BDS → year
**File:** `artifacts/frontend-admin/src/App.tsx`
- New shared helper `groupByDegreeYear()` buckets a flat list into
  MBBS/BDS (falling back to "Unspecified"/"All Programs" for untyped rows)
  and then by year, sorted newest-first.
- `AdminPastPapers`: degree comes off the existing `level` field's
  "Degree - Year" prefix (e.g. "MBBS - 1st Year" → "MBBS"); year is the
  paper's own `year` field. Rendered as MBBS/BDS section headers, each
  with year sub-headers, instead of one flat list.
- `AdminExams`: degree is `programTargetKind`, year is
  `yearTargetNumber` (already-existing fields — this only changes how the
  list is grouped for display, not the data model).

## 2. Past papers — full edit in admin
**File:** `artifacts/frontend-admin/src/App.tsx`
- New `PastPaperEditForm` component (mirrors `ExamEditForm`'s pattern):
  edits title, college (`examBoard`), year, the Degree/Year pair that
  composes `level`, and the optional program/academic-year targeting.
  Wired to a new `update` mutation (`pastPapersApi.update`) via an "Edit"
  button next to View/Upload/Publish/Delete on each paper row.
- Both the create form and the new edit form's college input now have a
  `<datalist>` of every college code already used across existing papers
  (pulled from `examBoard`), so the same college is spelled consistently
  instead of drifting into near-duplicates (e.g. "KMU" vs "K.M.U").
- Renamed the create form's "Exam board" placeholder to "College, e.g.
  KMU" — that field was already functioning as the college/university
  name, just mislabeled.

## 3. Student Past Papers — consistent title, simplified filters
**File:** `artifacts/frontend-student/src/App.tsx`
- The bold heading is now always `paper.title` (the "Block A"/"Block B"
  name set in admin). Previously it showed `paper.examBoard || paper.title`
  — so a paper with a college set showed the college name as the heading,
  and one without showed the title instead, i.e. the same list mixed two
  different kinds of labels depending on the paper. College + year now sit
  together on the small line above the heading instead, always in that
  position regardless of whether a college was set.
- Filters: removed "All Subjects" (was distinct `examBoard` values) and
  "All Modules" (was distinct `level` values, which read as odd strings
  like "MBBS - 1st Year" for a filter labeled "Module"). Replaced with two
  filters — "Colleges/University" (distinct `examBoard` values) and "Year"
  (distinct `year` values, e.g. "2023") — which also folds in what the old
  standalone "All Years" filter did, so there's one Year filter instead of
  two overlapping ones.

## 4. Favicon
**Files:** `artifacts/frontend-{admin,student}/public/favicon.svg`,
`artifacts/frontend-{admin,student}/index.html`
- The actual bug: `favicon.svg` in both frontends was still the unedited
  scaffold placeholder — a plain red rounded square (`fill="#FF3C00"`),
  not a stale-cache flash. Replaced with a teal pulse-wave mark on the
  brand's dark navy background (`#0e2a38` / `#2dd9c4`, matching the boot
  loader already shown on first load), same file in both apps.
- Also bumped the favicon `<link>` href to `/favicon.svg?v=2` (added a
  `shortcut icon` rel alongside it) in both `index.html` files, since
  browsers cache favicons more aggressively than normal assets — this
  forces a re-fetch on this deploy instead of a browser that visited
  before continuing to show the old red square from cache.

## Files touched
- `artifacts/frontend-admin/src/App.tsx`
- `artifacts/frontend-student/src/App.tsx`
- `artifacts/frontend-admin/public/favicon.svg`
- `artifacts/frontend-student/public/favicon.svg`
- `artifacts/frontend-admin/index.html`
- `artifacts/frontend-student/index.html`

## Suggested smoke-test before deploy
- Admin → Past papers: confirm papers now show under MBBS/BDS/Unspecified
  section headers with year sub-headers; add a paper, then Edit an
  existing one and confirm every field (title, college, year, degree/year,
  program/academic-year targeting) saves correctly.
- Admin → Pre-Proffs Exams: confirm the same MBBS/BDS/year grouping shows
  above the existing exam cards; existing Edit/Manage/Archive/Delete
  buttons still work per exam.
- Student → Past Papers: confirm every card's bold heading is the paper's
  title (not the college), the small line above it shows college + year,
  and the two remaining filters (Colleges/University, Year) narrow the
  list correctly.
- Load both apps fresh (hard refresh / new profile) and confirm the browser
  tab shows the teal pulse-wave icon, not a red square, from first paint.

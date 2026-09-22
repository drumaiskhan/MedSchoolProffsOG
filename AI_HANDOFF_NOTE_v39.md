# Hand-off note — v39 (dashboard rebuild + phone fixes)

Read v34/v37 first: **no real 3D transforms** (perspective / rotateX/Y / translateZ / preserve-3d). All depth in v39 is gradients, layered shadows, bevels and plain 2D motion (opacity/translate/scale/stroke-dashoffset). Reduced-motion disables it all (end of index.css).

## What changed
### Bugs from the phone screenshots
- **Sideways scroll / tab bar cut off** — most likely cause: a grid column blown out by unbreakable notification text (no `min-w-0`). Fixed at the source (`.dash-*` cells are `min-width:0`, feed text `overflow-wrap:anywhere`, line-clamped) and defensively (`html, body, .student-shell { overflow-x: clip }` — *clip*, not *hidden*, so sticky headers keep working; tab bar `w-full max-w-full`, items `min-w-0`; `main` `max-w-full`). NOT reproduced on a real device — verify on the phone.
- **"Good Morning, U…"** — header on /dashboard now says "Dashboard" (the hero greets by name). Date is compact on phones ("Mon, Sep 21"), full on md+.
- **Emoji alone on a line** — name + glyph are one nowrap/ellipsis line; glyph follows the time of day.
- **3-line sticky trial banner** — now a one-line ticker (`TrialBar`, `.trial-bar*`), static + centred on md+, and no longer sticky.
- **"W W T T T T F F S S" chart** — replaced by 7 real days (Mon…Sun + date, "Today" marked), tap/hover a bar for that day's sessions/questions/score. Data: new `daily` field on `GET /student/progress?tz=<getTimezoneOffset()>` (bucketed in the student's local day). `history` is unchanged. Old API builds fall back to bucketing `history` client-side.
- **INACTIVE + "Verified"** — hardcoded badge removed. Membership card is Active / Free trial (from site-content trial) / Inactive, with days left and a CTA.
- **Hero numbers changing with the range picker** — hero reads a fixed 1y query; the range picker only drives the analytics tiles.

### "Continue where you left off" is now dynamic
- New `GET /student/continue-learning` (routes/student-progress.ts) → `{ resume, upNext }`.
  - `resume` = module of the student's latest practice attempt. Attempts saved with only a `topicId` (the Practice page never sent module/subject) are resolved topic → subject → module. Respects program/year visibility.
  - Includes the exact topic to carry on with (`continue` = last topic unfinished, `next` = next unfinished topic, `review` = all done), last score, time ago, real per-module question counts/progress.
  - `upNext` = started-but-unfinished modules first, then untouched; this fixed `mcqCount` being `undefined` in "Recommended".
- `POST /practice-sessions` now derives `moduleId`/`subjectId` from `topicId` when the client omits them.
- `invalidatePracticeQueries()` (lib/query-client.ts) runs after a practice session is saved, so the card points at the module just worked in instead of a 30 s-old cache.
- Nothing hand-edited in `lib/api-zod` / `api-client-react` / openapi: both endpoints are plain `request<>()` calls in `lib/api.ts` (same pattern as `analyticsApi`). If you later move them into the OpenAPI spec, add them there.

### Hardcoded values removed from the dashboard
`'Active'` fallback, "Verified" badge, the fixed quote/subtitle (now `heroMessage()` from streak/today/week data), `MODULE_TILE_COLORS[0]` on the resume card (icon comes from the module name via `SubjectIcon`), "This week" sessions (sum of `daily`), list sizes (`DASH_LIMITS`), ranges (`ANALYTICS_RANGES`). Remaining literals are UI copy. `ProgressProfileCard` deleted (dead; it was the one-letter-axis chart).

### Look & feel
New `components/dashboard/` (DashHero, DashCards, dash-utils) + `.dash-*` CSS in a `@layer components` block at the end of index.css: raised glass hero with floating orbs and streak coins, animated progress ring in a glossy dome, keycap buttons, glossy stat/quick-link tiles (`tileStyle(hue)`; `QUICK_LINK_TILES` gained `hue`), animated bars/meters, staggered rise-in. `Progress` (used app-wide) is now a recessed well with a glossy fill (`.bar-fill`). Locked (trial) quick links show a lock and go to /payments; "Practice MCQs" now opens the resume topic.

## Verification actually done
- All edited files parse (TypeScript `createSourceFile`); helpers unit-checked (tsx); tz bucketing checked.
- Dashboard rendered in headless Chromium at 320 / 360 / 1280 px (+ dark) with stubbed data (long unbroken notification URL included): no horizontal overflow, no console errors. The harness has no Tailwind, so Shell/header/SegTabs/SectionHeader were stubbed — those were NOT visually verified.
- NOT run: `pnpm build`, real `tsc`, the API server, or any DB query. The two new SQL paths (`/student/continue-learning`, `daily`) are untested against Postgres — smoke-test them first.

## Known / not done
- "Everything 3D" beyond the dashboard = shared primitives only (Progress bar, shell). Other pages were not redesigned.
- Streak logic still counts UTC days (unchanged); the chart uses local days, so a late-night session can sit on a different day than the streak coins.
- `POST /practice-sessions` still selects all MCQs to score a session (`db.select().from(mcqsTable)`); should be `inArray(mcqsTable.id, ids)`.

---
# v40 addendum — search palette + Blocks/Modules redesign
Same constraint: NO real 3D transforms (v34/v37). Depth = gradients, layered shadows, overlapping plates, pointer glare (mouse only), plain 2D motion; reduced-motion switches it off (`.cp-*`, `.bk-*` at the end of index.css).

## Search (header / Dashboard "Search" tile / ⌘K)
- `components/search/CommandPalette.tsx` replaces the old QuickJump dropdown (`QuickJump` in lib/shared.tsx is now a thin wrapper that computes pages + trial locks). It renders in a **portal** — the header has backdrop-filter, which would make it the containing block of a fixed panel.
- Old problems: only filtered sidebar page names (placeholder promised topics/MCQs), dark tiles with near-invisible icons, and the global `input:focus-visible` outline drew a box inside the pill (`.cp-input` now uses `!important` to beat that unlayered rule), list cut off by the phone keyboard (panel height follows `visualViewport`).
- New `GET /student/search?q=` (routes/student-progress.ts): blocks, modules, subjects, topics, exams, past papers, restricted to what the student may open (same program/year targeting as the lists). ≥2 chars, 5 per group, LIKE wildcards escaped. **MCQ text is deliberately not searched** (question stems are the paid content). Uses `ilike` (Postgres) like the rest of the codebase — relevant if the MySQL port is ever done.
- Empty state: resume-where-you-left-off (shared `['continue-learning']` query), recent searches (localStorage, try/catch), jump-to pages as glossy hue tiles. Keys: ↑ ↓ Enter Esc; phone "go" key opens the highlighted row. Locked (trial) pages show a lock and go to /payments.
- Not verified: real lucide icons (harness used placeholder glyphs), real API, real phone keyboard behaviour.

## Blocks / Modules
- `components/blocks/BlockCards.tsx`: `BlockPoster`, `ModulePoster`, `CurriculumBanner`, `weightedProgress`. Card = cover image untouched on top + raised plate overlapping its lower edge. This fixes the title colliding with text baked into the cover images (e.g. "THE CARDIOVASCULAR MODULE" under "CVS Module") and the white progress bar disappearing on the image.
- `pages/Blocks.tsx` / `BlockDetail.tsx` rewritten around them (banner with animated stats; block page shows the block cover blurred behind + weighted overall progress ring). `ModuleCard` / `BlockHeroCard` in shared.tsx now delegate to the new components, so any other caller gets the new look.
- Module state chip: Start / Continue / Completed from real progress; cover-less modules get a stable per-name hue + subject icon.
- Verified only in headless Chromium with stub data at 360 and 1280 px (no horizontal overflow, no console errors).

## Merge note (v42 applied onto "MedSchoolProffsOG-main")
This tree already contained the v39 dashboard work; the v40 search palette + Blocks/Modules redesign were applied on top. package.json files (`@capacitor/privacy-screen ^1.1.4`, hover-card `^1.1.23`), `pnpm-lock.yaml` and the `lib/*/dist` folders of this tree were left exactly as provided. The new code adds no dependencies (uses react-dom `createPortal`, existing lucide-react ^0.545 icons).

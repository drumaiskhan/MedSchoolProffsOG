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

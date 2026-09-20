# AI handoff note — v37 (admin curriculum pages, 3D student UI, leaderboard + streaks)

Read this with AI_HANDOFF_NOTE_v34.md (the GPU / 3D-transform warning there still applies).
**See REMAINING_THINGS.md for what is NOT done or NOT verified.**

## IMPORTANT: how this was verified (and how it was not)
The environment that produced v37 had no `node_modules` and no network, so
`pnpm install`, `pnpm build`, `pnpm typecheck` and the integration tests were
**never run**. What was done instead:
* every changed file parses (esbuild);
* the frontend files were type-checked with `tsc` against hand-written stub typings
  (imports from third-party packages typed as `any`) — no new *real* errors; the
  only remaining reports are "implicit any" artefacts of the stubs;
* the Leaderboard (desktop / phone / dark) and the new admin building blocks were
  rendered in headless Chromium against mock data and checked by eye.
**First thing to do on a real machine: `pnpm install && pnpm typecheck && pnpm build`.**

## 1. "3D" without 3D transforms (student app)
v34 documented that `perspective` / `preserve-3d` / `rotateX/Y` corrupted the whole
browser paint on one GPU. So the 3D look is faked with layered `box-shadow`,
gradients, inset highlights, a solid darker "edge" under buttons, `clip-path`
podium faces and plain 2D translate/scale/skew. **Do not add real 3D transforms.**
* `frontend-student/src/index.css` — appended "v37 3D depth system" block:
  tokens (`--raise-1/2`, `--well`, `--edge-color`, medal palettes), global upgrade of
  `.rounded-2xl/3xl.border.bg-card` cards, `.bg-primary` buttons (keycap that presses
  down), inputs, `.card-lift`; helper classes `.d3-card .d3-well .d3-tile .d3-key
  .seg-thumb .medal .avatar-3d .avatar-ring .podium-* .flame .day-coin .lb-* .tabbar-dock
  .tab-key`. Opt out of the button/card depth with `.no-3d`. Reduced-motion respected.
* `lib/shared.tsx` (student): `StatTile` icon uses `.d3-tile`; `MobileTabBar` uses
  `.tabbar-dock` / `.tab-key`.
* `pages/Dashboard.tsx`: streak row is now a flame chip linking to /leaderboard.
* `lib/fx3d.tsx` (new): `useCountUp`, `Count`, `FlameIcon`, `Avatar3D`, `Medal`,
  `SegTabs` (sliding-thumb segmented control), `useAnyVisible`.

## 2. Leaderboard rebuild (student)
* `pages/Leaderboard.tsx` + `components/leaderboard/{metrics.ts,StandingHero,Podium3D,RankRow,YouDock}.tsx`.
* Hero with rank, percentile, gap to next student, animated flame streak, best run,
  "practise today" warning, 14-day activity coins; podium; rank by
  Points / Accuracy (min 10 questions) / Streak / Questions; search; floating
  "your place" dock with Jump-to-me. Ranking rules live in `metrics.ts`.
* All previous data-testids kept (`button-range-*`, `row-leaderboard-*`,
  `banner-your-rank`, `podium-place-*`, `button-retry-leaderboard`).

## 3. Streak backend (api-server)
* `src/lib/streak.ts` (new): `liveStreak()` — the stored `current_streak` is only
  rewritten when a session finishes, so a lapsed streak used to show forever. Now 0
  once a full UTC day is missed; also `practicedToday` and `atRisk`.
* `routes/analytics.ts`: `/analytics`, `/student/progress` and `/leaderboard` use it;
  `/leaderboard` rows gain `currentStreak`, `longestStreak`, `practicedToday` and a
  stable tie-break (points → accuracy → volume → id); new `GET /leaderboard/streak`
  (own streak + last 14 days).
* **Bug fixed:** `/student/progress` destructured `user` as an array, so its
  `currentStreak` was always 0.
* `routes/student-progress.ts`, `routes/medschool.ts` (student dashboard) also use `liveStreak`.
* Days are UTC days, exactly like `bumpStreak`. Students in UTC+5 who practise
  between 00:00–05:00 local time land on the "previous" streak day. Known, unchanged.

## 4. Admin curriculum pages
New shared pieces in `frontend-admin/src/lib/admin-ui.tsx`: `StatTiles`, `SearchBox`,
`Thumb` (uses `resolveUploadUrl`), `Group` (controlled disclosure), `QuickAdd`,
`MoveButtons`, `planReorder`, `byOrder`.
* **Academic content** (`AdminContent.tsx`, rewritten): summary tiles, search,
  All/Published/Draft filter, expand/collapse all, block cards with published counts,
  responsive headers. **Fixes:** block/module reorder now renumbers the list
  (`planReorder`) — the old two-row swap did nothing when order numbers were equal;
  block thumbnails resolve upload URLs (broke on split-domain deployments).
  `ModuleRow` (shared.tsx): same URL fix + wraps on phones.
* **Subjects** (`AdminSubjectsPage.tsx`, rewritten): tiles, search, module filter,
  in-place "add subject" per module, thumbnails, renumbering reorder.
* **Topics** (`AdminTopicsPage.tsx`, rewritten): tiles, search, subject filter,
  "Empty only" (topics with 0 MCQs), in-place add, **bulk add** (paste a list; dedupes
  against the subject's existing topics), MCQ count per topic, renumbering reorder.
* **MCQ bank** (`AdminMcqs.tsx` + `McqBankTree` in shared.tsx): overview tiles
  (bank / published / drafts / unassigned / need explanation), difficulty and
  published/draft chips, "Clear all". The filters also drive "Select all" so it
  only selects what is on screen. Everything else on that page is untouched.
* Reordering is disabled while a search/filter is active (so you only move what you see).
* data-testids of the old pages were kept where the element still exists.

## Conventions worth keeping
* No `perspective`/`rotateX/Y`/`translateZ`/`preserve-3d` anywhere.
* Streak reads go through `liveStreak()`; never return `users.current_streak` raw.
* Reorders: use `planReorder` (renumber), never swap two `displayOrder` values.

## v37.1 — fixes after first deploy
* **Blank band at the bottom of the Leaderboard (bug from v37, fixed).** Root cause:
  `.page-enter` used `animation-fill-mode: both`, so its last keyframe
  (`transform: translateY(0)`) was held forever. A transformed element becomes the
  containing block for `position: fixed` children, so the leaderboard's fixed
  "your place" dock was positioned against the page column, and while hidden
  (translated 140% down) it stretched the scroll height. Fixes:
  1. `index.css` `.page-enter` now uses `backwards` (no lingering transform — this also
     makes any other `fixed` element inside a page viewport-relative, as intended);
  2. `YouDock` is rendered with `createPortal` into `document.body` and is
     `visibility: hidden` while off. Reproduced and re-measured in headless Chromium
     (page height now = last row + normal bottom padding; dock floats at the viewport bottom).
  If some other page's fixed element (dialog, toast) relied on the old wrong containing
  block, look at `.page-enter` first.
* **Landing page "academic team"** rebuilt as `components/TeamShowcase.tsx` (dark stage,
  glass cards, metallic photo rings with halo + contact shadow, pointer highlight, hover
  lift + sheen, two columns on phones, staggered rows on desktop, "Read about the team"
  link to /about). CSS: `.team-*` and `.avatar-ring--teal/--violet` at the end of `index.css`.
  `TeamPhoto` (student `lib/shared.tsx`) gained an optional `size` prop (default unchanged).
  Same data as before (Admin → Site content → Team, active members, up to 8).

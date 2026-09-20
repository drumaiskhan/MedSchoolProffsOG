# Remaining things (after v37)

## 0. Verify first (nothing below was built or run here)
- [ ] `pnpm install && pnpm typecheck && pnpm build` for `api-server`, `frontend-student`, `frontend-admin`. v37 was written without `node_modules`/network; only parse checks, stub-typed `tsc` and headless-Chromium screenshots of the Leaderboard and the new admin building blocks were possible. Expect to fix a few type nits.
- [ ] Run `tests/integration/` — none of it was executed. Add cases for `GET /leaderboard/streak` and for the leaderboard streak fields.
- [ ] Look at the real pages in a browser on the GPU that broke in v34 (the depth system is 2D-only by design, but confirm).
- [ ] Deploy API and admin/student together: the student Leaderboard tolerates an old API (streak fields optional, `/leaderboard/streak` failure is non-fatal), but you only get streaks on the new API.

## 1. Not done yet — student app
- [ ] Only the Leaderboard was rebuilt page-by-page. Every other page gets the 3D depth **automatically** from the global CSS (cards, buttons, inputs, tab bar, stat tiles) but was not individually redesigned: Dashboard hero/header, Subjects/Blocks/Modules tiles, Practice/exam screens, Progress, Books, Flashcards, Account.
- [ ] Dashboard: the streak is only a small chip. A proper flame + 14-day coin strip (reuse `FlameIcon` and the `day-coin` classes / `GET /leaderboard/streak`) would match the leaderboard.
- [ ] Sidebar (desktop) was not touched.
- [ ] Tune `.bg-primary` keycap buttons: they now apply to every filled primary button; a few small ones may want `.no-3d`.
- [ ] Leaderboard: no unit tests for `components/leaderboard/metrics.ts` (pure functions — easy to test); no live "you moved up/down" indicator; podium value formatting for very large numbers untested.

## 2. Not done yet — admin app
- [ ] Not redesigned in v37: the parts of `AdminMcqs.tsx` below the bank header (manual entry form, bulk-add table, import/parsing flow, backup/restore), the per-MCQ edit rows inside `McqBankTree`, `ExplanationCoverage`. Only the overview tiles and filters were added.
- [ ] Academic content: no drag-and-drop reordering (still up/down arrows); no bulk publish/unpublish of modules; blocks have no Published toggle in the UI (they only show a "hidden" badge if inactive); no duplicate-module action.
- [ ] Subjects/Topics: no drag-and-drop, no cross-module "move subject", no bulk delete, no CSV import of topics (bulk add is paste-a-list only).
- [ ] Subjects page for a module with a very large number of subjects is not virtualised.
- [ ] Admin pages were only checked as isolated building blocks in a browser (`StatTiles`, `SearchBox`, `Group`, `QuickAdd`, `MoveButtons`, `Thumb`) — the four rebuilt pages themselves were not rendered against real API data.
- [ ] Reorders send one PATCH per changed row (fine for tens of rows). A `PATCH /…/reorder` endpoint taking the full id order would be cleaner and atomic.

## 3. Backend / data
- [ ] Streak days are UTC days (same as `bumpStreak`). Consider the student's local time zone (e.g. Pakistan UTC+5) so late-night practice counts on the right day.
- [ ] `users.current_streak` is still stale in the database until the next session; only reads are corrected. A nightly job could reset lapsed streaks if you want the stored value to be truthful too.
- [ ] `/leaderboard` still aggregates all attempts per request (polled every 10 s by every open leaderboard). Add short server-side caching if this gets heavy.
- [ ] Admin student detail (routes/medschool.ts ~line 1324) still returns the raw stored streak.

## 4. Known small things
- [ ] `frontend-student` leaderboard metric tabs scroll sideways on very narrow phones (Questions is partly off-screen until scrolled).
- [ ] The v34 note's warning about 3D transforms stays in force — keep the depth system 2D.

## 5. Added in v37.1
- [ ] Team showcase shows at most 8 active members (as before); ordering is Owners → Reviewers → Question setters, then admin display order. Verified with mock data only.
- [ ] The public `/about` page still uses the old plain team cards (only the landing page section was redesigned).
- [ ] Look for other `position: fixed` elements inside pages that may have been (wrongly) anchored to the page column by the old `.page-enter` transform and now move to the viewport — expected to be an improvement, but eyeball dialogs/toasts.

# AI Handoff Note v21

Scope: four fixes requested directly by the site owner after reviewing the
live deployment (schoolproffs.live) on a phone/laptop.

## 1. Flashcard front face rendering mirrored/upside-down

`frontend-student/src/index.css` — v20 added `backface-visibility: hidden`
(plus vendor prefixes) to `.flip-card-face`, which is the textbook fix,
but the owner's screenshots (front face readable only as a point-reflected
mirror image, while the flipped-to back face rendered correctly) show a
different, less common failure mode: on some Chromium/Windows GPU-driver
combinations, 3D-transformed elements without their own compositing layer
get rasterized flat, so "hidden" backface content still visibly bleeds
through as a 2D bitmap instead of being depth-culled. `backface-visibility`
alone doesn't fix this — the element needs to be forced onto its own GPU
layer.

Fix: added `translateZ(...)` to every rotated transform (`.flip-card-inner`,
`.flip-card-inner.is-flipped`, `.flip-card-face`, `.flip-card-face.flip-card-back`)
plus `will-change: transform` on `.flip-card-inner`, and explicit `z-index`
per face (front above back normally, swapped when `.is-flipped`) as a
second line of defense in case a given browser still mis-renders the
backface — the intended face always paints on top regardless. **Not build-
tested** (no way to run `vite build`/a real browser in this session — see
v20's note on that). Ask the owner to hard-refresh (clear cache) after
redeploying, since the old bundle may still be cached.

## 2. Blank white "loading" screen on route/page transitions

Both `frontend-admin/src/App.tsx` and `frontend-student/src/App.tsx` had
`<Suspense fallback={<SkeletonPage />}>` around the lazy-loaded route
switch. `SkeletonPage` is designed to sit *inside* `Shell`'s padded content
area — it has no header, sidebar, or background of its own — so on a cold
route-level lazy import (before `Shell` itself has mounted) it rendered as
a few bare gray/white rectangles floating on plain white, which is what
the owner's screenshot shows.

Fix: swapped the fallback to `<BrandedLoadingScreen />` in both apps —
same self-contained, full-height, animated-logo loader already used for
the initial page-load boot screen and the post-login session-restore
state, so now every loading gap in both apps looks the same. `SkeletonPage`
itself is untouched and still used everywhere it was already correct
(inside `Shell`, while a query loads).

## 3. Header greeting always said "Good morning"

`frontend-student/src/lib/shared.tsx`'s `Shell` component hardcoded the
dashboard page title as `` `Good morning, ${name}` `` regardless of the
clock, while the Dashboard page's own welcome card correctly computed a
time-aware greeting via the existing `greetingForHour(hour)` helper — so
the two disagreed (header said "Good Morning" at 9pm while the card below
correctly said "Good evening", exactly as in the owner's screenshot).
Fixed by having `Shell` call the same `greetingForHour(new Date().getHours())`
helper instead of a hardcoded string. No new logic; just reused what
already existed and was already correct one component over.

## 4. Trial mode for admins

New capability: an admin can grant a student temporary full access for a
chosen number of days without a payment, and revoke it early.

- **`lib/db`** — added `is_trial BOOLEAN NOT NULL DEFAULT FALSE` to
  `med_memberships` (Drizzle schema in `schema/medschool.ts`, the
  auto-run additive migration in `ensureSchema.ts`, and the human-readable
  `ensure-schema.sql` copy — kept in sync per that file's own comment).
  Runs automatically on next boot, no manual migration step needed (see
  `ensureSchema.ts`'s top comment for why this project does it this way).
- **`api-server/src/routes/medschool.ts`** — two new admin-only routes:
  - `POST /students/:id/trial` `{ durationDays: number }` — supersedes
    any existing ACTIVE membership row (same defensive pattern as the
    existing manual-activation code just above it) and inserts a new
    ACTIVE membership with `isTrial: true`, `expiresAt` = now +
    `durationDays`. Also flips the student's account `status` to `ACTIVE`
    and `emailVerified` to `true` (mirrors what manual activation already
    does) so the grant actually unlocks the app, and sends the same
    "membership activated" email with "Trial access" as the plan name.
  - `DELETE /students/:id/trial` — ends the most recent active trial
    early: marks that membership row `SUSPENDED` (kept for history, not
    deleted) and reverts the student's account `status` to `EXPIRED`.
    404s if the student has no active trial.
  - Both write an audit log row (`STUDENT_TRIAL_STARTED` /
    `STUDENT_TRIAL_ENDED`), matching the existing pattern for every other
    admin mutation in this file.
  - Deliberately reuses the *existing* membership-grant mechanism rather
    than adding a parallel "trial" concept — every place that already
    reads `med_memberships` to decide what a student can access (e.g.
    `GET /student/dashboard`) works correctly for a trial with zero
    additional changes, since a trial is just a normal ACTIVE membership
    row with one extra tag column.
  - Both routes validate their body with an inline `z.object(...)`, same
    as the existing `/students/:id/status` route just above them — not
    pulled from `@workspace/api-zod`, so this required no codegen step
    (which wasn't runnable in this session anyway — no network/node_modules,
    same constraint v20 hit).
- **`frontend-admin/src/lib/api.ts`** — added `startTrial(id, durationDays)`
  and `endTrial(id)` to `studentsAdminApi`, and added `isTrial: boolean` to
  `StudentDetail['activeMembership']`. This file is a hand-written fetch
  wrapper (not generated), so this was a direct, safe edit.
- **`frontend-admin/src/lib/shared.tsx`** (`StudentDrawer`) — new "Trial
  access" panel in the student detail drawer: if the student's active
  membership is a trial, shows its expiry date and an "End trial" button;
  otherwise shows a days input (default 7, capped 1–365) and a "Start
  trial" button. The existing "Active membership until…" banner above it
  now only shows for a *paid* active membership, so the two don't say
  overlapping/confusing things when a trial is active.
- **Not done**: the plain student list table (`GET /students`) doesn't
  currently return membership data at all, so there's no "Trial" badge in
  the row list — you have to open a student's drawer to see it. Wiring
  that in would mean joining `med_memberships` into that list query;
  skipped for now as lower priority than the drawer itself actually
  working. Flagging in case that's wanted next.

## What was checked, and what wasn't

- Manually reviewed every diff; ran a brace-balance sanity check on every
  touched file (all balanced).
- **Did not** run `tsc --noEmit`, `esbuild`, or `vite build` — no
  `node_modules` and no network access in this session, same constraint
  every prior handoff note in this repo has hit. Please run the v20 note's
  recommended check (`pnpm install && pnpm run build:admin && pnpm run
  build:student`, or your usual CI) before deploying.
- Specifically worth clicking through after deploying: a flashcard flip on
  the device/browser that showed the mirroring bug (hard-refresh first);
  the dashboard header greeting at a few different times of day; a cold
  route change (e.g. reload directly on a deep link) to see the new
  branded loader instead of blank white; and the new Trial access panel
  end-to-end (start a trial, confirm the student can access gated content,
  end it early, confirm they're locked out again).

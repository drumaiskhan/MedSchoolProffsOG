# AI Handoff Note v27 (for the next AI/dev)

Scope: 2 requested fixes, both traced to root cause rather than patched at
the symptom. No schema changes. Not build-tested (no network access to
`pnpm install` in this environment) — only syntax-checked with `tsc
--noEmit` on each touched file in isolation (workspace-package import
errors, missing `@types/node`/`@types/react`, missing JSX runtime, and the
pre-existing `err: unknown` narrowing pattern used throughout this codebase
are expected in isolation and were individually confirmed to not be new
syntax errors). **Run `pnpm dev` and a real signup + profile-edit round
trip before trusting this in prod.**

## 1. First Year past papers showing up in Third Year (and other year-mismatch) accounts

Traced the actual visibility logic end to end
(`contentVisibility.ts`'s `isTargetVisible`, `GET /past-papers` in
`past-papers.ts`) and it's correct — a paper tagged `yearTargetNumber: 1`
is already properly hidden from a student whose own year is 3. **This was
a data problem, not a logic bug**: any past paper uploaded before the
Degree + Year picker existed only ever got the free-text `level` field
(e.g. `"MBBS - 1st Year"`) typed or composed at creation, with
`programTargetKind`/`yearTargetNumber` left `null`. Per the existing
convention (see `contentVisibility.ts`'s doc comment), `null` on either
axis means "visible to every program/year" — so every one of those
legacy-labeled papers has been showing to every student regardless of
their actual year, even though its *label* says "1st Year".

Fix — new one-time backfill, same pattern as the existing
`POST /admin/books/backfill-links`:
- `POST /past-papers/backfill-year-targeting` (new, `past-papers.ts`,
  `requireAdmin`) — walks every past paper with both targeting fields
  null, splits its `level` on `" - "`, and — only when both halves match a
  real `DEGREE_YEAR_OPTIONS` entry (duplicated server-side in
  `past-papers.ts`, same values as `frontend-admin/src/lib/shared.tsx` —
  keep in sync if a degree/year label ever changes) — fills in
  `programTargetKind`/`yearTargetNumber` from it. Safe to re-run: already-
  tagged papers are left alone, unparseable `level` strings are skipped
  and counted rather than guessed at.
- `pastPapersApi.backfillYearTargeting()` (`frontend-admin/src/lib/api.ts`).
- "Fix year targeting" button next to "Add paper" in
  `AdminPastPapers.tsx`, toasts the fixed/skipped counts.

**Action needed on the actual deploy**: an admin needs to click this
button once (Admin → Past papers → "Fix year targeting") for it to take
effect on existing data — it doesn't run automatically at boot, since
unlike a schema migration this reads/rewrites real content rows and should
be a deliberate, visible action with a result an admin can see, same as
the books link-fix button. Any *new* paper created via the Degree + Year
picker already gets tagged correctly at save time and never needed this.

## 2. Student profile not showing MBBS/BDS or year; profile picture upload

**Root cause, much bigger than the profile page alone**: `/auth/register`
correctly saves a new student's college/program/year as proper foreign
keys (`institutionId`/`programId`/`academicYearId`) — but `userPublicView`
in `auth.ts` (what `/auth/me` returns) was reading the *old* free-text
`institution`/`program` columns instead, which registration never writes
to. Every student who signed up through the current registration flow
therefore had a genuinely blank Institution/Programme, and no year at all
(that field was never even returned), regardless of what they picked at
signup. I found the identical pattern independently in `userView`/
`paymentView` (`medschool.ts`) and the admin `/students`/`/students/:id`
routes — **not fixed this round** (out of scope of the ask, flagged below)
but worth knowing it's the same bug in four more places.

Fix, `auth.ts`:
- `userPublicView` is now `async` and resolves `institution`/`program`/
  `academicYear` from the FK ids (falling back to the legacy text columns
  only for any pre-existing row that has them but no FK set), and adds
  `programKind` ("MBBS"/"BDS"), `academicYear` (label, e.g. "3rd Year"),
  and `yearNumber` (plain 1-5) as their own fields since the profile page
  needs the year on its own, not just folded into a display string. All 5
  call sites updated to `await` it.
- Also now returns `profilePicturePath` and a resolved `profilePictureUrl`
  — the column already existed on `med_users` and the upload endpoint
  (`POST /uploads/profile-picture`) already existed and worked (it's used
  by `AdminTeam.tsx` for team member photos), it just was never returned
  by `/auth/me` or wired into any student-facing page.
- `PATCH /auth/me` (`UpdateMeSchema`) now also accepts an optional
  `profilePicturePath` (empty string clears it to `null`).

Fix, student frontend:
- `AuthUser` (`frontend-student/src/lib/api.ts`) gained `programKind`,
  `academicYear`, `yearNumber`, `profilePicturePath`, `profilePictureUrl`.
  `authApi.updateMe`'s body type gained the optional `profilePicturePath`.
- `Profile.tsx`:
  - Switched its read from `useGetCurrentUser()` (the generated
    api-client-react hook, typed against the codegen `User` shape —
    `id`/`name`/`email`/`role`/`status`/`institution`/`program` only, see
    `lib/api-zod/src/generated/types/user.ts`) to a local
    `useQuery({ queryKey: getGetCurrentUserQueryKey(), queryFn: authApi.me })`.
    Same cache key, so nothing else needs to change — this was purely a
    type ceiling hiding fields the server already sends; not a codegen
    regen (no network in this environment to run `orval`).
  - Header now shows "MBBS · 3rd Year" (`programKind` + `academicYear`)
    instead of the old blank `program` string; the read-only details grid
    also gained its own "Academic year" row.
  - New profile picture control in the edit form, explicitly labeled
    "(optional)" — uploads immediately on file choice (same
    `uploadFile(file, 'profile-picture')` used elsewhere), shows a preview,
    and is only included in the "Save changes" PATCH if the student
    actually picked a file. Skipping it entirely, or saving name/phone
    without ever touching it, works exactly as before. Avatar (header and
    edit-form) falls back to the existing initials circle when no picture
    is set.

**Not done this round** (flagging, not fixing): `userView`/`paymentView`
in `medschool.ts`, and `GET /students` / `GET /students/:id`
(same file) have the identical legacy-column bug — an admin looking at a
student's payment history or the Students list is currently seeing the
same blank Institution/Programme a student saw on their own profile
before this fix. Same shape of fix as `userPublicView` above (resolve from
the FK ids) would apply to all four.

## Verification done
- `tsc --noEmit` against each touched file in isolation, copied to a
  tsconfig-free scratch dir. Confirmed zero `TS1xxx` (parse/syntax) errors
  introduced; remaining errors are the expected isolation noise (missing
  workspace package types, missing JSX runtime, the pre-existing
  `err: unknown` catch pattern already used everywhere in this codebase).
- **Not done**: `pnpm install` / `pnpm dev` / production build, no live
  database to actually run the backfill against real past-paper rows or
  confirm a real signup + profile-picture-upload round trip end to end.
  Please smoke-test before trusting this in prod: (a) as a 3rd Year
  student, confirm 1st Year legacy papers disappear from the past-papers
  list only *after* an admin clicks "Fix year targeting" — before that
  click, this fix intentionally changes nothing; (b) sign up a fresh
  student, confirm their Profile page immediately shows the right
  MBBS/BDS + year (no backfill needed for new signups, this was a display
  bug not a data bug); (c) upload a profile picture, refresh, confirm it
  persists and renders; (d) confirm saving name/phone *without* touching
  the picture still works exactly as before.

## Files touched (full list)
- `artifacts/api-server/src/routes/past-papers.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/frontend-admin/src/lib/api.ts`
- `artifacts/frontend-admin/src/pages/AdminPastPapers.tsx`
- `artifacts/frontend-student/src/lib/api.ts`
- `artifacts/frontend-student/src/pages/Profile.tsx`
- this file, replaced (previous version archived as `AI_HANDOFF_NOTE_v26.md`)

# AI Handoff Note v27 (for the next AI/dev)

Scope: 2 requested fixes, both frontend-only (no schema/migration changes,
no new endpoints — the backend already had everything it needed). Not
build-tested (no network access to `pnpm install` in this environment) —
only syntax-checked in isolation with `tsc --noEmit` on each touched file
(the usual workspace-import / missing-`@types` noise ignored; also found
and removed a **pre-existing** duplicate `GraduationCap` import in both
touched admin files while in there — unrelated to this session's asks,
but it's a real `TS2300` duplicate-identifier error that a strict
`tsc --noEmit` build step would have failed on). **Run `pnpm dev` / a full
build before trusting this in prod.**

## 1. First Year past papers showing up for Third Year students

This was **not a new bug** — `past-papers.ts`, `contentVisibility.ts`, and
`AdminPastPapers.tsx` already had the whole targeting system in place from
an earlier session (`programTargetKind`/`yearTargetNumber` on the paper,
`isTargetVisible()` filtering `GET /past-papers`, and even a **"Fix year
targeting" backfill button** already sitting in the admin Past Papers page
for exactly this symptom). The gap: **neither the create form nor the edit
form actually required the Degree/Year picker to be filled in.** An admin
could save a paper with both left blank, and null-on-either-axis means
"visible to every program/year" by convention (see the big comment block
at the top of `past-papers.ts`'s `GET /past-papers` handler) — so a paper
typed as "1st Year MBBS" in the free-text title/description, but never
actually assigned a Degree + Year in the picker, silently leaked to every
year, Third included.

Fix (frontend only):
- `artifacts/frontend-admin/src/pages/AdminPastPapers.tsx` (create form)
  and `artifacts/frontend-admin/src/lib/shared.tsx` (`PastPaperEditForm`,
  the edit form) — the Degree and Year `<select>`s are now `required`,
  and the submit handler also checks both before calling
  `create.mutate`/`onSave` and shows a toast explaining why if either is
  missing, instead of silently saving an untargeted paper.
- Added an inline warning under the picker in both forms spelling out the
  consequence of leaving it blank, so it's not a mystery `required` mark.
- Left the deeper `institutionId`/`programId`/`academicYearId` FK trio
  (the "Colleges & courses" advanced targeting) optional, same as before
  — that's a genuinely optional extra narrowing layer, unrelated to this
  bug. Left the API's `PaperBody` zod schema optional on
  `programTargetKind`/`yearTargetNumber` too, since the fix belongs at the
  point where an admin can accidentally leave it blank (the form), not by
  rejecting every future legitimate "visible to all years" paper an admin
  might deliberately want (e.g. a general-orientation paper).

**Action needed on the live deployment** (I have no network/DB access
from this environment, so this can't be done for you): the papers that
already leaked were created before this fix and are already saved with
null targeting. Open **Admin -> Past papers** and click **"Fix year
targeting"** — it parses each untagged paper's `level` label (e.g. "MBBS
- 1st Year") and backfills the real targeting fields from it, so existing
leaked papers get corrected retroactively, no re-upload needed. Any paper
whose `level` was left blank too (not just untagged) won't have anything
to parse — open it via **Edit** and pick Degree + Year there (now required
going forward).

## 2. Animated "MedschoolProffs" wordmark — was frozen except on hover

`Logo` (student app: `artifacts/frontend-student/src/lib/shared.tsx`;
admin app: `artifacts/frontend-admin/src/lib/shared.tsx`) rendered the
wordmark as a CSS gradient clipped to text, but the sweep only played via
`group-hover:[background-position:0%]` — meaning on any touch device
(phones/tablets — no `:hover`) it just sat on one frozen frame of the
gradient, which happened to be mostly the flat foreground colour with
little to no visible teal. The admin app's `Logo` had it worse — a static
Lucide `Activity` icon and plain solid-colour text, no animation at all.

Fix:
- Both `Logo` components now animate the gradient continuously via a CSS
  `@keyframes` sweep (`brand-text-shimmer` / `admin-brand-text-shimmer`),
  so the colour movement is visible on every device, not just on
  mouse-hover. Hover now just speeds the same animation up
  (`animation-duration` shortens on `:hover`) instead of being required to
  see any motion at all.
- The gradient itself now blends in the same explicit teal
  (`#2dd9c4`) the pulsing `AnimatedBrandMark` icon and the boot screen
  already use, instead of relying only on `hsl(var(--primary))`-type
  tokens that could render close to a flat neutral depending on theme.
- Admin app: added its own `AnimatedBrandMark` (same pulsing waveform SVG
  the student app already had) and swapped it in for the static `Activity`
  icon, so both apps' logos now match — animated mark + animated wordmark.

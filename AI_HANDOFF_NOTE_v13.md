# Handoff note — v13 changes (MBBS/BDS college split)

Scope: colleges are now typed as MBBS or BDS at the **institution** level
(not just at the program level underneath them), across the DB schema, the
API, and both frontends. Touches:
- `lib/db/src/schema/medschool.ts`
- `lib/db/src/ensureSchema.ts`
- `artifacts/api-server/src/routes/academic-structure.ts`
- `artifacts/frontend-admin/src/lib/api.ts`
- `artifacts/frontend-admin/src/App.tsx`
- `artifacts/frontend-student/src/lib/api.ts`
- `artifacts/frontend-student/src/App.tsx`

**Not verified with a real build.** Same limitation as v10–v12: no network
access in this environment, so `pnpm install` can't resolve workspace
packages and no `tsc`/`pnpm dev`/browser test could be run. I did manually
recount JSX `<div>`/`</div>` balance in both edited `App.tsx` files
(comparing counts before/after the edit rather than a full parse) and it
came out even, but that is not a substitute for a real typecheck.
**Run `pnpm typecheck` and `pnpm dev` (both frontends) and a full build
before trusting this in prod.**

## Why

The ask: an MBBS college and a BDS college are different institutions, and
the college picker (both in admin and at student registration) should
reflect that instead of treating "college" as one flat list with MBBS/BDS
picked separately and disconnected from it.

## What changed

1. **New `kind` column on `med_institutions`.** Previously only
   `med_programs` had a `kind` (MBBS/BDS/OTHER), scoped *under* an
   institution. Now the institution row itself carries `kind: TEXT NOT
   NULL DEFAULT ''` — `""` for legacy rows created before this existed,
   `"MBBS"` or `"BDS"` for everything the admin UI creates going forward.
   Added via the same idempotent `CREATE TABLE IF NOT EXISTS` +
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern as every other
   column added post-launch (see `ensureSchema.ts`), so this is safe to
   run against an existing database — no rows disappear, they just start
   out unset.

2. **`GET /institutions` accepts `?kind=MBBS|BDS`.** Uppercased and
   matched exactly; omitting it returns every institution regardless of
   kind (used by the admin "Colleges & courses" page, which still shows
   everything, just split into tabs client-side). `POST`/`PATCH
   /institutions` accept and persist `kind` the same way `/programs`
   already did.

3. **Admin — Institutions list is now tabbed by MBBS / BDS.**
   (`AdminInstitutionsList` in `frontend-admin/src/App.tsx`.)
   - Two tabs, "MBBS colleges" and "BDS colleges", each with a live count.
   - A third "Unset" tab appears **only** if any institution still has
     `kind === ''` (i.e. only matters for pre-existing data) — once
     everything is categorized it disappears on its own.
   - The reorder arrows / drag-order (`displayOrder`) now renumber within
     the active tab only, not the whole table — MBBS and BDS colleges are
     never shown together, so their order numbers don't need to be
     globally unique, only unique within their own kind.
   - The "Add college" form has a required MBBS/BDS selector that
     defaults to whichever tab is currently open (switch tabs, and the
     next college you add defaults to that tab's type).
   - Every row has an inline type dropdown (Unset/MBBS/BDS) so an existing
     entry — including legacy ones — can be corrected at any time, not
     just set once.
   - `ProgramsColumn` (the programme list nested under a selected
     institution) now defaults its own "add program" kind dropdown to the
     parent institution's kind when it has one, e.g. picking a BDS college
     defaults the next program you add under it to BDS too. **Not
     enforced** — an admin can still explicitly choose a different kind
     (e.g. "Other") for a program under a typed institution. Flagged in
     case you want that locked down; wasn't in the original ask.

4. **Student registration — Program now comes before College.**
   (`Register` in `frontend-student/src/App.tsx`.)
   - Field order changed: Full name → **Program (MBBS/BDS)** → **College**
     → Academic year → Email/Phone → Password → Plan. Previously College
     came first and Program/Year were paired in a 2-column row after it;
     now each of Program/College/Year is its own full-width row, since
     College can't be picked (or make sense) until Program is chosen.
   - The college `<select>` is disabled until a program is picked, its
     query is now `academicApi.institutions(true, programKind)` (query key
     includes `programKind` so switching MBBS↔BDS refetches instead of
     reusing a cached list), and it only lists colleges of that kind.
   - Switching Program after a college was already selected clears the
     selected college (it may not exist in the new list) — handled via a
     `useEffect` on `programKind`.
   - Empty-state copy updated to be kind-specific: "No MBBS colleges are
     set up yet…" / "No BDS colleges are set up yet…".

5. **Both `api.ts` files** (`frontend-admin` and `frontend-student`): added
   `kind` to the `Institution` interface, added a small `qs()` query-string
   helper (there wasn't one — `institutions()` previously only had room for
   one optional param, `active`; now it takes `active` and `kind`).

## Files touched
- `lib/db/src/schema/medschool.ts`
- `lib/db/src/ensureSchema.ts`
- `artifacts/api-server/src/routes/academic-structure.ts`
- `artifacts/frontend-admin/src/lib/api.ts`
- `artifacts/frontend-admin/src/App.tsx`
- `artifacts/frontend-student/src/lib/api.ts`
- `artifacts/frontend-student/src/App.tsx`

## Verification done
- Manually recounted `<div>`/`</div>` balance for both edited `App.tsx`
  files before vs. after the edit (accounting for self-closing
  `<div .../>` tags): both files show the same pre-existing baseline
  offset of 2 before and after, with opens/closes each moving by exactly
  the number of divs actually added/removed — no net imbalance introduced.
- Read through the new JSX by hand for unclosed tags / mismatched
  ternaries; did not run a real parser or typechecker on it.
- **Not done**: `pnpm install` / `tsc --noEmit` / `pnpm dev` / production
  build, and no runtime/browser testing — no network access in this
  environment (same as every prior handoff note).

## Suggested smoke-test before deploy
- Migration: point `ensureSchema` at a copy of the real (non-empty)
  database and confirm `med_institutions` gets the `kind` column with no
  errors and no existing rows lost.
- Admin → Colleges & courses: switch between MBBS/BDS tabs, add a college
  in each, use the reorder arrows in both tabs, and (if you have any
  pre-existing institutions) confirm they show up under "Unset" and that
  setting their type via the inline dropdown moves them to the right tab
  and makes "Unset" disappear once it's empty.
- Admin: under a BDS-typed institution, add a programme and confirm the
  kind dropdown defaults to BDS (and that you can still override it).
- Student registration: confirm College stays disabled until a Program is
  picked, that switching Program clears an already-picked College, and
  that the College list only shows colleges of the selected kind.
- Full registration submit end-to-end (the POST body shape — institutionId
  + programKind — didn't change, only how those values get collected).

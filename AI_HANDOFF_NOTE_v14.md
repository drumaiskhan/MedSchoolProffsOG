# Handoff note — v14 changes (AI provider failover + registration fixes)

**Not verified with a real build.** Same limitation as v10–v13: no network
access in this environment, so `pnpm install` can't resolve workspace
packages and no `tsc`/`pnpm dev`/browser test could be run. Every edited
file was instead checked with a standalone `esbuild` syntax/JSX parse
(catches unclosed tags, bad JSX, syntax errors) — that passed clean on all
files below, but it is **not** a substitute for `pnpm typecheck` and
`pnpm dev` before trusting this in prod.

## 1. Multi-provider AI failover ("if one API goes down, another works")

**File:** `artifacts/api-server/src/lib/aiExplain.ts`

Previously `resolveProvider()` picked exactly *one* provider (DB setting, or
the first of ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY found in the
environment) and every AI call (`runPrompt`) used only that one — an outage,
rate limit, expired key, or timeout on that single provider took down "Ask
AI to explain," AI-generated MCQs/flashcards, and auto-explain-on-import
all at once.

- `resolveProvider()` → replaced with `resolveProviders()`, which returns an
  **ordered list** of every configured provider instead of just one:
  1. Primary DB-configured provider (`AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL`/
     `AI_BASE_URL` — unchanged from before).
  2. New optional **backup** DB-configured provider (`AI_PROVIDER_2`/
     `AI_API_KEY_2`/`AI_MODEL_2`/`AI_BASE_URL_2`) — lets an admin pair two
     *different* vendors (e.g. Anthropic primary, OpenAI backup) so one
     vendor's outage doesn't take the feature down.
  3. Every provider with a key present in the environment
     (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) — previously
     only the *first* one found was ever used; all of them are now kept as
     further fallbacks instead of the rest being silently ignored.
  Duplicate provider+key combinations are skipped.
- `runPrompt()` now loops over that list via a new `runOnProvider()` helper
  (same truncation-retry-on-the-same-provider logic as before, just
  factored out) and returns the **first candidate that succeeds**. A
  provider that throws is logged into a `failures[]` list and the loop
  moves on to the next configured provider — nothing is retried against a
  provider that's already failed for this request. Only if *every*
  configured provider fails does `runPrompt` throw, with a message that
  lists what each one said (so "everything is actually down" is
  distinguishable from "nothing is configured" — `AiNotConfiguredError` is
  still thrown separately when the candidate list is empty).
- Callers (`generateExplanation`, `generateHint`, `classifyDifficulty`,
  `generateFlashcardExplanation`, `generateFlashcardSet`, `generateMcqSet`
  in this file; `aiVisualizer.ts`, `explanations.ts` routes, `mcq-import.ts`)
  are **unchanged** — they all go through `runPrompt`/`generateExplanation`
  etc., so failover is transparent to every existing call site.

**File:** `artifacts/api-server/src/routes/settings.ts`
- `EDITABLE_KEYS`: added `AI_PROVIDER_2`, `AI_API_KEY_2`, `AI_MODEL_2`,
  `AI_BASE_URL_2` (same shape/semantics as the existing primary-provider
  keys, just for the backup slot).
- `SECRET_KEYS`: added `AI_API_KEY_2` so it's masked on the way out and
  skipped (not blanked) on PATCH when left empty — identical handling to
  `AI_API_KEY`.

**File:** `artifacts/frontend-admin/src/App.tsx` (Admin → Platform settings
→ AI tab)
- New "Backup AI provider (optional)" section under the existing primary
  provider fields: a Provider select (defaulting to "None — no backup
  configured"), and — only once a backup provider is chosen — API key
  (masked the same way as the primary key), Model, and (for `custom`) Base
  URL fields. Mirrors the primary section's fields/data-testids with a
  `-2` suffix (`select-ai-provider-2`, `input-ai-api-key-2`, etc.).
- Updated the on-page copy in two places to mention the backup provider and
  that env-var keys are tried *after* both DB slots.

**Nothing else changes.** A deployment with only the primary provider set
(or only an env var) behaves exactly as before — the backup slot and extra
env fallbacks are additive.

## 2. Student registration: College showed empty after the v13 MBBS/BDS split

**File:** `artifacts/api-server/src/routes/academic-structure.ts`
(`GET /institutions`)

Root cause: v13 added a `kind` column to `med_institutions` and made the
registration form's College list filter by an **exact** match
(`?kind=MBBS` / `?kind=BDS`). Every institution that existed *before* that
migration has `kind === ""` (see `ensureSchema.ts`'s backfill) until an
admin manually re-tags it from the new "Unset" tab in Admin → Colleges &
courses. Until that manual step happens for every legacy college, the
public registration page's College dropdown has nothing to show for either
program — "No MBBS colleges are set up yet" / "No BDS colleges are set up
yet" — even though the colleges are sitting right there in the database and
in the admin panel. From a student's perspective the College field (and,
since Year is disabled until a college's program is picked in the same
flow, effectively the Year field too) just doesn't work.

Fix: `?kind=` now matches the requested kind **or** an unset institution
(`kind === ""`), so not-yet-categorized colleges stay visible to students
under *both* the MBBS and BDS tabs until an admin assigns them a real kind
— instead of disappearing from registration entirely in the meantime. Once
an admin does tag a college, it narrows to just that one tab, same as
before. No schema or admin-UI change needed for this — it's a one-line
filter fix (`or(eq(kind, requested), eq(kind, ""))` instead of a bare
`eq(kind, requested)`).

## 3. Student registration: Academic year is now buttons, not a dropdown

**File:** `artifacts/frontend-student/src/App.tsx` (`Register`)

The Program field already used a row of tappable buttons (MBBS/BDS); Year
was a `<select>`, which is a slower, less obviously-interactive control on
mobile for a list this short (4 or 5 options) and was visually
inconsistent with the field right above it. Replaced the year `<select>`
with a row of buttons — same 4 (BDS) / 5 (MBBS) options, same selected/
unselected styling as the Program buttons (`border-primary bg-[#eef7f1]`
when selected), `data-testid="button-year-{n}"` per button. Before a
program is picked, five disabled placeholder buttons are shown instead of
an empty grid, with "(select a program first)" next to the label — same
information the old disabled-`<select>` conveyed, just consistent with the
new control type. The existing `yearNumber` state, the
`if (!yearNumber) setError(...)` submit-time check, and the "You'll see
content for…" summary line below the form are all unchanged — only the
input control changed, not the state shape or validation.

Removed the now-unused `CalendarDays` icon import (it isn't referenced
anywhere else in this file).

College was deliberately **left as a `<select>`** rather than converted to
buttons — the college list can be long and a searchable dropdown is a
better fit than a button grid at that size; item 2 above is what was
actually broken there.

## 4. Institution permanent-delete blocked on "still has programs/batches"

**File:** `artifacts/api-server/src/routes/academic-structure.ts`
(`DELETE /institutions/:id/permanent`)

Previously this route refused (409 "This institution still has programs
under it — remove or reassign those first") the moment any program existed
underneath the institution, forcing an admin to manually delete every
program/year/batch one at a time before the institution itself could go.
None of `med_programs` / `med_academic_years` / `med_batches` has a real
database-level `FOREIGN KEY` back to `med_institutions` (same situation as
`hardDeleteMcqs()` in `medschool.ts` — plain integer columns, no
`REFERENCES`), so that 409 was purely an application-level guard, not
something the database itself required.

Fixed by cascading the delete instead of blocking on it: in one
transaction, delete every batch under the institution's academic years,
then the academic years, then the programs, then the institution itself
(bottom-up, so nothing is ever half-deleted). The response now also
reports how many of each were cascaded (`{ ok, cascadedPrograms,
cascadedYears, cascadedBatches }`), and the admin confirm-dialog copy was
updated to say so up front instead of the old "blocked if it still has
programmes" line.

**Left unchanged on purpose:** the institution must still be archived
first (`active === false`), and the delete is still blocked if any student
account (`med_users.institutionId`) is directly assigned to it — a
student login is real user data, not structural config, so that's the one
thing this route still refuses to cascade away silently. A handful of
other tables (`med_resources`, `med_past_papers`) hold these program/year
ids only as optional targeting filters, not ownership — those simply go
unmatched afterward, the same tolerance the app already has for any other
archived/removed id.

**File:** `artifacts/frontend-admin/src/App.tsx`
- Updated the "Delete this institution permanently?" confirm dialog body to
  describe the cascade instead of the old block-on-programs behavior.

## Files touched
- `artifacts/api-server/src/lib/aiExplain.ts`
- `artifacts/api-server/src/routes/settings.ts`
- `artifacts/api-server/src/routes/academic-structure.ts`
- `artifacts/frontend-admin/src/App.tsx`
- `artifacts/frontend-student/src/App.tsx`

## Suggested smoke-test before deploy
- AI failover: configure a primary provider with a deliberately bad API
  key and a backup provider with a real one; confirm "Ask AI to explain"
  still succeeds (via the backup) and doesn't just fail. Check server logs/
  the thrown error text if you intentionally break both, to confirm the
  combined failure message actually lists both providers' errors.
- Admin → Platform settings → AI: confirm the new "Backup AI provider"
  section saves/reloads correctly (provider, key masking, model, base URL
  for `custom`), and that leaving it on "None" behaves identically to
  before this change.
- Registration: with a database that has pre-v13 institutions still
  `kind`-unset, confirm they now show up under both MBBS and BDS on the
  public Register page, and that tagging one via Admin → Colleges & courses
  narrows it to just that tab going forward.
- Registration: confirm the year buttons render 5 options for MBBS / 4 for
  BDS, that switching Program resets the year selection (existing
  `useEffect`/`setYearNumber('')` behavior, untouched), and that submitting
  without picking a year still shows "Please select your academic year."
- Full registration submit end-to-end — the POST body shape didn't change,
  only how College/Year are picked in the UI.
- Institution delete: archive an institution that has programs/years/
  batches under it, then "Delete permanently" — confirm it now succeeds
  (no more 409) and that the programs/years/batches are actually gone
  afterward. Separately, confirm it's still blocked with a clear error if
  a student account is assigned to that institution.

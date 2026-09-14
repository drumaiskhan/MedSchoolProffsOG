# AI Handoff Note v22

Scope: fix the flashcard flip rendering bug (screenshots showed the whole
browser frame — tabs, address bar, sidebar — mirrored/upside-down, not
just the card) and give the in-app "MedschoolProffs" sidebar logo the
same animated treatment `AnimatedBrandMark` already gave the marketing
nav in v20.

## Root cause (flashcard bug)

`frontend-student/src/index.css`'s `.flip-card*` rules had already been
patched twice before (see the superseded comments this note replaces):
first with `backface-visibility` + vendor prefixes, then with
`translateZ` + explicit `z-index` to force each face onto its own GPU
compositing layer. Both were reasonable fixes for the usual "wrong face
briefly visible" flip bug — but the new screenshots show the *entire*
browser paint (OS/browser chrome included, not just the card DOM)
point-reflected. That's a symptom of the GPU/driver compositing a true
3D `rotateY` + `perspective` + `preserve-3d` frame incorrectly on this
machine's hardware — below the DOM, so no amount of rearranging
`z-index`/layers inside the page can fix it. The only dependable fix is
to stop asking the compositor to do a 3D rotation at all.

## What changed

- **`frontend-student/src/index.css`** — replaced the `.flip-card`,
  `.flip-card-inner`, `.flip-card-face`, `.flip-card-face.flip-card-back`
  rules with a 2D-only fake flip: the outgoing face fades + shrinks
  (`opacity` + `scale`), the incoming face fades + grows in after a short
  `transition-delay` so the two never fully overlap mid-transition, and
  `pointer-events` is toggled so the hidden face can't eat clicks/taps.
  No `perspective`, `preserve-3d`, `rotateY`, `backface-visibility`, or
  `translateZ` anywhere in the rule now — nothing left that can trigger
  the driver-level bug. Markup in `Flashcards.tsx` (both the grid view
  and single-card study mode) is unchanged; the class names
  (`flip-card` / `flip-card-inner` / `is-flipped` / `flip-card-face` /
  `flip-card-back`) are the same, only what they *do* changed.
- **`frontend-student/src/lib/shared.tsx`** — `Logo` (the sidebar/header
  wordmark used throughout the app, shown in the screenshots) now renders
  `AnimatedBrandMark` (the pulsing heartbeat-line SVG already built in
  v20 for the marketing nav) instead of the static lucide `Activity`
  icon, and the "MedschoolProffs" text is now a `bg-clip-text` gradient
  (primary → accent, or the sidebar equivalents in dark mode) that sweeps
  into place on hover via `background-position`. Removed the now-unused
  `Activity` import. No other props/behavior of `Logo` changed, so every
  call site (sidebar, mobile header, etc.) picks this up automatically.

## What was checked, and what wasn't

- Parse-checked both edited files with a local `esbuild` (`--bundle
  --packages=external`, both `.tsx` files) — zero errors, both build to
  a bundle (the only output was an unrelated `import.meta`/IIFE warning
  from the `api.ts` this pulls in, not from either edited file).
- Did **not** run `pnpm install` / `vite build` / `tsc --noEmit` here —
  same no-network-access constraint as v20's session. Please run the
  real build before deploying, and specifically re-test the flashcards
  page (both grid view and "study" single-card mode) on the same
  machine/browser that produced the mirrored screenshots, since that's
  a hardware/driver-specific repro that can't be confirmed fixed from
  here.
- Did not touch `frontend-admin` — grepped it for the same `flip-card`
  pattern and it isn't there; `AdminFlashcards.tsx` is a CRUD/management
  page, not the flip-card study view, so nothing to fix on that side.

## Follow-up: General Trial Mode (this session, same v22)

Added a platform-wide "General trial mode" switch, separate from the
existing per-student `POST /students/:id/trial` grant (which still works
unchanged either way).

- **`lib/settings.ts`'s existing `platformSettingsTable` key/value store**
  gets one new key, `GLOBAL_TRIAL_MODE` — no schema migration needed,
  same generic table `PLATFORM_NAME`/`AI_VISUALIZER_ENABLED`/etc. already
  use. Unlike those two (which default ON — `"false"` is the opt-out),
  `GLOBAL_TRIAL_MODE` defaults OFF: only the exact string `"true"` enables
  it, so a fresh install or a failed settings lookup never accidentally
  opens the whole site.
- **`middlewares/auth.ts`'s `requireActiveMembership`** (the gate every
  membership-only route already uses) now checks this setting as a last
  resort, after its normal admin-bypass and per-student ACTIVE-status
  checks: if the student isn't otherwise active but `GLOBAL_TRIAL_MODE`
  is on, they pass anyway. Wrapped in try/catch, fails closed (treats a
  settings-lookup error as "off") so a DB hiccup can't accidentally grant
  free access. This required making the function `async` — it was sync
  before; every call site already just passes it to Express as
  middleware, so no other file needed to change.
- **`routes/settings.ts`** — added `GLOBAL_TRIAL_MODE` to `EDITABLE_KEYS`
  (admin `GET`/`PATCH /admin/settings`, same as every other feature
  toggle already there).
- **`routes/site-content.ts`** — also added it to the public
  `SITE_CONTENT_KEYS` list (`GET /site-content`) so the student app can
  read it and show a banner. This is read-only exposure — the actual
  access grant happens server-side in `requireActiveMembership` above,
  not by the student app "knowing" the flag.
- **`frontend-admin/src/pages/AdminSettings.tsx`** — new "General trial
  mode" card on the Features tab, styled amber/warning while on (matching
  the toggle's actual stakes — it opens the entire platform for free).
  Checkbox is `checked={values.GLOBAL_TRIAL_MODE === 'true'}` (note the
  inverted default vs. the other two checkboxes on that tab, which use
  `!== 'false'`).
- **`frontend-student/src/lib/shared.tsx`'s `Shell`** — new slim banner
  ("Trial mode is on — every feature is free to use right now.") shown
  above the header whenever the flag is on, hidden during focus mode
  (exam/practice) so it doesn't crowd that distraction-free header. Reads
  the same `['site-content']` query key `SideNav` already uses, so this
  doesn't add an extra request.
- Both frontends' `PlatformSettings`/`SiteContent` TypeScript interfaces
  got the new field added.

Checked the same way as the flashcard fix: esbuild `--bundle
--packages=external` on every edited file (server files with
`--platform=node`, frontend files with `--platform=browser
--loader:.tsx=tsx`) — zero errors on all seven touched files. Also reran
the `tsconfig.check.json` / `TS2304`+`TS2552` scoped-name check (same
technique v20 introduced) against all seven — zero undefined-reference
hits. Did not run a real `pnpm install`/`vite build`/`tsc --noEmit` here,
same no-network-access constraint noted above — please run the real
build, then click through: (1) toggle it on as admin and confirm a
signed-out-trial-eligible student (`EXPIRED`/`PAYMENT_PENDING_REVIEW`
status, no active membership) can now open MCQs/flashcards/exams/books;
(2) toggle it back off and confirm that same student is blocked again
with no lingering membership row created; (3) confirm a student with a
real paid membership sees no change in behavior either way.


# AI Handoff Note v18

Scope: "split the code for fast loading" — both frontends
(`frontend-student`, `frontend-admin`) shipped every page as one inline
`App.tsx` (2,075 and 3,566 lines respectively), so visiting `/login` on a
fresh page load downloaded and parsed the entire app — MCQ bank tree,
exam engine, payments hub, admin curriculum editor, all of it — before a
single pixel of the actual login form could render. Root cause was
structural, not a config problem: every route's component was a
top-level function defined inline in `App.tsx`, so there was no module
boundary for a bundler to split on.

## What changed

Mechanically split each `App.tsx` into:

- `src/pages/<PageName>.tsx` — one file per routed page (27 for student,
  25 for admin), each a plain default-exported component. These are the
  exact same components, unedited — this was a pure move, not a rewrite.
- `src/lib/shared.tsx` — everything that *isn't* a routed page (Shell,
  SideNav, the MCQ/flashcard tree components, form helpers, hooks like
  `usePageTitle`/`useFocusMode`, `cn`/`money`/`initials`, etc.). This
  stays in the main bundle since nearly every route needs it anyway —
  splitting it further would've meant every page re-fetching the same
  chrome.
- `App.tsx` itself — now just the QueryClient setup, one
  `const X = lazy(() => import('@/pages/X'))` per page, and `AppRoutes`
  wrapped in a single `<Suspense fallback={<SkeletonPage />}>` around
  the existing `<Switch>`/`<Route>` tree. Route paths and the
  `<Shell>` wrapping are byte-for-byte the same as before — only the
  page components are now lazy references instead of inline
  definitions. 2,075 → 106 lines (student), 3,566 → 88 lines (admin).

Net effect: a signed-out visitor hitting `/login` now only downloads the
login page's chunk plus shared chrome — not the MCQ bank, exam engine,
or (on the admin side) the curriculum editor and payments hub. Same for
every other route: you pay for the page you're on, not the whole app.
Vite/Rollup already had vendor chunking configured
(`react`/`react-dom`/`wouter`/`react-query` in their own cacheable
chunk) — that didn't need to change, it was just missing the
route-level split on top of it.

## How the split was done, and what was checked

This was a mechanical extraction (move each top-level declaration to its
own file, generate imports for whatever it references), not a hand
rewrite — done that way specifically to avoid introducing behavior
changes while restructuring ~5,600 lines across two files. Checked
after the fact, since (same as v17) there was no `node_modules` here to
run a real build:

- Every generated file (54 pages + 2 shared modules + 2 `App.tsx`) was
  run through `esbuild` as a syntax/parse check — no errors.
- Cross-checked that no page ended up importing a name it doesn't
  actually use as a component (the first pass over-matched on page
  names that only appeared in link-label text, e.g. `Subjects.tsx` had
  a stray back-link that just says "Blocks" — fixed by only treating a
  name as a real cross-page reference when it's used as `<Name`, not
  just present in the text).
- Checked for import-name collisions (a name pulled in from
  `@/lib/shared` that's also re-declared locally in the same page) —
  none found.
- Confirmed every extracted page file has exactly one `export default`.

**What this pass did *not* do**, because it genuinely needs a real
build to verify safely: run `tsc`/a dev server against the result, or
touch `vite.config.ts` further (the existing manualChunks setup already
covered the vendor-splitting half of this and didn't need edits). Run
both frontends through `vite build` (or at minimum `vite dev` and click
through each route) before deploying — an `esbuild` syntax pass confirms
the files parse, not that every prop/type lines up the way `tsc` would
catch.

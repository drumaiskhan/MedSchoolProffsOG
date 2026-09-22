# AI Handoff Note v19

Scope: "make the first page for it like PulsePrep" — a public marketing
landing page for `frontend-student`, since previously there wasn't one:
`/` went straight into `<Shell><Dashboard /></Shell>`, and Shell's own
auth check hard-redirected any signed-out visitor to `/login` before a
single pixel of marketing content could render. Every visitor's very
first impression of the product was a bare login form.

## What changed

- **`src/pages/Home.tsx` (new)** — public landing page mounted at `/`.
  Structure (nav → hero → why-us grid → about → pricing → feature grid →
  final CTA → footer) is modeled on the shape of sites like pulseprep.net,
  but every word of copy is original and specific to this app, and the
  pricing section pulls live data from `useListMembershipPlans()` (public
  endpoint, filtered to `active`, sorted by `displayOrder`) with a loading
  skeleton and a graceful empty state if no plans are configured yet.
  Header/tagline pull from the existing `/site-content` endpoint the
  same way `Footer` already does. Deliberately did **not** invent
  numeric claims ("10,000+ MCQs") or named student testimonials — I have
  no way to verify real current counts or get real quotes, so the copy
  stays qualitative instead of fabricating specifics that would need
  fact-checking against the live DB.
  - A visitor who already has a session gets bounced to `/dashboard`
    once the (non-blocking) `useGetCurrentUser` check resolves — the
    page still renders immediately rather than gating on that check,
    since the common case is a signed-out visitor.
  - Reuses `Footer` (`variant="full"`) as-is rather than duplicating
    footer content.

- **Root route reassigned**: `/` is now `Home`; the dashboard moved to
  `/dashboard`. Everywhere in the student app that assumed "dashboard
  lives at `/`" got updated to point at `/dashboard` instead:
  - `App.tsx` route table.
  - `src/lib/shared.tsx`: `navGroups` first entry (sidebar "Overview"
    link), `Shell`'s page-title logic (`location === '/dashboard'` for
    the "Good morning, X" heading), the focus-mode exit button.
  - `Logo` (`shared.tsx`) now takes an optional `href` prop (defaults to
    `/`, correct for its use in `AuthLayout` on the logged-out auth
    pages); the copy of it in the authenticated side-nav now passes
    `href="/dashboard"` explicitly so it doesn't send logged-in users
    back out to the marketing page.
  - `Login.tsx`'s post-login redirect (`setLocation`) now targets
    `/dashboard` instead of `/`.
  - `Flashcards.tsx`'s study-mode back arrow now targets `/dashboard`.
  - Register/VerifyEmail/ResetPassword were already redirecting to
    `/login`, not `/` — untouched.

`frontend-admin` was not touched — nothing in it hardcoded a link into
the student app's `/`.

## What was checked, and what wasn't

Same constraint as v17/v18: no `node_modules` here, so no real
`vite build`/`tsc`. What I could check:

- Ran every touched/new file (`Home.tsx`, `App.tsx`, `Login.tsx`,
  `shared.tsx`, `Flashcards.tsx`) through `esbuild` as a parse check —
  no errors, using the `esbuild` binary bundled with a globally
  installed `tsx` package (no network access to install `esbuild`
  directly).
- Grepped the whole `frontend-student` tree for any other hardcoded
  `"/"` reference (`href="/"`, `setLocation('/')`, `path="/"`) that
  would've silently kept assuming the dashboard lives at the root —
  the list above is everything that turned up.

**Not verified**, because it needs a real dev server: that `wouter`'s
`<Switch>` actually resolves `/` to `Home` and `/dashboard` to the
Shell-wrapped `Dashboard` at runtime (should be fine — exact-path
matching, no ordering conflict — but untested), that the public
`/membership-plans` and `/site-content` endpoints return what `Home.tsx`
expects with no auth header attached, and a click-through of the new
page's responsive layout at actual mobile widths. Run `vite dev` and
visit `/` signed out, then `/dashboard` signed in, before deploying.

# AI Handoff Note v20

Scope: fix the "Something went wrong" crash on admin (`ReferenceError` on
`/api/auth/me` 401) and the `ReferenceError: PaymentDestinationCard is not
defined` crash on student `/register`, then audit both frontends for the
same class of bug end-to-end. Also: animated nav logo on the marketing
landing page.

## Root cause

Both `frontend-admin` and `frontend-student` were split from one large
`App.tsx` into `src/lib/shared.tsx` + per-route files under `src/pages/`
(see v-earlier notes' "Round 3, item 10" / "perf pass" comments already in
the code). That split left many files referencing names that were only
ever in scope by accident of the old single-file layout:

1. **`queryClient`** — created as a local `const` inside `App.tsx`
   (`const queryClient = new QueryClient(...)`), but referenced as if it
   were a global in `shared.tsx` and ~30 page files across both apps
   (mutation `onSuccess` cache invalidation, `Shell`'s signed-out
   redirect, etc.). Every one of those was a `ReferenceError` waiting to
   fire the moment that code path ran. `Shell`'s redirect
   (`if (!user) { queryClient.clear(); window.location.href = '/login'; }`)
   runs on every anonymous page load once `/api/auth/me` returns 401 —
   which is why the admin app's root page (screenshot) crashed for any
   signed-out visitor, not just one route.

2. **Missing component/helper imports** — same split, same story, for
   symbols exported from each app's own `shared.tsx` (`PaymentDestinationCard`,
   `Badge`, `cn`, `EmptyState`, `ConfirmDialog`, `ExamCard`, `StatTile`,
   `McqBankTree`, `FaviconUploader`, `AdminAccountSection`,
   `NotificationBroadcastPanel`, and others — full list in the diff).
   `Register.tsx`'s `PaymentDestinationCard` crash was one instance of
   this pattern; there were ~20 more across both apps' `src/pages/`.

3. **`renderPdfFirstPageThumbnail`** (admin `AdminBooks.tsx`) — called to
   auto-generate a book cover thumbnail from an uploaded PDF, but never
   implemented anywhere in the codebase. Not a hard crash (it's inside a
   mutation's try/catch, so it just failed silently with a toast), but
   the feature never worked.

### Why this wasn't caught earlier

v17–v19's checks were `esbuild` parse-only (see those notes) — esbuild
strips TypeScript types and does not resolve identifier scope, so an
undefined JS reference like `queryClient` or `PaymentDestinationCard`
parses cleanly and only blows up at runtime, when that code path actually
executes. Only `tsc --noEmit` (real type-checking) catches "cannot find
name" — and no `node_modules` was available in any of these sessions to
run it directly against the workspace's `@workspace/api-client-react`
package.

**This time**, a standalone `tsconfig.check.json` (not part of the real
build) was used with `paths` mapped straight at each app's `src/` and at
`lib/api-client-react/src/index.ts`, `skipLibCheck: true`, letting `tsc`
run despite no installed `node_modules` for `react`/`lucide-react`/etc.
(those come back as harmless `TS2307` "cannot find module" noise — normal
without deps installed). Filtering that output to `TS2304`
("Cannot find name") and `TS2552` ("Cannot find name, did you mean X")
surfaced every genuine undefined-reference bug in both apps. Worth
keeping this file around (or wiring `pnpm --filter <app> run typecheck`
into CI) so this class of bug can't reach a deploy again.

## What changed

- **New `src/lib/query-client.ts`** in both `frontend-admin` and
  `frontend-student` — single exported `queryClient` singleton.
  `App.tsx` in both apps now imports it instead of creating its own local
  instance (this matters, not just for the `ReferenceError`: if each file
  had instead created its *own* `new QueryClient()`, cache
  clear/invalidate calls would silently no-op against the wrong
  instance instead of throwing).
- Every other file that referenced the bare `queryClient` name — both
  `shared.tsx` files and ~28 page files — now imports it from
  `@/lib/query-client`.
- ~20 page files (both apps) — added the missing symbol(s) to that
  file's existing `import { ... } from '@/lib/shared'` line. No new
  components were written; everything referenced already existed in
  `shared.tsx`, just wasn't imported where it was used.
- **`shared.tsx` (admin)** — added the missing `PaymentSettingsValues`
  (`Record<string, string>`) and `SetSetting`
  (`(key: string, value: string) => void`) type aliases used by the
  payment-settings tab components and never defined anywhere. Type-only,
  so this didn't crash at runtime (esbuild erases types either way), but
  it did fail real type-checking.
- **New `src/lib/pdf-thumbnail.ts` (admin)** — implements
  `renderPdfFirstPageThumbnail(file, maxWidth?)` using `pdfjs-dist`
  (added to `package.json`; **run `pnpm install` before building** —
  not resolvable in this sandbox, no network access here). Renders page 1
  of the uploaded PDF to a canvas and returns a JPEG `Blob`, or `null` on
  any failure (matches the call site's existing "best-effort, book still
  saves without a thumbnail" comment). Wired into `AdminBooks.tsx` with
  an import.
- **Landing page nav logo** (`frontend-student/src/pages/Home.tsx`) —
  was a plain lucide `TrendingUp` arrow icon, static. Replaced with a new
  `AnimatedBrandMark` export in `shared.tsx`: the same heartbeat-line SVG
  path and pulse keyframe animation already used by `BrandedLoadingScreen`
  (`boot-wave-draw`), just sized for inline nav use instead of a
  full-screen loading state and using `currentColor` so it inherits
  `text-primary` like the rest of the header. Nothing else on the page
  changed; the `TrendingUp` icon is still used elsewhere (the "Analytics"
  feature card) and its import was left in place.

## What was checked, and what wasn't

- Ran `tsc --noEmit` (via the throwaway `tsconfig.check.json` described
  above) against every `.ts`/`.tsx` file in both `frontend-admin/src` and
  `frontend-student/src`, before and after, filtered to `TS2304`/`TS2552`:
  **zero remaining** in both apps after this pass.
- Did **not** run a real `vite build` or `pnpm install` — no network
  access in this session, and the workspace's `catalog:` pnpm protocol
  isn't resolvable by plain `npm install` either. Please run
  `pnpm install && pnpm run build:admin && pnpm run build:student`
  (or your usual CI build) before deploying, and specifically click
  through `/register` (student) and the admin root path signed-out, to
  confirm both original crashes are gone.
- `pdfjs-dist`'s worker setup (`?url` import of
  `pdfjs-dist/build/pdf.worker.mjs`) is a well-known Vite pattern but
  **was not build-tested** here — no way to actually run `vite build`
  without `node_modules`. Worth a manual test of "add a PDF book without
  a manual cover" after deploying.
- Left the ~54 duplicate `GraduationCap` icon imports (one page's icon
  list imports it twice from `lucide-react`) alone — confirmed via a
  local `esbuild` binary that it silently dedupes rather than erroring,
  so it's cosmetic, not a bug. Flagging in case a stricter bundler is
  ever introduced.

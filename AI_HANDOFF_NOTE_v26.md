# AI Handoff Note v26 (for the next AI/dev)

Scope: 3 requested fixes. One schema addition (new table, additive —
`ensureSchema.ts`/`ensure-schema.sql`/`manual-migration.sql` all updated, no
existing table or column touched). Not build-tested (no network access to
`pnpm install` in this environment) — only syntax-checked with `tsc
--noEmit` on each touched file in isolation (workspace-package import
errors, missing `@types/node`, missing JSX runtime, and pre-existing
`err: unknown` narrowing noise are expected in isolation and were
individually confirmed to not be new syntax errors). **Run `pnpm dev` / a
full build and a real signup+reset-password round trip before trusting this
in prod.**

## 1. Reset-password (and verify-email/welcome) email links were broken

The report: the "Reset your MedschoolProffs password" email linked to
`https://medschoolproffs.netlify.app,https://medschoolproffss.netlify.app/reset-password?token=...`
— two URLs glued together with a comma, one of them a typo domain — which
the browser can't resolve (`DNS_PROBE_FINISHED_NXDOMAIN`).

Root cause: `APP_URL` is documented and used in `app.ts` as a
comma-separated CORS allow-list (`process.env.APP_URL?.split(",")` — see
`.env.example`: `APP_URL=http://localhost:5173,http://localhost:5174`, one
entry per frontend app). But `auth.ts` read that exact same env var and
dropped it straight into email links as if it were a single origin:
`` `${APP_URL}/reset-password?token=${raw}` ``. Any deploy that (correctly,
per the CORS docs) set `APP_URL` to more than one origin got a broken email
link — this wasn't a one-off typo in the email copy, it was structural: two
different features silently sharing one env var with incompatible formats.

Fix:
- New `artifacts/api-server/src/lib/publicAppUrl.ts` — `getPublicAppUrl()`
  resolves to exactly one URL: prefers an explicit `PUBLIC_APP_URL` env var,
  else falls back to the first entry of `APP_URL`, else `localhost:5173`.
- `auth.ts`'s `APP_URL` constant now comes from `getPublicAppUrl()` instead
  of `process.env.APP_URL` directly — this fixes all three email links that
  used it (verify-email, welcome, reset-password) with one change, since
  they all read the same constant.
- Documented the new var in `.env.example` (root), `artifacts/api-server/.env.example`,
  `DEPLOYMENT.md`'s env var table, and `DEPLOY-SPLIT.md`'s checklist.

**Action needed on the actual deploy, not just the code**: whichever host
runs `api-server` (Render/Railway/whatever `netlify.admin.toml`/`render.yaml`
resolve to in this setup) needs `PUBLIC_APP_URL` set to the real,
correctly-spelled student-app origin (no comma, no `medschoolproffss`
typo). The code fix makes a single-origin `APP_URL` keep working with zero
config changes, but a deploy that already has a comma-separated `APP_URL`
needs `PUBLIC_APP_URL` set explicitly or it'll still just take the *first*
entry of the list, which may or may not be the right one.

## 2. Notification "Clear all" — admin + student, admin's clears for everyone

New table `med_notification_dismissals` (`userId`, `notificationId`) — see
its comment in `lib/db/src/schema/medschool.ts` for the full reasoning.
Short version: a broadcast notification (`notificationsTable.userId IS
NULL`) is shared by every student, so a *student's* "Clear all" can't
delete the row outright without erasing the announcement for everyone else
— it records a dismissal instead. An *admin's* "Clear all" is a different,
more powerful action that really does delete every row for everyone,
because that's explicitly what was asked for ("when admin clears the
notifications they're removed from students too").

- `GET /notifications` (`medschool.ts`) now excludes any notification id
  the requesting user has a dismissal row for.
- `POST /notifications/clear` (new, `requireAuth`) — the personal/student
  version. Hard-deletes the caller's own notifications (`userId` = them),
  and inserts dismissal rows for every broadcast currently visible to them
  that isn't already dismissed. Used by both apps' "Clear all" for a
  non-admin, and by the admin for clearing just their own bell without
  nuking everyone else's — see below.
- `DELETE /admin/notifications/clear-all` (new, `requireAdmin`) — the
  global version. Deletes every row in `med_notifications` outright (and
  clears the dismissals table too, so it doesn't accumulate rows pointing
  at now-gone ids), logs an audit entry with the deleted count.
- `notificationsApi.clearMine()` (both frontends) → `POST /notifications/clear`.
  `notificationsApi.clearAll()` (admin frontend only) → the admin route.
- Both `Notifications.tsx` pages (admin + student) got a "Clear all" button
  next to "Mark all as read", gated behind `ConfirmDialog` since it's
  destructive. The admin's confirm copy says plainly that it removes
  notifications for every student too; the student's says the opposite —
  only their own view is cleared, classmates still see broadcasts.

Migration note: this needs the new table on any environment that hasn't
run `ensureSchema.ts`'s boot-time DDL since this change — it runs
automatically on next server boot (`CREATE TABLE IF NOT EXISTS`, safe to
rerun), no manual migration step required. `manual-migration.sql` was also
updated to match, for anyone who runs migrations by hand.

## 3. Module names had no rename UI at all (Blocks/Subjects/Topics did)

Checked all four "academic content" levels for the rename bug the ask
described. Subjects and Topics already had a working Pencil → inline
rename input → Save, and Blocks' edit form (`BlockForm`) already had a
`name` input pre-filled with `initial?.name`. **Modules were the one gap**:
`ModuleRow`'s Pencil button opened an edit panel with *only* program/year
targeting fields — no name input existed anywhere in that panel, even
though `PATCH /modules/:id` already accepts and applies `name` server-side
(`CreateModuleBody.partial()`) and always has. There was simply no way to
rename a module from the UI.

Fix, `artifacts/frontend-admin/src/lib/shared.tsx` (`ModuleRow`): added
local `editName` state, a "Module name" text input in the edit panel
(pre-filled when the panel opens), and folded `name: editName.trim()` into
the same "Save changes" mutation call that already updates
program/year-targeting — one Save button, one request, same as before but
now also renames. Save is disabled while the name is empty.

## Verification done
- `tsc --noEmit` against each touched file in isolation, copied out to a
  tsconfig-free scratch dir so the project's own `tsconfig.json` didn't
  swallow the check. Confirmed the only errors were the expected kind
  (missing `@types/node`, missing JSX/React types, `err: unknown` in
  catch-style `onError` callbacks used throughout this codebase already) —
  none were new syntax errors introduced by these edits.
- **Not done**: `pnpm install` / `pnpm dev` / production build, no live
  database to actually run the new `CREATE TABLE` against or confirm the
  dismiss/clear-all queries behave as expected with real rows, and no way
  to actually send an email from this environment to confirm the reset
  link resolves. Please smoke-test all three before trusting this in prod:
  (a) request a password reset and click the emailed link, (b) as a
  student, broadcast a notification as admin, clear-all as the student,
  confirm the admin and other students still see it, then clear-all as
  admin and confirm it's gone for everyone, (c) rename a module and confirm
  it sticks after a refresh.

## Files touched (full list)
- `artifacts/api-server/src/lib/publicAppUrl.ts` — new
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/medschool.ts`
- `lib/db/src/schema/medschool.ts`
- `lib/db/src/ensureSchema.ts`
- `lib/db/ensure-schema.sql`
- `lib/db/manual-migration.sql`
- `artifacts/frontend-admin/src/lib/api.ts`
- `artifacts/frontend-student/src/lib/api.ts`
- `artifacts/frontend-admin/src/pages/Notifications.tsx`
- `artifacts/frontend-student/src/pages/Notifications.tsx`
- `artifacts/frontend-admin/src/lib/shared.tsx` (`ModuleRow` only)
- `.env.example`, `artifacts/api-server/.env.example`, `DEPLOYMENT.md`,
  `DEPLOY-SPLIT.md` — docs for `PUBLIC_APP_URL`
- this file, replaced (previous version archived as `AI_HANDOFF_NOTE_v25.md`)

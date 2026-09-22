# AI Handoff Note v33 — device limit

## What it does
- Each login creates a row in `med_user_sessions`; the JWT now carries `sid`.
  `attachUser` (middlewares/auth.ts) only accepts a token whose row is active
  (not revoked, not expired), so limits and admin sign-outs take effect on the
  very next request.
- Limit for a student = `med_users.max_devices` if set, else the
  `DEFAULT_MAX_DEVICES` platform setting, else **2**. `0` = unlimited, max 50.
  **Admin accounts are never limited** (no self lock-out).
- Login at the limit → `403 { code: "DEVICE_LIMIT_REACHED", limit }` with a
  readable message (both login pages already show `error.message`). The
  attempt is refused before `lastLoginAt` / failed-attempt counters change.
- Signing in again from a browser that already holds a valid session for the
  same account replaces that session (no second slot). Logout frees the slot.
  Password change / reset revokes all of that user's sessions.
- Lowering a limit never kicks anyone out; it only blocks new sign-ins until
  the student is under it.
- Concurrency: check + insert run in a transaction under
  `pg_advisory_xact_lock(userId)`.

## Files
- DB: `med_user_sessions`, `med_users.max_devices` (schema/medschool.ts,
  ensureSchema.ts, ensure-schema.sql — created automatically on boot).
- API: `lib/deviceSessions.ts` (all logic), `lib/auth.ts` (`sid` in payload),
  `middlewares/auth.ts`, `routes/auth.ts` (login/register/logout/password),
  `routes/medschool.ts` (admin endpoints below), `routes/settings.ts`
  (`DEFAULT_MAX_DEVICES`, validated 0..50 or blank).
- Admin endpoints: `GET /students/:id/devices`,
  `PATCH /students/:id/device-limit {maxDevices: 0..50 | null}`,
  `DELETE /students/:id/devices/:sessionId`, `DELETE /students/:id/devices`.
  Audit actions: STUDENT_DEVICE_LIMIT_SET / _DEVICE_REVOKED / _DEVICES_RESET.
- Admin UI: `StudentDevicesSection` in `frontend-admin/src/lib/shared.tsx`
  (inside `StudentDrawer`), default-limit field in `AdminSettings.tsx`
  (Security tab).
- Test: `tests/integration/03-device-limit.mjs` (see README).

## Deploy notes / honest limits
- **Everyone is signed out once on deploy**: tokens issued before this change
  have no `sid` and are treated as signed out.
- NOT run against a real Postgres/browser in the environment this was written
  in (no DB/node_modules available) — files were syntax-checked and the pure
  helpers unit-tested only. Run `tests/integration/03-device-limit.mjs` and
  `tsc --noEmit` before shipping.
- A "device" is a browser/cookie, not hardware: clearing cookies or using a
  private window is a new device (and the old slot stays used until it
  expires after 7 days, is signed out by the student, or reset by an admin).
- Device labels come from the User-Agent (display only). IP is taken from
  `X-Forwarded-For` when present, else `req.ip`.
- Not built: student-facing "my devices" page (students at the limit must
  sign out on another device or ask an admin to reset).

## Student UI modernisation (same round)
Colours unchanged; only depth, spacing, structure and hover/focus behaviour.
- `frontend-student/src/index.css`: new `.student-shell` polish block (mirrors
  the admin's `.admin-shell`): card resting shadow, table hover, field focus
  ring, thin scrollbars, filled-button shadows, icon-button hover, active pill
  ring. Scoped to the signed-in app; login/register/public pages untouched.
- `lib/shared.tsx`: sidebar rebuilt in the admin style (tinted icon tiles per
  group, active accent bar, footer card, `aria-current`); header (rounded
  icon buttons, mobile search button, unread-count badge on the bell); content
  centred to max 1320px; `SectionHeader` (accent bar + optional `description`),
  `EmptyState`, `StatTile`, `Stat`, `Badge`, `Progress`, `ConfirmDialog`
  restyled. All pages inherit these.
- Pages: every page header now uses `SectionHeader` with a one-line
  description; Flashcards/AI Visualizer/Past Papers headers moved onto it
  (Past Papers' pale-blue hero became header + two stat tiles); Books cards
  polished.
- Not built: mobile bottom tab bar; dark-mode pass (many hardcoded pale
  colours remain); the public/auth pages (Home, Login, Register).
- NOT looked at in a browser (no node_modules/network here). Syntax-checked
  only — run `pnpm run build:student` and click through it before shipping.

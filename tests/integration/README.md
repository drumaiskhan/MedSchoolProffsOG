# Integration tests (added in round 16)

Plain Node scripts that drive a **running** API server against a **scratch**
Postgres database — never point them at production data (they create users,
books and settings, and one of them drops nothing but assumes an empty DB).

1. Start Postgres and create an empty database, e.g. `msp`.
2. Build and start the API with `DEFAULT_ADMIN_EMAIL=admin@test.com`,
   `DEFAULT_ADMIN_PASSWORD='Admin12345!'`, `PORT=3001`, `COOKIE_CROSS_SITE=false`
   and a `DATABASE_URL` for that database (the schema is created on boot).
3. `node 01-shuffle-trial-brevo-progress.mjs` — MCQ shuffle keeps per-option
   explanations, General Trial Mode gating (years / features / end date /
   books), Brevo slot settings, and the My Progress endpoint.
4. Serve this folder over HTTP on port 8099 (`python3 -m http.server 8099`
   here; the tests point a book at `http://localhost:8099/test.pdf`), then
   `node 02-secure-reader.mjs` — access rules, watermarked page images, word
   boxes, highlights, reading position, non-PDF handling.

The scripts talk to Postgres through `psql` (host localhost, user/password/db
`app`/`app`/`msp` — edit the `sql()` helper at the top if yours differ) and
expect `bcryptjs` to be resolvable from `artifacts/api-server`.

5. `node 03-device-limit.mjs` — 2 devices per student by default; admin can
   raise/lower it per student (0 = unlimited), change the platform default,
   sign a device (or all) out; password change frees the slots; admins exempt.
   It creates its own student (`dev@t.com`) and is independent of 01/02.

**Note (device limit):** 01 and 02 sign the same students in on a fresh client
every run, so after a couple of runs the 2-device default will refuse them.
Before re-running 01/02 do `delete from med_user_sessions;` (or set the
"Devices per student account" setting to 0).

# Running & deploying MedschoolProffs

> **This document describes the old single-frontend layout and is now
> stale.** The app has been split into three deployables — see
> [`DEPLOY-SPLIT.md`](./DEPLOY-SPLIT.md) for the current setup
> (`frontend-student`, `frontend-admin`, `api-server`). The rest of this
> file is kept for background on local dev, but any path referencing
> `artifacts/medschoolproffs` or `build:web` below is out of date — use
> `artifacts/frontend-student` / `artifacts/frontend-admin` and
> `build:student` / `build:admin` instead.

This is a pnpm workspace with three deployables:

- **`artifacts/api-server`** — Express API + Postgres (via Drizzle). Needs a
  persistent Node process and a database. Deploy to Railway, Render, Fly.io,
  or any Docker/Node host — **not** Vercel/Netlify (those are for static
  sites + short-lived serverless functions, not a good fit for this).
- **`artifacts/frontend-student`** — the student-facing Vite/React app.
- **`artifacts/frontend-admin`** — the admin dashboard, a separate Vite/React
  app (kept off the student domain on purpose). Both frontends deploy
  anywhere that serves static files: Vercel, Netlify, Render (static site),
  or the same host as the backend.

You can either deploy all three together on one platform (Render, Railway)
or split them across platforms (frontends on Vercel/Netlify, backend on
Railway/Render) — see `DEPLOY-SPLIT.md` for the split-specific env vars
(`VITE_API_BASE_URL`, `VITE_ADMIN_URL`/`VITE_STUDENT_URL`,
`COOKIE_CROSS_SITE`). Both paths are documented below.

## 1. Local dev in VS Code

**Prerequisites:** Node 22+, [pnpm](https://pnpm.io) (`corepack enable` if
you don't have it), and a Postgres database (local, or a free one from
[Neon](https://neon.tech)/[Supabase](https://supabase.com)/Railway).

```bash
git clone <your-repo>
cd MedschoolProffs-Platform
cp .env.example .env        # fill in DATABASE_URL and JWT_SECRET at minimum
pnpm install
pnpm run db:push             # pushes the schema to your database
pnpm run dev                 # runs the API + both frontends together
```

This starts three processes at once:

- API server — http://localhost:3001
- Student app (`artifacts/frontend-student`) — http://localhost:5173
- Admin app (`artifacts/frontend-admin`) — http://localhost:5174

Both frontends proxy `/api/*` to the backend automatically — no extra
config needed for local dev. They run on different ports on purpose (5173 /
5174) so both can be up at once locally without colliding; on a real deploy
each one gets its own domain instead (see `DEPLOY-SPLIT.md`).

**Opening this folder in VS Code:** the repo ships a `.vscode/tasks.json`
with ready-made tasks — open the Command Palette → "Tasks: Run Task" →
**Run all (API + student + admin)** does the same thing as `pnpm run dev`,
or run **Run API only** / **Run student app only** / **Run admin app only**
individually if you only need one process. "Install dependencies (pnpm)"
and "Push DB schema" are there too, so first-time setup doesn't need the
terminal at all if you'd rather not use it.

**Your first admin login is seeded automatically.** On first boot, if no
admin account exists yet, the server creates one:

```
Email:    umais0khan@gmail.com
Password: Umaiskhan000
```

**Change both immediately after your first login** — from
Admin → Platform settings → Your account, you can update the email
(requires your current password to confirm) and change the password. No
manual SQL, no invite-code dance required to get started.

If you'd rather the seeded account never use this repo's hardcoded
defaults at all (recommended for a public deploy), set
`DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` as real environment
variables (in Railway/Render's dashboard, or your local `.env`) before the
first boot — the seed step uses those instead when present. This only
matters on the very first boot; once any admin account exists, seeding is
skipped permanently, so setting these later does nothing (change
credentials from Platform settings instead).

Once you're in, add at least one institution (Admin → Colleges & courses)
and one membership plan (Admin → Membership plans) before students can
register — the signup form has nothing to select from otherwise. Creating
*additional* admin accounts still goes through `/admin-signup/1`, gated by
the `ADMIN_SIGNUP_CODE` you can set from Platform settings.

**Windows:** the build/dev scripts use POSIX shell syntax (inherited from
this project's Replit origins). Use WSL or Git Bash rather than PowerShell/cmd.

## 2. One-platform deploys (frontend + backend + database together)

### Render (recommended — has a ready-made blueprint)

`render.yaml` at the repo root defines a Postgres database, the backend
(Docker), and the frontend (static site) as one blueprint.

1. Push this repo to GitHub/GitLab.
2. In Render: **New → Blueprint**, point it at your repo. It reads
   `render.yaml` and provisions all three services.
3. After the backend's first deploy, copy its public URL into the
   `medschoolproffs-web` service's `VITE_API_BASE_URL` env var, then
   redeploy the frontend (env vars are baked in at build time for a Vite app).
4. `JWT_SECRET` and `DATABASE_URL` are wired automatically by the blueprint.
   If you use Supabase/Neon instead of the Railway Postgres plugin, the
   connection string points at a different network, so a plain
   `?sslmode=disable` DATABASE_URL will fail there — leave `sslmode` off
   (or set it to `require`) and the app enables SSL automatically.
   Set the SMTP/Supabase/Cloudinary vars from `.env.example` for real email
   and persistent file storage — required, not optional: there's no local-
   disk fallback (Render wipes local disk on every redeploy, which is why an
   upload could previously appear to succeed and vanish later).

### Railway

`railway.json` configures the backend build (Dockerfile) and start command.

1. Create a new Railway project, add a **Postgres** plugin (gives you
   `DATABASE_URL` automatically).
2. Add a service from your repo — Railway will detect `railway.json` and
   build via the root `Dockerfile`.
3. Set env vars: `JWT_SECRET`, `APP_URL` (your frontend's URL),
   `COOKIE_CROSS_SITE=true` if the frontend lives elsewhere.
4. For the frontend, either add a second Railway service (static site /
   Nixpacks, build command `pnpm install && pnpm run build:web`, publish
   `artifacts/medschoolproffs/dist/public`), or deploy it to Vercel/Netlify
   per section 3 below and point `VITE_API_BASE_URL` at this Railway
   service's public URL.

## 3. Split deploys (frontend on Vercel/Netlify, backend elsewhere)

Deploy the backend first (Railway or Render, per section 2 — just the
`medschoolproffs-api` / Railway service, skip the frontend part), note its
public URL, then:

### Vercel (frontend only)

`vercel.json` at the repo root sets the build command and output directory.
In the Vercel project settings, set:

- **Root Directory:** repo root (leave default — the workspace needs to
  install from the root so `workspace:*` dependencies resolve)
- **Environment variable:** `VITE_API_BASE_URL` = your backend's URL (e.g.
  `https://your-api.up.railway.app`, no trailing `/api`)

### Netlify (frontend only)

`netlify.toml` at the repo root has the build command, publish directory,
and SPA redirect already set up, and it's shared by **both** frontends —
create two Netlify sites pointing at this repo, and on each one set the
`FRONTEND` environment variable to `student` or `admin`
(**Site settings → Environment variables**), plus `VITE_API_BASE_URL` (and
`VITE_ADMIN_URL` / `VITE_STUDENT_URL`) per site. See `DEPLOY-SPLIT.md` for
the full walkthrough.

### Backend CORS/cookie config for split deploys

Since the frontend and backend are on different domains in this setup, set
on the **backend**:

```
APP_URL=https://your-frontend.vercel.app
COOKIE_CROSS_SITE=true
```

`COOKIE_CROSS_SITE=true` switches the session cookie to
`SameSite=None; Secure`, which is required for the browser to send it on
cross-site requests. Without this, login will appear to succeed but the
session won't persist.

## Environment variables reference

See `.env.example` for the full list with comments. The essentials:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Long random string |
| `APP_URL` | Recommended | Frontend origin(s), comma-separated; used for CORS |
| `PORT` | No | Defaults to 3001 locally; most platforms inject this |
| `VITE_API_BASE_URL` | Split deploys only | Set on the frontend build |
| `COOKIE_CROSS_SITE` | Split deploys only | Set on the backend |
| `SMTP_*` | No | Without it, emails log to the console instead of sending |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | No local-disk fallback exists — uploads throw an error without this |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | **Yes** | Used for large files (books/resources, or anything over ~5MB) |

## What I could and couldn't verify

I don't have network access in this environment, so none of this was
actually run — no `pnpm install`, no real deploy, no live Postgres. The
configuration is correct to the best of my knowledge (standard patterns for
each platform), but please do a real test deploy before relying on it, and
watch for:

- The `Dockerfile`'s runtime stage reinstalling only `nodemailer` (the one
  package esbuild's bundler externalizes that this project actually uses —
  see `artifacts/api-server/build.mjs`'s `external` list if you add a
  dependency that needs the same treatment).
- `pnpm run db:push` reads `.env` from `lib/db/`'s working directory when
  run through the filtered script — if it can't find `DATABASE_URL`, copy
  your root `.env` there too, or export `DATABASE_URL` in your shell first.

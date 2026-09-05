# Deploying the student/admin split

The app is now three deployable packages:

- `artifacts/frontend-student` — student-facing app
- `artifacts/frontend-admin` — admin dashboard (deploy on a separate, harder-
  to-guess subdomain, e.g. `admin.yourdomain.com`, not linked from the
  student site)
- `artifacts/api-server` — the one shared backend for both

## Every platform, three things to get right

1. **CORS**: set `APP_URL` on the backend to a comma-separated list of both
   frontend origins.
2. **Cookies**: set `COOKIE_CROSS_SITE=true` on the backend whenever a
   frontend is on a different origin than the API (true for basically every
   real deployment of this split). Skipping this is the #1 cause of
   "Please sign in to continue" right after a successful login.
3. **Env vars per frontend**: each frontend needs `VITE_API_BASE_URL`
   pointing at the backend. `frontend-student` also takes `VITE_ADMIN_URL`,
   `frontend-admin` also takes `VITE_STUDENT_URL` (used only to redirect a
   user who lands on the wrong app).

## Render

`render.yaml` already defines all three services — `medschoolproffs-api`,
`medschoolproffs-student`, `medschoolproffs-admin`. Deploy, then fill in the
`sync: false` env vars once you know each service's URL.

## Vercel

Create **two** Vercel projects pointing at this repo:
- one using `vercel.json` (student, the default)
- one using `vercel.admin.json` — set it via that project's Settings, or
  deploy with `vercel --local-config vercel.admin.json`

## Netlify

Create **two** Netlify sites pointing at this repo:
- one using `netlify.toml` (student, the default)
- one using `netlify.admin.toml` — set it via that site's
  Build & deploy > "Netlify configuration file" setting

## Root scripts

- `pnpm run dev` — runs the API + both frontends together for local dev
- `pnpm run build:student` / `pnpm run build:admin` / `pnpm run build:api`

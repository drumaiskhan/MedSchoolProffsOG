// APP_URL is documented (see .env.example) as "comma-separated if more than
// one" and is consumed that way for CORS in app.ts
// (`process.env.APP_URL?.split(",")`). auth.ts used to read the exact same
// `APP_URL` env var and drop it straight into email links as a single
// origin — `${APP_URL}/reset-password?token=...`. On any deploy where
// APP_URL was (correctly, per its own docs) set to more than one origin,
// that produced a broken link containing every origin glued together with
// commas, e.g.:
//
//   https://medschoolproffs.netlify.app,https://medschoolproffss.netlify.app/reset-password?token=...
//
// which the browser tries to resolve as one hostname and fails with
// DNS_PROBE_FINISHED_NXDOMAIN. This is exactly what shipped in the
// "Reset your MedschoolProffs password" email.
//
// Fix: emails need exactly one canonical URL, not a CORS allow-list. Prefer
// an explicit PUBLIC_APP_URL when set (recommended for any deploy with more
// than one allowed origin); otherwise fall back to the first entry of
// APP_URL so single-origin deploys keep working with zero config changes.
export function getPublicAppUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const firstFromAppUrl = process.env.APP_URL?.split(",")[0]?.trim();
  if (firstFromAppUrl) return firstFromAppUrl.replace(/\/+$/, "");

  return "http://localhost:5173";
}

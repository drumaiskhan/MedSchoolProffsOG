import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Supabase (and most other hosted Postgres providers reached over the public
// internet, e.g. Railway's app connecting out to a Supabase project) require
// SSL on every connection. node-postgres does NOT negotiate this on its own —
// without an explicit `ssl` option here, every connection attempt is rejected
// before it reaches Postgres. That failure is easy to miss: index.ts's own
// callers (ensureSchema, seedAdmin, etc.) already catch and log their errors
// and the HTTP server still starts, so the app looks "up" while every DB read
// and write quietly fails (e.g. saved data never loads, "Could not create
// plan" on every admin action).
//
// This is intentionally a plain substring check, NOT `new URL(databaseUrl)`.
// A generated DB password very often contains characters like `#`, `?`, or
// `@` that are valid in a Postgres connection string's password segment but
// are NOT the same character once `URL` parses it as a generic URI — `#`
// starts a fragment, `?` starts a query string, etc. `new URL()` on a
// password containing one of those either throws "Invalid URL" outright, or
// silently truncates the password at that character without any error at
// all. Either way this file is imported at process startup, so that failure
// crashes the entire API server before it can even start listening — every
// request then fails at the network level (looks like "the backend is
// unreachable" from the frontend), which is a much worse failure mode than
// the SSL problem this was meant to fix. A substring check needs no
// well-formed URL and can't be broken by what's inside the password.
//
// `sslmode=disable` in the URL (typical for a local/Docker Postgres with no
// TLS listener) opts out; anything else defaults to SSL on, since that's
// what every one of this app's supported hosted-DB providers needs.
// `rejectUnauthorized: false` is required because these providers use
// certificates not in Node's default trust store — this matches Supabase's
// and Railway's own connection-snippet guidance, not a relaxation we're
// choosing casually.
const sslDisabled = databaseUrl.includes("sslmode=disable");
const ssl = sslDisabled ? undefined : { rejectUnauthorized: false };

export const pool = new Pool({ connectionString: databaseUrl, ssl });

// Without this listener, an error on an idle pooled connection (e.g. the
// remote end dropping it) is an unhandled 'error' event, which crashes the
// whole Node process by default. Log it instead so a transient network blip
// against Supabase doesn't take the API server down.
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] Unexpected error on idle client", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export { ensureSchema } from "./ensureSchema";

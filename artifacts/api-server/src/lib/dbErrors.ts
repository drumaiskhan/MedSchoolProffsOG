/**
 * Drizzle ORM (0.36+) wraps every driver error in a `DrizzleQueryError`
 * whose `.message` is literally "Failed query: <sql>\nparams: <params>" —
 * the real Postgres error (e.g. "column ... does not exist", "duplicate
 * key value violates unique constraint ...") is on `.cause`, not `.message`.
 *
 * Every route that did `err instanceof Error ? err.message : ...` before
 * this file existed was therefore showing admins a raw SQL statement plus
 * the full list of bound parameters (i.e. every answer choice/question
 * text in the failed insert) instead of the one sentence that actually
 * explains what went wrong — see the "Import failed" / "Could not save
 * these questions" toast dumping a wall of query text for the real bug
 * this fixes.
 *
 * Walks the `.cause` chain (in case something wraps a wrapper) and falls
 * back to the outer message only if no better one is found, so this is
 * always at least as good as the old behavior.
 */
export function dbErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (!(err instanceof Error)) return fallback;

  let current: unknown = err;
  let best: string | null = null;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    // Skip messages that are clearly the "Failed query: ... params: ..."
    // dump — real Postgres errors don't start this way.
    if (!/^Failed quer(y|ies):/i.test(current.message)) {
      best = current.message;
      break;
    }
    current = (current as { cause?: unknown }).cause;
  }

  const message = (best ?? err.message).trim();
  if (!message) return fallback;
  // Still cap length as a last resort (e.g. a driver that inlines a huge
  // constraint definition into its error text) so one bad row can't blow
  // up a toast.
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

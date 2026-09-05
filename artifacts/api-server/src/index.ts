// Loads .env for local dev and platforms that don't inject env vars
// automatically. Must be the first import — everything else reads
// process.env at module-evaluation time. Safe to keep in production: on
// Replit/Railway/Render, env vars are already set and there's no .env file
// to load, so this is a no-op there.
import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaultAdmin } from "./lib/seedAdmin";
import { normalizeLegacyRoles } from "./lib/normalizeLegacyRoles";

// Most hosts (Railway, Render, Fly, Replit) inject PORT automatically. For
// local dev without a .env, default to 3001 instead of hard-failing.
const port = Number(process.env["PORT"]) || 3001;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

async function main(): Promise<void> {
  try {
    await normalizeLegacyRoles();
  } catch (err) {
    logger.error({ err }, "[migrate] Failed to normalize legacy 'superadmin' roles to 'admin' — those accounts may still be blocked from the admin UI until this succeeds.");
  }

  try {
    await seedDefaultAdmin();
  } catch (err) {
    logger.error({ err }, "[seed] Failed to seed default admin — the app will still start, but you may need to create an admin manually via /admin-signup/1.");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

main();

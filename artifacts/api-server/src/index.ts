import { fileURLToPath } from "node:url";
import { runMigrations } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// The production image sets RUN_MIGRATIONS=true so the database schema is
// created and updated from inside AWS on every start. Locally, use
// `pnpm --filter @workspace/db run push` instead.
if (process.env["RUN_MIGRATIONS"] === "true") {
  const migrationsFolder =
    process.env["MIGRATIONS_DIR"] ??
    fileURLToPath(new URL("../../../lib/db/drizzle/", import.meta.url));
  await runMigrations(migrationsFolder);
  logger.info({ migrationsFolder }, "Database migrations applied");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

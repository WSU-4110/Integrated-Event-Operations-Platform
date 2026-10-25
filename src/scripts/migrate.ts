// Applies pending migrations from ./drizzle to the `discord_bot` schema.
// `npm run db:migrate`. Never run against builderwars-db without an
// organizer's go-ahead.
import dotenv from 'dotenv';
import { ConfigError, loadConfig } from '../config/env.js';
import { createDatabase, createPool, waitForDatabase } from '../database/client.js';
import { runMigrations } from '../database/migrate.js';
import { createLogger } from '../utils/logger.js';

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });

  const target = new URL(config.database.url);
  logger.info(
    { host: target.hostname, database: target.pathname.slice(1), user: target.username },
    'Running migrations',
  );

  const pool = createPool(config.database, logger);
  try {
    await waitForDatabase(pool, logger, { attempts: 3 });
    const applied = await runMigrations(createDatabase(pool));
    logger.info(
      { applied },
      applied.length ? `Applied ${applied.length} migration(s)` : 'Already up to date',
    );
  } finally {
    await pool.end();
    logger.flush();
  }
}

main().catch((err: unknown) => {
  const message =
    err instanceof ConfigError
      ? err.message
      : `Migration failed: ${err instanceof Error ? err.message : String(err)}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

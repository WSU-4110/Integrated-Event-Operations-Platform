import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Config } from '../config/env.js';
import type { Logger } from '../utils/logger.js';
import type { Database } from './types.js';

/**
 * Connection pool for builderwars-db. The `discord_bot_app` role allows 10
 * connections; the bot uses at most 5 so migrations and scripts still fit.
 */
export function createPool(config: Config['database'], logger: Logger): pg.Pool {
  const ssl =
    config.ssl.mode === 'verify-full'
      ? { ca: readFileSync(config.ssl.caPath, 'utf8'), rejectUnauthorized: true }
      : false;

  const pool = new pg.Pool({
    connectionString: config.url,
    ssl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'builderwars-bot',
  });
  pool.on('error', (err) => logger.error({ err }, 'Idle database connection failed'));
  return pool;
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle(pool);
}

/** Waits for the database at startup, retrying with exponential backoff. */
export async function waitForDatabase(
  pool: pg.Pool,
  logger: Logger,
  { attempts = 6, baseDelayMs = 1000 } = {},
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      logger.info('Database connected');
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      const retryInMs = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(
        { attempt, retryInMs, reason: (err as Error).message },
        'Database not reachable yet',
      );
      await sleep(retryInMs);
    }
  }
}

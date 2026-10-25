import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { rowsOf, type Database } from './types.js';

// Applies the SQL migrations drizzle-kit generates in ./drizzle.
//
// Why not drizzle-kit's own migrator: it always runs
// `CREATE SCHEMA IF NOT EXISTS "<schema>"` first, and Postgres checks the
// database-level CREATE privilege before checking whether the schema exists.
// The bot role deliberately lacks that privilege, so the built-in migrator
// fails. This one uses the same journal and history table format but only
// touches objects inside `discord_bot`.

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle/', import.meta.url));
const HISTORY_TABLE = sql.raw('"discord_bot"."__drizzle_migrations"');
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

interface Journal {
  entries: { idx: number; tag: string; when: number }[];
}

interface Migration {
  tag: string;
  when: number;
  hash: string;
  statements: string[];
}

async function readMigrations(dir: string): Promise<Migration[]> {
  const journal = JSON.parse(await readFile(join(dir, 'meta', '_journal.json'), 'utf8')) as Journal;
  return Promise.all(
    [...journal.entries]
      .sort((a, b) => a.idx - b.idx)
      .map(async (entry) => {
        const text = await readFile(join(dir, `${entry.tag}.sql`), 'utf8');
        return {
          tag: entry.tag,
          when: entry.when,
          hash: createHash('sha256').update(text).digest('hex'),
          statements: text
            .split(STATEMENT_BREAKPOINT)
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }),
  );
}

/** Applies pending migrations in one transaction. Returns the tags applied. */
export async function runMigrations(
  db: Database,
  { dir = MIGRATIONS_DIR }: { dir?: string } = {},
): Promise<string[]> {
  const migrations = await readMigrations(dir);

  return db.transaction(async (tx) => {
    // Serializes concurrent runs (two deploys at once).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('discord_bot.migrations'))`);
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const applied = new Set(
      rowsOf<{ created_at: string | number }>(
        await tx.execute(sql`SELECT created_at FROM ${HISTORY_TABLE}`),
      ).map((row) => Number(row.created_at)),
    );

    const pending = migrations.filter((m) => !applied.has(m.when));
    for (const migration of pending) {
      for (const statement of migration.statements) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(
        sql`INSERT INTO ${HISTORY_TABLE} (hash, created_at) VALUES (${migration.hash}, ${migration.when})`,
      );
    }
    return pending.map((m) => m.tag);
  });
}

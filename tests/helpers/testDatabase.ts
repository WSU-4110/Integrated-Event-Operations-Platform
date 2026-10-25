import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { runMigrations } from '../../src/database/migrate.js';
import { createRepositories } from '../../src/database/repositories/index.js';
import type { Database } from '../../src/database/types.js';

export const EVENT_ID = 'builderwars-2026';

const initSql = (file: string) =>
  readFile(new URL(`../../docker/initdb/${file}`, import.meta.url), 'utf8');

export interface RegistrationInput {
  name?: string;
  email: string;
  discordUsername?: string | null;
  status?: string;
  eventId?: string;
}

/**
 * An in-process Postgres (PGlite, same major version as builderwars-db)
 * set up like production: the website's registrations table, the
 * discord_bot schema, and the discord_bot_app role with production grants.
 * Migrations and all bot queries run AS discord_bot_app, so a query that
 * would be denied in production fails here too.
 */
export async function createTestDatabase() {
  const pg = new PGlite();
  await pg.exec(await initSql('01-website-tables.sql'));
  await pg.exec(await initSql('02-discord-bot-role.sql'));
  await pg.exec('SET ROLE discord_bot_app');

  const db = drizzle(pg) as unknown as Database;
  await runMigrations(db);

  /** Runs website-side SQL as the admin (the bot role can't write registrations). */
  async function asAdmin<T>(fn: () => Promise<T>): Promise<T> {
    await pg.exec('RESET ROLE');
    try {
      return await fn();
    } finally {
      await pg.exec('SET ROLE discord_bot_app');
    }
  }

  return {
    pg,
    db,
    repos: createRepositories(db, EVENT_ID),

    async addRegistration(input: RegistrationInput): Promise<number> {
      return asAdmin(async () => {
        const result = await pg.query<{ id: number }>(
          `INSERT INTO public.registrations
             (event_id, name, email, school, class_standing, experience_level, discord_username, status)
           VALUES ($1, $2, $3, 'Wayne State', 'junior', 'beginner', $4, $5)
           RETURNING id`,
          [
            input.eventId ?? EVENT_ID,
            input.name ?? 'Test Person',
            input.email,
            input.discordUsername ?? null,
            input.status ?? 'approved',
          ],
        );
        return result.rows[0]!.id;
      });
    },

    async setStatus(id: number, status: string): Promise<void> {
      await asAdmin(() =>
        pg.query('UPDATE public.registrations SET status = $1 WHERE id = $2', [status, id]),
      );
    },

    async deleteRegistration(id: number): Promise<void> {
      await asAdmin(() => pg.query('DELETE FROM public.registrations WHERE id = $1', [id]));
    },

    close: () => pg.close(),
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

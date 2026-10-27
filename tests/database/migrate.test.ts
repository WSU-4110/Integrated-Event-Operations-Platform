import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/database/migrate.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

let t: TestDatabase;
beforeEach(async () => {
  t = await createTestDatabase(); // already ran migrations as discord_bot_app
});
afterEach(async () => {
  await t.close();
});

describe('migrations', () => {
  it('apply as the restricted bot role without creating a schema', async () => {
    const tables = await t.pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'discord_bot' ORDER BY 1`,
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      '__drizzle_migrations',
      'announcements',
      'events',
      'participant_links',
      'verification_attempts',
      'workshop_registrations',
      'workshops',
    ]);
  });

  it('record history and are idempotent', async () => {
    expect(await runMigrations(t.db)).toEqual([]);
    const history = await t.pg.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM discord_bot.__drizzle_migrations',
    );
    expect(history.rows[0]?.n).toBe(3);
  });

  it('only create objects owned by the bot role inside discord_bot', async () => {
    const owners = await t.pg.query<{ owner: string }>(
      `SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'discord_bot'`,
    );
    expect(owners.rows.map((r) => r.owner)).toEqual(['discord_bot_app']);
  });
});

describe('bot role permissions (mirrors production grants)', () => {
  it('can read registrations', async () => {
    await t.addRegistration({ email: 'a@example.edu' });
    const rows = await t.pg.query('SELECT id FROM public.registrations');
    expect(rows.rows).toHaveLength(1);
  });

  it.each([
    [
      'insert',
      `INSERT INTO public.registrations (name, email, school, class_standing, experience_level) VALUES ('x','x@x.edu','x','x','x')`,
    ],
    ['update', `UPDATE public.registrations SET status = 'approved'`],
    ['delete', 'DELETE FROM public.registrations'],
    ['alter', 'ALTER TABLE public.registrations ADD COLUMN hacked int'],
    ['create in public', 'CREATE TABLE public.nope (id int)'],
    ['create schema', 'CREATE SCHEMA nope'],
  ])('cannot %s', async (_label, statement) => {
    await expect(t.pg.exec(statement)).rejects.toThrow(/permission denied|must be owner/);
  });
});

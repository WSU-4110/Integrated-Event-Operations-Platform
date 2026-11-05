import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/database/migrate.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const initSql = (file: string) =>
  readFile(new URL(`../../docker/initdb/${file}`, import.meta.url), 'utf8');

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
      'lft_profiles',
      'participant_links',
      'team_join_requests',
      'team_members',
      'teams',
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
    expect(history.rows[0]?.n).toBe(5);
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

describe('the website dashboard', () => {
  it('can read participant_links, and nothing else of ours, where its role exists', async () => {
    const pg = new PGlite();
    await pg.exec(await initSql('01-website-tables.sql'));
    await pg.exec(await initSql('02-discord-bot-role.sql'));
    await pg.exec('CREATE ROLE builderwars');
    await pg.exec('SET ROLE discord_bot_app');
    await runMigrations(drizzle(pg));

    const can = async (table: string, privilege: string) =>
      (
        await pg.query<{ ok: boolean }>(
          `SELECT has_table_privilege('builderwars', 'discord_bot.${table}', '${privilege}') AS ok`,
        )
      ).rows[0]?.ok;
    expect(await can('participant_links', 'SELECT')).toBe(true);
    expect(await can('participant_links', 'UPDATE')).toBe(false);
    expect(await can('teams', 'SELECT')).toBe(false);
    expect(await can('announcements', 'SELECT')).toBe(false);
    await pg.close();
  });

  it('migrates fine where its role does not exist (local and tests)', async () => {
    const roles = await t.pg.query(`SELECT 1 FROM pg_roles WHERE rolname = 'builderwars'`);
    expect(roles.rows).toEqual([]);
    expect(await runMigrations(t.db)).toEqual([]);
  });

  it('has the columns the website reads', async () => {
    const columns = await t.pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'discord_bot' AND table_name = 'participant_links'`,
    );
    expect(columns.rows.map((c) => c.column_name)).toEqual(
      expect.arrayContaining([
        'id',
        'discord_user_id',
        'registration_id',
        'linked_at',
        'active',
        'checked_in',
        'checked_in_at',
      ]),
    );
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

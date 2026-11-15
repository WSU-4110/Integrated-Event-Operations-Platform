import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';
let t: TestDatabase;
beforeAll(async () => { t = await createTestDatabase(); });
afterAll(async () => { await t.close(); });
it('executes the database clock query and checks an empty failure window', async () => {
  expect(await t.repos.attempts.isLockedOut('800000000000000001', 900000)).toBe(false);
});
it('uses database timestamps to enforce five recent failures', async () => {
  const discordUserId='800000000000000002';
  for(let i=0;i<5;i++)await t.repos.attempts.record({discordUserId,discordUsername:'clock.test',result:'NO_MATCH'});
  expect(await t.repos.attempts.isLockedOut(discordUserId,900000)).toBe(true);
});
it('finds five fresh failures even when an older failure precedes them', async () => {
  const id='800000000000000003';
  await t.pg.query(`insert into discord_bot.verification_attempts(discord_user_id,discord_username,result,created_at)
    values($1,'clock.test','NO_MATCH',now()-interval '20 minutes')`,[id]);
  for(let i=0;i<5;i++)await t.repos.attempts.record({discordUserId:id,discordUsername:'clock.test',result:'NO_MATCH'});
  expect(await t.repos.attempts.isLockedOut(id,900000)).toBe(true);
});
it('does not extend an expired lockout when fewer than five new failures occurred', async () => {
  const id='800000000000000004';
  await t.pg.query(`insert into discord_bot.verification_attempts(discord_user_id,discord_username,result,created_at)
    select $1,'clock.test','NO_MATCH',now()-interval '25 minutes' from generate_series(1,5)`,[id]);
  for(let i=0;i<4;i++)await t.repos.attempts.record({discordUserId:id,discordUsername:'clock.test',result:'NO_MATCH'});
  expect(await t.repos.attempts.isLockedOut(id,900000)).toBe(false);
});

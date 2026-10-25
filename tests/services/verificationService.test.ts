import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMIT, createVerificationService } from '../../src/services/verificationService.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const ADA = { discordUserId: '500000000000000001', discordUsername: 'ada_example' };
const MALLORY = { discordUserId: '500000000000000666', discordUsername: 'mallory' };
const ORGANIZER = '500000000000000999';

let t: TestDatabase;
let service: ReturnType<typeof createVerificationService>;

beforeEach(async () => {
  t = await createTestDatabase();
  service = createVerificationService(t.repos);
});
afterEach(async () => {
  await t.close();
});

async function attemptResults(discordUserId: string): Promise<string[]> {
  const rows = await t.pg.query<{ result: string }>(
    'SELECT result FROM discord_bot.verification_attempts WHERE discord_user_id = $1 ORDER BY id',
    [discordUserId],
  );
  return rows.rows.map((r) => r.result);
}

describe('verify (username + email)', () => {
  it('links when the username and email match a pending or approved registration', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'Ada_Example' });

    const outcome = await service.verify({ ...ADA, email: '  ADA@Wayne.edu ' });

    expect(outcome.kind).toBe('verified');
    const link = await service.getLink(ADA.discordUserId);
    expect(link).toMatchObject({ registrationId: id, active: true, linkedBy: null });
    expect(await attemptResults(ADA.discordUserId)).toEqual(['MATCHED']);
  });

  it('accepts pending registrations', async () => {
    await t.addRegistration({
      email: 'ada@wayne.edu',
      discordUsername: 'ada_example',
      status: 'pending',
    });
    expect((await service.verify({ ...ADA, email: 'ada@wayne.edu' })).kind).toBe('verified');
  });

  it('normalizes the stored username (@, #0, case, spaces)', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: ' @Ada_Example#0 ' });
    expect((await service.verify({ ...ADA, email: 'ada@wayne.edu' })).kind).toBe('verified');
  });

  it('IMPERSONATION: the right username with the wrong email does not link', async () => {
    // Mallory renamed herself to ada_example before Ada joined the server.
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });

    const outcome = await service.verify({
      discordUserId: MALLORY.discordUserId,
      discordUsername: 'ada_example',
      email: 'mallory@evil.edu',
    });

    expect(outcome.kind).toBe('no_match');
    expect(await service.getLink(MALLORY.discordUserId)).toBeNull();
  });

  it('the right email with a different Discord username does not link', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    const outcome = await service.verify({ ...MALLORY, email: 'ada@wayne.edu' });
    expect(outcome.kind).toBe('no_match');
    expect(await service.getLink(MALLORY.discordUserId)).toBeNull();
  });

  it('a registration without a Discord username cannot self-verify', async () => {
    await t.addRegistration({ email: 'eve@wayne.edu', discordUsername: null, status: 'pending' });
    const outcome = await service.verify({
      discordUserId: '500000000000000005',
      discordUsername: 'eve',
      email: 'eve@wayne.edu',
    });
    expect(outcome.kind).toBe('no_match');
  });

  it.each(['waitlisted', 'declined'])('refuses %s registrations', async (status) => {
    const id = await t.addRegistration({
      email: 'ada@wayne.edu',
      discordUsername: 'ada_example',
      status,
    });

    const outcome = await service.verify({ ...ADA, email: 'ada@wayne.edu' });

    expect(outcome).toEqual({ kind: 'ineligible', status });
    expect(await service.getLink(ADA.discordUserId)).toBeNull();
    const [attempt] = (
      await t.pg.query<{ result: string; registration_id: number }>(
        'SELECT result, registration_id FROM discord_bot.verification_attempts',
      )
    ).rows;
    expect(attempt).toEqual({ result: 'INELIGIBLE', registration_id: id });
  });

  it('ignores registrations for other events', async () => {
    await t.addRegistration({
      email: 'ada@wayne.edu',
      discordUsername: 'ada_example',
      eventId: 'builderwars-2025',
    });
    expect((await service.verify({ ...ADA, email: 'ada@wayne.edu' })).kind).toBe('no_match');
  });

  it('flags a registration already linked to another Discord account, without linking', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await service.verify({ ...ADA, email: 'ada@wayne.edu' });

    // A second account that also has the username (e.g. after Ada renamed) and knows the email.
    const outcome = await service.verify({
      discordUserId: MALLORY.discordUserId,
      discordUsername: 'ada_example',
      email: 'ada@wayne.edu',
    });

    expect(outcome).toEqual({ kind: 'already_linked', registrationId: id });
    expect(await service.getLink(MALLORY.discordUserId)).toBeNull();
    expect((await service.getLink(ADA.discordUserId))?.registrationId).toBe(id);
    expect(await attemptResults(MALLORY.discordUserId)).toEqual(['ALREADY_LINKED']);
  });

  it('flags multiple matching registrations as ambiguous, without linking', async () => {
    // The unique constraint is case-sensitive, so these can both exist.
    const a = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    const b = await t.addRegistration({ email: 'ADA@wayne.edu', discordUsername: 'ada_example' });

    const outcome = await service.verify({ ...ADA, email: 'ada@wayne.edu' });

    expect(outcome).toEqual({ kind: 'ambiguous', registrationIds: expect.arrayContaining([a, b]) });
    expect(await service.getLink(ADA.discordUserId)).toBeNull();
    expect(await attemptResults(ADA.discordUserId)).toEqual(['AMBIGUOUS']);
  });

  it('reports an existing link instead of re-linking', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await service.verify({ ...ADA, email: 'ada@wayne.edu' });
    expect((await service.verify({ ...ADA, email: 'ada@wayne.edu' })).kind).toBe(
      'already_verified',
    );
  });

  it('never stores the typed email', async () => {
    await service.verify({ ...ADA, email: 'secret-guess@wayne.edu' });
    const dump = JSON.stringify(
      (await t.pg.query('SELECT * FROM discord_bot.verification_attempts')).rows,
    );
    expect(dump).not.toContain('secret-guess');
  });
});

describe('rate limiting', () => {
  it(`blocks after ${RATE_LIMIT.maxFailures} failures in an hour, then recovers`, async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });

    for (let i = 0; i < RATE_LIMIT.maxFailures; i++) {
      expect((await service.verify({ ...ADA, email: `guess${i}@wayne.edu` })).kind).toBe(
        'no_match',
      );
    }
    expect(await service.isRateLimited(ADA.discordUserId)).toBe(true);

    // Even the correct email is refused while limited.
    expect((await service.verify({ ...ADA, email: 'ada@wayne.edu' })).kind).toBe('rate_limited');
    expect(await service.getLink(ADA.discordUserId)).toBeNull();

    // An hour later the window has passed (age the attempts instead of waiting).
    await t.pg.query(
      "UPDATE discord_bot.verification_attempts SET created_at = created_at - interval '61 minutes'",
    );
    expect(await service.isRateLimited(ADA.discordUserId)).toBe(false);
    expect((await service.verify({ ...ADA, email: 'ada@wayne.edu' })).kind).toBe('verified');
  });

  it('is per user', async () => {
    for (let i = 0; i < RATE_LIMIT.maxFailures; i++) {
      await service.verify({ ...MALLORY, email: `guess${i}@wayne.edu` });
    }
    expect(await service.isRateLimited(MALLORY.discordUserId)).toBe(true);
    expect(await service.isRateLimited(ADA.discordUserId)).toBe(false);
  });
});

describe('organizer link / unlink', () => {
  it('links by email, recording the organizer, and clears the queue for that user', async () => {
    const id = await t.addRegistration({
      name: 'Eve Waitlist',
      email: 'eve@wayne.edu',
      discordUsername: null,
      status: 'pending',
    });
    await service.verify({ ...MALLORY, email: 'eve@wayne.edu' }); // a failed self-verify
    expect(await service.listVerificationQueue()).toHaveLength(1);

    const outcome = await service.linkManually({
      discordUserId: MALLORY.discordUserId,
      organizerId: ORGANIZER,
      email: 'EVE@wayne.edu',
    });

    expect(outcome).toMatchObject({
      kind: 'linked',
      registration: { id, name: 'Eve Waitlist', status: 'pending' },
    });
    expect((await service.getLink(MALLORY.discordUserId))?.linkedBy).toBe(ORGANIZER);
    expect(await service.listVerificationQueue()).toEqual([]);
  });

  it('links by registration ID', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu' });
    const outcome = await service.linkManually({
      discordUserId: ADA.discordUserId,
      organizerId: ORGANIZER,
      registrationId: id,
    });
    expect(outcome.kind).toBe('linked');
  });

  it('refuses unknown, ineligible and already-linked registrations', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    const declined = await t.addRegistration({ email: 'dee@wayne.edu', status: 'declined' });
    await service.verify({ ...ADA, email: 'ada@wayne.edu' });

    const link = (registrationId: number, discordUserId = MALLORY.discordUserId) =>
      service.linkManually({ discordUserId, organizerId: ORGANIZER, registrationId });

    expect(await link(99999)).toEqual({ kind: 'registration_not_found' });
    expect(await link(declined)).toEqual({ kind: 'ineligible', status: 'declined' });
    expect(await link(id)).toEqual({
      kind: 'registration_taken',
      discordUserId: ADA.discordUserId,
    });

    const other = await t.addRegistration({ email: 'other@wayne.edu' });
    expect(await link(other, ADA.discordUserId)).toEqual({
      kind: 'user_already_linked',
      registrationId: id,
    });
  });

  it('unlink removes the link so the registration can be linked again', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await service.verify({ ...ADA, email: 'ada@wayne.edu' });

    expect((await service.unlink(ADA.discordUserId))?.registrationId).toBe(id);
    expect(await service.getLink(ADA.discordUserId)).toBeNull();
    expect(await service.unlink(ADA.discordUserId)).toBeNull();
    expect((await service.verify({ ...ADA, email: 'ada@wayne.edu' })).kind).toBe('verified');
  });
});

describe('verification queue', () => {
  it('shows the latest unresolved failure per user, not successes or rate limits', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await service.verify({ ...MALLORY, email: 'one@wayne.edu' });
    await service.verify({ ...MALLORY, email: 'two@wayne.edu' });
    await service.verify({ ...ADA, email: 'wrong@wayne.edu' });
    await service.verify({ ...ADA, email: 'ada@wayne.edu' }); // success resolves Ada's failure

    const queue = await service.listVerificationQueue();
    expect(queue.map((a) => [a.discordUserId, a.result])).toEqual([
      [MALLORY.discordUserId, 'NO_MATCH'],
    ]);
  });
});

describe('hasLikelyRegistration (onboarding DM only)', () => {
  it('matches eligible registrations by normalized username', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'Ada_Example' });
    await t.addRegistration({ email: 'dee@wayne.edu', discordUsername: 'dee', status: 'declined' });

    expect(await service.hasLikelyRegistration('ada_example')).toBe(true);
    expect(await service.hasLikelyRegistration('dee')).toBe(false);
    expect(await service.hasLikelyRegistration('nobody')).toBe(false);
  });
});

describe('syncLinkStatuses', () => {
  it('deactivates links whose registration was waitlisted, declined or deleted', async () => {
    const ids = {
      approved: await t.addRegistration({ email: 'a@wayne.edu', discordUsername: 'user_a' }),
      waitlisted: await t.addRegistration({ email: 'b@wayne.edu', discordUsername: 'user_b' }),
      declined: await t.addRegistration({ email: 'c@wayne.edu', discordUsername: 'user_c' }),
      deleted: await t.addRegistration({ email: 'd@wayne.edu', discordUsername: 'user_d' }),
    };
    let n = 0;
    for (const [key, id] of Object.entries(ids)) {
      const outcome = await service.linkManually({
        discordUserId: `60000000000000000${n++}`,
        organizerId: ORGANIZER,
        registrationId: id,
      });
      expect(outcome.kind, key).toBe('linked');
    }
    await t.setStatus(ids.waitlisted, 'waitlisted');
    await t.setStatus(ids.declined, 'declined');
    await t.deleteRegistration(ids.deleted);

    const result = await service.syncLinkStatuses();

    expect(result.deactivated.map((l) => [l.registrationId, l.status]).sort()).toEqual(
      [
        [ids.waitlisted, 'waitlisted'],
        [ids.declined, 'declined'],
        [ids.deleted, 'deleted'],
      ].sort(),
    );
    expect(result.active.map((l) => l.registrationId)).toEqual([ids.approved]);

    // Persisted, and a second run changes nothing.
    const again = await service.syncLinkStatuses();
    expect(again.deactivated).toEqual([]);
    expect(again.active.map((l) => l.registrationId)).toEqual([ids.approved]);
  });

  it('reactivates a link when the registration is approved again', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await service.verify({ ...ADA, email: 'ada@wayne.edu' });
    await t.setStatus(id, 'waitlisted');
    await service.syncLinkStatuses();
    expect((await service.getLink(ADA.discordUserId))?.active).toBe(false);

    await t.setStatus(id, 'approved');
    const result = await service.syncLinkStatuses();

    expect(result.reactivated.map((l) => l.discordUserId)).toEqual([ADA.discordUserId]);
    expect((await service.getLink(ADA.discordUserId))?.active).toBe(true);
  });
});

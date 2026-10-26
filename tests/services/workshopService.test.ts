import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ParticipantLink } from '../../src/database/schema/index.js';
import type { WorkshopInput } from '../../src/database/repositories/workshopRepository.js';
import { createWorkshopService, type WorkshopService } from '../../src/services/workshopService.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-11-14T15:00:00Z');

let t: TestDatabase;
let clock: Date;
let service: WorkshopService;

beforeEach(async () => {
  t = await createTestDatabase();
  clock = NOW;
  service = createWorkshopService(t.repos, { now: () => clock });
});
afterEach(async () => {
  await t.close();
});

let seq = 0;
/** A verified participant: a website registration plus a Discord link. */
async function participant(name = `Person ${++seq}`): Promise<ParticipantLink> {
  const registrationId = await t.addRegistration({ name, email: `p${++seq}@wayne.edu` });
  const created = await t.repos.links.create({
    discordUserId: String(400000000000000000n + BigInt(registrationId)),
    registrationId,
    linkedBy: null,
  });
  if (!created.ok) throw new Error('link failed');
  return created.link;
}

function input(overrides: Partial<WorkshopInput> = {}): WorkshopInput {
  return {
    name: `Workshop ${++seq}`,
    description: 'Learn things',
    speaker: 'Grace',
    startTime: new Date(NOW.getTime() + 2 * HOUR),
    endTime: new Date(NOW.getTime() + 3 * HOUR),
    location: 'Room 204',
    capacity: 2,
    ...overrides,
  };
}

async function workshop(overrides: Partial<WorkshopInput> = {}) {
  const outcome = await service.create(input(overrides));
  if (outcome.kind !== 'saved') throw new Error(outcome.kind);
  return outcome.workshop;
}

async function counts(id: number) {
  const w = await service.get(id);
  return { registered: w?.registered, waitlisted: w?.waitlisted };
}

describe('creating and editing workshops', () => {
  it('rejects bad times and duplicate names', async () => {
    const w = await workshop({ name: 'AI Fundamentals' });
    expect((await service.create(input({ name: 'AI Fundamentals' }))).kind).toBe('name_taken');
    expect(
      await service.create(input({ endTime: input().startTime, startTime: input().startTime })),
    ).toEqual({ kind: 'invalid', reason: 'It must end after it starts.' });
    expect(await service.update(w.id, { capacity: 0 })).toMatchObject({ kind: 'invalid' });
    expect(await service.update(9999, { capacity: 5 })).toEqual({ kind: 'not_found' });
  });

  it('lists only workshops that have not ended, soonest first', async () => {
    const later = await workshop({
      startTime: new Date(NOW.getTime() + 5 * HOUR),
      endTime: new Date(NOW.getTime() + 6 * HOUR),
    });
    const soon = await workshop();
    await workshop({
      startTime: new Date(NOW.getTime() - 3 * HOUR),
      endTime: new Date(NOW.getTime() - 2 * HOUR),
    });
    expect((await service.listUpcoming()).map((w) => w.id)).toEqual([soon.id, later.id]);
  });
});

describe('registering', () => {
  it('registers, then refuses a duplicate', async () => {
    const w = await workshop();
    const p = await participant();
    expect((await service.register(w.id, p)).kind).toBe('registered');
    expect((await service.register(w.id, p)).kind).toBe('already_registered');
    expect(await counts(w.id)).toEqual({ registered: 1, waitlisted: 0 });
  });

  it('offers the waitlist when full, and only joins it when asked', async () => {
    const w = await workshop({ capacity: 1 });
    await service.register(w.id, await participant());
    const late = await participant();

    expect((await service.register(w.id, late)).kind).toBe('full');
    expect(await counts(w.id)).toEqual({ registered: 1, waitlisted: 0 });

    expect(await service.register(w.id, late, { joinWaitlist: true })).toMatchObject({
      kind: 'waitlisted',
      position: 1,
    });
    expect(await service.register(w.id, late, { joinWaitlist: true })).toMatchObject({
      kind: 'already_waitlisted',
      position: 1,
    });
  });

  it('joins the waitlist directly as registered if a spot is open', async () => {
    const w = await workshop();
    expect((await service.register(w.id, await participant(), { joinWaitlist: true })).kind).toBe(
      'registered',
    );
  });

  it('closes signups once the workshop starts', async () => {
    const w = await workshop();
    const p = await participant();
    await service.register(w.id, p);
    clock = w.startTime;
    expect((await service.register(w.id, await participant())).kind).toBe('started');
    expect((await service.cancel(w.id, p)).kind).toBe('started');
  });

  it('reports a missing workshop', async () => {
    expect(await service.register(9999, await participant())).toEqual({ kind: 'not_found' });
    expect(await service.cancel(9999, await participant())).toEqual({ kind: 'not_found' });
  });
});

describe('capacity under concurrent clicks', () => {
  it('never registers more than the capacity', async () => {
    const w = await workshop({ capacity: 3 });
    const people = await Promise.all(Array.from({ length: 12 }, () => participant()));

    const outcomes = await Promise.all(people.map((p) => service.register(w.id, p)));

    expect(outcomes.filter((o) => o.kind === 'registered')).toHaveLength(3);
    expect(outcomes.filter((o) => o.kind === 'full')).toHaveLength(9);
    expect(await counts(w.id)).toEqual({ registered: 3, waitlisted: 0 });
  });

  it('gives every concurrent waitlister a distinct place', async () => {
    const w = await workshop({ capacity: 2 });
    const people = await Promise.all(Array.from({ length: 8 }, () => participant()));

    const outcomes = await Promise.all(
      people.map((p) => service.register(w.id, p, { joinWaitlist: true })),
    );

    const positions = outcomes.flatMap((o) => (o.kind === 'waitlisted' ? [o.position] : []));
    expect(positions.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await counts(w.id)).toEqual({ registered: 2, waitlisted: 6 });
  });

  it('keeps one row when the same person double-clicks', async () => {
    const w = await workshop({ capacity: 5 });
    const p = await participant();

    const outcomes = await Promise.all([1, 2, 3].map(() => service.register(w.id, p)));

    expect(outcomes.map((o) => o.kind).sort()).toEqual([
      'already_registered',
      'already_registered',
      'registered',
    ]);
    expect(await counts(w.id)).toEqual({ registered: 1, waitlisted: 0 });
  });

  it('has a unique constraint as the last line of defense', async () => {
    const w = await workshop();
    const p = await participant();
    const insert = () =>
      t.pg.query(
        `INSERT INTO discord_bot.workshop_registrations (workshop_id, participant_link_id, status)
         VALUES ($1, $2, 'REGISTERED')`,
        [w.id, p.id],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/workshop_registrations_workshop_link_unique/);
  });
});

describe('cancelling and the waitlist', () => {
  it('promotes the earliest waitlisted person when a registrant cancels', async () => {
    const w = await workshop({ capacity: 1 });
    const first = await participant();
    const [second, third] = [await participant(), await participant()];
    await service.register(w.id, first);
    await service.register(w.id, second, { joinWaitlist: true });
    await service.register(w.id, third, { joinWaitlist: true });

    const outcome = await service.cancel(w.id, first);

    expect(outcome).toMatchObject({
      kind: 'cancelled',
      promoted: [{ workshopId: w.id, discordUserId: second.discordUserId }],
    });
    expect((await service.register(w.id, second)).kind).toBe('already_registered');
    expect(await service.register(w.id, third, { joinWaitlist: true })).toMatchObject({
      kind: 'already_waitlisted',
      position: 1,
    });
    expect(await counts(w.id)).toEqual({ registered: 1, waitlisted: 1 });
  });

  it("doesn't promote anyone when someone leaves the waitlist", async () => {
    const w = await workshop({ capacity: 1 });
    await service.register(w.id, await participant());
    const waiting = await participant();
    await service.register(w.id, waiting, { joinWaitlist: true });

    expect((await service.cancel(w.id, waiting)).kind).toBe('left_waitlist');
    expect(await counts(w.id)).toEqual({ registered: 1, waitlisted: 0 });
  });

  it('sends someone who cancels and comes back to the end of the waitlist', async () => {
    const w = await workshop({ capacity: 1 });
    const holder = await participant();
    const [a, b] = [await participant(), await participant()];
    await service.register(w.id, holder);
    await service.register(w.id, a, { joinWaitlist: true });
    await service.register(w.id, b, { joinWaitlist: true });

    await service.cancel(w.id, a);
    expect(await service.register(w.id, a, { joinWaitlist: true })).toMatchObject({
      kind: 'waitlisted',
      position: 2,
    });
  });

  it('says so when cancelling without a signup', async () => {
    const w = await workshop();
    expect((await service.cancel(w.id, await participant())).kind).toBe('not_registered');
  });

  it('promotes from the waitlist when the capacity goes up', async () => {
    const w = await workshop({ capacity: 1 });
    await service.register(w.id, await participant());
    const waiting = [await participant(), await participant(), await participant()];
    for (const p of waiting) await service.register(w.id, p, { joinWaitlist: true });

    const outcome = await service.update(w.id, { capacity: 3 });

    expect(outcome).toMatchObject({
      kind: 'saved',
      promoted: waiting.slice(0, 2).map((p) => ({ discordUserId: p.discordUserId })),
    });
    expect(await counts(w.id)).toEqual({ registered: 3, waitlisted: 1 });
  });

  it("doesn't remove anyone when the capacity goes down", async () => {
    const w = await workshop({ capacity: 3 });
    for (let i = 0; i < 3; i++) await service.register(w.id, await participant());
    await service.update(w.id, { capacity: 1 });
    expect(await counts(w.id)).toEqual({ registered: 3, waitlisted: 0 });
    expect((await service.register(w.id, await participant())).kind).toBe('full');
  });

  it('refills spots freed by an unlink', async () => {
    const w = await workshop({ capacity: 1 });
    const holder = await participant();
    const waiting = await participant();
    await service.register(w.id, holder);
    await service.register(w.id, waiting, { joinWaitlist: true });

    await t.repos.links.deleteByDiscordUserId(holder.discordUserId); // cascades to signups
    expect(await service.fillAllOpenSpots()).toEqual([
      { workshopId: w.id, discordUserId: waiting.discordUserId },
    ]);
  });
});

describe('roster and removal', () => {
  it('lists registered then waitlisted people with names from the website', async () => {
    const w = await workshop({ capacity: 1 });
    const ada = await participant('Ada Lovelace');
    const alan = await participant('Alan Turing');
    const quitter = await participant('Quitter');
    await service.register(w.id, alan, { joinWaitlist: true });
    await service.register(w.id, ada, { joinWaitlist: true });
    await service.register(w.id, quitter, { joinWaitlist: true });
    await service.cancel(w.id, quitter);

    const roster = await service.roster(w.id);
    expect(roster.map((r) => [r.name, r.status])).toEqual([
      ['Alan Turing', 'REGISTERED'],
      ['Ada Lovelace', 'WAITLISTED'],
    ]);
  });

  it('reports who was signed up when a workshop is removed', async () => {
    const w = await workshop({ capacity: 1 });
    const a = await participant();
    const b = await participant();
    await service.register(w.id, a);
    await service.register(w.id, b, { joinWaitlist: true });

    const removed = await service.remove(w.id);

    expect(removed?.affectedDiscordUserIds).toEqual([a.discordUserId, b.discordUserId]);
    expect(await service.get(w.id)).toBeNull();
    const left = await t.pg.query('SELECT 1 FROM discord_bot.workshop_registrations');
    expect(left.rows).toHaveLength(0);
  });

  it("shows each participant's own statuses", async () => {
    const [w1, w2, w3] = [await workshop({ capacity: 1 }), await workshop(), await workshop()];
    const me = await participant();
    await service.register(w1.id, await participant());
    await service.register(w1.id, me, { joinWaitlist: true });
    await service.register(w2.id, me);
    await service.register(w3.id, me);
    await service.cancel(w3.id, me);

    expect(await service.statusesFor(me)).toEqual(
      new Map([
        [w1.id, 'WAITLISTED'],
        [w2.id, 'REGISTERED'],
      ]),
    );
  });

  it('finds workshops by name for autocomplete, treating % and _ literally', async () => {
    await workshop({ name: 'AI Fundamentals' });
    await workshop({ name: 'Intro to Git' });
    await workshop({ name: '100% Rust' });
    expect((await service.search('ai f')).map((w) => w.name)).toEqual(['AI Fundamentals']);
    expect((await service.search('%')).map((w) => w.name)).toEqual(['100% Rust']);
    expect(await service.search('')).toHaveLength(3);
  });
});

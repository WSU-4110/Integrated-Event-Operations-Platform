import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventInput } from '../../src/database/repositories/eventRepository.js';
import { createScheduleService, type ScheduleService } from '../../src/services/scheduleService.js';
import { createWorkshopService } from '../../src/services/workshopService.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-11-14T15:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

let t: TestDatabase;
let clock: Date;
let schedule: ScheduleService;

beforeEach(async () => {
  t = await createTestDatabase();
  clock = NOW;
  schedule = createScheduleService(t.repos, { now: () => clock });
});
afterEach(async () => {
  await t.close();
});

function input(overrides: Partial<EventInput> = {}): EventInput {
  return {
    name: 'Lunch',
    description: '',
    startTime: at(1),
    endTime: at(2),
    location: 'Main hall',
    type: 'FOOD',
    ...overrides,
  };
}

async function event(overrides: Partial<EventInput> = {}) {
  const outcome = await schedule.create(input(overrides));
  if (outcome.kind !== 'saved') throw new Error(outcome.kind);
  return outcome.event;
}

async function workshop(name: string, startsIn: number) {
  const outcome = await createWorkshopService(t.repos).create({
    name,
    description: '',
    speaker: null,
    startTime: at(startsIn),
    endTime: at(startsIn + 1),
    location: 'Room 204',
    capacity: 10,
  });
  if (outcome.kind !== 'saved') throw new Error(outcome.kind);
  return outcome.workshop;
}

describe('managing events', () => {
  it('rejects blank names and end times before the start', async () => {
    expect(await schedule.create(input({ name: '  ' }))).toMatchObject({ kind: 'invalid' });
    expect(await schedule.create(input({ endTime: at(1) }))).toEqual({
      kind: 'invalid',
      reason: 'It must end after it starts.',
    });
    const e = await event();
    expect(await schedule.update(e.id, { startTime: at(3) })).toMatchObject({ kind: 'invalid' });
    expect(await schedule.update(9999, { name: 'x' })).toEqual({ kind: 'not_found' });
  });

  it('allows moments without an end time, and lets names repeat (two lunches)', async () => {
    await event({ name: 'Submission deadline', type: 'DEADLINE', endTime: null, location: null });
    await event({ name: 'Lunch', startTime: at(24), endTime: at(25) });
    await event({ name: 'Lunch' });
    expect((await schedule.search('lunch')).map((e) => e.startTime)).toEqual([at(1), at(24)]);
  });

  it('edits and removes', async () => {
    const e = await event();
    const outcome = await schedule.update(e.id, { name: 'Dinner', location: null });
    expect(outcome).toMatchObject({ kind: 'saved', event: { name: 'Dinner', location: null } });
    expect((await schedule.remove(e.id))?.id).toBe(e.id);
    expect(await schedule.get(e.id)).toBeNull();
  });
});

describe('the schedule', () => {
  it('merges events and workshops in time order, each exactly once', async () => {
    await event({ name: 'Lunch', startTime: at(2), endTime: at(3) });
    const w = await workshop('AI Fundamentals', 1);
    await event({ name: 'Deadline', type: 'DEADLINE', startTime: at(20), endTime: null });

    const { upcoming, hasEvents } = await schedule.snapshot();
    expect(hasEvents).toBe(true);
    expect(upcoming.map((i) => [i.source, i.name, i.type])).toEqual([
      ['workshop', 'AI Fundamentals', 'WORKSHOP'],
      ['event', 'Lunch', 'FOOD'],
      ['event', 'Deadline', 'DEADLINE'],
    ]);
    expect(upcoming[0]).toMatchObject({ id: w.id, startTime: at(1), endTime: at(2) });
    expect(upcoming[2]?.endTime).toBeNull();
  });

  it('drops what has ended but keeps what is underway', async () => {
    await event({ name: 'Breakfast', startTime: at(-3), endTime: at(-2) });
    await event({ name: 'Opening', startTime: at(-1), endTime: at(1) });
    await event({ name: 'Doors open', type: 'GENERAL', startTime: at(-1), endTime: null });
    await workshop('Old workshop', -5);

    const { upcoming } = await schedule.snapshot();
    expect(upcoming.map((i) => i.name)).toEqual(['Opening']);
  });

  it('says when no events exist yet, even if workshops do', async () => {
    await workshop('AI Fundamentals', 1);
    expect(await schedule.snapshot()).toMatchObject({ hasEvents: false });
  });

  it('/next: the next thing to start, and what is happening now', async () => {
    await event({ name: 'Hacking', type: 'GENERAL', startTime: at(-2), endTime: at(20) });
    await event({ name: 'Lunch', startTime: at(2), endTime: at(3) });
    await workshop('AI Fundamentals', 1);

    const { next, happening } = await schedule.next();
    expect(next).toMatchObject({ source: 'workshop', name: 'AI Fundamentals' });
    expect(happening.map((i) => i.name)).toEqual(['Hacking']);

    clock = at(30);
    expect(await schedule.next()).toEqual({ next: null, happening: [] });
  });
});

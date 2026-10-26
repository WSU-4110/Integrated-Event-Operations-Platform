import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnnouncementInput } from '../../src/database/repositories/announcementRepository.js';
import {
  createAnnouncementService,
  DRAFT_TTL_MS,
  MAX_LATENESS_MS,
  type AnnouncementService,
} from '../../src/services/announcementService.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const MINUTE = 60_000;
const NOW = new Date('2026-11-14T15:00:00Z');
const ORGANIZER = '400000000000000009';

let t: TestDatabase;
let clock: Date;
let service: AnnouncementService;

beforeEach(async () => {
  t = await createTestDatabase();
  clock = NOW;
  service = createAnnouncementService(t.repos, { now: () => clock });
});
afterEach(async () => {
  await t.close();
});

function draft(overrides: Partial<AnnouncementInput> = {}) {
  return service.createDraft({
    title: 'Lunch is here',
    body: 'Pizza in the main hall',
    type: 'FOOD',
    pingParticipants: false,
    scheduledFor: null,
    createdBy: ORGANIZER,
    ...overrides,
  });
}

/** A confirmed announcement scheduled `minutes` from now. */
async function scheduled(minutes: number) {
  const a = await draft({ scheduledFor: new Date(NOW.getTime() + minutes * MINUTE) });
  expect((await service.confirm(a.id)).kind).toBe('scheduled');
  return a;
}

describe('confirming a draft', () => {
  it('claims an immediate announcement for sending exactly once', async () => {
    const a = await draft();
    const first = await service.confirm(a.id);
    expect(first).toMatchObject({ kind: 'send_now', announcement: { status: 'SENDING' } });
    // A second click on Send, after or during the first one:
    expect(await service.confirm(a.id)).toMatchObject({
      kind: 'not_draft',
      announcement: { status: 'SENDING' },
    });
  });

  it('only one of several simultaneous clicks gets the announcement', async () => {
    const a = await draft();
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => service.confirm(a.id)));
    expect(outcomes.filter((o) => o.kind === 'send_now')).toHaveLength(1);
  });

  it('schedules one with a send time', async () => {
    const a = await scheduled(30);
    expect((await service.get(a.id))?.status).toBe('SCHEDULED');
  });

  it('can be edited only while it is a draft', async () => {
    const a = await draft();
    const edited = await service.updateDraft(a.id, {
      title: 'Dinner is here',
      body: 'Tacos',
      type: 'FOOD',
      pingParticipants: true,
      scheduledFor: null,
    });
    expect(edited).toMatchObject({ title: 'Dinner is here', pingParticipants: true });
    await service.confirm(a.id);
    expect(
      await service.updateDraft(a.id, { ...edited!, title: 'Too late', scheduledFor: null }),
    ).toBeNull();
  });

  it('discards drafts but not confirmed announcements', async () => {
    const a = await draft();
    expect(await service.discard(a.id)).toBe(true);
    expect(await service.confirm(a.id)).toMatchObject({ kind: 'not_draft' });
    const b = await scheduled(10);
    expect(await service.discard(b.id)).toBe(false);
  });

  it('reports a missing announcement', async () => {
    expect(await service.confirm(9999)).toEqual({ kind: 'not_found' });
  });
});

describe('scheduled sends', () => {
  it('claims only what is due, and each one only once', async () => {
    const due = await scheduled(5);
    const later = await scheduled(60);

    expect(await service.claimDue()).toEqual([]);
    clock = new Date(NOW.getTime() + 5 * MINUTE);
    expect((await service.claimDue()).map((a) => a.id)).toEqual([due.id]);
    expect(await service.claimDue()).toEqual([]); // the next minute's run

    clock = new Date(NOW.getTime() + 61 * MINUTE);
    const [first, second] = await Promise.all([service.claimDue(), service.claimDue()]);
    expect([...first, ...second].map((a) => a.id)).toEqual([later.id]);
  });

  it('never claims drafts or cancelled announcements', async () => {
    await draft({ scheduledFor: new Date(NOW.getTime() + MINUTE) }); // never confirmed
    const cancelled = await scheduled(1);
    expect(await service.cancel(cancelled.id)).toMatchObject({ status: 'CANCELLED' });
    clock = new Date(NOW.getTime() + 2 * MINUTE);
    expect(await service.claimDue()).toEqual([]);
  });

  it('records the result of a send, once', async () => {
    const a = await scheduled(1);
    clock = new Date(NOW.getTime() + MINUTE);
    await service.claimDue();
    const post = { channelId: '500000000000000001', messageId: '600000000000000001' };
    expect(await service.markSent(a.id, post)).toMatchObject({ status: 'SENT', ...post });
    expect(await service.markFailed(a.id, 'late error')).toBeNull();
    expect((await service.get(a.id))?.sentAt).toEqual(clock);
  });

  it('knows when a claimed announcement is too late to send', async () => {
    const a = await scheduled(1);
    clock = new Date(NOW.getTime() + MINUTE + MAX_LATENESS_MS + MINUTE);
    const [claimed] = await service.claimDue();
    expect(claimed?.id).toBe(a.id);
    expect(service.isTooLate(claimed!)).toBe(true);
  });

  it('cancels scheduled and failed announcements, not sent ones', async () => {
    const a = await scheduled(1);
    clock = new Date(NOW.getTime() + MINUTE);
    await service.claimDue();
    await service.markFailed(a.id, 'no permission');
    expect((await service.listOpen()).map((x) => [x.id, x.status])).toEqual([[a.id, 'FAILED']]);
    expect(await service.cancel(a.id)).toMatchObject({ status: 'CANCELLED' });
    expect(await service.listOpen()).toEqual([]);

    const b = await draft();
    await service.confirm(b.id);
    await service.markSent(b.id, { channelId: '1', messageId: '2' });
    expect(await service.cancel(b.id)).toBeNull();
  });

  it('finds cancellable announcements by title', async () => {
    await scheduled(10);
    await draft({ title: 'A draft' });
    expect((await service.searchCancellable('lunch')).map((a) => a.title)).toEqual([
      'Lunch is here',
    ]);
    expect(await service.searchCancellable('draft')).toEqual([]);
  });

  it('deletes drafts nobody confirmed after a day', async () => {
    const stale = await draft();
    const kept = await scheduled(10);
    clock = new Date(Date.now() + DRAFT_TTL_MS + MINUTE);
    expect(await service.deleteStaleDrafts()).toBe(1);
    expect(await service.get(stale.id)).toBeNull();
    expect(await service.get(kept.id)).not.toBeNull();
  });
});

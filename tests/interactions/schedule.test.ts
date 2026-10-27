import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { componentHandlers } from '../../src/components/index.js';
import { InteractionRouter } from '../../src/interactions/router.js';
import type { BotContext } from '../../src/interactions/types.js';
import { ORGANIZER_ONLY_MESSAGE } from '../../src/middleware/permissions.js';
import { createScheduleService } from '../../src/services/scheduleService.js';
import { createWorkshopService } from '../../src/services/workshopService.js';
import { fakeContext, fakeInteraction, ORGANIZER_ROLE } from '../helpers/fakes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const HOUR = 3_600_000;
// 2026-11-14 10:00 in Detroit (EST, UTC-5).
const NOW = new Date('2026-11-14T15:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

let t: TestDatabase;
let ctx: BotContext;
let router: InteractionRouter;

beforeEach(async () => {
  t = await createTestDatabase();
  ({ ctx } = await fakeContext({
    schedule: createScheduleService(t.repos, { now: () => NOW }),
    workshops: createWorkshopService(t.repos, { now: () => NOW }),
  }));
  router = new InteractionRouter(ctx, commands, componentHandlers);
});
afterEach(async () => {
  await t.close();
});

const lastCall = (fn: unknown): unknown => (fn as Mock).mock.calls.at(-1)?.[0];
const json = (value: unknown) => JSON.stringify(value);
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

async function addEvent(name: string, startsIn: number, hours: number | null = 1) {
  const outcome = await ctx.services.schedule.create({
    name,
    description: `About ${name}`,
    startTime: at(startsIn),
    endTime: hours === null ? null : at(startsIn + hours),
    location: 'Main hall',
    type: 'FOOD',
  });
  if (outcome.kind !== 'saved') throw new Error(outcome.kind);
  return outcome.event;
}

const command = (commandName: string) => fakeInteraction({ kind: 'command', commandName });

function admin(subcommand: string, options: Record<string, unknown>, roles = [ORGANIZER_ROLE]) {
  return fakeInteraction({
    kind: 'command',
    commandName: 'admin',
    subcommandGroup: 'event',
    subcommand,
    options,
    roles,
  });
}

describe('/schedule', () => {
  it('shows the built-in schedule until organizers add an event', async () => {
    const interaction = command('schedule');
    await router.handle(interaction);
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(json(lastCall(interaction.editReply))).toContain(
      ctx.content.help.sections.schedule.title,
    );
  });

  it('then shows events and workshops by day, with Discord timestamps', async () => {
    await addEvent('Lunch', 3);
    await addEvent('Breakfast', 22.5); // Sunday 8:30 in Detroit
    await ctx.services.workshops.create({
      name: 'AI Fundamentals',
      description: '',
      speaker: null,
      startTime: at(1),
      endTime: at(2),
      location: 'Room 204',
      capacity: 10,
    });

    const interaction = command('schedule');
    await router.handle(interaction);
    const text = json(lastCall(interaction.editReply));
    expect(text).toContain('Saturday, November 14');
    expect(text).toContain('Sunday, November 15');
    expect(text).toContain(`<t:${seconds(at(1))}:t>`);
    expect(text.indexOf('AI Fundamentals')).toBeLessThan(text.indexOf('Lunch'));
    expect(text.indexOf('Lunch')).toBeLessThan(text.indexOf('Breakfast'));
  });

  it('is what the Schedule button in /help shows', async () => {
    await addEvent('Lunch', 3);
    const interaction = fakeInteraction({ kind: 'button', customId: 'help:show:schedule' });
    await router.handle(interaction);
    expect(json(lastCall(interaction.reply))).toContain('Lunch');
  });
});

describe('/next', () => {
  it('shows the next event, what is on now, and a schedule button', async () => {
    await addEvent('Hacking', -1, 20);
    await addEvent('Lunch', 3);

    const interaction = command('next');
    await router.handle(interaction);
    const reply = json(lastCall(interaction.editReply));
    expect(reply).toContain('Next: 🍕 Lunch');
    expect(reply).toContain(`<t:${seconds(at(3))}:R>`);
    expect(reply).toContain('Happening now');
    expect(reply).toContain('Hacking');
    expect(reply).toContain('schedule:view');

    const button = fakeInteraction({ kind: 'button', customId: 'schedule:view' });
    await router.handle(button);
    expect(json(lastCall(button.editReply))).toContain('Lunch');
  });

  it('says when nothing else is scheduled', async () => {
    const interaction = command('next');
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('Nothing else is scheduled');
  });
});

describe('/admin event', () => {
  it('is for organizers only', async () => {
    const interaction = admin(
      'add',
      { name: 'Lunch', start: '2026-11-14 13:00', type: 'FOOD' },
      [],
    );
    await router.handle(interaction);
    expect(json(lastCall(interaction.reply))).toContain(ORGANIZER_ONLY_MESSAGE);
    expect(await ctx.services.schedule.search('', 25)).toEqual([]);
  });

  it('adds an event, reading the time in the event time zone', async () => {
    const interaction = admin('add', {
      name: 'Lunch',
      start: '2026-11-14 13:00',
      type: 'FOOD',
      duration: 60,
      location: 'Main hall',
    });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('✅ Added 🍕 **Lunch**');
    const [event] = await ctx.services.schedule.search('lunch', 25);
    expect(event).toMatchObject({
      startTime: new Date('2026-11-14T18:00:00Z'),
      endTime: new Date('2026-11-14T19:00:00Z'),
      location: 'Main hall',
    });
  });

  it('adds a moment without an end time, and rejects unreadable times', async () => {
    await router.handle(
      admin('add', { name: 'Submissions due', start: '2026-11-15 12:00', type: 'DEADLINE' }),
    );
    expect((await ctx.services.schedule.search('due', 25))[0]?.endTime).toBeNull();

    const bad = admin('add', { name: 'Lunch', start: 'noon', type: 'FOOD' });
    await router.handle(bad);
    expect(json(lastCall(bad.editReply))).toContain("couldn't read `noon`");
  });

  it('points workshop organizers to /admin workshop for signups', async () => {
    const interaction = admin('add', {
      name: 'Git 101',
      start: '2026-11-14 14:00',
      type: 'WORKSHOP',
    });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('/admin workshop add');
  });

  it('edits only what is given, keeps the length when moved, and clears with -', async () => {
    const event = await addEvent('Lunch', 3, 1.5);
    const interaction = admin('edit', {
      event: event.id,
      start: '2026-11-14 14:00',
      location: '-',
    });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('✅ Updated');
    expect(await ctx.services.schedule.get(event.id)).toMatchObject({
      name: 'Lunch',
      startTime: new Date('2026-11-14T19:00:00Z'),
      endTime: new Date('2026-11-14T20:30:00Z'),
      location: null,
    });

    await router.handle(admin('edit', { event: event.id, duration: 0 }));
    expect((await ctx.services.schedule.get(event.id))?.endTime).toBeNull();
  });

  it('removes an event', async () => {
    const event = await addEvent('Lunch', 3);
    const interaction = admin('remove', { event: event.id });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('🗑️ Removed');
    expect(await ctx.services.schedule.get(event.id)).toBeNull();
  });

  it('suggests events by name, to organizers only', async () => {
    const event = await addEvent('Lunch', 3);
    const suggest = (roles: string[]) =>
      fakeInteraction({
        kind: 'autocomplete',
        commandName: 'admin',
        focusedOption: 'event',
        focused: 'lun',
        roles,
      });

    const organizer = suggest([ORGANIZER_ROLE]);
    await router.handle(organizer);
    expect(lastCall(organizer.respond)).toEqual([
      { name: 'Lunch · Sat, Nov 14, 1:00 PM', value: event.id },
    ]);

    const member = suggest([]);
    await router.handle(member);
    expect(lastCall(member.respond)).toEqual([]);
  });
});

import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { componentHandlers } from '../../src/components/index.js';
import { InteractionRouter } from '../../src/interactions/router.js';
import type { BotContext } from '../../src/interactions/types.js';
import { ORGANIZER_ONLY_MESSAGE } from '../../src/middleware/permissions.js';
import { createVerificationService } from '../../src/services/verificationService.js';
import { createWorkshopService } from '../../src/services/workshopService.js';
import {
  CHANNEL_ID,
  fakeContext,
  fakeInteraction,
  MESSAGE_ID,
  ORGANIZER_ROLE,
  USER_ID,
} from '../helpers/fakes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const HOUR = 3_600_000;

let t: TestDatabase;
let ctx: BotContext;
let router: InteractionRouter;

beforeEach(async () => {
  t = await createTestDatabase();
  ({ ctx } = await fakeContext({
    verification: createVerificationService(t.repos),
    workshops: createWorkshopService(t.repos),
  }));
  router = new InteractionRouter(ctx, commands, componentHandlers);
});
afterEach(async () => {
  await t.close();
});

let seq = 0;
async function verify(discordUserId: string, name = 'Test Person') {
  const registrationId = await t.addRegistration({ name, email: `u${++seq}@wayne.edu` });
  const created = await t.repos.links.create({ discordUserId, registrationId, linkedBy: null });
  if (!created.ok) throw new Error('link failed');
  return created.link;
}

async function workshop(capacity = 2, startsInHours = 2) {
  const outcome = await ctx.services.workshops.create({
    name: `AI Fundamentals ${++seq}`,
    description: 'Neural nets from scratch',
    speaker: 'Grace',
    startTime: new Date(Date.now() + startsInHours * HOUR),
    endTime: new Date(Date.now() + (startsInHours + 1) * HOUR),
    location: 'Room 204',
    capacity,
  });
  if (outcome.kind !== 'saved') throw new Error(outcome.kind);
  return outcome.workshop;
}

const click = (
  action: string,
  workshopId: number,
  options: { userId?: string; ephemeral?: boolean; messageId?: string } = {},
) =>
  fakeInteraction({
    kind: 'button',
    customId: `workshop:${action}:${workshopId}`,
    userId: options.userId,
    message: { id: options.messageId, ephemeral: options.ephemeral },
  });

const json = (value: unknown) => JSON.stringify(value);
const lastCall = (fn: unknown): unknown => (fn as Mock).mock.calls.at(-1)?.[0];

describe('/workshops', () => {
  it('lists upcoming workshops privately, with a menu to open one', async () => {
    const w = await workshop();
    const interaction = fakeInteraction({ kind: 'command', commandName: 'workshops' });

    await router.handle(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const view = json(lastCall(interaction.editReply));
    expect(view).toContain(w.name);
    expect(view).toContain('workshop:view');
    expect(view).toContain('Verify with /verify'); // unverified viewer
  });

  it("shows the viewer's own status", async () => {
    const w = await workshop();
    const link = await verify(USER_ID);
    await ctx.services.workshops.register(w.id, link);
    const interaction = fakeInteraction({ kind: 'command', commandName: 'workshops' });

    await router.handle(interaction);

    expect(json(lastCall(interaction.editReply))).toContain("You're registered");
  });

  it('opens a card from the menu, with a back button', async () => {
    const w = await workshop();
    const interaction = fakeInteraction({
      kind: 'select',
      customId: 'workshop:view',
      values: [String(w.id)],
    });

    await router.handle(interaction);

    const card = json(lastCall(interaction.update));
    expect(card).toContain(`workshop:register:${w.id}`);
    expect(card).toContain('workshop:list');
  });
});

describe('workshop card buttons', () => {
  it('asks unverified members to verify, without touching the card', async () => {
    const w = await workshop();
    const interaction = click('register', w.id);

    await router.handle(interaction);

    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
    expect(json(lastCall(interaction.reply))).toContain('/verify');
    expect((await ctx.services.workshops.get(w.id))?.registered).toBe(0);
  });

  it('blocks members whose registration is no longer active', async () => {
    const w = await workshop();
    const link = await verify(USER_ID);
    await t.repos.links.setActive([link.id], false);

    await router.handle(click('register', w.id));

    expect((await ctx.services.workshops.get(w.id))?.registered).toBe(0);
  });

  it('registers from the public card: updates its counts and confirms privately', async () => {
    const w = await workshop();
    await verify(USER_ID);
    await ctx.services.workshops.setPost(w.id, { channelId: CHANNEL_ID, messageId: MESSAGE_ID });
    const interaction = click('register', w.id);

    await router.handle(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(json(lastCall(interaction.editReply))).toContain('1 / 2 registered');
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
        content: expect.stringContaining("You're registered"),
      }),
    );
    expect(interaction.cardEdits).toEqual([]); // the card was this message; no second edit
  });

  it('refreshes the posted card when signing up from the private card', async () => {
    const w = await workshop();
    await verify(USER_ID);
    await ctx.services.workshops.setPost(w.id, { channelId: CHANNEL_ID, messageId: MESSAGE_ID });
    const interaction = click('register', w.id, { ephemeral: true, messageId: '1' });

    await router.handle(interaction);

    expect(json(lastCall(interaction.editReply))).toContain('workshop:list'); // keeps Back
    expect(interaction.cardEdits).toHaveLength(1);
    expect(json(interaction.cardEdits[0]?.view)).toContain('1 / 2 registered');
  });

  it('offers the waitlist when full, then joins it', async () => {
    const w = await workshop(1);
    await ctx.services.workshops.register(w.id, await verify('400000000000000099'));
    await verify(USER_ID);

    const register = click('register', w.id);
    await router.handle(register);
    const offer = json(lastCall(register.followUp));
    expect(offer).toContain('is full');
    expect(offer).toContain(`workshop:waitlist:${w.id}`);

    const join = click('waitlist', w.id, { ephemeral: true, messageId: '2' });
    await router.handle(join);
    const result = json(lastCall(join.editReply));
    expect(result).toContain('#1');
    expect(result).toContain('"components":[]'); // the Join button is gone
    expect((await ctx.services.workshops.get(w.id))?.waitlisted).toBe(1);
  });

  it('promotes the next person on cancel and DMs them', async () => {
    const w = await workshop(1);
    await ctx.services.workshops.register(w.id, await verify(USER_ID));
    const waiting = '400000000000000077';
    await ctx.services.workshops.register(w.id, await verify(waiting), { joinWaitlist: true });

    const interaction = click('cancel', w.id);
    await router.handle(interaction);

    expect(json(lastCall(interaction.followUp))).toContain('is cancelled');
    expect(interaction.dms).toEqual([
      { userId: waiting, message: expect.stringContaining('A spot opened up') },
    ]);
    expect(await ctx.services.workshops.get(w.id)).toMatchObject({ registered: 1, waitlisted: 0 });
  });

  it('reports errors after deferUpdate privately instead of overwriting the card', async () => {
    await verify(USER_ID);
    const interaction = click('register', 9999);

    await router.handle(interaction);

    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
        content: expect.stringContaining('no longer exists'),
      }),
    );
  });
});

describe('/admin workshop', () => {
  const admin = (subcommand: string, options: Record<string, unknown>, roles = [ORGANIZER_ROLE]) =>
    fakeInteraction({
      kind: 'command',
      commandName: 'admin',
      subcommandGroup: subcommand === 'workshop-roster' ? undefined : 'workshop',
      subcommand,
      options,
      roles,
    });

  const addOptions = {
    name: 'Intro to Git',
    start: '2026-11-14 14:00',
    duration: 60,
    location: 'Room 101',
    capacity: 30,
  };

  it('is for organizers only', async () => {
    const interaction = admin('add', addOptions, []);
    await router.handle(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: ORGANIZER_ONLY_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(await ctx.services.workshops.search('')).toEqual([]);
  });

  it('adds a workshop, reading the time in the event time zone', async () => {
    const interaction = admin('add', addOptions);
    await router.handle(interaction);

    const [created] = await ctx.services.workshops.search('Intro to Git');
    expect(created?.startTime.toISOString()).toBe('2026-11-14T19:00:00.000Z'); // 14:00 EST
    expect(created?.endTime.toISOString()).toBe('2026-11-14T20:00:00.000Z');
    expect(json(lastCall(interaction.editReply))).toContain('Created');
  });

  it('explains a time it cannot read', async () => {
    const interaction = admin('add', { ...addOptions, start: 'saturday 2pm' });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('YYYY-MM-DD HH:MM');
  });

  it('edits only the given fields and keeps the length when moving the start', async () => {
    const w = await workshop(2);
    const interaction = admin('edit', { workshop: w.id, start: '2026-11-14 16:30', capacity: 5 });
    await router.handle(interaction);

    const updated = await ctx.services.workshops.get(w.id);
    expect(updated?.startTime.toISOString()).toBe('2026-11-14T21:30:00.000Z');
    expect(updated?.endTime.toISOString()).toBe('2026-11-14T22:30:00.000Z');
    expect(updated).toMatchObject({ capacity: 5, location: 'Room 204', speaker: 'Grace' });
  });

  it('posts a card and remembers it for live updates', async () => {
    const w = await workshop();
    const interaction = admin('post', { workshop: w.id });
    await router.handle(interaction);

    expect(json(lastCall(interaction.postChannel.send))).toContain(`workshop:register:${w.id}`);
    expect(await ctx.services.workshops.get(w.id)).toMatchObject({
      channelId: CHANNEL_ID,
      messageId: MESSAGE_ID,
    });
  });

  it('refuses to remove a workshop people signed up for, unless forced', async () => {
    const w = await workshop();
    const member = '400000000000000055';
    await ctx.services.workshops.register(w.id, await verify(member));

    await router.handle(admin('remove', { workshop: w.id }));
    expect(await ctx.services.workshops.get(w.id)).not.toBeNull();

    const forced = admin('remove', { workshop: w.id, force: true });
    await router.handle(forced);
    expect(await ctx.services.workshops.get(w.id)).toBeNull();
    expect(forced.dms).toEqual([
      { userId: member, message: expect.stringContaining('was cancelled') },
    ]);
  });

  it('exports the roster as a private CSV with website names', async () => {
    const w = await workshop(1);
    await ctx.services.workshops.register(w.id, await verify('400000000000001111', 'Ada Lovelace'));
    await ctx.services.workshops.register(
      w.id,
      await verify('400000000000002222', '=HYPERLINK()'),
      {
        joinWaitlist: true,
      },
    );

    const interaction = admin('workshop-roster', { workshop: w.id });
    await router.handle(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const payload = lastCall(interaction.editReply) as { files: { attachment: Buffer }[] };
    const csv = payload.files[0]!.attachment.toString('utf8').split('\r\n');
    expect(csv[0]).toBe(
      'status,waitlist_position,discord_username,discord_user_id,registration_id,name,signed_up_at',
    );
    expect(csv[1]).toMatch(/^registered,,user_1111,400000000000001111,\d+,Ada Lovelace,/);
    expect(csv[2]).toMatch(/^waitlisted,1,user_2222,400000000000002222,\d+,'=HYPERLINK\(\),/);
  });

  it('suggests workshops to organizers only', async () => {
    const w = await workshop();
    const auto = (roles: string[]) =>
      fakeInteraction({ kind: 'autocomplete', commandName: 'admin', focused: 'ai', roles });

    const organizer = auto([ORGANIZER_ROLE]);
    await router.handle(organizer);
    expect(organizer.respond).toHaveBeenCalledWith([
      { name: expect.stringContaining(w.name), value: w.id },
    ]);

    const member = auto([]);
    await router.handle(member);
    expect(member.respond).toHaveBeenCalledWith([]);
  });
});

describe('/admin unlink', () => {
  it('gives the freed workshop spot to the waitlist', async () => {
    const w = await workshop(1);
    const target = '400000000000000033';
    const waiting = '400000000000000044';
    await ctx.services.workshops.register(w.id, await verify(target));
    await ctx.services.workshops.register(w.id, await verify(waiting), { joinWaitlist: true });

    const interaction = fakeInteraction({
      kind: 'command',
      commandName: 'admin',
      subcommand: 'unlink',
      options: { user: { id: target, bot: false } },
      roles: [ORGANIZER_ROLE],
    });
    await router.handle(interaction);

    expect(await ctx.services.workshops.get(w.id)).toMatchObject({ registered: 1, waitlisted: 0 });
    expect(interaction.dms.map((d) => d.userId)).toEqual([waiting]);
  });
});

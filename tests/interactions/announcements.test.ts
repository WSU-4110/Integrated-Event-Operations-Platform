import { DiscordAPIError, RESTJSONErrorCodes, type ModalBuilder } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { componentHandlers } from '../../src/components/index.js';
import { InteractionRouter } from '../../src/interactions/router.js';
import type { BotContext } from '../../src/interactions/types.js';
import { runScheduledAnnouncements } from '../../src/jobs/scheduledAnnouncements.js';
import { ORGANIZER_ONLY_MESSAGE } from '../../src/middleware/permissions.js';
import {
  createAnnouncementService,
  MAX_LATENESS_MS,
} from '../../src/services/announcementService.js';
import {
  ANNOUNCEMENT_CHANNEL,
  fakeConfig,
  fakeContext,
  fakeInteraction,
  ORGANIZER_ROLE,
  PARTICIPANT_ROLE,
  USER_ID,
} from '../helpers/fakes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const MINUTE = 60_000;
// 2026-11-14 10:00 in Detroit (EST, UTC-5).
const NOW = new Date('2026-11-14T15:00:00Z');

let t: TestDatabase;
let ctx: BotContext;
let router: InteractionRouter;
let clock: Date;

beforeEach(async () => {
  t = await createTestDatabase();
  clock = NOW;
  ({ ctx } = await fakeContext({
    announcements: createAnnouncementService(t.repos, { now: () => clock }),
  }));
  router = new InteractionRouter(ctx, commands, componentHandlers);
});
afterEach(async () => {
  await t.close();
});

const lastCall = (fn: unknown): unknown => (fn as Mock).mock.calls.at(-1)?.[0];
const json = (value: unknown) => JSON.stringify(value);
type Payload = { content?: string; embeds?: unknown[]; components?: unknown[] };

interface Form {
  title?: string;
  body?: string;
  type?: string;
  ping?: 'yes' | 'no';
  sendAt?: string;
}

function formInteraction(form: Form, options: { roles?: string[]; draftId?: number } = {}) {
  return fakeInteraction({
    kind: 'modal',
    customId: options.draftId ? `announce:submit:${options.draftId}` : 'announce:submit',
    roles: options.roles ?? [ORGANIZER_ROLE],
    fields: {
      title: form.title ?? 'Lunch is here',
      body: form.body ?? 'Pizza in the **main hall**. @everyone hurry!',
      send_at: form.sendAt ?? '',
    },
    selects: { type: [form.type ?? 'FOOD'], ping: [form.ping ?? 'no'] },
    // An edit is submitted from the preview message's Edit button.
    message: options.draftId ? { ephemeral: true } : undefined,
  });
}

/** Submits the form and returns the preview and the draft's ID. */
async function submit(form: Form = {}) {
  const interaction = formInteraction(form);
  await router.handle(interaction);
  const preview = lastCall(interaction.editReply) as Payload;
  const id = Number(/announce:send:(\d+)/.exec(json(preview))?.[1]);
  return { interaction, preview, id };
}

function press(action: 'send' | 'edit' | 'discard', id: number, roles = [ORGANIZER_ROLE]) {
  return fakeInteraction({
    kind: 'button',
    customId: `announce:${action}:${id}`,
    roles,
    message: { ephemeral: true },
  });
}

/** Posts made to the announcement channel by `interaction`'s client. */
const posts = (interaction: ReturnType<typeof fakeInteraction>) =>
  interaction.channelSends
    .filter((s) => s.channelId === ANNOUNCEMENT_CHANNEL)
    .map((s) => s.message as Record<string, unknown>);

describe('only organizers can announce', () => {
  it('/announce refuses non-organizers before opening the form', async () => {
    const interaction = fakeInteraction({ kind: 'command', commandName: 'announce' });
    await router.handle(interaction);
    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(json(lastCall(interaction.reply))).toContain(ORGANIZER_ONLY_MESSAGE);
  });

  it('the form refuses a non-organizer who submits it anyway', async () => {
    const interaction = formInteraction({}, { roles: [] });
    await router.handle(interaction);
    expect(json(lastCall(interaction.reply))).toContain(ORGANIZER_ONLY_MESSAGE);
    expect(await ctx.services.announcements.listOpen()).toEqual([]);
    expect(await t.repos.announcements.findById(1)).toBeNull();
  });

  it('the Send button refuses someone who lost the organizer role', async () => {
    const { id } = await submit();
    const click = press('send', id, []);
    await router.handle(click);
    expect(json(lastCall(click.reply))).toContain(ORGANIZER_ONLY_MESSAGE);
    expect(posts(click)).toHaveLength(0);
    expect((await ctx.services.announcements.get(id))?.status).toBe('DRAFT');
  });

  it('is hidden from regular members in the Discord UI', () => {
    const data = commands.find((c) => c.data.name === 'announce')!.data.toJSON();
    expect(data.default_member_permissions).toBe('32'); // ManageGuild
  });
});

describe('/announce', () => {
  it('opens the form with title, message, type, ping and send time', async () => {
    const interaction = fakeInteraction({
      kind: 'command',
      commandName: 'announce',
      roles: [ORGANIZER_ROLE],
    });
    await router.handle(interaction);
    const modal = (lastCall(interaction.showModal) as ModalBuilder).toJSON();
    expect(modal.custom_id).toBe('announce:submit');
    expect(json(modal)).toMatch(/"title".*"body".*"type".*"ping".*"send_at"/);
  });

  it('explains when no announcement channel is configured', async () => {
    ctx.config = fakeConfig({
      channels: { verificationLogId: ctx.config.channels.verificationLogId, announcementId: null },
    });
    const interaction = fakeInteraction({
      kind: 'command',
      commandName: 'announce',
      roles: [ORGANIZER_ROLE],
    });
    await router.handle(interaction);
    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(json(lastCall(interaction.reply))).toContain('ANNOUNCEMENT_CHANNEL_ID');
  });

  it('shows a private preview and posts nothing yet', async () => {
    const { interaction, preview } = await submit();
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(preview.content).toContain(`<#${ANNOUNCEMENT_CHANNEL}>`);
    expect(preview.content).toContain('No ping');
    expect(json(preview.embeds)).toContain('🍕 Lunch is here');
    expect(json(preview.components)).toContain('Send now');
    expect(posts(interaction)).toHaveLength(0);
  });

  it('sends exactly once, even if Send is pressed twice', async () => {
    const { id } = await submit();
    const first = press('send', id);
    await router.handle(first);
    expect(json(lastCall(first.editReply))).toContain('✅ Posted: https://discord.com/channels/');

    const [post] = posts(first);
    expect(posts(first)).toHaveLength(1);
    expect(json(post?.embeds)).toContain('Pizza in the **main hall**');
    // Nothing pings: not the role, and not the @everyone typed in the body.
    expect(post?.content).toBeUndefined();
    expect(post?.allowedMentions).toEqual({ parse: [], roles: [] });
    expect(post?.nonce).toBe(`announcement-${id}`);

    const second = press('send', id);
    await router.handle(second);
    expect(posts(second)).toHaveLength(0);
    expect(json(lastCall(second.editReply))).toContain('already sent');
    expect(await ctx.services.announcements.get(id)).toMatchObject({
      status: 'SENT',
      channelId: ANNOUNCEMENT_CHANNEL,
    });
  });

  it('pings only the Participant role, and only when asked', async () => {
    const { id, preview } = await submit({ ping: 'yes' });
    // The fake guild's Participant role isn't mentionable and the bot lacks Mention Everyone.
    expect(preview.content).toContain("I can't");
    const click = press('send', id);
    await router.handle(click);
    const [post] = posts(click);
    expect(post?.content).toBe(`<@&${PARTICIPANT_ROLE}>`);
    expect(post?.allowedMentions).toEqual({ parse: [], roles: [PARTICIPANT_ROLE] });
  });

  it('blocks sending until an unreadable or past send time is fixed', async () => {
    const unreadable = await submit({ sendAt: 'tomorrow at noon' });
    expect(unreadable.preview.content).toContain("couldn't read `tomorrow at noon`");
    expect(json(unreadable.preview.components)).toMatch(/"disabled":true/);

    const past = await submit({ sendAt: '2026-11-14 09:00' });
    expect(past.preview.content).toContain('already passed');
  });

  it('Edit reopens the form filled in, and saving updates the same preview', async () => {
    const { id } = await submit({ sendAt: '2026-11-14 12:30' });
    const click = press('edit', id);
    await router.handle(click);
    const modal = (lastCall(click.showModal) as ModalBuilder).toJSON();
    expect(modal.custom_id).toBe(`announce:submit:${id}`);
    expect(json(modal)).toContain('"value":"Lunch is here"');
    expect(json(modal)).toContain('"value":"2026-11-14 12:30"');

    const edit = formInteraction(
      { title: 'Lunch moved', sendAt: '2026-11-14 13:00' },
      { draftId: id },
    );
    await router.handle(edit);
    expect(edit.deferUpdate).toHaveBeenCalled();
    expect(json(lastCall(edit.editReply))).toContain('Lunch moved');
    expect(await ctx.services.announcements.get(id)).toMatchObject({
      title: 'Lunch moved',
      scheduledFor: new Date('2026-11-14T18:00:00Z'),
    });
  });

  it('Discard throws the draft away', async () => {
    const { id } = await submit();
    const discard = press('discard', id);
    await router.handle(discard);
    expect(json(lastCall(discard.editReply))).toContain('Discarded');

    const send = press('send', id);
    await router.handle(send);
    expect(posts(send)).toHaveLength(0);
    expect(json(lastCall(send.editReply))).toContain('discarded');
  });

  it('records a failed post and keeps the text for the organizer', async () => {
    const { id } = await submit();
    const click = press('send', id);
    click.client.channels.fetch = vi.fn(async () => ({
      isSendable: () => true,
      send: vi.fn(async () => {
        throw new DiscordAPIError(
          { message: 'Missing Permissions', code: RESTJSONErrorCodes.MissingPermissions },
          RESTJSONErrorCodes.MissingPermissions,
          403,
          'POST',
          '/channels/x/messages',
          {},
        );
      }),
    })) as never;
    await router.handle(click);
    const reply = lastCall(click.editReply) as Payload;
    expect(reply.content).toContain('I need Send Messages and Embed Links');
    expect(json(reply.embeds)).toContain('Lunch is here');
    expect((await ctx.services.announcements.get(id))?.status).toBe('FAILED');
  });
});

describe('scheduled announcements', () => {
  async function schedule(sendAt: string) {
    const { id, preview } = await submit({ sendAt });
    expect(json(preview.components)).toContain('Schedule');
    const click = press('send', id);
    await router.handle(click);
    expect(json(lastCall(click.editReply))).toContain('🕒 Scheduled for <t:');
    expect(posts(click)).toHaveLength(0);
    return id;
  }

  it('are sent by the job exactly once, when due', async () => {
    const id = await schedule('2026-11-14 10:30'); // 30 minutes from NOW
    const { client, channelSends } = fakeInteraction({ kind: 'button' });
    const sentToChannel = () => channelSends.filter((s) => s.channelId === ANNOUNCEMENT_CHANNEL);

    await runScheduledAnnouncements(client, ctx);
    expect(sentToChannel()).toHaveLength(0);

    clock = new Date(NOW.getTime() + 30 * MINUTE);
    // Overlapping runs (or a second bot process) and the next minute's run:
    await Promise.all([
      runScheduledAnnouncements(client as never, ctx),
      runScheduledAnnouncements(client as never, ctx),
    ]);
    clock = new Date(NOW.getTime() + 31 * MINUTE);
    expect(await runScheduledAnnouncements(client as never, ctx)).toMatchObject({ sent: 0 });

    expect(sentToChannel()).toHaveLength(1);
    expect((await ctx.services.announcements.get(id))?.status).toBe('SENT');
  });

  it("aren't sent hours late after downtime; the organizer gets a DM instead", async () => {
    const id = await schedule('2026-11-14 10:30');
    clock = new Date(NOW.getTime() + 30 * MINUTE + MAX_LATENESS_MS + MINUTE);
    const { client, channelSends, dms } = fakeInteraction({ kind: 'button' });

    expect(await runScheduledAnnouncements(client as never, ctx)).toMatchObject({ missed: 1 });
    expect(channelSends).toHaveLength(0);
    expect(dms).toEqual([{ userId: USER_ID, message: expect.stringContaining("wasn't posted") }]);
    expect((await ctx.services.announcements.get(id))?.status).toBe('FAILED');
  });

  it('can be listed and cancelled with /admin announcement', async () => {
    const id = await schedule('2026-11-14 10:30');
    const list = fakeInteraction({
      kind: 'command',
      commandName: 'admin',
      subcommandGroup: 'announcement',
      subcommand: 'list',
      roles: [ORGANIZER_ROLE],
    });
    await router.handle(list);
    expect(json(lastCall(list.editReply))).toContain(`#${id}`);

    const autocomplete = fakeInteraction({
      kind: 'autocomplete',
      commandName: 'admin',
      focusedOption: 'announcement',
      focused: 'lunch',
      roles: [ORGANIZER_ROLE],
    });
    await router.handle(autocomplete);
    expect(lastCall(autocomplete.respond)).toEqual([
      { name: expect.stringContaining(`#${id} · Lunch is here`), value: id },
    ]);

    const cancel = fakeInteraction({
      kind: 'command',
      commandName: 'admin',
      subcommandGroup: 'announcement',
      subcommand: 'cancel',
      options: { announcement: id },
      roles: [ORGANIZER_ROLE],
    });
    await router.handle(cancel);
    expect(json(lastCall(cancel.editReply))).toContain("won't be sent");

    clock = new Date(NOW.getTime() + 30 * MINUTE);
    const { client, channelSends } = fakeInteraction({ kind: 'button' });
    await runScheduledAnnouncements(client, ctx);
    expect(channelSends).toHaveLength(0);
  });
});

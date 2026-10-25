import { Collection, MessageFlags, type Client, type GuildMember } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { componentHandlers } from '../../src/components/index.js';
import { Messages } from '../../src/components/embeds/verifyEmbeds.js';
import { onMemberJoin, WelcomeMessages } from '../../src/events/guildMemberAdd.js';
import { InteractionRouter } from '../../src/interactions/router.js';
import type { BotContext } from '../../src/interactions/types.js';
import { runParticipantSync } from '../../src/jobs/participantSync.js';
import { ORGANIZER_ONLY_MESSAGE } from '../../src/middleware/permissions.js';
import { requireVerified } from '../../src/middleware/requireVerified.js';
import { createVerificationService } from '../../src/services/verificationService.js';
import {
  fakeContext,
  fakeInteraction,
  ORGANIZER_ROLE,
  PARTICIPANT_ROLE,
  USER_ID,
} from '../helpers/fakes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

let t: TestDatabase;
let ctx: BotContext;
let router: InteractionRouter;

beforeEach(async () => {
  t = await createTestDatabase();
  ({ ctx } = await fakeContext({ verification: createVerificationService(t.repos) }));
  router = new InteractionRouter(ctx, commands, componentHandlers);
});
afterEach(async () => {
  await t.close();
});

const submit = (email: string, username = 'ada_example') =>
  fakeInteraction({ kind: 'modal', customId: 'verify:submit', fields: { email }, username });

function editedText(interaction: ReturnType<typeof fakeInteraction>): string {
  const payload = vi.mocked(interaction.editReply).mock.calls.at(-1)?.[0];
  return JSON.stringify(payload);
}

describe('/verify', () => {
  it('opens the email form for unverified members', async () => {
    const interaction = fakeInteraction({ kind: 'command', commandName: 'verify' });
    await router.handle(interaction);
    expect(interaction.showModal).toHaveBeenCalledOnce();
  });

  it('shows status instead of the form once verified', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await router.handle(submit('ada@wayne.edu'));

    const interaction = fakeInteraction({ kind: 'command', commandName: 'verify' });
    await router.handle(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already verified') }),
    );
  });

  it("doesn't open the form while rate limited", async () => {
    for (let i = 0; i < 5; i++) await router.handle(submit(`guess${i}@wayne.edu`));
    const interaction = fakeInteraction({ kind: 'command', commandName: 'verify' });

    await router.handle(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: Messages.rateLimited,
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe('verification form submit', () => {
  it('links, gives the Participant role and logs it for organizers', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    const interaction = submit('ada@wayne.edu');

    await router.handle(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(interaction.fetchedMember.roles.add).toHaveBeenCalledWith(
      PARTICIPANT_ROLE,
      expect.any(String),
    );
    expect(editedText(interaction)).toContain("You're verified");
    expect(JSON.stringify(interaction.logMessages)).toContain(`registration #${id}`);
  });

  it('IMPERSONATION: matching username with a wrong email gets no link and no role', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    const interaction = submit('attacker@evil.edu', 'ada_example');

    await router.handle(interaction);

    expect(interaction.fetchedMember.roles.add).not.toHaveBeenCalled();
    expect(editedText(interaction)).toContain("couldn't find a registration");
    expect(await ctx.services.verification.getLink(USER_ID)).toBeNull();
  });

  it('rejects malformed emails without counting an attempt', async () => {
    const interaction = submit('not-an-email');
    await router.handle(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(Messages.invalidEmail);
    expect(await ctx.services.verification.listVerificationQueue()).toEqual([]);
  });

  it('tells the member an organizer will help, and alerts organizers, on conflicts', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await ctx.services.verification.linkManually({
      discordUserId: '700000000000000001',
      organizerId: 'org',
      registrationId: id,
    });
    const interaction = submit('ada@wayne.edu');

    await router.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(Messages.needsOrganizer);
    expect(JSON.stringify(interaction.logMessages)).toContain('already linked');
    expect(interaction.fetchedMember.roles.add).not.toHaveBeenCalled();
  });

  it("reports when the role couldn't be assigned instead of claiming success", async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    const interaction = submit('ada@wayne.edu');
    interaction.fetchedMember.roles.add.mockRejectedValueOnce(new Error('Missing Permissions'));

    await router.handle(interaction);

    expect(editedText(interaction)).toContain("couldn't give you the **Participant** role");
    expect(JSON.stringify(interaction.logMessages)).toContain(
      "couldn't give them the Participant role",
    );
  });
});

describe('requireVerified', () => {
  it('blocks unverified members with a Verify button', async () => {
    const interaction = fakeInteraction({ kind: 'command' });
    expect(await requireVerified(interaction as never, ctx)).toBeNull();
    const payload = vi.mocked(interaction.reply).mock.calls[0]?.[0];
    expect(JSON.stringify(payload)).toContain('verify:start');
    expect(JSON.stringify(payload)).toContain('Run `/verify`');
  });

  it('lets verified members through', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await router.handle(submit('ada@wayne.edu'));
    const interaction = fakeInteraction({ kind: 'command' });

    const link = await requireVerified(interaction as never, ctx);

    expect(link?.discordUserId).toBe(USER_ID);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('blocks members whose registration became inactive', async () => {
    const id = await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await router.handle(submit('ada@wayne.edu'));
    await t.setStatus(id, 'declined');
    await ctx.services.verification.syncLinkStatuses();
    const interaction = fakeInteraction({ kind: 'command' });

    expect(await requireVerified(interaction as never, ctx)).toBeNull();
    expect(JSON.stringify(vi.mocked(interaction.reply).mock.calls[0]?.[0])).toContain('paused');
  });
});

describe('/profile', () => {
  it('shows the linked registration, read from the website table', async () => {
    await t.addRegistration({
      name: 'Ada Lovelace',
      email: 'ada@wayne.edu',
      discordUsername: 'ada_example',
      status: 'pending',
    });
    await router.handle(submit('ada@wayne.edu'));
    const interaction = fakeInteraction({ kind: 'command', commandName: 'profile' });

    await router.handle(interaction);

    const text = editedText(interaction);
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Pending review');
  });

  it('offers verification to unverified members', async () => {
    const interaction = fakeInteraction({ kind: 'command', commandName: 'profile' });
    await router.handle(interaction);
    expect(editedText(interaction)).toContain('verify:start');
  });
});

describe('/admin', () => {
  const target = { id: '800000000000000001', bot: false };
  const admin = (subcommand: string, options: Record<string, unknown>, roles = [ORGANIZER_ROLE]) =>
    fakeInteraction({ kind: 'command', commandName: 'admin', subcommand, options, roles });

  it('refuses non-organizers', async () => {
    const interaction = admin('verification-queue', {}, []);
    await router.handle(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: ORGANIZER_ONLY_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it('link by email assigns the role and logs who did it', async () => {
    const id = await t.addRegistration({
      name: 'Eve W',
      email: 'eve@wayne.edu',
      status: 'pending',
    });
    const interaction = admin('link', { user: target, email: 'eve@wayne.edu' });

    await router.handle(interaction);

    expect(editedText(interaction)).toContain(`registration #${id}`);
    expect(interaction.fetchedMember.roles.add).toHaveBeenCalledWith(
      PARTICIPANT_ROLE,
      expect.any(String),
    );
    expect((await ctx.services.verification.getLink(target.id))?.linkedBy).toBe(USER_ID);
    expect(JSON.stringify(interaction.logMessages)).toContain(
      `<@${USER_ID}> linked <@${target.id}>`,
    );
  });

  it('link requires exactly one of email or registration', async () => {
    const interaction = admin('link', { user: target });
    await router.handle(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('either `email` or `registration`'),
      }),
    );
  });

  it('unlink removes the link and the role', async () => {
    const id = await t.addRegistration({ email: 'eve@wayne.edu' });
    await router.handle(admin('link', { user: target, registration: id }));
    const interaction = admin('unlink', { user: target });
    interaction.fetchedMember.roles.cache.set(PARTICIPANT_ROLE, {});

    await router.handle(interaction);

    expect(await ctx.services.verification.getLink(target.id)).toBeNull();
    expect(interaction.fetchedMember.roles.remove).toHaveBeenCalledWith(
      PARTICIPANT_ROLE,
      expect.any(String),
    );
  });

  it('verification-queue lists failed attempts', async () => {
    await router.handle(submit('wrong@wayne.edu', 'someone'));
    const interaction = admin('verification-queue', {});

    await router.handle(interaction);

    const text = editedText(interaction);
    expect(text).toContain('someone');
    expect(text).toContain('No match');
  });
});

describe('member join onboarding', () => {
  function member(username: string, roles: string[] = []) {
    return {
      id: USER_ID,
      user: { bot: false, username },
      guild: { id: ctx.config.discord.guildId },
      roles: { cache: new Map(roles.map((r) => [r, {}])), add: vi.fn(), remove: vi.fn() },
      send: vi.fn(async (_message: string) => {}),
    };
  }

  it('suggests /verify when the username matches a registration (without granting access)', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'Ada_Example' });
    const m = member('ada_example');

    await onMemberJoin(m as unknown as GuildMember, ctx);

    expect(m.send).toHaveBeenCalledWith(WelcomeMessages.likelyMatch);
    expect(m.roles.add).not.toHaveBeenCalled();
  });

  it('points unregistered members to the website', async () => {
    const m = member('stranger');
    await onMemberJoin(m as unknown as GuildMember, ctx);
    expect(m.send).toHaveBeenCalledWith(WelcomeMessages.unregistered(ctx.config.registrationUrl));
  });

  it('restores the role for verified members who rejoin', async () => {
    await t.addRegistration({ email: 'ada@wayne.edu', discordUsername: 'ada_example' });
    await router.handle(submit('ada@wayne.edu'));
    const m = member('ada_example');

    await onMemberJoin(m as unknown as GuildMember, ctx);

    expect(m.roles.add).toHaveBeenCalledWith(PARTICIPANT_ROLE, expect.any(String));
    expect(m.send).toHaveBeenCalledWith(WelcomeMessages.returning);
  });

  it('ignores closed DMs', async () => {
    const { DiscordAPIError } = await import('discord.js');
    const m = member('stranger');
    m.send.mockRejectedValueOnce(
      new DiscordAPIError({ code: 50007, message: 'Cannot send' }, 50007, 403, 'POST', '/x', {}),
    );
    await expect(onMemberJoin(m as unknown as GuildMember, ctx)).resolves.toBeUndefined();
  });
});

describe('participant sync job', () => {
  it('removes the role from declined registrations and restores it for active ones', async () => {
    const keep = await t.addRegistration({ email: 'a@wayne.edu' });
    const drop = await t.addRegistration({ email: 'b@wayne.edu' });
    const { verification } = ctx.services;
    await verification.linkManually({
      discordUserId: '900000000000000001',
      organizerId: 'o',
      registrationId: keep,
    });
    await verification.linkManually({
      discordUserId: '900000000000000002',
      organizerId: 'o',
      registrationId: drop,
    });
    await t.setStatus(drop, 'declined');

    const mk = (id: string, roles: string[]) => ({
      id,
      roles: { cache: new Map(roles.map((r) => [r, {}])), add: vi.fn(), remove: vi.fn() },
    });
    const lostRole = mk('900000000000000001', []); // active, but someone removed the role
    const declined = mk('900000000000000002', [PARTICIPANT_ROLE]);
    const sent: unknown[] = [];
    const client = {
      guilds: {
        fetch: async () => ({
          members: {
            fetch: async () =>
              new Collection([
                [lostRole.id, lostRole],
                [declined.id, declined],
              ]),
          },
        }),
      },
      channels: {
        fetch: async () => ({ isSendable: () => true, send: async (m: unknown) => sent.push(m) }),
      },
    } as unknown as Client;

    const summary = await runParticipantSync(client, ctx);

    expect(summary).toMatchObject({
      deactivated: 1,
      rolesRemoved: 1,
      rolesAdded: 1,
      roleFailures: 0,
    });
    expect(declined.roles.remove).toHaveBeenCalledWith(PARTICIPANT_ROLE, expect.any(String));
    expect(lostRole.roles.add).toHaveBeenCalledWith(PARTICIPANT_ROLE, expect.any(String));
    expect(JSON.stringify(sent)).toContain(`registration #${drop}`);
  });
});

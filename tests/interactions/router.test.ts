import { DiscordAPIError, MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { componentHandlers } from '../../src/components/index.js';
import { GENERIC_ERROR_MESSAGE, UserFacingError } from '../../src/interactions/errors.js';
import {
  InteractionRouter,
  STALE_COMMAND_MESSAGE,
  STALE_COMPONENT_MESSAGE,
} from '../../src/interactions/router.js';
import type { SlashCommand } from '../../src/interactions/types.js';
import { fakeContext, fakeInteraction } from '../helpers/fakes.js';

function command(name: string, execute: SlashCommand['execute']): SlashCommand {
  return { data: { name, toJSON: () => ({ name, description: name }) }, execute };
}

describe('InteractionRouter', () => {
  it('routes slash commands and logs the command without its arguments', async () => {
    const { ctx, logger } = await fakeContext();
    const execute = vi.fn(async () => {});
    const router = new InteractionRouter(ctx, [command('ping', execute)], []);
    const interaction = fakeInteraction({ kind: 'command', commandName: 'ping' });

    await router.handle(interaction);

    expect(execute).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      { command: 'ping', userId: '400000000000000001' },
      'Command',
    );
  });

  it('replies politely to commands it no longer knows', async () => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(ctx, [], []);
    const interaction = fakeInteraction({ kind: 'command', commandName: 'gone' });

    await router.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: STALE_COMMAND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('hides internal errors behind a generic message with an error ID', async () => {
    const { ctx, logger } = await fakeContext();
    const secret = new Error('connection to db at 10.0.0.1 failed: password authentication');
    const router = new InteractionRouter(
      ctx,
      [
        command('boom', async () => {
          throw secret;
        }),
      ],
      [],
    );
    const interaction = fakeInteraction({ kind: 'command', commandName: 'boom' });

    await router.handle(interaction);

    const reply = vi.mocked(interaction.reply).mock.calls[0]?.[0] as { content: string };
    expect(reply.content).toContain(GENERIC_ERROR_MESSAGE);
    expect(reply.content).toMatch(/Error ID: `[0-9A-F]{8}`/);
    expect(reply.content).not.toContain('password');

    const errorId = /`([0-9A-F]{8})`/.exec(reply.content)?.[1];
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: secret, errorId }),
      'Interaction failed',
    );
  });

  it('edits the deferred reply when a deferred handler fails', async () => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(
      ctx,
      [
        command('slow', async (i) => {
          await i.deferReply();
          throw new Error('db down');
        }),
      ],
      [],
    );
    const interaction = fakeInteraction({ kind: 'command', commandName: 'slow' });

    await router.handle(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining(GENERIC_ERROR_MESSAGE) }),
    );
  });

  it('follows up when the handler already replied', async () => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(
      ctx,
      [
        command('half', async (i) => {
          await i.reply('partial');
          throw new Error('later failure');
        }),
      ],
      [],
    );
    const interaction = fakeInteraction({ kind: 'command', commandName: 'half' });

    await router.handle(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });

  it('shows UserFacingError messages as-is, without an error ID', async () => {
    const { ctx, logger } = await fakeContext();
    const router = new InteractionRouter(
      ctx,
      [
        command('team', async () => {
          throw new UserFacingError("You're already on a team.");
        }),
      ],
      [],
    );
    const interaction = fakeInteraction({ kind: 'command', commandName: 'team' });

    await router.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "❌ You're already on a team.",
      flags: MessageFlags.Ephemeral,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("doesn't try to answer an interaction Discord has already expired", async () => {
    const { ctx, logger } = await fakeContext();
    const expired = new DiscordAPIError(
      { code: 10062, message: 'Unknown interaction' },
      10062,
      404,
      'POST',
      '/interactions/1/token/callback',
      {},
    );
    const router = new InteractionRouter(
      ctx,
      [
        command('late', async () => {
          throw expired;
        }),
      ],
      [],
    );
    const interaction = fakeInteraction({ kind: 'command', commandName: 'late' });

    await router.handle(interaction);

    expect(logger.error).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('routes components by custom ID namespace', async () => {
    const { ctx } = await fakeContext();
    const handle = vi.fn(async () => {});
    const router = new InteractionRouter(ctx, [], [{ namespace: 'workshop', handle }]);
    const interaction = fakeInteraction({ kind: 'button', customId: 'workshop:register:7' });

    await router.handle(interaction);

    expect(handle).toHaveBeenCalledWith(
      interaction,
      { namespace: 'workshop', action: 'register', args: ['7'] },
      ctx,
    );
  });

  it('tells users when a button is no longer active', async () => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(ctx, [], []);
    const interaction = fakeInteraction({ kind: 'button', customId: 'removed:thing' });

    await router.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: STALE_COMPONENT_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('refuses duplicate command names and component namespaces', async () => {
    const { ctx } = await fakeContext();
    const noop = async () => {};
    expect(() => new InteractionRouter(ctx, [command('a', noop), command('a', noop)], [])).toThrow(
      /Duplicate command/,
    );
    expect(
      () =>
        new InteractionRouter(
          ctx,
          [],
          [
            { namespace: 'x', handle: noop },
            { namespace: 'x', handle: noop },
          ],
        ),
    ).toThrow(/Duplicate component/);
  });
});

describe('registered commands and components', () => {
  it('registers every command', () => {
    expect(commands.map((c) => c.data.name).sort()).toEqual([
      'admin',
      'faq',
      'help',
      'profile',
      'resources',
      'rules',
      'verify',
    ]);
  });

  it('hides /admin from members without Manage Server in the Discord UI', () => {
    const admin = commands.find((c) => c.data.name === 'admin')!.data.toJSON();
    expect(admin.default_member_permissions).toBe('32'); // ManageGuild
  });

  it('/help defers, then shows the menu privately', async () => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(ctx, commands, componentHandlers);
    const interaction = fakeInteraction({ kind: 'command', commandName: 'help' });

    await router.handle(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array), components: expect.any(Array) }),
    );
  });

  it.each(['rules', 'faq', 'resources'])('/%s replies ephemerally', async (name) => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(ctx, commands, componentHandlers);
    const interaction = fakeInteraction({ kind: 'command', commandName: name });

    await router.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral, embeds: expect.any(Array) }),
    );
  });

  it('every help button opens its section', async () => {
    const { ctx, logger } = await fakeContext();
    const router = new InteractionRouter(ctx, commands, componentHandlers);
    for (const section of Object.keys(ctx.content.help.sections)) {
      const interaction = fakeInteraction({ kind: 'button', customId: `help:show:${section}` });
      await router.handle(interaction);
      expect(interaction.reply, section).toHaveBeenCalledOnce();
    }
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('the FAQ menu updates the message in place with the chosen answer', async () => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(ctx, commands, componentHandlers);
    const faq = ctx.content.faqs[0]!;
    const interaction = fakeInteraction({
      kind: 'select',
      customId: 'faq:select',
      values: [faq.id],
    });

    await router.handle(interaction);

    const view = vi.mocked(interaction.update).mock.calls[0]?.[0] as {
      embeds: { toJSON(): { description?: string } }[];
    };
    expect(view.embeds[0]?.toJSON().description).toBe(faq.answer);
  });

  it('the resources menu updates the message in place', async () => {
    const { ctx } = await fakeContext();
    const router = new InteractionRouter(ctx, commands, componentHandlers);
    const interaction = fakeInteraction({
      kind: 'select',
      customId: 'resources:select',
      values: ['aws'],
    });

    await router.handle(interaction);

    expect(interaction.update).toHaveBeenCalledOnce();
  });
});

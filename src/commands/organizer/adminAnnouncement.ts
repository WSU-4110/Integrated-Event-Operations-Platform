import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import {
  AnnouncementMessages,
  buildAnnouncementList,
} from '../../components/embeds/announcementEmbeds.js';
import { shortEventTime } from '../../components/embeds/workshopEmbeds.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext } from '../../interactions/types.js';

// /admin announcement list|cancel. Writing one is /announce.

type GuildCommand = ChatInputCommandInteraction<'cached'>;

export const ANNOUNCEMENT_OPTION = 'announcement';

export function addAnnouncementAdminCommands(
  builder: SlashCommandSubcommandsOnlyBuilder,
): SlashCommandSubcommandsOnlyBuilder {
  return builder.addSubcommandGroup((group) =>
    group
      .setName('announcement')
      .setDescription('Scheduled announcements')
      .addSubcommand((sub) =>
        sub.setName('list').setDescription('Scheduled announcements and ones that failed'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('cancel')
          .setDescription('Cancel a scheduled announcement, or dismiss a failed one')
          .addIntegerOption((o) =>
            o
              .setName(ANNOUNCEMENT_OPTION)
              .setDescription('Start typing the title')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),
  );
}

/** Suggests cancellable announcements; the value is the ID. Organizer-checked by the caller. */
export async function autocompleteAnnouncement(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  const matches = await ctx.services.announcements.searchCancellable(
    String(interaction.options.getFocused()),
    25,
  );
  await interaction.respond(
    matches.map((a) => {
      const when =
        a.status === 'FAILED'
          ? 'failed'
          : a.scheduledFor
            ? shortEventTime(a.scheduledFor, ctx.config.eventTimeZone)
            : 'due now';
      return { name: `#${a.id} · ${a.title} · ${when}`.slice(0, 100), value: a.id };
    }),
  );
}

async function cancel(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const id = interaction.options.getInteger(ANNOUNCEMENT_OPTION, true);
  const { announcements } = ctx.services;
  const cancelled = await announcements.cancel(id);
  if (!cancelled) {
    const current = await announcements.get(id);
    throw new UserFacingError(
      current ? AnnouncementMessages.alreadyHandled(current.status) : AnnouncementMessages.notFound,
    );
  }
  ctx.logger.info(
    { organizerId: interaction.user.id, announcementId: id },
    'Announcement cancelled',
  );
  await interaction.editReply(`🚫 Cancelled **${cancelled.title}** (#${id}). It won't be sent.`);
}

/** Runs /admin announcement <sub> (already deferred, organizer-checked). */
export async function handleAnnouncementAdmin(
  interaction: GuildCommand,
  ctx: BotContext,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'list':
      await interaction.editReply(
        buildAnnouncementList(await ctx.services.announcements.listOpen()),
      );
      return;
    case 'cancel':
      return cancel(interaction, ctx);
    default:
      throw new Error(`Unknown /admin announcement subcommand: ${sub}`);
  }
}

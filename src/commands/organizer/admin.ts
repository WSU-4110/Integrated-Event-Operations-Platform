import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { buildVerificationQueueView, statusLabel } from '../../components/embeds/verifyEmbeds.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext, SlashCommand } from '../../interactions/types.js';
import { isOrganizer, requireOrganizer } from '../../middleware/permissions.js';
import { roleChangeSucceeded, setParticipantRole } from '../../services/participantRoles.js';
import { postVerificationLog } from '../../services/verificationLog.js';
import { announcePromotions, refreshWorkshopCard } from '../../services/workshopNotifications.js';
import {
  addAnnouncementAdminCommands,
  ANNOUNCEMENT_OPTION,
  autocompleteAnnouncement,
  handleAnnouncementAdmin,
} from './adminAnnouncement.js';
import {
  addEventAdminCommands,
  autocompleteEvent,
  EVENT_OPTION,
  handleEventAdmin,
} from './adminEvent.js';
import {
  addWorkshopAdminCommands,
  autocompleteWorkshop,
  handleWorkshopAdmin,
} from './adminWorkshop.js';

type GuildCommand = ChatInputCommandInteraction<'cached'>;

async function link(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const email = interaction.options.getString('email') ?? undefined;
  const registrationId = interaction.options.getInteger('registration') ?? undefined;

  if (user.bot) throw new UserFacingError("Bots can't be linked to registrations.");
  if ((email === undefined) === (registrationId === undefined)) {
    throw new UserFacingError('Give either `email` or `registration`, not both.');
  }

  const outcome = await ctx.services.verification.linkManually({
    discordUserId: user.id,
    organizerId: interaction.user.id,
    registrationId,
    email,
  });

  switch (outcome.kind) {
    case 'registration_not_found':
      throw new UserFacingError('No BuilderWars registration matches that.');
    case 'ambiguous_email':
      throw new UserFacingError(
        `Several registrations use that email (${outcome.registrationIds.map((id) => `#${id}`).join(', ')}). Use \`registration\` instead.`,
      );
    case 'ineligible':
      throw new UserFacingError(
        `That registration is ${statusLabel(outcome.status)}. Only pending or approved registrations can be linked.`,
      );
    case 'user_already_linked':
      throw new UserFacingError(
        `<@${user.id}> is already linked to registration #${outcome.registrationId}. Use \`/admin unlink\` first.`,
      );
    case 'registration_taken':
      throw new UserFacingError(
        `That registration is already linked to <@${outcome.discordUserId}>. Use \`/admin unlink\` on them first.`,
      );
    case 'linked': {
      const { registration } = outcome;
      ctx.logger.info(
        { organizerId: interaction.user.id, userId: user.id, registrationId: registration.id },
        'Manual link',
      );
      const role = await setParticipantRole(
        interaction.guild,
        user.id,
        true,
        ctx,
        `Linked by organizer ${interaction.user.id}`,
      );
      const roleNote =
        role === 'not_in_guild'
          ? "\nThey aren't in the server yet; they'll get the Participant role when they join."
          : roleChangeSucceeded(role)
            ? ''
            : "\n⚠️ I couldn't give them the Participant role. Check that my role is above Participant.";
      await interaction.editReply(
        `✅ Linked <@${user.id}> to registration #${registration.id} (**${registration.name}**, ${statusLabel(registration.status)}).${roleNote}`,
      );
      await postVerificationLog(
        interaction.client,
        ctx,
        `🔗 <@${interaction.user.id}> linked <@${user.id}> to registration #${registration.id}.`,
      );
      return;
    }
  }
}

async function unlink(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const removed = await ctx.services.verification.unlink(user.id);
  if (!removed) throw new UserFacingError(`<@${user.id}> isn't linked to a registration.`);

  ctx.logger.info(
    { organizerId: interaction.user.id, userId: user.id, registrationId: removed.registrationId },
    'Manual unlink',
  );
  const role = await setParticipantRole(
    interaction.guild,
    user.id,
    false,
    ctx,
    `Unlinked by organizer ${interaction.user.id}`,
  );
  const roleNote =
    role === 'failed'
      ? "\n⚠️ I couldn't remove their Participant role; please remove it by hand."
      : '';
  await interaction.editReply(
    `Unlinked <@${user.id}> from registration #${removed.registrationId} and removed their Participant role.${roleNote}`,
  );
  await postVerificationLog(
    interaction.client,
    ctx,
    `✂️ <@${interaction.user.id}> unlinked <@${user.id}> from registration #${removed.registrationId}.`,
  );

  // Unlinking deletes their workshop signups, which may free spots. The
  // unlink already succeeded, so a failure here is only logged.
  try {
    const promoted = await ctx.services.workshops.fillAllOpenSpots();
    for (const workshopId of new Set(promoted.map((p) => p.workshopId))) {
      await refreshWorkshopCard(interaction.client, ctx, workshopId);
    }
    await announcePromotions(interaction.client, ctx, promoted);
  } catch (err) {
    ctx.logger.error({ err, userId: user.id }, 'Could not refill workshop spots after unlink');
  }
}

async function verificationQueue(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const attempts = await ctx.services.verification.listVerificationQueue(20);
  await interaction.editReply(buildVerificationQueueView(attempts));
}

const baseCommand = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Organizer tools')
  .setContexts(InteractionContextType.Guild)
  // Hides the command from regular members; requireOrganizer is the real check.
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('link')
      .setDescription('Link a member to a website registration (by email or registration ID)')
      .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
      .addStringOption((o) =>
        o.setName('email').setDescription('Email on their website registration'),
      )
      .addIntegerOption((o) =>
        o
          .setName('registration')
          .setDescription('Registration ID (from the dashboard CSV export)')
          .setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('unlink')
      .setDescription('Remove a member’s link and their Participant role')
      .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('verification-queue')
      .setDescription('Failed or ambiguous verification attempts to review'),
  );

/** Suggestions for whichever ID option is being typed in. */
async function autocomplete(interaction: AutocompleteInteraction, ctx: BotContext): Promise<void> {
  if (!isOrganizer(interaction.member, ctx)) {
    await interaction.respond([]);
    return;
  }
  switch (interaction.options.getFocused(true).name) {
    case EVENT_OPTION:
      return autocompleteEvent(interaction, ctx);
    case ANNOUNCEMENT_OPTION:
      return autocompleteAnnouncement(interaction, ctx);
    default:
      return autocompleteWorkshop(interaction, ctx);
  }
}

export const adminCommand: SlashCommand = {
  data: addAnnouncementAdminCommands(addEventAdminCommands(addWorkshopAdminCommands(baseCommand))),

  async execute(interaction, ctx) {
    if (!(await requireOrganizer(interaction, ctx))) return;
    if (!interaction.inCachedGuild()) throw new UserFacingError('Use this inside the server.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    switch (interaction.options.getSubcommandGroup()) {
      case 'workshop':
        return handleWorkshopAdmin(interaction, ctx);
      case 'event':
        return handleEventAdmin(interaction, ctx);
      case 'announcement':
        return handleAnnouncementAdmin(interaction, ctx);
    }
    switch (interaction.options.getSubcommand()) {
      case 'link':
        return link(interaction, ctx);
      case 'unlink':
        return unlink(interaction, ctx);
      case 'verification-queue':
        return verificationQueue(interaction, ctx);
      case 'workshop-roster':
        return handleWorkshopAdmin(interaction, ctx);
      default:
        throw new Error(`Unknown /admin subcommand: ${interaction.options.getSubcommand()}`);
    }
  },

  autocomplete,
};

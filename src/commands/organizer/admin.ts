import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { buildVerificationQueueView, statusLabel } from '../../components/embeds/verifyEmbeds.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext, SlashCommand } from '../../interactions/types.js';
import { requireOrganizer } from '../../middleware/permissions.js';
import { roleChangeSucceeded, setParticipantRole } from '../../services/participantRoles.js';
import { postVerificationLog } from '../../services/verificationLog.js';

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
}

async function verificationQueue(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const attempts = await ctx.services.verification.listVerificationQueue(20);
  await interaction.editReply(buildVerificationQueueView(attempts));
}

export const adminCommand: SlashCommand = {
  data: new SlashCommandBuilder()
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
    ),

  async execute(interaction, ctx) {
    if (!(await requireOrganizer(interaction, ctx))) return;
    if (!interaction.inCachedGuild()) throw new UserFacingError('Use this inside the server.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    switch (interaction.options.getSubcommand()) {
      case 'link':
        return link(interaction, ctx);
      case 'unlink':
        return unlink(interaction, ctx);
      case 'verification-queue':
        return verificationQueue(interaction, ctx);
      default:
        throw new Error(`Unknown /admin subcommand: ${interaction.options.getSubcommand()}`);
    }
  },
};

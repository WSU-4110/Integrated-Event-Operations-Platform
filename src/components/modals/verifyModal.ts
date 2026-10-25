import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { z } from 'zod';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext, ComponentHandler } from '../../interactions/types.js';
import { roleChangeSucceeded, setParticipantRole } from '../../services/participantRoles.js';
import { postVerificationLog } from '../../services/verificationLog.js';
import {
  buildAlreadyVerifiedMessage,
  buildVerifiedView,
  buildVerifyModal,
  EMAIL_INPUT_ID,
  Messages,
  VERIFY_NAMESPACE,
} from '../embeds/verifyEmbeds.js';

/**
 * Entry point for `/verify` and the Verify buttons: shows status if already
 * linked, otherwise opens the email form. Runs before any reply, because a
 * modal must be the first response to an interaction.
 */
export async function startVerification(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: BotContext,
): Promise<void> {
  const { verification } = ctx.services;
  const link = await verification.getLink(interaction.user.id);
  if (link) {
    await interaction.reply({
      content: buildAlreadyVerifiedMessage(link),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (await verification.isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: Messages.rateLimited, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(buildVerifyModal());
}

async function submitVerification(
  interaction: ModalSubmitInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    throw new UserFacingError('Please verify from inside the BuilderWars server.');
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const email = interaction.fields.getTextInputValue(EMAIL_INPUT_ID).trim();
  if (!z.email().safeParse(email).success) {
    await interaction.editReply(Messages.invalidEmail);
    return;
  }

  const { user } = interaction;
  const outcome = await ctx.services.verification.verify({
    discordUserId: user.id,
    discordUsername: user.username,
    email,
  });
  // Result only: never the email.
  ctx.logger.info({ userId: user.id, result: outcome.kind }, 'Verification attempt');

  const who = `<@${user.id}> (\`${user.username}\`)`;
  const log = (message: string) => postVerificationLog(interaction.client, ctx, message);

  switch (outcome.kind) {
    case 'verified': {
      const role = await setParticipantRole(
        interaction.guild,
        user.id,
        true,
        ctx,
        `Verified registration #${outcome.link.registrationId}`,
      );
      const roleAssigned = roleChangeSucceeded(role);
      await interaction.editReply(buildVerifiedView({ roleAssigned }));
      await log(
        roleAssigned
          ? `✅ ${who} verified: registration #${outcome.link.registrationId}`
          : `⚠️ ${who} verified (registration #${outcome.link.registrationId}), but I couldn't give them the Participant role. Make sure my role is above Participant; the sync job will retry.`,
      );
      return;
    }
    case 'already_verified':
      await interaction.editReply(buildAlreadyVerifiedMessage(outcome.link));
      return;
    case 'no_match':
      await interaction.editReply(Messages.noMatch(ctx.config.registrationUrl));
      return;
    case 'ineligible':
      await interaction.editReply(Messages.ineligible(outcome.status));
      return;
    case 'rate_limited':
      await interaction.editReply(Messages.rateLimited);
      return;
    case 'ambiguous':
      await interaction.editReply(Messages.needsOrganizer);
      await log(
        `⚠️ ${who} matches several registrations (${outcome.registrationIds.map((id) => `#${id}`).join(', ')}). Link the right one with \`/admin link\`.`,
      );
      return;
    case 'already_linked':
      await interaction.editReply(Messages.needsOrganizer);
      await log(
        `⚠️ ${who} matched registration #${outcome.registrationId}, which is already linked to another Discord account. If this is the real registrant, use \`/admin unlink\` on the other account, then \`/admin link\`.`,
      );
      return;
  }
}

/** `verify:start` (button) and `verify:submit` (modal). */
export const verifyHandler: ComponentHandler = {
  namespace: VERIFY_NAMESPACE,

  async handle(interaction, customId, ctx) {
    if (customId.action === 'start' && interaction.isButton()) {
      await startVerification(interaction, ctx);
    } else if (customId.action === 'submit' && interaction.isModalSubmit()) {
      await submitVerification(interaction, ctx);
    } else {
      throw new Error(`Unexpected verify component: ${interaction.customId}`);
    }
  },
};

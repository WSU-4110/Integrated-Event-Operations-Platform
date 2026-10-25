import { MessageFlags, type RepliableInteraction } from 'discord.js';
import { buildNotVerifiedView, Messages } from '../components/embeds/verifyEmbeds.js';
import type { ParticipantLink } from '../database/schema/index.js';
import type { BotContext, MessageView } from '../interactions/types.js';

/**
 * Gate for participant features (workshops, teams, mentor, check-in,
 * submission). Returns the caller's active link, or replies with how to
 * verify and returns null. Works whether or not the interaction was deferred.
 */
export async function requireVerified(
  interaction: RepliableInteraction,
  ctx: BotContext,
): Promise<ParticipantLink | null> {
  const link = await ctx.services.verification.getLink(interaction.user.id);
  if (link?.active) return link;

  const view: MessageView = link
    ? { embeds: buildNotVerifiedView(Messages.inactive).embeds, components: [] }
    : buildNotVerifiedView();

  if (interaction.deferred || interaction.replied) await interaction.editReply(view);
  else await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
  return null;
}

import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildNotVerifiedView, buildProfileView } from '../../components/embeds/verifyEmbeds.js';
import type { SlashCommand } from '../../interactions/types.js';

export const profileCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('See your linked BuilderWars registration')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { verification } = ctx.services;

    const link = await verification.getLink(interaction.user.id);
    if (!link) {
      await interaction.editReply(buildNotVerifiedView());
      return;
    }
    const registration = await verification.getRegistration(link.registrationId);
    await interaction.editReply(buildProfileView(link, registration));
  },
};

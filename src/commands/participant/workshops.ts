import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildWorkshopListFor } from '../../components/buttons/workshopButtons.js';
import type { SlashCommand } from '../../interactions/types.js';

// Anyone can browse; signing up (the card buttons) requires verification.
export const workshopsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('workshops')
    .setDescription('See upcoming workshops, register, cancel or join a waitlist')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(await buildWorkshopListFor(interaction, ctx));
  },
};

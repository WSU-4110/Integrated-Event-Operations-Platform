import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { startVerification } from '../../components/modals/verifyModal.js';
import type { SlashCommand } from '../../interactions/types.js';

export const verifyCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Link your Discord account to your BuilderWars registration')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, ctx) {
    await startVerification(interaction, ctx);
  },
};

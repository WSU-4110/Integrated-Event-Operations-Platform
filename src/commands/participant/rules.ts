import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildRulesView } from '../../components/embeds/rulesEmbeds.js';
import type { SlashCommand } from '../../interactions/types.js';

export const rulesCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('rules').setDescription('The official hackathon rules'),

  async execute(interaction, ctx) {
    await interaction.reply({
      ...buildRulesView(ctx.content.rules),
      flags: MessageFlags.Ephemeral,
    });
  },
};

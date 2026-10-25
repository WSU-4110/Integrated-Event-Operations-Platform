import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildResourcesView } from '../../components/embeds/resourceEmbeds.js';
import type { SlashCommand } from '../../interactions/types.js';

export const resourcesCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('resources')
    .setDescription('Docs, tools and guides for building your project'),

  async execute(interaction, ctx) {
    await interaction.reply({
      ...buildResourcesView(ctx.content.resources),
      flags: MessageFlags.Ephemeral,
    });
  },
};

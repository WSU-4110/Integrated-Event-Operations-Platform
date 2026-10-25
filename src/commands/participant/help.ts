import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildHelpMenu } from '../../components/embeds/helpEmbeds.js';
import type { SlashCommand } from '../../interactions/types.js';

export const helpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Everything the BuilderWars bot can do for you'),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const link = await ctx.services.verification.getLink(interaction.user.id);
    await interaction.editReply(buildHelpMenu(ctx.content.help, { verified: !!link?.active }));
  },
};

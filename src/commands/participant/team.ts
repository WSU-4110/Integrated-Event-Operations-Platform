import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildTeamPanel } from '../../components/embeds/teamEmbeds.js';
import type { SlashCommand } from '../../interactions/types.js';
import { requireVerified } from '../../middleware/requireVerified.js';

export const teamCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Create a team, see yours, or leave it')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const link = await requireVerified(interaction, ctx);
    if (!link) return;
    await interaction.editReply(buildTeamPanel(await ctx.services.teams.forMember(link)));
  },
};

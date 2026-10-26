import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildNextView } from '../../components/embeds/scheduleEmbeds.js';
import type { SlashCommand } from '../../interactions/types.js';

export const nextCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('next')
    .setDescription("What's coming up next, and what's happening now"),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(buildNextView(await ctx.services.schedule.next()));
  },
};

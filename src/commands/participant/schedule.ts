import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildScheduleFor } from '../../components/buttons/scheduleButtons.js';
import type { SlashCommand } from '../../interactions/types.js';

export const scheduleCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('The event schedule, including workshops'),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(await buildScheduleFor(ctx));
  },
};

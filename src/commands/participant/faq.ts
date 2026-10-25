import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildFaqView } from '../../components/embeds/faqEmbeds.js';
import type { SlashCommand } from '../../interactions/types.js';

export const faqCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('faq').setDescription('Answers to common questions'),

  async execute(interaction, ctx) {
    await interaction.reply({ ...buildFaqView(ctx.content.faqs), flags: MessageFlags.Ephemeral });
  },
};

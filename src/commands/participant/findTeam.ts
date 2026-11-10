import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildFindTeamFor } from '../../components/buttons/teamButtons.js';
import type { SlashCommand } from '../../interactions/types.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { TEAM_LIMITS } from '../../services/teamService.js';

export const findTeamCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('find-team')
    .setDescription('Browse teams with open spots, or list yourself as looking for one')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('skill')
        .setDescription('A skill the team needs')
        .setMaxLength(TEAM_LIMITS.skillLength)
        .setAutocomplete(true),
    )
    .addStringOption((o) =>
      o
        .setName('keyword')
        .setDescription('A word from the team name, project or skills')
        .setMaxLength(TEAM_LIMITS.skillLength),
    )
    .addIntegerOption((o) =>
      o.setName('spots').setDescription('At least this many open spots').setMinValue(1),
    ),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const link = await requireVerified(interaction, ctx);
    if (!link) return;
    await interaction.editReply(
      await buildFindTeamFor(
        link,
        {
          page: 0,
          minSpots: interaction.options.getInteger('spots') ?? 1,
          skill: interaction.options.getString('skill'),
          keyword: interaction.options.getString('keyword'),
        },
        ctx,
      ),
    );
  },

  async autocomplete(interaction, ctx) {
    const typed = interaction.options.getFocused().toLowerCase();
    const { skills } = await ctx.services.teams.listOpen();
    await interaction.respond(
      skills
        .filter((skill) => skill.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((skill) => ({ name: skill, value: skill })),
    );
  },
};

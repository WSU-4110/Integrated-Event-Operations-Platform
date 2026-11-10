import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandSubcommandsOnlyBuilder,
  User,
} from 'discord.js';
import { buildTeamRoster, TeamMessages } from '../../components/embeds/teamEmbeds.js';
import type { ParticipantLink } from '../../database/schema/index.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext } from '../../interactions/types.js';
import { sendDirectMessage } from '../../services/directMessages.js';
import { announceDeparture, announceJoin } from '../../services/teamNotifications.js';
import { removeTeamResources, renameTeamResources } from '../../services/teamResources.js';
import { TEAM_LIMITS } from '../../services/teamService.js';

// /admin team: the organizer override for teams. Size and one-team rules still
// apply; organizers can make room first with `kick`.

type GuildCommand = ChatInputCommandInteraction<'cached'>;

export const TEAM_OPTION = 'team';

export function addTeamAdminCommands(
  builder: SlashCommandSubcommandsOnlyBuilder,
): SlashCommandSubcommandsOnlyBuilder {
  return builder.addSubcommandGroup((group) =>
    group
      .setName('team')
      .setDescription('Teams (organizer override)')
      .addSubcommand((sub) => sub.setName('list').setDescription('All teams and their owners'))
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Put a verified participant on a team')
          .addIntegerOption((o) =>
            o
              .setName(TEAM_OPTION)
              .setDescription('Start typing the name')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('kick')
          .setDescription('Take someone off their team')
          .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('owner')
          .setDescription('Make a team member its owner')
          .addIntegerOption((o) =>
            o
              .setName(TEAM_OPTION)
              .setDescription('Start typing the name')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('rename')
          .setDescription('Rename a team')
          .addIntegerOption((o) =>
            o
              .setName(TEAM_OPTION)
              .setDescription('Start typing the name')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption((o) =>
            o
              .setName('name')
              .setDescription('The new name')
              .setRequired(true)
              .setMaxLength(TEAM_LIMITS.name.max),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('delete')
          .setDescription('Dissolve a team (deletes its role and channel)')
          .addIntegerOption((o) =>
            o
              .setName(TEAM_OPTION)
              .setDescription('Start typing the name')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addBooleanOption((o) =>
            o.setName('confirm').setDescription('Yes, dissolve this team').setRequired(true),
          ),
      ),
  );
}

/** Suggests teams by name; the value is the ID. Organizer-checked by the caller. */
export async function autocompleteTeam(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  const matches = await ctx.services.teams.search(String(interaction.options.getFocused()), 25);
  await interaction.respond(matches.map((team) => ({ name: team.name, value: team.id })));
}

async function activeLink(user: User, ctx: BotContext): Promise<ParticipantLink> {
  const link = await ctx.services.verification.getLink(user.id);
  if (!link) throw new UserFacingError(`<@${user.id}> isn't verified.`);
  if (!link.active) throw new UserFacingError(`<@${user.id}>'s registration isn't active.`);
  return link;
}

async function list(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const { teams } = ctx.services;
  const [all, members] = await Promise.all([teams.listAll(), teams.allMembers()]);
  const owners = new Map<number, string>();
  for (const team of all) {
    const owner = members.find((m) => m.linkId === team.ownerLinkId);
    if (owner) owners.set(team.id, owner.discordUserId);
  }
  await interaction.editReply(buildTeamRoster(all, owners, teams.maxSize));
}

async function add(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const target = await activeLink(user, ctx);
  const teamId = interaction.options.getInteger(TEAM_OPTION, true);
  const outcome = await ctx.services.teams.addMember(teamId, target);
  switch (outcome.kind) {
    case 'not_found':
      throw new UserFacingError(TeamMessages.notFound);
    case 'full':
      throw new UserFacingError('That team is full. Make room with `/admin team kick` first.');
    case 'already_on_team':
      throw new UserFacingError(`<@${user.id}> is already on a team.`);
    case 'added':
      ctx.logger.info({ organizerId: interaction.user.id, userId: user.id, teamId }, 'Team add');
      await interaction.editReply(`✅ Added <@${user.id}> to **${outcome.team.name}**.`);
      await announceJoin(interaction.client, ctx, outcome.team, user.id, {
        userId: user.id,
        message: `✅ An organizer added you to **${outcome.team.name}**.`,
      });
      return;
    default:
      throw new Error(`Unexpected outcome: ${outcome.kind}`);
  }
}

async function kick(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const link = await ctx.services.verification.getLink(user.id);
  const outcome = link ? await ctx.services.teams.leave(link) : ({ kind: 'not_on_team' } as const);
  if (outcome.kind === 'not_on_team') {
    throw new UserFacingError(`<@${user.id}> isn't on a team.`);
  }
  ctx.logger.info(
    { organizerId: interaction.user.id, userId: user.id, teamId: outcome.team.id },
    'Team kick',
  );
  const note = outcome.dissolved
    ? ' They were the last member, so the team was dissolved.'
    : outcome.newOwner
      ? ` <@${outcome.newOwner.discordUserId}> is the new owner.`
      : '';
  await interaction.editReply(`Removed <@${user.id}> from **${outcome.team.name}**.${note}`);
  await announceDeparture(interaction.client, ctx, outcome, user.id);
  await sendDirectMessage(
    interaction.client,
    ctx,
    user.id,
    `An organizer removed you from **${outcome.team.name}**. Questions? Message an organizer.`,
  );
}

async function owner(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const target = await activeLink(user, ctx);
  const teamId = interaction.options.getInteger(TEAM_OPTION, true);
  const outcome = await ctx.services.teams.transferOwnership(teamId, target);
  switch (outcome.kind) {
    case 'not_found':
      throw new UserFacingError(TeamMessages.notFound);
    case 'not_a_member':
      throw new UserFacingError(`<@${user.id}> isn't on that team.`);
    case 'transferred':
      ctx.logger.info({ organizerId: interaction.user.id, userId: user.id, teamId }, 'Team owner');
      await interaction.editReply(`👑 <@${user.id}> now owns **${outcome.team.name}**.`);
      await sendDirectMessage(
        interaction.client,
        ctx,
        user.id,
        `👑 An organizer made you the owner of **${outcome.team.name}**. Manage it with \`/team\`.`,
      );
      return;
    default:
      throw new Error(`Unexpected outcome: ${outcome.kind}`);
  }
}

async function rename(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const teamId = interaction.options.getInteger(TEAM_OPTION, true);
  const outcome = await ctx.services.teams.rename(
    teamId,
    interaction.options.getString('name', true),
  );
  switch (outcome.kind) {
    case 'invalid':
      throw new UserFacingError(outcome.reason);
    case 'name_taken':
      throw new UserFacingError(TeamMessages.nameTaken);
    case 'saved':
      ctx.logger.info({ organizerId: interaction.user.id, teamId }, 'Team renamed');
      await interaction.editReply(`✏️ Renamed the team to **${outcome.team.name}**.`);
      // Not awaited: channel renames can wait minutes on Discord's rate limit.
      void renameTeamResources(interaction.client, ctx, outcome.team);
      return;
    default:
      throw new UserFacingError(TeamMessages.notFound);
  }
}

async function remove(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  if (!interaction.options.getBoolean('confirm', true)) {
    throw new UserFacingError('Nothing changed. Set `confirm` to True to dissolve the team.');
  }
  const teamId = interaction.options.getInteger(TEAM_OPTION, true);
  const removed = await ctx.services.teams.dissolve(teamId);
  if (!removed) throw new UserFacingError(TeamMessages.notFound);

  const { team, members } = removed;
  ctx.logger.info({ organizerId: interaction.user.id, teamId }, 'Team dissolved by organizer');
  const cleaned = await removeTeamResources(interaction.client, ctx, team);
  await interaction.editReply(
    `🗑️ Dissolved **${team.name}** (${members.length} removed).${cleaned ? '' : "\n⚠️ I couldn't delete its role or channel; please remove them by hand."}`,
  );
  for (const member of members) {
    await sendDirectMessage(
      interaction.client,
      ctx,
      member.discordUserId,
      `An organizer dissolved your team, **${team.name}**. Questions? Message an organizer.`,
    );
  }
}

/** Runs /admin team <sub> (already deferred, organizer-checked). */
export async function handleTeamAdmin(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'list':
      return list(interaction, ctx);
    case 'add':
      return add(interaction, ctx);
    case 'kick':
      return kick(interaction, ctx);
    case 'owner':
      return owner(interaction, ctx);
    case 'rename':
      return rename(interaction, ctx);
    case 'delete':
      return remove(interaction, ctx);
    default:
      throw new Error(`Unknown /admin team subcommand: ${sub}`);
  }
}

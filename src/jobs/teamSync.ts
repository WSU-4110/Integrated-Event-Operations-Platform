import { DiscordAPIError, RESTJSONErrorCodes, type Client, type Guild } from 'discord.js';
import type { BotContext } from '../interactions/types.js';
import { describeProvisionProblem, provisionTeam } from '../services/teamResources.js';
import { postVerificationLog } from '../services/verificationLog.js';

export interface TeamSyncSummary {
  provisioned: number;
  failed: number;
  rolesAdded: number;
  rolesRemoved: number;
}

const NOTHING: TeamSyncSummary = { provisioned: 0, failed: 0, rolesAdded: 0, rolesRemoved: 0 };

export function isIdleTeamSync(summary: TeamSyncSummary): boolean {
  return (
    summary.provisioned === 0 &&
    summary.failed === 0 &&
    summary.rolesAdded === 0 &&
    summary.rolesRemoved === 0
  );
}

/** A member by ID (from the cache if possible), or null if they aren't in the server. */
async function fetchMember(guild: Guild, userId: string) {
  try {
    return await guild.members.fetch(userId);
  } catch (err) {
    if (
      err instanceof DiscordAPIError &&
      Number(err.code) === Number(RESTJSONErrorCodes.UnknownMember)
    ) {
      return null;
    }
    throw err;
  }
}

/** Problems already reported, so organizers aren't told again every run. */
const reported = new Set<string>();

/**
 * Repairs Discord from the database when TEAM_CHANNELS_ENABLED is on: creates
 * missing roles and channels (say a set-up failed, or the feature was just
 * turned on), adds the role to members missing it, and takes it from anyone no
 * longer on the team. Does nothing when the feature is off.
 *
 * Reads the member cache rather than asking for every member: Discord rate-limits
 * that gateway request, and the participant sync (which runs first) just made it.
 */
export async function runTeamSync(client: Client, ctx: BotContext): Promise<TeamSyncSummary> {
  if (!ctx.config.teams.channelsEnabled) return NOTHING;

  const { teams } = ctx.services;
  const summary = { ...NOTHING };
  const guild = await client.guilds.fetch(ctx.config.discord.guildId);
  const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);

  const problems = new Set<string>();
  for (const team of await teams.listAll()) {
    const hasRole = !!team.discordRoleId && roles.has(team.discordRoleId);
    const hasChannel = !!team.discordChannelId && channels.has(team.discordChannelId);
    if (hasRole && hasChannel) continue;

    const result = await provisionTeam(client, ctx, team.id);
    if (result === 'ok') summary.provisioned++;
    const problem = describeProvisionProblem(result, team.name);
    if (problem) {
      summary.failed++;
      problems.add(problem);
    }
  }

  // Re-read: provisioning may have just added roles.
  const current = await teams.listAll();
  const membership = await teams.allMembers();
  for (const team of current) {
    if (!team.discordRoleId) continue;
    const roleId = team.discordRoleId;
    const expected = new Set(
      membership.filter((m) => m.teamId === team.id).map((m) => m.discordUserId),
    );
    const onError = (err: unknown, userId: string) => {
      summary.failed++;
      ctx.logger.error({ err, userId, teamId: team.id }, 'Could not sync team role');
    };

    for (const userId of expected) {
      try {
        const member = await fetchMember(guild, userId);
        if (member && !member.roles.cache.has(roleId)) {
          await member.roles.add(roleId, 'On this team');
          summary.rolesAdded++;
        }
      } catch (err) {
        onError(err, userId);
      }
    }
    for (const member of guild.members.cache.values()) {
      if (!member.roles.cache.has(roleId) || expected.has(member.id)) continue;
      try {
        await member.roles.remove(roleId, 'No longer on this team');
        summary.rolesRemoved++;
      } catch (err) {
        onError(err, member.id);
      }
    }
  }

  for (const problem of problems) {
    if (!reported.has(problem)) await postVerificationLog(client, ctx, problem);
  }
  reported.clear();
  for (const problem of problems) reported.add(problem);
  return summary;
}

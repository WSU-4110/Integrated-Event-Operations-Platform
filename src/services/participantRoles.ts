import { DiscordAPIError, RESTJSONErrorCodes, type Guild, type GuildMember } from 'discord.js';
import type { BotContext } from '../interactions/types.js';

export type RoleChangeResult = 'changed' | 'unchanged' | 'not_in_guild' | 'failed';

type RoleContext = Pick<BotContext, 'config' | 'logger'>;

export function roleChangeSucceeded(result: RoleChangeResult): boolean {
  return result === 'changed' || result === 'unchanged';
}

/** Adds or removes the Participant role on a member already fetched. */
export async function applyParticipantRole(
  member: GuildMember,
  give: boolean,
  ctx: RoleContext,
  reason: string,
): Promise<RoleChangeResult> {
  const roleId = ctx.config.roles.participantRoleId;
  if (member.roles.cache.has(roleId) === give) return 'unchanged';
  try {
    if (give) await member.roles.add(roleId, reason);
    else await member.roles.remove(roleId, reason);
    return 'changed';
  } catch (err) {
    // Usually Missing Permissions: the bot's role must sit above Participant.
    ctx.logger.error({ err, userId: member.id, give }, 'Could not change Participant role');
    return 'failed';
  }
}

/** Adds or removes the Participant role by user ID. */
export async function setParticipantRole(
  guild: Guild,
  userId: string,
  give: boolean,
  ctx: RoleContext,
  reason: string,
): Promise<RoleChangeResult> {
  let member: GuildMember;
  try {
    member = await guild.members.fetch(userId);
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownMember) {
      return 'not_in_guild';
    }
    ctx.logger.error({ err, userId }, 'Could not fetch member');
    return 'failed';
  }
  return applyParticipantRole(member, give, ctx, reason);
}

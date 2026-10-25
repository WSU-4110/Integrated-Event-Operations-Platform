import type { Client } from 'discord.js';
import type { BotContext } from '../interactions/types.js';
import { statusLabel } from '../components/embeds/verifyEmbeds.js';
import { applyParticipantRole } from '../services/participantRoles.js';
import { postVerificationLog } from '../services/verificationLog.js';

export interface ParticipantSyncSummary {
  deactivated: number;
  reactivated: number;
  rolesAdded: number;
  rolesRemoved: number;
  roleFailures: number;
}

/**
 * Keeps Discord in step with the website:
 * - registrations that became waitlisted/declined/deleted lose the Participant role
 * - every active link has the Participant role (restores it if removed by mistake)
 */
export async function runParticipantSync(
  client: Client,
  ctx: BotContext,
): Promise<ParticipantSyncSummary> {
  const result = await ctx.services.verification.syncLinkStatuses();
  const guild = await client.guilds.fetch(ctx.config.discord.guildId);
  const members = await guild.members.fetch(); // needs the GuildMembers intent

  const summary: ParticipantSyncSummary = {
    deactivated: result.deactivated.length,
    reactivated: result.reactivated.length,
    rolesAdded: 0,
    rolesRemoved: 0,
    roleFailures: 0,
  };

  for (const link of result.deactivated) {
    const member = members.get(link.discordUserId);
    const change = member
      ? await applyParticipantRole(member, false, ctx, `Registration is ${link.status}`)
      : 'not_in_guild';
    if (change === 'changed') summary.rolesRemoved++;
    if (change === 'failed') summary.roleFailures++;
    await postVerificationLog(
      client,
      ctx,
      `🔻 <@${link.discordUserId}>'s registration #${link.registrationId} is now ${link.status === 'deleted' ? 'deleted' : statusLabel(link.status)}. Participant access paused${change === 'failed' ? ", but I couldn't remove the role; please remove it by hand" : ''}.`,
    );
  }

  for (const link of result.active) {
    const member = members.get(link.discordUserId);
    if (!member) continue;
    const change = await applyParticipantRole(member, true, ctx, 'Active registration');
    if (change === 'changed') summary.rolesAdded++;
    if (change === 'failed') summary.roleFailures++;
  }

  for (const link of result.reactivated) {
    await postVerificationLog(
      client,
      ctx,
      `🔺 <@${link.discordUserId}>'s registration #${link.registrationId} is active again. Participant access restored.`,
    );
  }

  return summary;
}

import type { Client } from 'discord.js';
import type { Team } from '../database/schema/index.js';
import type { BotContext } from '../interactions/types.js';
import { sendDirectMessage } from './directMessages.js';
import { postToTeamChannel, removeTeamResources, setTeamRole } from './teamResources.js';
import type { LeaveOutcome } from './teamService.js';
import { postVerificationLog } from './verificationLog.js';

// What follows a team change on Discord: roles, the team channel and DMs. The
// change is already saved, so none of this can fail the action.

type LeftOutcome = Extract<LeaveOutcome, { kind: 'left' }>;

/** Someone just joined: role, a hello in the team channel, and a DM. */
export async function announceJoin(
  client: Client,
  ctx: BotContext,
  team: Team,
  joinerId: string,
  dm: { userId: string; message: string } | null,
): Promise<void> {
  await setTeamRole(client, ctx, team, joinerId, true);
  await postToTeamChannel(client, ctx, team, {
    content: `👋 <@${joinerId}> joined the team!`,
    allowedMentions: { users: [joinerId] },
  });
  if (dm) await sendDirectMessage(client, ctx, dm.userId, dm.message);
}

/**
 * Someone is off a team: their role, then a dissolved team's role and channel,
 * or a note to the new owner. Returns false if a dissolved team's Discord
 * leftovers couldn't be removed.
 */
export async function announceDeparture(
  client: Client,
  ctx: BotContext,
  outcome: LeftOutcome,
  userId: string,
): Promise<boolean> {
  const { team, newOwner } = outcome;
  if (outcome.dissolved) {
    const removed = await removeTeamResources(client, ctx, team);
    if (!removed) {
      await postVerificationLog(
        client,
        ctx,
        `⚠️ Team **${team.name}** was dissolved, but I couldn't delete its role or channel. Please remove them by hand.`,
      );
    }
    return removed;
  }

  await setTeamRole(client, ctx, team, userId, false);
  await postToTeamChannel(client, ctx, team, {
    content: newOwner
      ? `<@${userId}> left the team. <@${newOwner.discordUserId}> is the new owner.`
      : `<@${userId}> left the team.`,
    allowedMentions: { users: newOwner ? [newOwner.discordUserId] : [] },
  });
  if (newOwner) {
    await sendDirectMessage(
      client,
      ctx,
      newOwner.discordUserId,
      `👑 You're now the owner of **${team.name}**. Manage it with \`/team\`.`,
    );
  }
  return true;
}

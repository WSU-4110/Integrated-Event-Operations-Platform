import {
  DiscordAPIError,
  Events,
  RESTJSONErrorCodes,
  type Client,
  type GuildMember,
} from 'discord.js';
import type { BotContext } from '../interactions/types.js';
import { applyParticipantRole } from '../services/participantRoles.js';

export const WelcomeMessages = {
  returning:
    "👋 Welcome back to **BuilderWars**! You're still verified, so your Participant role is restored.",
  likelyMatch:
    '👋 Welcome to **BuilderWars**! It looks like you registered on the website. Run `/verify` in the server and enter your registration email to unlock workshops, teams and mentor help.',
  unregistered: (registrationUrl: string) =>
    `👋 Welcome to **BuilderWars**! To take part, register at ${registrationUrl} using your Discord username, then run \`/verify\` in the server.`,
};

/**
 * Onboarding for new members. A username match alone never grants access:
 * it only changes which welcome DM is sent. Members who were already linked
 * (rejoining) get their role back.
 */
export async function onMemberJoin(member: GuildMember, ctx: BotContext): Promise<void> {
  if (member.user.bot || member.guild.id !== ctx.config.discord.guildId) return;
  const { verification } = ctx.services;

  const link = await verification.getLink(member.id);
  let message: string;
  if (link?.active) {
    await applyParticipantRole(member, true, ctx, 'Rejoined; already verified');
    message = WelcomeMessages.returning;
  } else if (await verification.hasLikelyRegistration(member.user.username)) {
    message = WelcomeMessages.likelyMatch;
  } else {
    message = WelcomeMessages.unregistered(ctx.config.registrationUrl);
  }

  try {
    await member.send(message);
  } catch (err) {
    if (
      err instanceof DiscordAPIError &&
      err.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser
    ) {
      ctx.logger.debug({ userId: member.id }, 'Welcome DM not delivered (DMs closed)');
      return;
    }
    throw err;
  }
}

export function registerGuildMemberAdd(client: Client, ctx: BotContext): void {
  client.on(Events.GuildMemberAdd, (member) => {
    onMemberJoin(member, ctx).catch((err: unknown) =>
      ctx.logger.error({ err, userId: member.id }, 'Member onboarding failed'),
    );
  });
}

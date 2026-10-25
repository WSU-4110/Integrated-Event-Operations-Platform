import type { Client } from 'discord.js';
import type { BotContext } from '../interactions/types.js';

/**
 * Posts to the organizer-only verification log channel. Mentions render but
 * never ping. Failures are logged, never thrown: the log is a convenience,
 * not part of the user's request.
 */
export async function postVerificationLog(
  client: Client,
  ctx: Pick<BotContext, 'config' | 'logger'>,
  content: string,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(ctx.config.channels.verificationLogId);
    if (!channel?.isSendable()) {
      ctx.logger.warn('VERIFICATION_LOG_CHANNEL_ID is not a channel the bot can post in');
      return;
    }
    await channel.send({ content, allowedMentions: { parse: [] } });
  } catch (err) {
    ctx.logger.warn({ err }, 'Could not post to the verification log');
  }
}

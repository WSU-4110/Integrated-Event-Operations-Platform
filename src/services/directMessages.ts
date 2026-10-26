import type { Client, MessageCreateOptions } from 'discord.js';
import type { BotContext } from '../interactions/types.js';

/**
 * DMs a user. Returns false instead of throwing when it fails, which is
 * common (DMs closed, user left): a DM is a courtesy on top of an action
 * that already happened.
 */
export async function sendDirectMessage(
  client: Client,
  ctx: Pick<BotContext, 'logger'>,
  userId: string,
  message: string | MessageCreateOptions,
): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    await user.send(message);
    return true;
  } catch (err) {
    ctx.logger.info({ userId, reason: (err as Error).message }, 'Could not send DM');
    return false;
  }
}

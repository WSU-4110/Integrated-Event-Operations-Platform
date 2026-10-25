import { Events, type Client } from 'discord.js';
import type { InteractionRouter } from '../interactions/router.js';
import type { BotContext } from '../interactions/types.js';

export function registerInteractionCreate(
  client: Client,
  ctx: BotContext,
  router: InteractionRouter,
): void {
  client.on(Events.InteractionCreate, (interaction) => {
    // The router handles its own errors; this only catches bugs in the router itself.
    router.handle(interaction).catch((err: unknown) => {
      ctx.logger.error({ err }, 'Unhandled error in interaction router');
    });
  });
}

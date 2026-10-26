import { DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import {
  buildRemovedCard,
  buildWorkshopCard,
  WorkshopMessages,
} from '../components/embeds/workshopEmbeds.js';
import type { Workshop } from '../database/schema/index.js';
import type { BotContext, MessageView } from '../interactions/types.js';
import { sendDirectMessage } from './directMessages.js';
import type { Promotion } from './workshopService.js';

// Discord side effects of workshop changes. Like the verification log,
// failures are logged and never thrown: the database change already happened.

const GONE = new Set<number>([
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.UnknownChannel,
]);

/** Edits a posted card. 'gone' means the message or channel was deleted. */
async function editPostedCard(
  client: Client,
  ctx: BotContext,
  workshop: Workshop,
  view: MessageView,
): Promise<'edited' | 'gone' | 'failed' | 'not_posted'> {
  if (!workshop.channelId || !workshop.messageId) return 'not_posted';
  try {
    const channel = await client.channels.fetch(workshop.channelId);
    if (!channel?.isTextBased()) return 'gone';
    await channel.messages.edit(workshop.messageId, view);
    return 'edited';
  } catch (err) {
    if (err instanceof DiscordAPIError && GONE.has(Number(err.code))) return 'gone';
    ctx.logger.warn({ err, workshopId: workshop.id }, 'Could not update workshop card');
    return 'failed';
  }
}

/**
 * Updates the posted card's counts. Pass `skipMessageId` when the card was
 * already updated as the interaction's own message.
 */
export async function refreshWorkshopCard(
  client: Client,
  ctx: BotContext,
  workshopId: number,
  { skipMessageId }: { skipMessageId?: string } = {},
): Promise<void> {
  const { workshops } = ctx.services;
  try {
    const workshop = await workshops.get(workshopId);
    if (!workshop || workshop.messageId === skipMessageId) return;
    const view = buildWorkshopCard(workshop, { started: workshops.hasStarted(workshop) });
    if ((await editPostedCard(client, ctx, workshop, view)) === 'gone') {
      // Someone deleted the card; stop trying to update it.
      await workshops.setPost(workshopId, null);
    }
  } catch (err) {
    ctx.logger.warn({ err, workshopId }, 'Could not refresh workshop card');
  }
}

/** Marks a removed workshop's posted card as cancelled. */
export async function markCardRemoved(
  client: Client,
  ctx: BotContext,
  workshop: Workshop,
): Promise<void> {
  await editPostedCard(client, ctx, workshop, buildRemovedCard(workshop));
}

/** DMs everyone promoted off a waitlist. */
export async function announcePromotions(
  client: Client,
  ctx: BotContext,
  promotions: readonly Promotion[],
): Promise<void> {
  for (const { workshopId, discordUserId } of promotions) {
    ctx.logger.info({ workshopId, userId: discordUserId }, 'Promoted from workshop waitlist');
    try {
      const workshop = await ctx.services.workshops.get(workshopId);
      if (workshop) {
        await sendDirectMessage(client, ctx, discordUserId, WorkshopMessages.promotedDm(workshop));
      }
    } catch (err) {
      ctx.logger.warn({ err, workshopId, userId: discordUserId }, 'Could not announce promotion');
    }
  }
}

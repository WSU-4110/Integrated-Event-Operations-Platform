import { MessageFlags, type ButtonInteraction, type RepliableInteraction } from 'discord.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext, ComponentHandler, MessageView } from '../../interactions/types.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { announcePromotions, refreshWorkshopCard } from '../../services/workshopNotifications.js';
import {
  buildFullView,
  buildWorkshopCard,
  buildWorkshopList,
  WORKSHOP_NAMESPACE,
  WorkshopMessages,
  type WorkshopAction,
} from '../embeds/workshopEmbeds.js';

/** The /workshops list for this user (their own statuses included). */
export async function buildWorkshopListFor(
  interaction: RepliableInteraction,
  ctx: BotContext,
): Promise<MessageView> {
  const { verification, workshops } = ctx.services;
  const [list, link] = await Promise.all([
    workshops.listUpcoming(),
    verification.getLink(interaction.user.id),
  ]);
  const verified = !!link?.active;
  return buildWorkshopList(list, {
    statuses: verified && link ? await workshops.statusesFor(link) : new Map(),
    verified,
    timeZone: ctx.config.eventTimeZone,
  });
}

function parseWorkshopId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Bad workshop ID: ${raw}`);
  return id;
}

/**
 * Register / Cancel / Join Waitlist. The reply is always private; the
 * message the button is on gets fresh counts (a card) or the result (the
 * "it's full" message), and the posted public card is refreshed too.
 */
async function handleSignup(
  interaction: ButtonInteraction,
  action: WorkshopAction,
  workshopId: number,
  ctx: BotContext,
): Promise<void> {
  const link = await requireVerified(interaction, ctx);
  if (!link) return;
  await interaction.deferUpdate();

  const { workshops } = ctx.services;
  let reply: string | MessageView;
  let promoted: Parameters<typeof announcePromotions>[2] = [];

  if (action === 'cancel') {
    const outcome = await workshops.cancel(workshopId, link);
    switch (outcome.kind) {
      case 'not_found':
        throw new UserFacingError(WorkshopMessages.notFound);
      case 'cancelled':
        reply = WorkshopMessages.cancelled(outcome.workshop);
        promoted = outcome.promoted;
        break;
      case 'left_waitlist':
        reply = WorkshopMessages.leftWaitlist(outcome.workshop);
        break;
      case 'not_registered':
        reply = WorkshopMessages.notRegistered(outcome.workshop);
        break;
      case 'started':
        reply = WorkshopMessages.started(outcome.workshop);
        break;
    }
  } else {
    const outcome = await workshops.register(workshopId, link, {
      joinWaitlist: action === 'waitlist',
    });
    switch (outcome.kind) {
      case 'not_found':
        throw new UserFacingError(WorkshopMessages.notFound);
      case 'registered':
        reply = WorkshopMessages.registered(outcome.workshop);
        break;
      case 'full':
        reply = buildFullView(outcome.workshop);
        break;
      case 'waitlisted':
        reply = WorkshopMessages.waitlisted(outcome.workshop, outcome.position);
        break;
      case 'already_registered':
        reply = WorkshopMessages.alreadyRegistered(outcome.workshop);
        break;
      case 'already_waitlisted':
        reply = WorkshopMessages.alreadyWaitlisted(outcome.workshop, outcome.position);
        break;
      case 'started':
        reply = WorkshopMessages.started(outcome.workshop);
        break;
    }
  }
  const payload =
    typeof reply === 'string' ? { content: reply, embeds: [], components: [] } : reply;

  if (action === 'waitlist') {
    // The button is on the private "it's full" message: replace it with the result.
    await interaction.editReply(payload);
  } else {
    const workshop = await workshops.get(workshopId);
    if (workshop) {
      const withBack = interaction.message.flags.has(MessageFlags.Ephemeral);
      const started = workshops.hasStarted(workshop);
      await interaction.editReply(buildWorkshopCard(workshop, { started, withBack }));
    }
    await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  }

  await refreshWorkshopCard(interaction.client, ctx, workshopId, {
    skipMessageId: action === 'waitlist' ? undefined : interaction.message.id,
  });
  await announcePromotions(interaction.client, ctx, promoted);
}

/**
 * `workshop:register|cancel|waitlist:<id>` buttons, the `workshop:view`
 * menu and the `workshop:list` back button.
 */
export const workshopButtons: ComponentHandler = {
  namespace: WORKSHOP_NAMESPACE,

  async handle(interaction, customId, ctx) {
    const { action } = customId;

    if (action === 'view' && interaction.isStringSelectMenu()) {
      const workshop = await ctx.services.workshops.get(parseWorkshopId(interaction.values[0]));
      if (!workshop) throw new UserFacingError(WorkshopMessages.notFound);
      const started = ctx.services.workshops.hasStarted(workshop);
      await interaction.update(buildWorkshopCard(workshop, { started, withBack: true }));
      return;
    }

    if (action === 'list' && interaction.isButton()) {
      await interaction.update(await buildWorkshopListFor(interaction, ctx));
      return;
    }

    if (
      (action === 'register' || action === 'cancel' || action === 'waitlist') &&
      interaction.isButton()
    ) {
      await handleSignup(interaction, action, parseWorkshopId(customId.args[0]), ctx);
      return;
    }

    throw new Error(`Unexpected workshop component: ${interaction.customId}`);
  },
};

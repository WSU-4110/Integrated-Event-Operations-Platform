import { MessageFlags } from 'discord.js';
import type { BotContext, ComponentHandler, MessageView } from '../../interactions/types.js';
import { buildHelpSection } from '../embeds/helpEmbeds.js';
import { buildScheduleView, SCHEDULE_NAMESPACE } from '../embeds/scheduleEmbeds.js';

/**
 * The live schedule. Until organizers add the first event, it's the
 * built-in schedule from the help content instead.
 */
export async function buildScheduleFor(ctx: BotContext): Promise<MessageView> {
  const { schedule } = ctx.services;
  const { upcoming, hasEvents } = await schedule.snapshot();
  if (!hasEvents) return buildHelpSection(ctx.content.help, 'schedule');
  return buildScheduleView(upcoming, { now: schedule.now(), timeZone: ctx.config.eventTimeZone });
}

/** The `schedule:view` button under /next. */
export const scheduleButtons: ComponentHandler = {
  namespace: SCHEDULE_NAMESPACE,

  async handle(interaction, customId, ctx) {
    if (customId.action !== 'view') {
      throw new Error(`Unexpected schedule component: ${interaction.customId}`);
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(await buildScheduleFor(ctx));
  },
};

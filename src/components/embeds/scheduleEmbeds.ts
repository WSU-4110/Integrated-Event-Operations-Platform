import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { ScheduleItem } from '../../database/repositories/eventRepository.js';
import type { EventType } from '../../database/schema/index.js';
import type { MessageView } from '../../interactions/types.js';
import { isHappening } from '../../services/scheduleService.js';
import { buildCustomId } from '../../utils/customId.js';
import { discordTimestamp } from '../../utils/time.js';
import { Colors, EMBED_DESCRIPTION_LIMIT, EMBED_TOTAL_LIMIT } from './theme.js';

export const SCHEDULE_NAMESPACE = 'schedule';
export const SCHEDULE_VIEW_ID = buildCustomId(SCHEDULE_NAMESPACE, 'view');

export const EVENT_TYPE_STYLES: Record<EventType, { label: string; emoji: string }> = {
  GENERAL: { label: 'General', emoji: '📌' },
  WORKSHOP: { label: 'Workshop', emoji: '🛠️' },
  MENTOR: { label: 'Mentoring', emoji: '🧑‍🏫' },
  FOOD: { label: 'Food', emoji: '🍕' },
  DEADLINE: { label: 'Deadline', emoji: '⏰' },
  JUDGING: { label: 'Judging', emoji: '🏆' },
};

const SCHEDULE_TITLE = '📅 Schedule';
const SCHEDULE_FOOTER = 'Times are in your time zone · Sign up for workshops with /workshops';

function timeRange(item: Pick<ScheduleItem, 'startTime' | 'endTime'>): string {
  const start = discordTimestamp(item.startTime, 't');
  return item.endTime ? `${start} – ${discordTimestamp(item.endTime, 't')}` : start;
}

export function scheduleLine(item: ScheduleItem, now: Date): string {
  const where = item.location ? ` · ${item.location}` : '';
  const live = isHappening(item, now) ? ' · 🔴 **Now**' : '';
  return `${timeRange(item)} · ${EVENT_TYPE_STYLES[item.type].emoji} **${item.name}**${where}${live}`;
}

/** "Saturday, November 14" in the event's time zone, where the event happens. */
function dayLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * The /schedule view: upcoming items grouped by day. Long schedules spill
 * into a second embed, and anything past Discord's 6000-character message
 * limit is summarized as "…and N more".
 */
export function buildScheduleView(
  items: readonly ScheduleItem[],
  options: { now: Date; timeZone: string },
): MessageView {
  if (items.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.schedule)
          .setTitle(SCHEDULE_TITLE)
          .setDescription('Nothing else is on the schedule.'),
      ],
      components: [],
    };
  }

  const descriptions = [''];
  // Room for the title, footer and the "…and N more" note.
  const budget = EMBED_TOTAL_LIMIT - SCHEDULE_TITLE.length - SCHEDULE_FOOTER.length - 100;
  let used = 0;
  let shown = 0;
  const append = (text: string) => {
    const current = descriptions.at(-1)!;
    if (current.length + text.length > EMBED_DESCRIPTION_LIMIT) descriptions.push(text.trimStart());
    else descriptions[descriptions.length - 1] = current + text;
    used += text.length;
  };

  let day: string | null = null;
  for (const item of items) {
    const label = dayLabel(item.startTime, options.timeZone);
    const header = label === day ? '' : `${day === null ? '' : '\n\n'}**${label}**`;
    const line = `\n${scheduleLine(item, options.now)}`;
    if (used + header.length + line.length > budget) break;
    if (header) append(header);
    append(line);
    day = label;
    shown++;
  }
  if (shown < items.length) append(`\n\n*…and ${items.length - shown} more.*`);

  const embeds = descriptions.map((description) =>
    new EmbedBuilder().setColor(Colors.schedule).setDescription(description),
  );
  embeds[0]!.setTitle(SCHEDULE_TITLE);
  embeds.at(-1)!.setFooter({ text: SCHEDULE_FOOTER });
  return { embeds, components: [] };
}

const HAPPENING_SHOWN = 5;

/** The /next view: what starts next, what's on right now, and a schedule button. */
export function buildNextView({
  next,
  happening,
}: {
  next: ScheduleItem | null;
  happening: readonly ScheduleItem[];
}): MessageView {
  const embed = new EmbedBuilder().setColor(Colors.schedule);
  if (next) {
    const style = EVENT_TYPE_STYLES[next.type];
    embed.setTitle(`⏭️ Next: ${style.emoji} ${next.name}`).addFields({
      name: '🕒 Starts',
      value: `${discordTimestamp(next.startTime, 'R')}\n${discordTimestamp(next.startTime, 'F')}${next.endTime ? ` – ${discordTimestamp(next.endTime, 't')}` : ''}`,
      inline: true,
    });
    if (next.location) embed.addFields({ name: '📍 Where', value: next.location, inline: true });
    if (next.description) embed.setDescription(next.description);
    if (next.source === 'workshop') {
      embed.addFields({ name: '🎟️ Signups', value: 'Register with `/workshops`.' });
    }
  } else {
    embed.setTitle('⏭️ Next').setDescription('Nothing else is scheduled.');
  }

  if (happening.length > 0) {
    const lines = happening.slice(0, HAPPENING_SHOWN).map((item) => {
      const where = item.location ? ` · ${item.location}` : '';
      const until = item.endTime ? ` · until ${discordTimestamp(item.endTime, 't')}` : '';
      return `${EVENT_TYPE_STYLES[item.type].emoji} **${item.name}**${where}${until}`;
    });
    if (happening.length > HAPPENING_SHOWN) {
      lines.push(`…and ${happening.length - HAPPENING_SHOWN} more`);
    }
    embed.addFields({ name: '🔴 Happening now', value: lines.join('\n').slice(0, 1024) });
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(SCHEDULE_VIEW_ID)
          .setLabel('View Schedule')
          .setEmoji('📅')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

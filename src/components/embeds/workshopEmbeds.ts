import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { WorkshopWithCounts } from '../../database/repositories/workshopRepository.js';
import type { Workshop, WorkshopRegistrationStatus } from '../../database/schema/index.js';
import type { MessageView } from '../../interactions/types.js';
import { buildCustomId } from '../../utils/customId.js';
import { discordTimestamp } from '../../utils/time.js';
import { Colors } from './theme.js';

export const WORKSHOP_NAMESPACE = 'workshop';
export const WORKSHOP_SELECT_ID = buildCustomId(WORKSHOP_NAMESPACE, 'view');
export const WORKSHOP_LIST_ID = buildCustomId(WORKSHOP_NAMESPACE, 'list');
export const SELECT_OPTIONS_LIMIT = 25;

export type WorkshopAction = 'register' | 'cancel' | 'waitlist';

export function workshopButtonId(action: WorkshopAction, workshopId: number): string {
  return buildCustomId(WORKSHOP_NAMESPACE, action, workshopId);
}

const when = (w: Workshop) => `${discordTimestamp(w.startTime, 'F')}`;
const bold = (w: Workshop) => `**${w.name}**`;

export const WorkshopMessages = {
  registered: (w: Workshop) =>
    `✅ You're registered for ${bold(w)}, ${when(w)} in ${w.location}.\nCan't make it? Press **Cancel Registration** so someone on the waitlist gets your spot.`,
  full: (w: Workshop) =>
    `${bold(w)} is full. Join the waitlist and you'll get the next open spot automatically; I'll DM you if that happens.`,
  waitlisted: (w: Workshop, position: number) =>
    `⏳ You're **#${position}** on the waitlist for ${bold(w)}. If a spot opens, you'll be registered automatically and I'll DM you.`,
  alreadyRegistered: (w: Workshop) => `You're already registered for ${bold(w)} (${when(w)}).`,
  alreadyWaitlisted: (w: Workshop, position: number) =>
    `You're already **#${position}** on the waitlist for ${bold(w)}.`,
  started: (w: Workshop) =>
    `${bold(w)} has already started, so signups and cancellations are closed.`,
  cancelled: (w: Workshop) => `Your registration for ${bold(w)} is cancelled.`,
  leftWaitlist: (w: Workshop) => `You've left the waitlist for ${bold(w)}.`,
  notRegistered: (w: Workshop) => `You aren't signed up for ${bold(w)}.`,
  notFound: 'This workshop no longer exists. Run `/workshops` to see the current list.',
  promotedDm: (w: Workshop) =>
    `🎉 A spot opened up in ${bold(w)}, so you're now registered! It starts ${when(w)} (${discordTimestamp(w.startTime, 'R')}) in ${w.location}.\nCan't make it anymore? Cancel from \`/workshops\` so the next person gets the spot.`,
  removedDm: (w: Workshop) =>
    `${bold(w)} (${when(w)}) was cancelled by the organizers, so your signup was removed. Sorry about that! Check \`/workshops\` for other sessions.`,
} as const;

function spotsText(w: WorkshopWithCounts): string {
  const remaining = Math.max(0, w.capacity - w.registered);
  const line = `${w.registered} / ${w.capacity} registered`;
  if (remaining > 0) return `${line}\n${remaining} spot${remaining === 1 ? '' : 's'} remaining`;
  return `${line}\n**Full**${w.waitlisted > 0 ? ` · ${w.waitlisted} on the waitlist` : ' · join the waitlist'}`;
}

/**
 * A workshop's card. The same view is used for the public card posted by
 * organizers (buttons work after restarts: all state is in the custom IDs)
 * and the private one opened from /workshops (`withBack`). It never shows
 * anything about the person looking at it.
 */
export function buildWorkshopCard(
  w: WorkshopWithCounts,
  options: { started: boolean; withBack?: boolean },
): MessageView {
  const embed = new EmbedBuilder()
    .setColor(options.started ? Colors.muted : Colors.workshops)
    .setTitle(`🛠️ ${w.name}`)
    .addFields(
      {
        name: '🕒 When',
        value: `${when(w)} – ${discordTimestamp(w.endTime, 't')}\n${discordTimestamp(w.startTime, 'R')}`,
        inline: true,
      },
      { name: '📍 Where', value: w.location, inline: true },
    )
    .setFooter({ text: `Workshop #${w.id}` });
  if (w.description) embed.setDescription(w.description);
  if (w.speaker) embed.addFields({ name: '🎤 Speaker', value: w.speaker, inline: true });
  embed.addFields({
    name: '🎟️ Spots',
    value: options.started ? `${w.registered} registered\nSignups are closed` : spotsText(w),
  });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(workshopButtonId('register', w.id))
      .setLabel('Register')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(options.started),
    new ButtonBuilder()
      .setCustomId(workshopButtonId('cancel', w.id))
      .setLabel('Cancel Registration')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(options.started),
  );
  if (options.withBack) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(WORKSHOP_LIST_ID)
        .setLabel('All workshops')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return { embeds: [embed], components: [row] };
}

/** Replaces a posted card once the workshop is removed. */
export function buildRemovedCard(w: Workshop): MessageView {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.muted)
        .setTitle(`🛠️ ${w.name}`)
        .setDescription('This workshop was cancelled.'),
    ],
    components: [],
  };
}

/** The "it's full" reply, with a button to join the waitlist. */
export function buildFullView(w: Workshop): MessageView {
  return {
    embeds: [new EmbedBuilder().setColor(Colors.warning).setDescription(WorkshopMessages.full(w))],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(workshopButtonId('waitlist', w.id))
          .setLabel('Join Waitlist')
          .setEmoji('⏳')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

const STATUS_BADGES: Record<WorkshopRegistrationStatus, string> = {
  REGISTERED: "✅ You're registered",
  WAITLISTED: "⏳ You're on the waitlist",
  CANCELLED: '',
};

/** Short local time for places Discord timestamps don't render (menu options). */
export function shortEventTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * The private /workshops list: one line per workshop with the viewer's own
 * status, and a menu to open a workshop's card.
 */
export function buildWorkshopList(
  list: readonly WorkshopWithCounts[],
  options: {
    statuses: ReadonlyMap<number, WorkshopRegistrationStatus>;
    verified: boolean;
    timeZone: string;
  },
): MessageView {
  const embed = new EmbedBuilder().setColor(Colors.workshops).setTitle('🛠️ Workshops');
  if (list.length === 0) {
    embed.setDescription('No upcoming workshops yet. Check back soon!');
    return { embeds: [embed], components: [] };
  }

  const shown = list.slice(0, SELECT_OPTIONS_LIMIT);
  embed.setDescription(
    shown
      .map((w) => {
        const spots =
          w.registered >= w.capacity
            ? `Full${w.waitlisted > 0 ? ` (${w.waitlisted} waiting)` : ''}`
            : `${w.capacity - w.registered} of ${w.capacity} spots left`;
        const badge = STATUS_BADGES[options.statuses.get(w.id) ?? 'CANCELLED'];
        return `**${w.name}**\n${discordTimestamp(w.startTime, 'f')} · ${w.location} · ${spots}${badge ? `\n${badge}` : ''}`;
      })
      .join('\n\n'),
  );
  embed.setFooter({
    text: options.verified
      ? 'Pick a workshop below to register, cancel or join the waitlist.'
      : 'Verify with /verify to sign up for workshops.',
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(WORKSHOP_SELECT_ID)
    .setPlaceholder('Choose a workshop…')
    .addOptions(
      shown.map((w) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(w.name.slice(0, 100))
          .setDescription(
            `${shortEventTime(w.startTime, options.timeZone)} · ${w.location}`.slice(0, 100),
          )
          .setValue(String(w.id)),
      ),
    );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)],
  };
}

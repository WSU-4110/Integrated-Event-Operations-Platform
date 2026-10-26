import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuOptionBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
} from 'discord.js';
import {
  ANNOUNCEMENT_TYPES,
  type Announcement,
  type AnnouncementStatus,
  type AnnouncementType,
} from '../../database/schema/index.js';
import type { MessageView } from '../../interactions/types.js';
import { buildCustomId } from '../../utils/customId.js';
import { discordTimestamp, formatEventTime } from '../../utils/time.js';
import { Colors, EMBED_DESCRIPTION_LIMIT } from './theme.js';

export const ANNOUNCE_NAMESPACE = 'announce';

/** Custom IDs of the modal's fields. */
export const AnnounceFields = {
  title: 'title',
  body: 'body',
  type: 'type',
  ping: 'ping',
  sendAt: 'send_at',
} as const;

export const ANNOUNCEMENT_LIMITS = { title: 200, body: 4000 } as const;

export const ANNOUNCEMENT_STYLES: Record<
  AnnouncementType,
  { label: string; emoji: string; color: number }
> = {
  GENERAL: { label: 'General', emoji: '📢', color: Colors.brand },
  IMPORTANT: { label: 'Important', emoji: '🚨', color: Colors.danger },
  WORKSHOP: { label: 'Workshop', emoji: '🛠️', color: Colors.workshops },
  REMINDER: { label: 'Reminder', emoji: '⏰', color: Colors.warning },
  FOOD: { label: 'Food', emoji: '🍕', color: Colors.food },
  DEADLINE: { label: 'Deadline', emoji: '⏳', color: Colors.deadline },
};

export type AnnounceAction = 'send' | 'edit' | 'discard';

/** `announce:submit` for a new announcement, `announce:submit:<id>` when editing a draft. */
export function announceModalId(draftId?: number): string {
  return draftId === undefined
    ? buildCustomId(ANNOUNCE_NAMESPACE, 'submit')
    : buildCustomId(ANNOUNCE_NAMESPACE, 'submit', draftId);
}

export function announceButtonId(action: AnnounceAction, id: number): string {
  return buildCustomId(ANNOUNCE_NAMESPACE, action, id);
}

type AnnouncementContent = Pick<Announcement, 'title' | 'body' | 'type'>;

export function buildAnnouncementEmbed(a: AnnouncementContent): EmbedBuilder {
  const style = ANNOUNCEMENT_STYLES[a.type];
  return new EmbedBuilder()
    .setColor(style.color)
    .setTitle(`${style.emoji} ${a.title}`)
    .setDescription(a.body)
    .setFooter({ text: `BuilderWars · ${style.label}` });
}

/**
 * The message posted in the announcement channel. Nothing in it can ping
 * except the Participant role, and only when the organizer asked for it,
 * so an `@everyone` typed in the body stays plain text.
 */
export function buildAnnouncementMessage(
  a: AnnouncementContent & Pick<Announcement, 'pingParticipants'>,
  participantRoleId: string,
): MessageCreateOptions {
  return {
    ...(a.pingParticipants ? { content: `<@&${participantRoleId}>` } : {}),
    embeds: [buildAnnouncementEmbed(a).setTimestamp(new Date())],
    allowedMentions: { parse: [], roles: a.pingParticipants ? [participantRoleId] : [] },
  };
}

/** The /announce form, filled in from `draft` when editing. */
export function buildAnnouncementModal(options: {
  timeZone: string;
  draft?: Announcement;
}): ModalBuilder {
  const { draft, timeZone } = options;
  return new ModalBuilder()
    .setCustomId(announceModalId(draft?.id))
    .setTitle(draft ? 'Edit announcement' : 'New announcement')
    .addLabelComponents(
      (label) =>
        label.setLabel('Title').setTextInputComponent((input) => {
          input
            .setCustomId(AnnounceFields.title)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(ANNOUNCEMENT_LIMITS.title);
          if (draft) input.setValue(draft.title);
          return input;
        }),
      (label) =>
        label
          .setLabel('Message')
          .setDescription('Markdown works. Mentions in here never ping anyone.')
          .setTextInputComponent((input) => {
            input
              .setCustomId(AnnounceFields.body)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(ANNOUNCEMENT_LIMITS.body);
            if (draft) input.setValue(draft.body);
            return input;
          }),
      (label) =>
        label.setLabel('Type').setStringSelectMenuComponent((menu) =>
          menu
            .setCustomId(AnnounceFields.type)
            .setRequired(true)
            .addOptions(
              ANNOUNCEMENT_TYPES.map((type) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(ANNOUNCEMENT_STYLES[type].label)
                  .setEmoji(ANNOUNCEMENT_STYLES[type].emoji)
                  .setValue(type)
                  .setDefault(type === (draft?.type ?? 'GENERAL')),
              ),
            ),
        ),
      (label) =>
        label
          .setLabel('Ping @Participants?')
          .setStringSelectMenuComponent((menu) =>
            menu
              .setCustomId(AnnounceFields.ping)
              .setRequired(true)
              .addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel("Don't ping")
                  .setEmoji('🔕')
                  .setValue('no')
                  .setDefault(!draft?.pingParticipants),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Ping @Participants')
                  .setEmoji('🔔')
                  .setValue('yes')
                  .setDefault(!!draft?.pingParticipants),
              ),
          ),
      (label) =>
        label
          .setLabel('Send at (optional)')
          .setDescription(`YYYY-MM-DD HH:MM in ${timeZone}. Leave empty to send right away.`)
          .setTextInputComponent((input) => {
            input
              .setCustomId(AnnounceFields.sendAt)
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('2026-11-14 14:00')
              .setMaxLength(40);
            if (draft?.scheduledFor) input.setValue(formatEventTime(draft.scheduledFor, timeZone));
            return input;
          }),
    );
}

const when = (date: Date) => `${discordTimestamp(date, 'F')} (${discordTimestamp(date, 'R')})`;

/**
 * The private preview shown after the form: exactly what will be posted,
 * plus when, whether it pings, and Send / Edit / Discard.
 */
export function buildAnnouncementPreview(
  a: Announcement,
  options: { channelId: string; canPing: boolean; problem?: string },
): MessageView & { content: string } {
  const lines = [`**Preview.** This is how it will look in <#${options.channelId}>.`];
  lines.push(
    a.scheduledFor
      ? `🕒 Will be sent ${when(a.scheduledFor)}.`
      : '📤 Will be sent as soon as you press **Send now**.',
  );
  if (!a.pingParticipants) lines.push('🔕 No ping.');
  else if (options.canPing) lines.push('🔔 Pings @Participants.');
  else {
    lines.push(
      "⚠️ You asked to ping @Participants, but I can't: make the role mentionable, or give me the **Mention @everyone, @here, and All Roles** permission. It will post without the ping.",
    );
  }
  if (options.problem) lines.push(`⚠️ ${options.problem} Press **Edit** to fix it.`);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(announceButtonId('send', a.id))
      .setLabel(a.scheduledFor ? 'Schedule' : 'Send now')
      .setEmoji(a.scheduledFor ? '🕒' : '📤')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!!options.problem),
    new ButtonBuilder()
      .setCustomId(announceButtonId('edit', a.id))
      .setLabel('Edit')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(announceButtonId('discard', a.id))
      .setLabel('Discard')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );
  return { content: lines.join('\n'), embeds: [buildAnnouncementEmbed(a)], components: [row] };
}

export const AnnouncementMessages = {
  notConfigured:
    "Announcements are off: `ANNOUNCEMENT_CHANNEL_ID` isn't set in the bot's configuration.",
  sent: (url: string) => `✅ Posted: ${url}`,
  scheduled: (a: Announcement) =>
    `🕒 Scheduled for ${when(a.scheduledFor!)}. To cancel it: \`/admin announcement cancel\` (#${a.id}).`,
  discarded: '🗑️ Discarded. Nothing was posted.',
  failed: (reason: string) => `❌ Couldn't post it: ${reason}`,
  notFound: 'This announcement no longer exists. Run `/announce` to write a new one.',
  badTime: (input: string, timeZone: string) =>
    `I couldn't read \`${input}\` as a time. Use \`YYYY-MM-DD HH:MM\` in ${timeZone}, for example \`2026-11-14 14:00\`.`,
  pastTime: 'That send time has already passed.',
  alreadyHandled: (status: AnnouncementStatus) =>
    ({
      DRAFT: 'This announcement is still a draft.',
      SCHEDULED: 'This announcement is already scheduled.',
      SENDING: 'This announcement is already being sent.',
      SENT: 'This announcement was already sent.',
      FAILED: "This announcement couldn't be sent. See `/admin announcement list`.",
      CANCELLED: 'This announcement was discarded or cancelled.',
    })[status],
  failedDm: (a: Announcement, reason: string) =>
    `❌ Your scheduled announcement **${a.title}** (#${a.id}) wasn't posted: ${reason}\nWrite it again with \`/announce\`.`,
} as const;

function listLine(a: Announcement): string {
  const style = ANNOUNCEMENT_STYLES[a.type];
  const ping = a.pingParticipants ? ' · 🔔' : '';
  const head = `\`#${a.id}\` ${style.emoji} **${a.title}**${ping}`;
  switch (a.status) {
    case 'SCHEDULED':
      return `${head}\n${a.scheduledFor ? when(a.scheduledFor) : 'any moment now'}`;
    case 'SENDING':
      return `${head}\n⚠️ Interrupted while sending. Check the channel before writing it again.`;
    default:
      return `${head}\n❌ ${a.failureReason ?? 'Failed'}`;
  }
}

/** `/admin announcement list`: what's waiting to go out, and what went wrong. */
export function buildAnnouncementList(list: readonly Announcement[]): MessageView {
  const embed = new EmbedBuilder().setColor(Colors.brand).setTitle('📣 Announcements');
  if (list.length === 0) {
    embed.setDescription('Nothing scheduled. Write one with `/announce`.');
    return { embeds: [embed], components: [] };
  }

  const sections = [
    { title: '🕒 Scheduled', rows: list.filter((a) => a.status === 'SCHEDULED') },
    { title: '⚠️ Needs attention', rows: list.filter((a) => a.status !== 'SCHEDULED') },
  ].filter((section) => section.rows.length > 0);

  let description = '';
  let hidden = 0;
  for (const section of sections) {
    let started = false;
    for (const a of section.rows) {
      const header = started ? '' : `${description ? '\n\n' : ''}**${section.title}**`;
      const piece = `${header}\n${listLine(a)}`;
      if (description.length + piece.length > EMBED_DESCRIPTION_LIMIT - 50) {
        hidden++;
        continue;
      }
      description += piece;
      started = true;
    }
  }
  if (hidden > 0) description += `\n\n*…and ${hidden} more.*`;

  embed
    .setDescription(description)
    .setFooter({ text: 'Cancel or dismiss one with /admin announcement cancel' });
  return { embeds: [embed], components: [] };
}

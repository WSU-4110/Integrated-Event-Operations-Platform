import {
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type Guild,
} from 'discord.js';
import {
  AnnouncementMessages,
  buildAnnouncementMessage,
} from '../components/embeds/announcementEmbeds.js';
import type { Announcement } from '../database/schema/index.js';
import type { BotContext } from '../interactions/types.js';

export type PublishResult = { ok: true; url: string } | { ok: false; reason: string };

/** Whether a role mention of Participant will actually notify people. */
export function canPingParticipants(guild: Guild, ctx: Pick<BotContext, 'config'>): boolean {
  if (guild.roles.cache.get(ctx.config.roles.participantRoleId)?.mentionable) return true;
  return !!guild.members.me?.permissions.has(PermissionFlagsBits.MentionEveryone);
}

function describeSendError(err: unknown, channelId: string): string {
  if (err instanceof DiscordAPIError) {
    const code = Number(err.code);
    if (code === Number(RESTJSONErrorCodes.MissingAccess)) return `I can't see <#${channelId}>.`;
    if (code === Number(RESTJSONErrorCodes.MissingPermissions)) {
      return `I need Send Messages and Embed Links in <#${channelId}>.`;
    }
    if (code === Number(RESTJSONErrorCodes.UnknownChannel)) {
      return "`ANNOUNCEMENT_CHANNEL_ID` points to a channel that doesn't exist.";
    }
    return `Discord refused the message (${err.message}).`;
  }
  return "I couldn't reach Discord. Check the channel before writing it again, in case it went through.";
}

/**
 * Posts an announcement the caller has claimed (status SENDING) and records
 * the result. Never throws. The nonce makes Discord drop a duplicate if its
 * client library retries the request.
 */
export async function publishAnnouncement(
  client: Client,
  ctx: BotContext,
  announcement: Announcement,
): Promise<PublishResult> {
  const { announcements } = ctx.services;
  const channelId = ctx.config.channels.announcementId;
  const log = { announcementId: announcement.id, organizerId: announcement.createdBy };

  let result: PublishResult;
  if (!channelId) {
    result = { ok: false, reason: AnnouncementMessages.notConfigured };
  } else {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isSendable()) {
        result = { ok: false, reason: "`ANNOUNCEMENT_CHANNEL_ID` isn't a channel I can post in." };
      } else {
        const message = await channel.send({
          ...buildAnnouncementMessage(announcement, ctx.config.roles.participantRoleId),
          nonce: `announcement-${announcement.id}`,
          enforceNonce: true,
        });
        result = { ok: true, url: message.url };
        try {
          await announcements.markSent(announcement.id, { channelId, messageId: message.id });
        } catch (err) {
          // It's posted; the row stays SENDING, so it won't be sent again.
          ctx.logger.error({ err, ...log }, 'Announcement posted but not marked as sent');
        }
      }
    } catch (err) {
      ctx.logger.warn({ err, ...log }, 'Could not post announcement');
      result = { ok: false, reason: describeSendError(err, channelId) };
    }
  }

  if (result.ok) {
    ctx.logger.info({ ...log, scheduled: !!announcement.scheduledFor }, 'Announcement sent');
  } else {
    ctx.logger.warn({ ...log, reason: result.reason }, 'Announcement failed');
    await announcements
      .markFailed(announcement.id, result.reason)
      .catch((err: unknown) => ctx.logger.error({ err, ...log }, 'Could not mark as failed'));
  }
  return result;
}

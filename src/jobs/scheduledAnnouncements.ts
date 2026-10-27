import type { Client } from 'discord.js';
import { AnnouncementMessages } from '../components/embeds/announcementEmbeds.js';
import type { BotContext } from '../interactions/types.js';
import { publishAnnouncement } from '../services/announcementDelivery.js';
import { sendDirectMessage } from '../services/directMessages.js';
import { discordTimestamp } from '../utils/time.js';

export interface AnnouncementJobSummary {
  sent: number;
  failed: number;
  /** Due while the bot was offline for too long, so not sent late. */
  missed: number;
  draftsDeleted: number;
}

export const isIdleAnnouncementRun = (s: AnnouncementJobSummary) =>
  s.sent + s.failed + s.missed + s.draftsDeleted === 0;

/**
 * Sends scheduled announcements that are due. Each one is claimed
 * (SCHEDULED → SENDING) before it's posted, so overlapping runs or a second
 * process can't post it again. The organizer gets a DM if it fails.
 */
export async function runScheduledAnnouncements(
  client: Client,
  ctx: BotContext,
): Promise<AnnouncementJobSummary> {
  const { announcements } = ctx.services;
  const summary: AnnouncementJobSummary = {
    sent: 0,
    failed: 0,
    missed: 0,
    draftsDeleted: await announcements.deleteStaleDrafts(),
  };

  for (const announcement of await announcements.claimDue()) {
    let reason: string;
    if (announcements.isTooLate(announcement)) {
      reason = `It was due ${discordTimestamp(announcement.scheduledFor!, 'F')}, but I was offline then, so I didn't send it late.`;
      await announcements.markFailed(announcement.id, reason);
      summary.missed++;
    } else {
      const result = await publishAnnouncement(client, ctx, announcement);
      if (result.ok) {
        summary.sent++;
        continue;
      }
      reason = result.reason;
      summary.failed++;
    }
    await sendDirectMessage(
      client,
      ctx,
      announcement.createdBy,
      AnnouncementMessages.failedDm(announcement, reason),
    );
  }
  return summary;
}

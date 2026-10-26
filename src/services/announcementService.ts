import {
  CANCELLABLE_ANNOUNCEMENT_STATUSES,
  type AnnouncementInput,
} from '../database/repositories/announcementRepository.js';
import type { Repositories } from '../database/repositories/index.js';
import type { Announcement } from '../database/schema/index.js';

// Announcements go DRAFT → (SCHEDULED →) SENDING → SENT or FAILED. Every
// step is one conditional UPDATE (AnnouncementRepository.transition), so a
// double-click, two overlapping job runs or a second bot process can't
// send the same announcement twice. The cost: if the bot dies mid-send,
// the row stays SENDING and is never retried automatically.

export type ConfirmOutcome =
  /** Claimed for sending (now SENDING); the caller posts it. */
  | { kind: 'send_now'; announcement: Announcement }
  | { kind: 'scheduled'; announcement: Announcement }
  /** Already sent, scheduled or discarded (for example, a second click). */
  | { kind: 'not_draft'; announcement: Announcement }
  | { kind: 'not_found' };

export type AnnouncementService = ReturnType<typeof createAnnouncementService>;

/** Unconfirmed drafts are deleted after this long. */
export const DRAFT_TTL_MS = 24 * 3_600_000;
/** A scheduled announcement this late (the bot was offline) isn't sent anymore. */
export const MAX_LATENESS_MS = 30 * 60_000;

export function createAnnouncementService(
  repos: Repositories,
  { now = () => new Date() }: { now?: () => Date } = {},
) {
  const { announcements } = repos;

  return {
    now,

    get: (id: number) => announcements.findById(id),

    createDraft: (input: AnnouncementInput & { createdBy: string }) =>
      announcements.createDraft(input),

    updateDraft: (id: number, input: AnnouncementInput) => announcements.updateDraft(id, input),

    /** The organizer pressed Send: send now, or schedule it. */
    async confirm(id: number): Promise<ConfirmOutcome> {
      const current = await announcements.findById(id);
      if (!current) return { kind: 'not_found' };
      const to = current.scheduledFor ? 'SCHEDULED' : 'SENDING';
      const claimed = await announcements.transition(id, ['DRAFT'], to);
      if (!claimed) {
        const latest = await announcements.findById(id);
        return latest ? { kind: 'not_draft', announcement: latest } : { kind: 'not_found' };
      }
      return { kind: to === 'SENDING' ? 'send_now' : 'scheduled', announcement: claimed };
    },

    /** Throws the draft away (the preview's Discard button). */
    async discard(id: number): Promise<boolean> {
      return !!(await announcements.transition(id, ['DRAFT'], 'CANCELLED'));
    },

    /** Cancels a scheduled announcement, or dismisses a failed one. */
    cancel: (id: number) =>
      announcements.transition(id, CANCELLABLE_ANNOUNCEMENT_STATUSES, 'CANCELLED'),

    /** Claims everything due. Each row is returned to exactly one caller. */
    claimDue: () => announcements.claimDue(now()),

    /** True if a claimed announcement is too late to be worth sending. */
    isTooLate: (announcement: Announcement) =>
      !!announcement.scheduledFor &&
      now().getTime() - announcement.scheduledFor.getTime() > MAX_LATENESS_MS,

    markSent: (id: number, post: { channelId: string; messageId: string }) =>
      announcements.transition(id, ['SENDING'], 'SENT', { ...post, sentAt: now() }),

    markFailed: (id: number, reason: string) =>
      announcements.transition(id, ['SENDING'], 'FAILED', { failureReason: reason }),

    listOpen: () => announcements.listOpen(),

    searchCancellable: (query: string, limit = 25) => announcements.searchCancellable(query, limit),

    deleteStaleDrafts: () =>
      announcements.deleteDraftsBefore(new Date(now().getTime() - DRAFT_TTL_MS)),
  };
}

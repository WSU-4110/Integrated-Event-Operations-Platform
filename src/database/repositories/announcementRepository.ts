import { and, asc, desc, eq, ilike, inArray, lt, lte, sql } from 'drizzle-orm';
import { containsPattern } from '../like.js';
import { announcements, type Announcement, type AnnouncementStatus } from '../schema/index.js';
import type { Database } from '../types.js';

export type AnnouncementInput = Pick<
  Announcement,
  'title' | 'body' | 'type' | 'pingParticipants' | 'scheduledFor'
>;

export interface AnnouncementRepository {
  createDraft(input: AnnouncementInput & { createdBy: string }): Promise<Announcement>;
  /** Changes a draft; null if it's no longer a draft. */
  updateDraft(id: number, input: AnnouncementInput): Promise<Announcement | null>;
  findById(id: number): Promise<Announcement | null>;
  /**
   * Moves one row from any of `from` to `to` in a single conditional UPDATE.
   * Returns null if the row wasn't in one of those states, so when two
   * callers race, exactly one of them gets the row.
   */
  transition(
    id: number,
    from: readonly AnnouncementStatus[],
    to: AnnouncementStatus,
    fields?: Partial<Pick<Announcement, 'channelId' | 'messageId' | 'sentAt' | 'failureReason'>>,
  ): Promise<Announcement | null>;
  /** Claims every scheduled announcement due at `now` (SCHEDULED → SENDING). */
  claimDue(now: Date): Promise<Announcement[]>;
  /** Scheduled, interrupted and failed announcements, soonest first. */
  listOpen(): Promise<Announcement[]>;
  /** For autocomplete: scheduled or failed, title contains `query`. */
  searchCancellable(query: string, limit: number): Promise<Announcement[]>;
  /** Removes drafts nobody confirmed. Returns how many. */
  deleteDraftsBefore(cutoff: Date): Promise<number>;
}

const a = announcements;
const CANCELLABLE: AnnouncementStatus[] = ['SCHEDULED', 'FAILED'];

export function createAnnouncementRepository(db: Database): AnnouncementRepository {
  return {
    async createDraft(input) {
      const [row] = await db
        .insert(a)
        .values({ ...input, status: 'DRAFT' })
        .returning();
      return row!;
    },

    async updateDraft(id, input) {
      const [row] = await db
        .update(a)
        .set({ ...input, updatedAt: sql`now()` })
        .where(and(eq(a.id, id), eq(a.status, 'DRAFT')))
        .returning();
      return row ?? null;
    },

    async findById(id) {
      const [row] = await db.select().from(a).where(eq(a.id, id));
      return row ?? null;
    },

    async transition(id, from, to, fields = {}) {
      const [row] = await db
        .update(a)
        .set({ ...fields, status: to, updatedAt: sql`now()` })
        .where(and(eq(a.id, id), inArray(a.status, [...from])))
        .returning();
      return row ?? null;
    },

    async claimDue(now) {
      return db
        .update(a)
        .set({ status: 'SENDING', updatedAt: sql`now()` })
        .where(and(eq(a.status, 'SCHEDULED'), lte(a.scheduledFor, now)))
        .returning();
    },

    async listOpen() {
      return db
        .select()
        .from(a)
        .where(inArray(a.status, ['SCHEDULED', 'SENDING', 'FAILED']))
        .orderBy(asc(a.scheduledFor), asc(a.id))
        .limit(50);
    },

    async searchCancellable(query, limit) {
      return db
        .select()
        .from(a)
        .where(and(inArray(a.status, CANCELLABLE), ilike(a.title, containsPattern(query))))
        .orderBy(desc(sql`${a.status} = 'SCHEDULED'`), asc(a.scheduledFor), asc(a.id))
        .limit(limit);
    },

    async deleteDraftsBefore(cutoff) {
      const rows = await db
        .delete(a)
        .where(and(eq(a.status, 'DRAFT'), lt(a.updatedAt, cutoff)))
        .returning({ id: a.id });
      return rows.length;
    },
  };
}

export const CANCELLABLE_ANNOUNCEMENT_STATUSES: readonly AnnouncementStatus[] = CANCELLABLE;

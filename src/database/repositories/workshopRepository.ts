import { and, asc, count, eq, getTableColumns, gt, ilike, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../errors.js';
import {
  participantLinks,
  WORKSHOP_NAME_UNIQUE,
  workshopRegistrations,
  workshops,
  type Workshop,
  type WorkshopRegistration,
  type WorkshopRegistrationStatus,
} from '../schema/index.js';
import type { Database } from '../types.js';

export interface WorkshopCounts {
  registered: number;
  waitlisted: number;
}

export type WorkshopWithCounts = Workshop & WorkshopCounts;

export type WorkshopInput = Pick<
  Workshop,
  'name' | 'description' | 'speaker' | 'startTime' | 'endTime' | 'location' | 'capacity'
>;

export type SaveWorkshopResult = { ok: true; workshop: Workshop } | { ok: false; conflict: 'name' };

export interface RosterEntry {
  discordUserId: string;
  registrationId: number;
  status: WorkshopRegistrationStatus;
  registeredAt: Date;
}

/** Queries available inside `withLock`, all in one transaction. */
export interface LockedWorkshop {
  workshop: Workshop;
  countRegistered(): Promise<number>;
  findRegistration(participantLinkId: number): Promise<WorkshopRegistration | null>;
  /** Inserts or updates the row, restarting its `registeredAt` (its waitlist place). */
  setStatus(participantLinkId: number, status: WorkshopRegistrationStatus): Promise<void>;
  /** 1-based place in the waitlist. */
  waitlistPosition(participantLinkId: number): Promise<number>;
  /** The earliest waitlisted participant, if any. */
  nextWaitlisted(): Promise<{ participantLinkId: number; discordUserId: string } | null>;
}

export interface WorkshopRepository {
  create(input: WorkshopInput): Promise<SaveWorkshopResult>;
  update(id: number, patch: Partial<WorkshopInput>): Promise<SaveWorkshopResult | null>;
  delete(id: number): Promise<Workshop | null>;
  findById(id: number): Promise<WorkshopWithCounts | null>;
  /** Workshops that haven't ended yet, soonest first. */
  listEndingAfter(now: Date): Promise<WorkshopWithCounts[]>;
  /** For autocomplete: name contains `query`, soonest first. */
  search(query: string, limit: number): Promise<Workshop[]>;
  setPost(id: number, post: { channelId: string; messageId: string } | null): Promise<void>;
  /** This participant's non-cancelled status per workshop. */
  statusesForLink(participantLinkId: number): Promise<Map<number, WorkshopRegistrationStatus>>;
  /** Registered and waitlisted participants, registered first, then in signup order. */
  roster(workshopId: number): Promise<RosterEntry[]>;
  /** IDs of workshops with anyone on the waitlist. */
  idsWithWaitlist(): Promise<number[]>;
  /**
   * Runs `fn` in a transaction holding `SELECT ... FOR UPDATE` on the
   * workshop row, so capacity checks and changes can't interleave. Returns
   * null if the workshop doesn't exist.
   */
  withLock<T>(workshopId: number, fn: (locked: LockedWorkshop) => Promise<T>): Promise<T | null>;
}

const w = workshops;
const r = workshopRegistrations;

const countsColumns = {
  ...getTableColumns(w),
  registered: sql<number>`count(${r.id}) filter (where ${r.status} = 'REGISTERED')`.mapWith(Number),
  waitlisted: sql<number>`count(${r.id}) filter (where ${r.status} = 'WAITLISTED')`.mapWith(Number),
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function saving(fn: () => Promise<Workshop | undefined>): Promise<SaveWorkshopResult | null> {
  try {
    const workshop = await fn();
    return workshop ? { ok: true, workshop } : null;
  } catch (err) {
    if (isUniqueViolation(err, WORKSHOP_NAME_UNIQUE)) return { ok: false, conflict: 'name' };
    throw err;
  }
}

function lockedQueries(tx: Database, workshop: Workshop): LockedWorkshop {
  const forWorkshop = eq(r.workshopId, workshop.id);

  async function findRegistration(participantLinkId: number) {
    const [row] = await tx
      .select()
      .from(r)
      .where(and(forWorkshop, eq(r.participantLinkId, participantLinkId)));
    return row ?? null;
  }

  return {
    workshop,
    findRegistration,

    async countRegistered() {
      const [row] = await tx
        .select({ n: count() })
        .from(r)
        .where(and(forWorkshop, eq(r.status, 'REGISTERED')));
      return row?.n ?? 0;
    },

    async setStatus(participantLinkId, status) {
      // clock_timestamp(), not now(): rows changed in one transaction still
      // get distinct, ordered times. The unique constraint is the last guard
      // against duplicate rows.
      const registeredAt = sql`clock_timestamp()`;
      await tx
        .insert(r)
        .values({ workshopId: workshop.id, participantLinkId, status, registeredAt })
        .onConflictDoUpdate({
          target: [r.workshopId, r.participantLinkId],
          set: { status, registeredAt },
        });
    },

    async waitlistPosition(participantLinkId) {
      const mine = await findRegistration(participantLinkId);
      if (mine?.status !== 'WAITLISTED') return 0;
      // Compared in SQL: JS Dates would drop the microseconds.
      const [row] = await tx
        .select({ n: count() })
        .from(r)
        .where(
          and(
            forWorkshop,
            eq(r.status, 'WAITLISTED'),
            sql`(${r.registeredAt}, ${r.id}) <= (SELECT ${r.registeredAt}, ${r.id} FROM ${r} WHERE ${r.id} = ${mine.id})`,
          ),
        );
      return row?.n ?? 0;
    },

    async nextWaitlisted() {
      const [row] = await tx
        .select({
          participantLinkId: r.participantLinkId,
          discordUserId: participantLinks.discordUserId,
        })
        .from(r)
        .innerJoin(participantLinks, eq(participantLinks.id, r.participantLinkId))
        .where(and(forWorkshop, eq(r.status, 'WAITLISTED')))
        .orderBy(asc(r.registeredAt), asc(r.id))
        .limit(1);
      return row ?? null;
    },
  };
}

export function createWorkshopRepository(db: Database): WorkshopRepository {
  const withCounts = () =>
    db.select(countsColumns).from(w).leftJoin(r, eq(r.workshopId, w.id)).groupBy(w.id).$dynamic();

  return {
    async create(input) {
      return (await saving(async () => (await db.insert(w).values(input).returning())[0]))!;
    },

    async update(id, patch) {
      return saving(
        async () =>
          (
            await db
              .update(w)
              .set({ ...patch, updatedAt: sql`now()` })
              .where(eq(w.id, id))
              .returning()
          )[0],
      );
    },

    async delete(id) {
      const [row] = await db.delete(w).where(eq(w.id, id)).returning();
      return row ?? null;
    },

    async findById(id) {
      const [row] = await withCounts().where(eq(w.id, id));
      return row ?? null;
    },

    async listEndingAfter(now) {
      return withCounts().where(gt(w.endTime, now)).orderBy(asc(w.startTime), asc(w.id));
    },

    async search(query, limit) {
      return db
        .select()
        .from(w)
        .where(ilike(w.name, `%${escapeLike(query.trim())}%`))
        .orderBy(asc(w.startTime), asc(w.id))
        .limit(limit);
    },

    async setPost(id, post) {
      await db
        .update(w)
        .set({ channelId: post?.channelId ?? null, messageId: post?.messageId ?? null })
        .where(eq(w.id, id));
    },

    async statusesForLink(participantLinkId) {
      const rows = await db
        .select({ workshopId: r.workshopId, status: r.status })
        .from(r)
        .where(and(eq(r.participantLinkId, participantLinkId), sql`${r.status} <> 'CANCELLED'`));
      return new Map(rows.map((row) => [row.workshopId, row.status]));
    },

    async roster(workshopId) {
      return db
        .select({
          discordUserId: participantLinks.discordUserId,
          registrationId: participantLinks.registrationId,
          status: r.status,
          registeredAt: r.registeredAt,
        })
        .from(r)
        .innerJoin(participantLinks, eq(participantLinks.id, r.participantLinkId))
        .where(and(eq(r.workshopId, workshopId), sql`${r.status} <> 'CANCELLED'`))
        .orderBy(sql`${r.status} = 'WAITLISTED'`, asc(r.registeredAt), asc(r.id));
    },

    async idsWithWaitlist() {
      const rows = await db
        .selectDistinct({ id: r.workshopId })
        .from(r)
        .where(eq(r.status, 'WAITLISTED'));
      return rows.map((row) => row.id);
    },

    async withLock(workshopId, fn) {
      return db.transaction(async (tx) => {
        const [workshop] = await tx.select().from(w).where(eq(w.id, workshopId)).for('update');
        if (!workshop) return null;
        return fn(lockedQueries(tx, workshop));
      });
    },
  };
}

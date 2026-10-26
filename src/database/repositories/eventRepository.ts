import { asc, count, eq, gt, ilike, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import { containsPattern } from '../like.js';
import { events, workshops, type EventType, type ScheduleEvent } from '../schema/index.js';
import type { Database } from '../types.js';

export type EventInput = Pick<
  ScheduleEvent,
  'name' | 'description' | 'startTime' | 'endTime' | 'location' | 'type'
>;

/** One line of the schedule: an event or a workshop. */
export interface ScheduleItem {
  source: 'event' | 'workshop';
  id: number;
  name: string;
  description: string;
  type: EventType;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
}

export interface EventRepository {
  create(input: EventInput): Promise<ScheduleEvent>;
  update(id: number, patch: Partial<EventInput>): Promise<ScheduleEvent | null>;
  delete(id: number): Promise<ScheduleEvent | null>;
  findById(id: number): Promise<ScheduleEvent | null>;
  /** For autocomplete: name contains `query`, soonest first. */
  search(query: string, limit: number): Promise<ScheduleEvent[]>;
  count(): Promise<number>;
  /**
   * Events and workshops that haven't ended at `now` (a deadline counts as
   * ending when it starts), soonest first. Workshops are read from their own
   * table, so each appears exactly once.
   */
  schedule(now: Date, limit: number): Promise<ScheduleItem[]>;
}

const e = events;

export function createEventRepository(db: Database): EventRepository {
  return {
    async create(input) {
      const [row] = await db.insert(e).values(input).returning();
      return row!;
    },

    async update(id, patch) {
      const [row] = await db
        .update(e)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(e.id, id))
        .returning();
      return row ?? null;
    },

    async delete(id) {
      const [row] = await db.delete(e).where(eq(e.id, id)).returning();
      return row ?? null;
    },

    async findById(id) {
      const [row] = await db.select().from(e).where(eq(e.id, id));
      return row ?? null;
    },

    async search(query, limit) {
      return db
        .select()
        .from(e)
        .where(ilike(e.name, containsPattern(query)))
        .orderBy(asc(e.startTime), asc(e.id))
        .limit(limit);
    },

    async count() {
      const [row] = await db.select({ n: count() }).from(e);
      return row?.n ?? 0;
    },

    async schedule(now, limit) {
      const eventRows = db
        .select({
          source: sql<ScheduleItem['source']>`'event'`.as('source'),
          id: e.id,
          name: e.name,
          description: e.description,
          type: e.type,
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
        })
        .from(e)
        .where(sql`coalesce(${e.endTime}, ${e.startTime}) > ${now}`);
      const workshopRows = db
        .select({
          source: sql<ScheduleItem['source']>`'workshop'`.as('source'),
          id: workshops.id,
          name: workshops.name,
          description: workshops.description,
          type: sql<EventType>`'WORKSHOP'`.as('type'),
          startTime: workshops.startTime,
          endTime: workshops.endTime,
          location: workshops.location,
        })
        .from(workshops)
        .where(gt(workshops.endTime, now));

      return unionAll(eventRows, workshopRows)
        .orderBy(sql`start_time`, sql`source`, sql`id`)
        .limit(limit);
    },
  };
}

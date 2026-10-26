import type { Repositories } from '../database/repositories/index.js';
import type { EventInput, ScheduleItem } from '../database/repositories/eventRepository.js';
import type { ScheduleEvent } from '../database/schema/index.js';

// The event schedule: organizer-managed events plus workshops, read
// together so a workshop shows up once, from its own table.

export type EventSaveOutcome =
  | { kind: 'saved'; event: ScheduleEvent }
  | { kind: 'invalid'; reason: string }
  | { kind: 'not_found' };

export interface ScheduleSnapshot {
  /** Haven't ended yet, soonest first. */
  upcoming: ScheduleItem[];
  /** False until organizers add the first event; until then /schedule shows the built-in one. */
  hasEvents: boolean;
}

export type ScheduleService = ReturnType<typeof createScheduleService>;

// Far more than a two-day hackathon needs; keeps a runaway table from
// producing a huge message.
const SCHEDULE_LIMIT = 200;

function validate(input: Pick<EventInput, 'name' | 'startTime' | 'endTime'>): string | null {
  if (!input.name.trim()) return "The name can't be empty.";
  if (input.endTime && input.endTime.getTime() <= input.startTime.getTime()) {
    return 'It must end after it starts.';
  }
  return null;
}

/** Whether `item` is underway at `now`. Moments (no end time) never are. */
export function isHappening(item: Pick<ScheduleItem, 'startTime' | 'endTime'>, now: Date): boolean {
  return (
    item.endTime !== null &&
    item.startTime.getTime() <= now.getTime() &&
    now.getTime() < item.endTime.getTime()
  );
}

export function createScheduleService(
  repos: Repositories,
  { now = () => new Date() }: { now?: () => Date } = {},
) {
  const { events } = repos;

  return {
    now,

    get: (id: number) => events.findById(id),

    search: (query: string, limit = 25) => events.search(query, limit),

    async snapshot(): Promise<ScheduleSnapshot> {
      const [upcoming, total] = await Promise.all([
        events.schedule(now(), SCHEDULE_LIMIT),
        events.count(),
      ]);
      return { upcoming, hasEvents: total > 0 };
    },

    /** The next thing to start, and what's underway right now. */
    async next(): Promise<{ next: ScheduleItem | null; happening: ScheduleItem[] }> {
      const at = now();
      const upcoming = await events.schedule(at, SCHEDULE_LIMIT);
      return {
        next: upcoming.find((item) => item.startTime.getTime() > at.getTime()) ?? null,
        happening: upcoming.filter((item) => isHappening(item, at)),
      };
    },

    async create(input: EventInput): Promise<EventSaveOutcome> {
      const invalid = validate(input);
      if (invalid) return { kind: 'invalid', reason: invalid };
      return { kind: 'saved', event: await events.create(input) };
    },

    async update(id: number, patch: Partial<EventInput>): Promise<EventSaveOutcome> {
      const current = await events.findById(id);
      if (!current) return { kind: 'not_found' };
      const invalid = validate({ ...current, ...patch });
      if (invalid) return { kind: 'invalid', reason: invalid };
      const event = await events.update(id, patch);
      return event ? { kind: 'saved', event } : { kind: 'not_found' };
    },

    remove: (id: number) => events.delete(id),
  };
}

import type { Repositories } from '../database/repositories/index.js';
import type {
  LockedWorkshop,
  WorkshopInput,
  WorkshopWithCounts,
} from '../database/repositories/workshopRepository.js';
import type { ParticipantLink, Workshop } from '../database/schema/index.js';

// Workshop signups. Every change that depends on capacity runs under a row
// lock on the workshop (WorkshopRepository.withLock), so two people racing
// for the last spot can't both get it.

/** A waitlisted participant who just got a spot. */
export interface Promotion {
  workshopId: number;
  discordUserId: string;
}

export type RegisterOutcome =
  | { kind: 'registered'; workshop: Workshop }
  | { kind: 'waitlisted'; workshop: Workshop; position: number }
  | { kind: 'full'; workshop: Workshop }
  | { kind: 'already_registered'; workshop: Workshop }
  | { kind: 'already_waitlisted'; workshop: Workshop; position: number }
  | { kind: 'started'; workshop: Workshop }
  | { kind: 'not_found' };

export type CancelOutcome =
  | { kind: 'cancelled'; workshop: Workshop; promoted: Promotion[] }
  | { kind: 'left_waitlist'; workshop: Workshop }
  | { kind: 'not_registered'; workshop: Workshop }
  | { kind: 'started'; workshop: Workshop }
  | { kind: 'not_found' };

export type SaveOutcome =
  | { kind: 'saved'; workshop: Workshop; promoted: Promotion[] }
  | { kind: 'name_taken' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'not_found' };

export interface RosterRow {
  discordUserId: string;
  registrationId: number;
  /** From the website registration; null if it was deleted. */
  name: string | null;
  status: 'REGISTERED' | 'WAITLISTED';
  registeredAt: Date;
}

export type WorkshopService = ReturnType<typeof createWorkshopService>;

function validate(input: Pick<WorkshopInput, 'startTime' | 'endTime' | 'capacity'>): string | null {
  if (input.endTime.getTime() <= input.startTime.getTime()) return 'It must end after it starts.';
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    return 'Capacity must be at least 1.';
  }
  return null;
}

export function createWorkshopService(
  repos: Repositories,
  { now = () => new Date() }: { now?: () => Date } = {},
) {
  const { workshops, registrations } = repos;

  const hasStarted = (workshop: Workshop) => now().getTime() >= workshop.startTime.getTime();

  /** Moves waitlisted people into open spots, earliest first. Call under the lock. */
  async function promote(locked: LockedWorkshop): Promise<Promotion[]> {
    if (hasStarted(locked.workshop)) return [];
    const promoted: Promotion[] = [];
    let registered = await locked.countRegistered();
    while (registered < locked.workshop.capacity) {
      const next = await locked.nextWaitlisted();
      if (!next) break;
      await locked.setStatus(next.participantLinkId, 'REGISTERED');
      promoted.push({ workshopId: locked.workshop.id, discordUserId: next.discordUserId });
      registered++;
    }
    return promoted;
  }

  async function fillOpenSpots(workshopId: number): Promise<Promotion[]> {
    return (await workshops.withLock(workshopId, promote)) ?? [];
  }

  return {
    get: (id: number): Promise<WorkshopWithCounts | null> => workshops.findById(id),

    /** Workshops that haven't ended, soonest first. */
    listUpcoming: () => workshops.listEndingAfter(now()),

    search: (query: string, limit = 25) => workshops.search(query, limit),

    statusesFor: (link: ParticipantLink) => workshops.statusesForLink(link.id),

    hasStarted,

    /**
     * Signs up a verified participant. If the workshop is full, returns
     * `full` unless `joinWaitlist` is set, in which case they join the end
     * of the waitlist.
     */
    async register(
      workshopId: number,
      link: ParticipantLink,
      { joinWaitlist = false }: { joinWaitlist?: boolean } = {},
    ): Promise<RegisterOutcome> {
      const outcome = await workshops.withLock(
        workshopId,
        async (locked): Promise<RegisterOutcome> => {
          const { workshop } = locked;
          const existing = await locked.findRegistration(link.id);
          if (existing?.status === 'REGISTERED') return { kind: 'already_registered', workshop };
          if (existing?.status === 'WAITLISTED') {
            return {
              kind: 'already_waitlisted',
              workshop,
              position: await locked.waitlistPosition(link.id),
            };
          }
          if (hasStarted(workshop)) return { kind: 'started', workshop };

          if ((await locked.countRegistered()) < workshop.capacity) {
            await locked.setStatus(link.id, 'REGISTERED');
            return { kind: 'registered', workshop };
          }
          if (!joinWaitlist) return { kind: 'full', workshop };

          await locked.setStatus(link.id, 'WAITLISTED');
          return {
            kind: 'waitlisted',
            workshop,
            position: await locked.waitlistPosition(link.id),
          };
        },
      );
      return outcome ?? { kind: 'not_found' };
    },

    /** Cancels a registration or leaves the waitlist; a freed spot goes to the waitlist. */
    async cancel(workshopId: number, link: ParticipantLink): Promise<CancelOutcome> {
      const outcome = await workshops.withLock(
        workshopId,
        async (locked): Promise<CancelOutcome> => {
          const { workshop } = locked;
          const existing = await locked.findRegistration(link.id);
          if (!existing || existing.status === 'CANCELLED') {
            return { kind: 'not_registered', workshop };
          }
          if (hasStarted(workshop)) return { kind: 'started', workshop };

          await locked.setStatus(link.id, 'CANCELLED');
          if (existing.status === 'WAITLISTED') return { kind: 'left_waitlist', workshop };
          return { kind: 'cancelled', workshop, promoted: await promote(locked) };
        },
      );
      return outcome ?? { kind: 'not_found' };
    },

    fillOpenSpots,

    /** Fills spots on every workshop with a waitlist (for example after an unlink). */
    async fillAllOpenSpots(): Promise<Promotion[]> {
      const promoted: Promotion[] = [];
      for (const id of await workshops.idsWithWaitlist()) {
        promoted.push(...(await fillOpenSpots(id)));
      }
      return promoted;
    },

    async create(input: WorkshopInput): Promise<SaveOutcome> {
      const invalid = validate(input);
      if (invalid) return { kind: 'invalid', reason: invalid };
      const result = await workshops.create(input);
      return result.ok
        ? { kind: 'saved', workshop: result.workshop, promoted: [] }
        : { kind: 'name_taken' };
    },

    /** Applies changes; raising the capacity promotes waitlisted participants. */
    async update(id: number, patch: Partial<WorkshopInput>): Promise<SaveOutcome> {
      const current = await workshops.findById(id);
      if (!current) return { kind: 'not_found' };
      const invalid = validate({ ...current, ...patch });
      if (invalid) return { kind: 'invalid', reason: invalid };

      const result = await workshops.update(id, patch);
      if (!result) return { kind: 'not_found' };
      if (!result.ok) return { kind: 'name_taken' };
      return { kind: 'saved', workshop: result.workshop, promoted: await fillOpenSpots(id) };
    },

    /** Deletes the workshop and its signups. Returns who was signed up, to notify them. */
    async remove(
      id: number,
    ): Promise<{ workshop: Workshop; affectedDiscordUserIds: string[] } | null> {
      const roster = await workshops.roster(id);
      const workshop = await workshops.delete(id);
      if (!workshop) return null;
      return { workshop, affectedDiscordUserIds: roster.map((entry) => entry.discordUserId) };
    },

    setPost: (id: number, post: { channelId: string; messageId: string } | null) =>
      workshops.setPost(id, post),

    /** Registered then waitlisted participants, with names from the website. */
    async roster(workshopId: number): Promise<RosterRow[]> {
      const entries = await workshops.roster(workshopId);
      const summaries = await registrations.findSummaries(entries.map((e) => e.registrationId));
      return entries.map((entry) => ({
        ...entry,
        status: entry.status as RosterRow['status'],
        name: summaries.get(entry.registrationId)?.name ?? null,
      }));
    },
  };
}

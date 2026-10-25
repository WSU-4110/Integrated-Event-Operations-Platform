import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../types.js';
import { websiteRegistrations as r } from '../website/registrations.js';

// The only module that reads the website's registrations table. If the
// website schema changes, this file (and website/registrations.ts) change.
// Every query is scoped to the configured event.

export interface RegistrationMatchCandidate {
  id: number;
  status: string;
  discordUsername: string | null;
}

export interface RegistrationSummary {
  id: number;
  name: string;
  status: string;
}

export interface WebsiteRegistrationRepository {
  /** Registrations with this email (case-insensitive). Never returns the email itself. */
  findByEmail(normalizedEmail: string): Promise<RegistrationMatchCandidate[]>;
  findById(id: number): Promise<RegistrationSummary | null>;
  /** Registrations that have a Discord username, for username-only lookups. */
  listWithDiscordUsername(): Promise<RegistrationMatchCandidate[]>;
  /** Current status per registration ID. Missing IDs were deleted (or belong to another event). */
  findStatuses(ids: readonly number[]): Promise<Map<number, string>>;
}

export function createWebsiteRegistrationRepository(
  db: Database,
  eventId: string,
): WebsiteRegistrationRepository {
  const inEvent = eq(r.eventId, eventId);
  const candidateColumns = { id: r.id, status: r.status, discordUsername: r.discordUsername };

  return {
    async findByEmail(normalizedEmail) {
      return db
        .select(candidateColumns)
        .from(r)
        .where(and(inEvent, eq(sql`lower(btrim(${r.email}))`, normalizedEmail)));
    },

    async findById(id) {
      const [row] = await db
        .select({ id: r.id, name: r.name, status: r.status })
        .from(r)
        .where(and(inEvent, eq(r.id, id)));
      return row ?? null;
    },

    async listWithDiscordUsername() {
      return db
        .select(candidateColumns)
        .from(r)
        .where(and(inEvent, isNotNull(r.discordUsername)));
    },

    async findStatuses(ids) {
      if (ids.length === 0) return new Map();
      const rows = await db
        .select({ id: r.id, status: r.status })
        .from(r)
        .where(and(inEvent, inArray(r.id, [...ids])));
      return new Map(rows.map((row) => [row.id, row.status]));
    },
  };
}

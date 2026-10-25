import { eq, inArray, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../errors.js';
import {
  PARTICIPANT_LINK_DISCORD_USER_UNIQUE,
  PARTICIPANT_LINK_REGISTRATION_UNIQUE,
  participantLinks,
  type ParticipantLink,
} from '../schema/index.js';
import type { Database } from '../types.js';

export type CreateLinkResult =
  { ok: true; link: ParticipantLink } | { ok: false; conflict: 'discord_user' | 'registration' };

export interface ParticipantLinkRepository {
  findByDiscordUserId(discordUserId: string): Promise<ParticipantLink | null>;
  findByRegistrationId(registrationId: number): Promise<ParticipantLink | null>;
  /** Unique constraints are the final guard against double-linking. */
  create(input: {
    discordUserId: string;
    registrationId: number;
    linkedBy: string | null;
  }): Promise<CreateLinkResult>;
  deleteByDiscordUserId(discordUserId: string): Promise<ParticipantLink | null>;
  listAll(): Promise<ParticipantLink[]>;
  setActive(ids: readonly number[], active: boolean): Promise<void>;
}

export function createParticipantLinkRepository(db: Database): ParticipantLinkRepository {
  return {
    async findByDiscordUserId(discordUserId) {
      const [link] = await db
        .select()
        .from(participantLinks)
        .where(eq(participantLinks.discordUserId, discordUserId));
      return link ?? null;
    },

    async findByRegistrationId(registrationId) {
      const [link] = await db
        .select()
        .from(participantLinks)
        .where(eq(participantLinks.registrationId, registrationId));
      return link ?? null;
    },

    async create(input) {
      try {
        const [link] = await db.insert(participantLinks).values(input).returning();
        if (!link) throw new Error('Insert returned no row');
        return { ok: true, link };
      } catch (err) {
        if (isUniqueViolation(err, PARTICIPANT_LINK_DISCORD_USER_UNIQUE)) {
          return { ok: false, conflict: 'discord_user' };
        }
        if (isUniqueViolation(err, PARTICIPANT_LINK_REGISTRATION_UNIQUE)) {
          return { ok: false, conflict: 'registration' };
        }
        throw err;
      }
    },

    async deleteByDiscordUserId(discordUserId) {
      const [link] = await db
        .delete(participantLinks)
        .where(eq(participantLinks.discordUserId, discordUserId))
        .returning();
      return link ?? null;
    },

    async listAll() {
      return db.select().from(participantLinks);
    },

    async setActive(ids, active) {
      if (ids.length === 0) return;
      await db
        .update(participantLinks)
        .set({ active, updatedAt: sql`now()` })
        .where(inArray(participantLinks.id, [...ids]));
    },
  };
}

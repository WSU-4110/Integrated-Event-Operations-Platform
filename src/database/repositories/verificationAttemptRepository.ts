import { and, count, desc, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';
import {
  verificationAttempts,
  type VerificationAttempt,
  type VerificationResult,
} from '../schema/index.js';
import type { Database } from '../types.js';

/** Results that count toward the rate limit and show in the organizer queue. */
export const FAILED_RESULTS: readonly VerificationResult[] = [
  'NO_MATCH',
  'INELIGIBLE',
  'AMBIGUOUS',
  'ALREADY_LINKED',
];

export interface VerificationAttemptRepository {
  record(input: {
    discordUserId: string;
    discordUsername: string;
    result: VerificationResult;
    registrationId?: number | null;
  }): Promise<void>;
  /** Failures in the last `windowMs`, measured with the database clock. */
  countRecentFailures(discordUserId: string, windowMs: number): Promise<number>;
  resolveForUser(discordUserId: string): Promise<void>;
  /** The latest unresolved failure per user, newest first. */
  listUnresolved(limit: number): Promise<VerificationAttempt[]>;
}

export function createVerificationAttemptRepository(db: Database): VerificationAttemptRepository {
  const a = verificationAttempts;

  return {
    async record(input) {
      await db.insert(a).values(input);
    },

    async countRecentFailures(discordUserId, windowMs) {
      // created_at comes from the database's now(), so compare against it too.
      const windowStart = sql`now() - make_interval(secs => ${windowMs / 1000})`;
      const [row] = await db
        .select({ n: count() })
        .from(a)
        .where(
          and(
            eq(a.discordUserId, discordUserId),
            inArray(a.result, [...FAILED_RESULTS]),
            gte(a.createdAt, windowStart),
          ),
        );
      return row?.n ?? 0;
    },

    async resolveForUser(discordUserId) {
      await db
        .update(a)
        .set({ resolved: true })
        .where(and(eq(a.discordUserId, discordUserId), eq(a.resolved, false)));
    },

    async listUnresolved(limit) {
      const latestPerUser = await db
        .selectDistinctOn([a.discordUserId])
        .from(a)
        .where(and(eq(a.resolved, false), notInArray(a.result, ['MATCHED', 'RATE_LIMITED'])))
        .orderBy(a.discordUserId, desc(a.createdAt));
      return latestPerUser
        .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
        .slice(0, limit);
    },
  };
}

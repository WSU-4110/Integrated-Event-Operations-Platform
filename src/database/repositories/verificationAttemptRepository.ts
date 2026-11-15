
import { and, count, desc, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';
import {
  verificationAttempts,
  type VerificationAttempt,
  type VerificationResult,
} from '../schema/index.js';
import { rowsOf, type Database } from '../types.js';

/** Results that count toward the rate limit and organizer queue. */
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

  /** Number of failures in the most recent window. */
  countRecentFailures(
    discordUserId: string,
    windowMs: number,
  ): Promise<number>;

  /** Whether a 15-minute lockout is currently active. */
  isLockedOut(
    discordUserId: string,
    windowMs: number,
  ): Promise<boolean>;

  resolveForUser(discordUserId: string): Promise<void>;

  /** Latest unresolved failure per user, newest first. */
  listUnresolved(limit: number): Promise<VerificationAttempt[]>;
}

export function createVerificationAttemptRepository(
  db: Database,
): VerificationAttemptRepository {
  const a = verificationAttempts;

  return {
    async record(input) {
      await db.insert(a).values(input);
    },

    async countRecentFailures(discordUserId, windowMs) {
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

    async isLockedOut(discordUserId, windowMs) {
      // Use the database clock for both stored timestamps
      // and the current time.
      const [clock] = rowsOf<{ now: Date | string }>(
        await db.execute(sql`select now() as now`),
      );

      const now = new Date(clock?.now ?? Date.now()).getTime();

      // Only failures within the last two windows can
      // contribute to a lockout that is still active.
      const windowStart = sql`now() - make_interval(secs => ${(windowMs * 2) / 1000})`;

      const recent = await db
        .select({ createdAt: a.createdAt })
        .from(a)
        .where(
          and(
            eq(a.discordUserId, discordUserId),
            inArray(a.result, [...FAILED_RESULTS]),
            gte(a.createdAt, windowStart),
          ),
        )
        .orderBy(a.createdAt);

      // Find the earliest group of five failures occurring
      // within the configured failure window.
      //
      // The fifth failure starts a 15-minute lockout.
      // Failures during that lockout must not restart it.
      let index = 0;

      while (index + 4 < recent.length) {
        const first = recent[index]!.createdAt.getTime();

        const fifth = recent[index + 4]!.createdAt.getTime();
        if (fifth - first > windowMs) {
          // Slide the whole window: retaining the old first timestamp can
          // overlook a later group of five fresh failures.
          index++;
          continue;
        }

        const expiresAt = fifth + windowMs;

        if (now < expiresAt) {
          return true;
        }

        // Skip failures that happened during the expired lockout.
        while (
          index < recent.length &&
          recent[index]!.createdAt.getTime() < expiresAt
        ) {
          index++;
        }
      }

      return false;
    },

    async resolveForUser(discordUserId) {
      await db
        .update(a)
        .set({ resolved: true })
        .where(
          and(
            eq(a.discordUserId, discordUserId),
            eq(a.resolved, false),
          ),
        );
    },

    async listUnresolved(limit) {
      const latestPerUser = await db
        .selectDistinctOn([a.discordUserId])
        .from(a)
        .where(
          and(
            eq(a.resolved, false),
            notInArray(a.result, ['MATCHED', 'RATE_LIMITED']),
          ),
        )
        .orderBy(a.discordUserId, desc(a.createdAt));

      return latestPerUser
        .sort(
          (x, y) =>
            y.createdAt.getTime() - x.createdAt.getTime(),
        )
        .slice(0, limit);
    },
  };
}

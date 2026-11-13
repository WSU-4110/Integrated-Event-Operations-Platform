
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

  /** Failures in the last windowMs, using the database clock. */
  countRecentFailures(
    discordUserId: string,
    windowMs: number,
  ): Promise<number>;

  /** Whether the user is still within a 15-minute lockout. */
  isLockedOut(
    discordUserId: string,
    windowMs: number,
  ): Promise<boolean>;

  resolveForUser(discordUserId: string): Promise<void>;

  /** The latest unresolved failure per user, newest first. */
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
      // Look back two windows to find the fifth failure
      // that could have triggered an active lockout.
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
        .orderBy(desc(a.createdAt));

      // Find any five failures within one 15-minute window.
      // A lockout lasts 15 minutes after the fifth failure.
      const now = Date.now();

      for (let i = 4; i < recent.length; i++) {
        const fifthFailure = recent[i - 4].createdAt.getTime();
        const firstFailure = recent[i].createdAt.getTime();

        const failuresWithinWindow =
          fifthFailure - firstFailure <= windowMs;

        const lockoutStillActive =
          now - fifthFailure < windowMs;

        if (failuresWithinWindow && lockoutStillActive) {
          return true;
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

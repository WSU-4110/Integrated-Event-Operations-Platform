import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { discordBot } from './discordBot.js';

export const VERIFICATION_RESULTS = [
  'MATCHED',
  'NO_MATCH',
  'INELIGIBLE', // username + email matched, but the registration is waitlisted/declined
  'AMBIGUOUS',
  'ALREADY_LINKED',
  'RATE_LIMITED',
] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

/**
 * One row per /verify attempt. The email the user typed is never stored,
 * only the outcome.
 */
export const verificationAttempts = discordBot.table(
  'verification_attempts',
  {
    id: serial('id').primaryKey(),
    discordUserId: text('discord_user_id').notNull(),
    discordUsername: text('discord_username').notNull(),
    result: text('result').$type<VerificationResult>().notNull(),
    // The registration involved, when known (for organizers resolving conflicts).
    registrationId: integer('registration_id'),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('verification_attempts_user_created_idx').on(t.discordUserId, t.createdAt),
    check(
      'verification_attempts_result_check',
      sql.raw(`result IN (${VERIFICATION_RESULTS.map((r) => `'${r}'`).join(', ')})`),
    ),
  ],
);

export type VerificationAttempt = typeof verificationAttempts.$inferSelect;

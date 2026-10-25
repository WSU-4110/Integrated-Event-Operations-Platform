import { integer, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Read model for the website's `public.registrations` table. The website
 * owns this table: the bot only has SELECT on it, and it is deliberately
 * outside the drizzle-kit schema so it is never migrated. Only the columns
 * the bot reads are declared.
 */
export const websiteRegistrations = pgTable('registrations', {
  id: integer('id').primaryKey(),
  eventId: text('event_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  discordUsername: text('discord_username'),
  status: text('status').notNull(),
});

/** Website statuses that grant access to the Discord server. */
export const ELIGIBLE_STATUSES: readonly string[] = ['pending', 'approved'];

export function isEligibleStatus(status: string | undefined): boolean {
  return status !== undefined && ELIGIBLE_STATUSES.includes(status);
}

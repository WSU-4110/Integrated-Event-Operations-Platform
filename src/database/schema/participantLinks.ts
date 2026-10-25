import { boolean, integer, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { discordBot } from './discordBot.js';

export const PARTICIPANT_LINK_DISCORD_USER_UNIQUE = 'participant_links_discord_user_id_unique';
export const PARTICIPANT_LINK_REGISTRATION_UNIQUE = 'participant_links_registration_id_unique';

/**
 * A Discord account linked to a website registration. After linking, the bot
 * identifies participants by the Discord user ID (snowflake), never by
 * username. No names or emails are stored here.
 */
export const participantLinks = discordBot.table('participant_links', {
  id: serial('id').primaryKey(),
  discordUserId: text('discord_user_id').notNull().unique(PARTICIPANT_LINK_DISCORD_USER_UNIQUE),
  // public.registrations.id, stored as a value (no cross-schema foreign key).
  registrationId: integer('registration_id').notNull().unique(PARTICIPANT_LINK_REGISTRATION_UNIQUE),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  // null = self-verified; otherwise the organizer's Discord user ID.
  linkedBy: text('linked_by'),
  // false once the registration is waitlisted, declined or deleted on the website.
  active: boolean('active').notNull().default(true),
  checkedIn: boolean('checked_in').notNull().default(false),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ParticipantLink = typeof participantLinks.$inferSelect;

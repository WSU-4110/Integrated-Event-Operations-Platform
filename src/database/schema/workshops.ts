import { sql } from 'drizzle-orm';
import { check, index, integer, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { discordBot } from './discordBot.js';
import { participantLinks } from './participantLinks.js';

export const WORKSHOP_NAME_UNIQUE = 'workshops_name_unique';

export const workshops = discordBot.table(
  'workshops',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    speaker: text('speaker'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    location: text('location').notNull(),
    capacity: integer('capacity').notNull(),
    // The persistent card posted with /admin workshop post, so it can be edited.
    channelId: text('channel_id'),
    messageId: text('message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique(WORKSHOP_NAME_UNIQUE).on(t.name),
    check('workshops_capacity_check', sql.raw('capacity > 0')),
    check('workshops_time_check', sql.raw('end_time > start_time')),
  ],
);

export type Workshop = typeof workshops.$inferSelect;

export const WORKSHOP_REGISTRATION_STATUSES = ['REGISTERED', 'WAITLISTED', 'CANCELLED'] as const;
export type WorkshopRegistrationStatus = (typeof WORKSHOP_REGISTRATION_STATUSES)[number];

export const WORKSHOP_REGISTRATION_UNIQUE = 'workshop_registrations_workshop_link_unique';

/**
 * One row per participant per workshop. Cancelling keeps the row (status
 * CANCELLED), and signing up again reuses it.
 */
export const workshopRegistrations = discordBot.table(
  'workshop_registrations',
  {
    id: serial('id').primaryKey(),
    workshopId: integer('workshop_id')
      .notNull()
      .references(() => workshops.id, { onDelete: 'cascade' }),
    participantLinkId: integer('participant_link_id')
      .notNull()
      .references(() => participantLinks.id, { onDelete: 'cascade' }),
    status: text('status').$type<WorkshopRegistrationStatus>().notNull(),
    // When the row entered its current status; orders the waitlist.
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique(WORKSHOP_REGISTRATION_UNIQUE).on(t.workshopId, t.participantLinkId),
    index('workshop_registrations_workshop_status_idx').on(t.workshopId, t.status, t.registeredAt),
    check(
      'workshop_registrations_status_check',
      sql.raw(`status IN (${WORKSHOP_REGISTRATION_STATUSES.map((s) => `'${s}'`).join(', ')})`),
    ),
  ],
);

export type WorkshopRegistration = typeof workshopRegistrations.$inferSelect;

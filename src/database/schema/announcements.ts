import { sql } from 'drizzle-orm';
import { boolean, check, index, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { discordBot } from './discordBot.js';

export const ANNOUNCEMENT_TYPES = [
  'GENERAL',
  'IMPORTANT',
  'WORKSHOP',
  'REMINDER',
  'FOOD',
  'DEADLINE',
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

/**
 * DRAFT: written, waiting for the organizer to press Send in the preview.
 * SCHEDULED: confirmed, waiting for `scheduled_for`.
 * SENDING: claimed by one sender. Rows only leave SCHEDULED/DRAFT through a
 * single conditional UPDATE, which is what makes every send happen once.
 */
export const ANNOUNCEMENT_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);

export const announcements = discordBot.table(
  'announcements',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    type: text('type').$type<AnnouncementType>().notNull(),
    pingParticipants: boolean('ping_participants').notNull().default(false),
    // Null means "send as soon as it's confirmed".
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    status: text('status').$type<AnnouncementStatus>().notNull().default('DRAFT'),
    createdBy: text('created_by').notNull(), // organizer's Discord user ID
    channelId: text('channel_id'),
    messageId: text('message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('announcements_status_scheduled_idx').on(t.status, t.scheduledFor),
    check('announcements_type_check', inList('type', ANNOUNCEMENT_TYPES)),
    check('announcements_status_check', inList('status', ANNOUNCEMENT_STATUSES)),
  ],
);

export type Announcement = typeof announcements.$inferSelect;

import { sql } from 'drizzle-orm';
import { check, index, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { discordBot } from './discordBot.js';

export const EVENT_TYPES = [
  'GENERAL',
  'WORKSHOP',
  'MENTOR',
  'FOOD',
  'DEADLINE',
  'JUDGING',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Schedule entries managed with /admin event. Workshops live in their own
 * table and are merged into the schedule when it's read, never copied here.
 */
export const events = discordBot.table(
  'events',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    // Null for a moment in time, such as a deadline.
    endTime: timestamp('end_time', { withTimezone: true }),
    location: text('location'),
    type: text('type').$type<EventType>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_start_time_idx').on(t.startTime),
    check('events_time_check', sql.raw('end_time IS NULL OR end_time > start_time')),
    check('events_type_check', sql.raw(`type IN (${EVENT_TYPES.map((s) => `'${s}'`).join(', ')})`)),
  ],
);

export type ScheduleEvent = typeof events.$inferSelect;

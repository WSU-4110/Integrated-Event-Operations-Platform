
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const eventScheduleTable = pgTable(
  "event_schedule",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location").notNull(),
    startTime: timestamp("start_time", {
      withTimezone: true,
    }).notNull(),
    endTime: timestamp("end_time", {
      withTimezone: true,
    }).notNull(),
    published: boolean("published").notNull().default(false),
    position: integer("position").notNull().default(0),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    index("event_schedule_listing_idx").on(
      table.eventId,
      table.published,
      table.startTime,
    ),
  ],
);

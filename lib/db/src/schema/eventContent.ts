import { boolean, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const eventContentTable = pgTable("event_content", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  kind: text("kind", { enum: ["announcement", "resource"] }).notNull(),
  title: text("title").notNull(),
  body: text("body"),
  url: text("url"),
  position: integer("position").notNull(),
  published: boolean("published").notNull().default(false),
  authorId: text("author_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("event_content_listing_idx").on(table.eventId, table.published, table.kind, table.position, table.id),
]);

import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const waitlistTable = pgTable("waitlist_registrations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  school: text("school").notNull(),
  discordUsername: text("discord_username"),
  experienceLevel: text("experience_level").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWaitlistSchema = createInsertSchema(waitlistTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;
export type WaitlistRegistration = typeof waitlistTable.$inferSelect;

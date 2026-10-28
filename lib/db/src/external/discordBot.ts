import {
  boolean,
  integer,
  pgSchema,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Read model for the Discord bot's table (Discord-Bot branch). The bot owns
// and migrates the discord_bot schema; the website only reads it, so this file
// is deliberately outside src/schema and never part of our migrations.
const discordBot = pgSchema("discord_bot");

export const discordParticipantLinksTable = discordBot.table(
  "participant_links",
  {
    id: integer("id").primaryKey(),
    discordUserId: text("discord_user_id").notNull(),
    registrationId: integer("registration_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    active: boolean("active").notNull(),
    checkedIn: boolean("checked_in").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  },
);

export type DiscordParticipantLink =
  typeof discordParticipantLinksTable.$inferSelect;

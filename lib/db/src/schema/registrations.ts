import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const EVENT_ID = "builderwars-2026";

export const CLASS_STANDINGS = [
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "graduate",
] as const;
export const EXPERIENCE_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "professional",
] as const;
export const TEAM_STATUSES = ["has_team", "looking", "solo"] as const;
export const REGISTRATION_STATUSES = [
  "pending",
  "approved",
  "waitlisted",
  "declined",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

// Status changes organizers may make (FR-04). Nothing returns to "pending".
export const STATUS_TRANSITIONS: Record<
  RegistrationStatus,
  RegistrationStatus[]
> = {
  pending: ["approved", "waitlisted", "declined"],
  waitlisted: ["approved", "declined"],
  approved: ["waitlisted", "declined"],
  declined: ["approved", "waitlisted"],
};

// One row per person per event (FR-01). People imported from the old
// waitlist have no Discord username or team status until they add them.
export const registrationsTable = pgTable(
  "registrations",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull().default(EVENT_ID),
    name: text("name").notNull(),
    email: text("email").notNull(),
    school: text("school").notNull(),
    classStanding: text("class_standing").notNull(),
    experienceLevel: text("experience_level").notNull(),
    discordUsername: text("discord_username"),
    teamStatus: text("team_status"),
    teamName: text("team_name"),
    status: text("status").notNull().default("pending"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    source: text("source").notNull().default("website"),
    confirmationEmailSentAt: timestamp("confirmation_email_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("registrations_event_email_unique").on(table.eventId, table.email),
  ],
);

export type Registration = typeof registrationsTable.$inferSelect;

// Every status change, who made it, and when (FR-04). Written in the same
// transaction as the change itself.
export const registrationStatusChangesTable = pgTable(
  "registration_status_changes",
  {
    id: serial("id").primaryKey(),
    registrationId: integer("registration_id")
      .notNull()
      .references(() => registrationsTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    changedByUserId: text("changed_by_user_id").notNull(),
    changedByEmail: text("changed_by_email").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("status_changes_registration_idx").on(table.registrationId),
  ],
);

export type RegistrationStatusChange =
  typeof registrationStatusChangesTable.$inferSelect;

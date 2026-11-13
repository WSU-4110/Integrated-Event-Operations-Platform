import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { registrationsTable } from "./registrations";

export const attendanceCorrectionsTable = pgTable(
  "attendance_corrections",
  {
    id: serial("id").primaryKey(),
    registrationId: integer("registration_id")
      .notNull()
      .references(() => registrationsTable.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    reason: text("reason").notNull(),
    originalCheckedInAt: timestamp("original_checked_in_at", {
      withTimezone: true,
    }).notNull(),
    originalCheckedInBy: text("original_checked_in_by"),
    correctedBy: text("corrected_by").notNull(),
    correctedByEmail: text("corrected_by_email").notNull(),
    correctedAt: timestamp("corrected_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    attendanceVersion: integer("attendance_version").notNull(),
  },
  (t) => [
    index("attendance_corrections_registration_idx").on(t.registrationId, t.id),
    check(
      "attendance_correction_reason_required",
      sql`length(btrim(${t.reason})) between 1 and 1000`,
    ),
  ],
);

import { Router, type IRouter } from "express";
import { and, count, eq, ilike, or, type SQL } from "drizzle-orm";
import {
  db,
  EVENT_ID,
  registrationsTable,
  usersTable,
  type Registration,
} from "@workspace/db";
import { ListRegistrationsQueryParams } from "@workspace/api-zod";
import { sendRegistrationConfirmation } from "../lib/registrationConfirmationEmail";

const router: IRouter = Router();
// Comma-separated list of organizer emails allowed into /api/admin.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

// Auth guard middleware for all admin routes
router.use("/admin", async (req, res, next) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  const email = user?.email?.trim().toLowerCase();
  if (!email || !ADMIN_EMAILS.has(email)) {
    res
      .status(403)
      .json({ error: "Admin access is restricted to event organizers." });
    return;
  }

  next();
});

function toApi(r: Registration) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    school: r.school,
    class_standing: r.classStanding,
    experience_level: r.experienceLevel,
    discord_username: r.discordUsername,
    team_status: r.teamStatus,
    team_name: r.teamName,
    status: r.status,
    source: r.source,
    confirmation_email_sent_at: r.confirmationEmailSentAt,
    created_at: r.createdAt,
  };
}

const forThisEvent = eq(registrationsTable.eventId, EVENT_ID);

router.get("/admin/registrations", async (req, res): Promise<void> => {
  const parsed = ListRegistrationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, experience_level, team_status, limit, offset } = parsed.data;

  const conditions: SQL[] = [forThisEvent];
  if (search) {
    conditions.push(
      or(
        ilike(registrationsTable.name, `%${search}%`),
        ilike(registrationsTable.email, `%${search}%`),
        ilike(registrationsTable.school, `%${search}%`),
        ilike(registrationsTable.discordUsername, `%${search}%`),
        ilike(registrationsTable.teamName, `%${search}%`),
      )!,
    );
  }
  if (experience_level) {
    conditions.push(eq(registrationsTable.experienceLevel, experience_level));
  }
  if (team_status) {
    conditions.push(eq(registrationsTable.teamStatus, team_status));
  }
  const whereClause = and(...conditions);

  const [registrations, totalResult] = await Promise.all([
    db
      .select()
      .from(registrationsTable)
      .where(whereClause)
      .orderBy(registrationsTable.createdAt)
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(registrationsTable).where(whereClause),
  ]);

  res.json({
    registrations: registrations.map(toApi),
    total: Number(totalResult[0]?.count ?? 0),
  });
});

router.delete("/admin/registrations/:id", async (req, res): Promise<void> => {
  const rawId = req.params.id;
  const registrationId = Number(rawId);

  if (
    !/^\d+$/.test(rawId) ||
    !Number.isSafeInteger(registrationId) ||
    registrationId < 1
  ) {
    res.status(400).json({ error: "A valid registration ID is required." });
    return;
  }

  const deleted = await db
    .delete(registrationsTable)
    .where(and(eq(registrationsTable.id, registrationId), forThisEvent))
    .returning({ id: registrationsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Registration not found." });
    return;
  }

  res.status(204).send();
});

router.post(
  "/admin/registrations/:id/resend-confirmation",
  async (req, res): Promise<void> => {
    const registrationId = Number(req.params.id);
    if (!Number.isSafeInteger(registrationId) || registrationId < 1) {
      res.status(400).json({ error: "A valid registration ID is required." });
      return;
    }

    const [registration] = await db
      .select()
      .from(registrationsTable)
      .where(and(eq(registrationsTable.id, registrationId), forThisEvent));
    if (!registration) {
      res.status(404).json({ error: "Registration not found." });
      return;
    }

    try {
      await sendRegistrationConfirmation({
        name: registration.name,
        email: registration.email,
      });
    } catch (err: unknown) {
      req.log.error(
        { err, registrationId },
        "Resending the confirmation email failed",
      );
      res.status(502).json({
        error: "The email provider rejected the email. Check the server logs.",
      });
      return;
    }

    const sentAt = new Date();
    await db
      .update(registrationsTable)
      .set({ confirmationEmailSentAt: sentAt })
      .where(eq(registrationsTable.id, registrationId));
    res.json({ confirmation_email_sent_at: sentAt });
  },
);

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [totalResult, byLevel, byTeam] = await Promise.all([
    db.select({ count: count() }).from(registrationsTable).where(forThisEvent),
    db
      .select({ key: registrationsTable.experienceLevel, count: count() })
      .from(registrationsTable)
      .where(forThisEvent)
      .groupBy(registrationsTable.experienceLevel),
    db
      .select({ key: registrationsTable.teamStatus, count: count() })
      .from(registrationsTable)
      .where(forThisEvent)
      .groupBy(registrationsTable.teamStatus),
  ]);

  const tally = (rows: { key: string | null; count: number }[]) =>
    Object.fromEntries(
      rows.map((row) => [row.key ?? "unknown", Number(row.count)]),
    );

  res.json({
    total: Number(totalResult[0]?.count ?? 0),
    by_experience_level: tally(byLevel),
    by_team_status: tally(byTeam),
  });
});

// Quote values for CSV, and neutralize spreadsheet formulas: a value starting
// with = + - @ (or tab/return) would run as a formula in Excel or Sheets.
function csvCell(value: string | number | Date | null | undefined): string {
  if (value == null) return "";
  let str = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get("/admin/export", async (_req, res): Promise<void> => {
  const registrations = await db
    .select()
    .from(registrationsTable)
    .where(forThisEvent)
    .orderBy(registrationsTable.createdAt);

  const columns = [
    "id",
    "name",
    "email",
    "school",
    "class_standing",
    "experience_level",
    "discord_username",
    "team_status",
    "team_name",
    "status",
    "source",
    "confirmation_email_sent_at",
    "created_at",
  ] as const;
  const rows = registrations.map((r) => {
    const api = toApi(r);
    return columns.map((column) => csvCell(api[column])).join(",");
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="registrations-${new Date().toISOString().split("T")[0]}.csv"`,
  );
  res.send([columns.join(","), ...rows].join("\n") + "\n");
});

export default router;

import { Router, type IRouter } from "express";
import { and, count, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import {
  ACTIVE_STATUSES,
  db,
  discordParticipantLinksTable,
  EVENT_ID,
  REMOVED_STATUSES,
  registrationStatusChangesTable,
  registrationsTable,
  STATUS_TRANSITIONS,
  usersTable,
  type Registration,
  type RegistrationStatus,
} from "@workspace/db";
import {
  ListRegistrationsQueryParams,
  UpdateRegistrationStatusBody,
} from "@workspace/api-zod";
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
    req.log.warn({ path: req.path }, "Admin request without a session");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  const email = user?.email?.trim().toLowerCase();
  if (!email || !ADMIN_EMAILS.has(email)) {
    // Log the user ID, not the email address (NFR-02).
    req.log.warn(
      { path: req.path, userId: req.user.id },
      "Admin access denied: not on ADMIN_EMAILS",
    );
    res
      .status(403)
      .json({ error: "Admin access is restricted to event organizers." });
    return;
  }

  // The organizer's identity for the status history (FR-04).
  res.locals.adminEmail = email;
  next();
});

type DiscordLinkInfo = { active: boolean; linkedAt: Date };
type DiscordLinks = Map<number, DiscordLinkInfo> | null;

// Errors meaning the website can't see the Discord bot's table: no permission
// yet (42501), or the bot hasn't created it (42P01, 3F000).
function isDiscordUnavailable(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === "42501" || code === "42P01" || code === "3F000";
}

// The bot's verification records for these registrations, keyed by
// registration ID; null if the website can't read them.
async function loadDiscordLinks(ids: number[]): Promise<DiscordLinks> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await db
      .select({
        registrationId: discordParticipantLinksTable.registrationId,
        active: discordParticipantLinksTable.active,
        linkedAt: discordParticipantLinksTable.linkedAt,
      })
      .from(discordParticipantLinksTable)
      .where(inArray(discordParticipantLinksTable.registrationId, ids));
    return new Map(
      rows.map((row) => [
        row.registrationId,
        { active: row.active, linkedAt: row.linkedAt },
      ]),
    );
  } catch (err) {
    if (isDiscordUnavailable(err)) return null;
    throw err;
  }
}

function discordStatus(id: number, links: DiscordLinks) {
  if (links === null) return { status: "unknown" as const, verifiedAt: null };
  const link = links.get(id);
  if (!link) return { status: "not_verified" as const, verifiedAt: null };
  return {
    status: link.active ? ("verified" as const) : ("removed" as const),
    verifiedAt: link.linkedAt,
  };
}

function toApi(r: Registration, links: DiscordLinks) {
  const discord = discordStatus(r.id, links);
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
    status_updated_at: r.statusUpdatedAt,
    allowed_statuses: STATUS_TRANSITIONS[r.status as RegistrationStatus] ?? [],
    discord_status: discord.status,
    discord_verified_at: discord.verifiedAt,
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

  const { search, experience_level, team_status, access, limit, offset } =
    parsed.data;

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
  if (access) {
    conditions.push(
      inArray(
        registrationsTable.status,
        access === "active" ? ACTIVE_STATUSES : REMOVED_STATUSES,
      ),
    );
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

  const links = await loadDiscordLinks(registrations.map((r) => r.id));
  res.json({
    registrations: registrations.map((r) => toApi(r, links)),
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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(id) && id >= 1 ? id : null;
}

class StatusChangeError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

// FR-04: change a registration's status. The request carries the status the
// organizer saw; if someone else changed it since, the change is refused so
// they can reload instead of overwriting. The new status and its history row
// are saved together.
router.patch(
  "/admin/registrations/:id/status",
  async (req, res): Promise<void> => {
    const registrationId = parseId(req.params.id);
    const parsed = UpdateRegistrationStatusBody.safeParse(req.body);
    if (!registrationId || !parsed.success) {
      res
        .status(400)
        .json({ error: "A valid registration and status are required." });
      return;
    }
    const { status: nextStatus, expected_status } = parsed.data;

    try {
      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(registrationsTable)
          .where(and(eq(registrationsTable.id, registrationId), forThisEvent))
          .for("update");
        if (!current) {
          throw new StatusChangeError(404, "Registration not found.");
        }
        if (current.status !== expected_status) {
          throw new StatusChangeError(
            409,
            `Someone else already changed this registration to "${current.status}". Reload to see the latest.`,
          );
        }
        const allowed =
          STATUS_TRANSITIONS[current.status as RegistrationStatus] ?? [];
        if (!allowed.includes(nextStatus)) {
          throw new StatusChangeError(
            400,
            `A registration can't go from "${current.status}" to "${nextStatus}".`,
          );
        }

        const now = new Date();
        const [row] = await tx
          .update(registrationsTable)
          .set({ status: nextStatus, statusUpdatedAt: now })
          .where(eq(registrationsTable.id, registrationId))
          .returning();
        await tx.insert(registrationStatusChangesTable).values({
          registrationId,
          fromStatus: current.status,
          toStatus: nextStatus,
          changedByUserId: req.user!.id,
          changedByEmail: res.locals.adminEmail as string,
          changedAt: now,
        });
        return row;
      });

      // #6 (FR-05) will send the approval notice and verification code here,
      // after the change is saved; a failed notification must not undo it.
      res.json(toApi(updated, await loadDiscordLinks([updated.id])));
    } catch (err: unknown) {
      if (err instanceof StatusChangeError) {
        res.status(err.httpStatus).json({ error: err.message });
        return;
      }
      req.log.error(
        { err, registrationId },
        "Failed to change registration status",
      );
      res
        .status(500)
        .json({ error: "The status couldn't be changed. Please try again." });
    }
  },
);

router.get(
  "/admin/registrations/:id/history",
  async (req, res): Promise<void> => {
    const registrationId = parseId(req.params.id);
    if (!registrationId) {
      res.status(400).json({ error: "A valid registration ID is required." });
      return;
    }
    const [registration] = await db
      .select({ id: registrationsTable.id })
      .from(registrationsTable)
      .where(and(eq(registrationsTable.id, registrationId), forThisEvent));
    if (!registration) {
      res.status(404).json({ error: "Registration not found." });
      return;
    }
    const changes = await db
      .select()
      .from(registrationStatusChangesTable)
      .where(eq(registrationStatusChangesTable.registrationId, registrationId))
      .orderBy(
        registrationStatusChangesTable.changedAt,
        registrationStatusChangesTable.id,
      );
    res.json({
      changes: changes.map((c) => ({
        from_status: c.fromStatus,
        to_status: c.toStatus,
        changed_by_email: c.changedByEmail,
        changed_at: c.changedAt,
      })),
    });
  },
);

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
        discordUsername: registration.discordUsername,
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
  const [totalResult, byLevel, byTeam, byStatus] = await Promise.all([
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
    db
      .select({ key: registrationsTable.status, count: count() })
      .from(registrationsTable)
      .where(forThisEvent)
      .groupBy(registrationsTable.status),
  ]);

  // Active registrations with an active Discord verification.
  let discordVerified: number | null;
  try {
    const [row] = await db
      .select({ count: count() })
      .from(discordParticipantLinksTable)
      .innerJoin(
        registrationsTable,
        eq(registrationsTable.id, discordParticipantLinksTable.registrationId),
      )
      .where(
        and(
          forThisEvent,
          eq(discordParticipantLinksTable.active, true),
          inArray(registrationsTable.status, ACTIVE_STATUSES),
        ),
      );
    discordVerified = Number(row?.count ?? 0);
  } catch (err) {
    if (!isDiscordUnavailable(err)) throw err;
    discordVerified = null;
  }

  const tally = (rows: { key: string | null; count: number }[]) =>
    Object.fromEntries(
      rows.map((row) => [row.key ?? "unknown", Number(row.count)]),
    );

  res.json({
    total: Number(totalResult[0]?.count ?? 0),
    by_experience_level: tally(byLevel),
    by_team_status: tally(byTeam),
    by_status: tally(byStatus),
    discord_verified: discordVerified,
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
    "discord_status",
    "discord_verified_at",
    "source",
    "confirmation_email_sent_at",
    "created_at",
  ] as const;
  const links = await loadDiscordLinks(registrations.map((r) => r.id));
  const rows = registrations.map((r) => {
    const api = toApi(r, links);
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

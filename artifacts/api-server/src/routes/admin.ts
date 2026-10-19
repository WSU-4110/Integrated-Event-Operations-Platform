import { Router, type IRouter } from "express";
import { ilike, or, eq, count, sql } from "drizzle-orm";
import { db, usersTable, waitlistTable } from "@workspace/db";
import { ListRegistrationsQueryParams } from "@workspace/api-zod";

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
    res.status(403).json({ error: "Admin access is restricted to event organizers." });
    return;
  }

  next();
});

router.get("/admin/registrations", async (req, res): Promise<void> => {
  const parsed = ListRegistrationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, experience_level, limit, offset } = parsed.data;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(waitlistTable.name, `%${search}%`),
        ilike(waitlistTable.email, `%${search}%`),
        ilike(waitlistTable.school, `%${search}%`),
      ),
    );
  }
  if (experience_level) {
    conditions.push(eq(waitlistTable.experienceLevel, experience_level));
  }

  const whereClause = conditions.length > 0
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : undefined;

  const [registrations, totalResult] = await Promise.all([
    db
      .select()
      .from(waitlistTable)
      .where(whereClause)
      .orderBy(waitlistTable.createdAt)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(waitlistTable)
      .where(whereClause),
  ]);

  res.json({
    registrations: registrations.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      school: r.school,
      discord_username: r.discordUsername,
      experience_level: r.experienceLevel,
      created_at: r.createdAt,
    })),
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
    .delete(waitlistTable)
    .where(eq(waitlistTable.id, registrationId))
    .returning({ id: waitlistTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Registration not found." });
    return;
  }

  res.status(204).send();
});

router.get("/admin/stats", async (req, res): Promise<void> => {
  const [totalResult, byLevel] = await Promise.all([
    db.select({ count: count() }).from(waitlistTable),
    db
      .select({
        level: waitlistTable.experienceLevel,
        count: count(),
      })
      .from(waitlistTable)
      .groupBy(waitlistTable.experienceLevel),
  ]);

  const by_experience_level: Record<string, number> = {};
  for (const row of byLevel) {
    by_experience_level[row.level] = Number(row.count);
  }

  res.json({
    total: Number(totalResult[0]?.count ?? 0),
    by_experience_level,
  });
});

router.get("/admin/export", async (req, res): Promise<void> => {
  const registrations = await db
    .select()
    .from(waitlistTable)
    .orderBy(waitlistTable.createdAt);

  const header = "id,name,email,school,discord_username,experience_level,created_at\n";
  const rows = registrations
    .map((r) => {
      const escape = (v: string | null | undefined) => {
        if (v == null) return "";
        const str = String(v);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      return [
        r.id,
        escape(r.name),
        escape(r.email),
        escape(r.school),
        escape(r.discordUsername),
        escape(r.experienceLevel),
        r.createdAt.toISOString(),
      ].join(",");
    })
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="waitlist-${new Date().toISOString().split("T")[0]}.csv"`,
  );
  res.send(header + rows);
});

export default router;

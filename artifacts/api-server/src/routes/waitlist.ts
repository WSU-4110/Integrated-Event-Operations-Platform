import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { db, waitlistTable } from "@workspace/db";
import {
  SubmitWaitlistBody,
  CheckWaitlistQueryParams,
} from "@workspace/api-zod";
import { sendWaitlistConfirmation } from "../lib/waitlistConfirmationEmail";

const router: IRouter = Router();
const informationPacketPath = fileURLToPath(
  new URL(
    "../../../attached_assets/BuilderWars_Information_Packet.pdf",
    import.meta.url,
  ),
);

router.post("/waitlist", async (req, res): Promise<void> => {
  const parsed = SubmitWaitlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, school, discord_username, experience_level } = parsed.data;

  // Only currently enrolled students with .edu addresses can join the waitlist.
  const emailRegex = /^[^\s@]+@[^\s@]+\.edu$/i;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: "A .edu email address is required." });
    return;
  }

  // Check for duplicate
  const existing = await db
    .select({ id: waitlistTable.id })
    .from(waitlistTable)
    .where(eq(waitlistTable.email, email.toLowerCase().trim()));

  if (existing.length > 0) {
    res.status(409).json({ error: "This email is already registered on the waitlist." });
    return;
  }

  try {
    const [registration] = await db
      .insert(waitlistTable)
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        school: school.trim(),
        discordUsername: discord_username ?? null,
        experienceLevel: experience_level,
      })
      .returning();

    try {
      await sendWaitlistConfirmation({
        name: registration.name,
        email: registration.email,
        packetPath: informationPacketPath,
      });
    } catch (err: unknown) {
      await db
        .delete(waitlistTable)
        .where(eq(waitlistTable.id, registration.id));
      req.log.error(
        { err, registrationId: registration.id },
        "Failed to send waitlist confirmation email",
      );
      res.status(502).json({
        error: "We could not send your confirmation email. Please try again.",
      });
      return;
    }

    res.status(201).json({
      id: registration.id,
      name: registration.name,
      email: registration.email,
      school: registration.school,
      discord_username: registration.discordUsername,
      experience_level: registration.experienceLevel,
      created_at: registration.createdAt,
    });
  } catch (err: unknown) {
    // Handle unique constraint race condition
    if (
      err instanceof Error &&
      err.message.includes("unique constraint")
    ) {
      res.status(409).json({ error: "This email is already registered on the waitlist." });
      return;
    }
    req.log.error({ err }, "Failed to insert waitlist registration");
    res.status(500).json({ error: "Failed to register. Please try again." });
  }
});

router.get("/waitlist/information-packet", (_req, res): void => {
  res.download(
    informationPacketPath,
    "BuilderWars-Information-Packet.pdf",
    (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "The information packet is unavailable." });
      }
    },
  );
});

router.get("/waitlist/check", async (req, res): Promise<void> => {
  const parsed = CheckWaitlistQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { email } = parsed.data;

  const existing = await db
    .select({ id: waitlistTable.id })
    .from(waitlistTable)
    .where(eq(waitlistTable.email, email.toLowerCase().trim()));

  res.json({ registered: existing.length > 0 });
});

export default router;

import { Router, type IRouter } from "express";
import { and, eq, isNull, not } from "drizzle-orm";
import { db, EVENT_ID, registrationsTable } from "@workspace/db";
import {
  SubmitRegistrationBody,
  CheckRegistrationQueryParams,
} from "@workspace/api-zod";
import {
  informationPacketPath,
  sendRegistrationConfirmation,
} from "../lib/registrationConfirmationEmail";

const router: IRouter = Router();

const DUPLICATE_MESSAGE =
  "This email is already registered for BuilderWars. Check your inbox for the confirmation, or contact awssbg@wayne.edu.";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// People imported from the old waitlist have no Discord username yet. When
// they submit the form, their existing row is completed instead of being
// refused as a duplicate; their original sign-up date is kept.
const incompleteWaitlistEntry = and(
  eq(registrationsTable.source, "waitlist"),
  isNull(registrationsTable.discordUsername),
);

function isUniqueViolation(err: unknown): boolean {
  // node-postgres reports unique violations as SQLSTATE 23505, sometimes
  // wrapped in a Drizzle error.
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

router.post("/registrations", async (req, res): Promise<void> => {
  const parsed = SubmitRegistrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Some fields are missing or invalid. Please check the form.",
    });
    return;
  }

  const input = parsed.data;

  // Only currently enrolled students with .edu addresses can register.
  if (!/^[^\s@]+@[^\s@]+\.edu$/i.test(input.email)) {
    res.status(400).json({ error: "A .edu email address is required." });
    return;
  }

  const email = normalizeEmail(input.email);
  const teamName =
    input.team_status === "has_team" ? input.team_name?.trim() || null : null;

  const details = {
    name: input.name.trim(),
    school: input.school.trim(),
    classStanding: input.class_standing,
    experienceLevel: input.experience_level,
    discordUsername: input.discord_username.trim(),
    teamStatus: input.team_status,
    teamName,
  };

  let registration;
  try {
    [registration] = await db
      .insert(registrationsTable)
      .values({ ...details, email })
      .returning();
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      const [completed] = await db
        .update(registrationsTable)
        .set(details)
        .where(
          and(
            eq(registrationsTable.eventId, EVENT_ID),
            eq(registrationsTable.email, email),
            incompleteWaitlistEntry,
          ),
        )
        .returning();
      if (!completed) {
        res.status(409).json({ error: DUPLICATE_MESSAGE });
        return;
      }
      registration = completed;
    } else {
      req.log.error({ err }, "Failed to save registration");
      res
        .status(500)
        .json({
          error: "We couldn't save your registration. Please try again.",
        });
      return;
    }
  }
  if (!registration) {
    res
      .status(500)
      .json({ error: "We couldn't save your registration. Please try again." });
    return;
  }

  // The registration is saved at this point. A failed email doesn't undo it;
  // confirmation_email_sent_at stays empty so organizers can see who needs a
  // resend (NFR-04).
  let emailSent = false;
  try {
    await sendRegistrationConfirmation({
      name: registration.name,
      email: registration.email,
      discordUsername: registration.discordUsername,
    });
    await db
      .update(registrationsTable)
      .set({ confirmationEmailSentAt: new Date() })
      .where(eq(registrationsTable.id, registration.id));
    emailSent = true;
  } catch (err: unknown) {
    req.log.error(
      { err, registrationId: registration.id },
      "Registration saved but the confirmation email was not sent",
    );
  }

  res.status(201).json({
    id: registration.id,
    name: registration.name,
    email: registration.email,
    status: registration.status,
    confirmation_email_sent: emailSent,
  });
});

router.get("/registrations/check", async (req, res): Promise<void> => {
  const parsed = CheckRegistrationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const existing = await db
    .select({ id: registrationsTable.id })
    .from(registrationsTable)
    .where(
      and(
        eq(registrationsTable.eventId, EVENT_ID),
        eq(registrationsTable.email, normalizeEmail(parsed.data.email)),
        // An incomplete waitlist entry can still submit the form.
        not(incompleteWaitlistEntry!),
      ),
    );

  res.json({ registered: existing.length > 0 });
});

router.get("/information-packet", (_req, res): void => {
  res.download(
    informationPacketPath,
    "BuilderWars-Information-Packet.pdf",
    (err) => {
      if (err && !res.headersSent) {
        res
          .status(500)
          .json({ error: "The information packet is unavailable." });
      }
    },
  );
});

export default router;

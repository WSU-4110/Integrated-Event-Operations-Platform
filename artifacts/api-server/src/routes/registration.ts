
import { Router, type IRouter } from "express";
import { and, eq, isNull, not } from "drizzle-orm";
import { db, EVENT_ID, registrationsTable } from "@workspace/db";
import { CheckRegistrationQueryParams } from "@workspace/api-zod";
import { informationPacketPath } from "../lib/registrationConfirmationEmail";
import { RegistrationFacade } from "../lib/registrationFacade";

const router: IRouter = Router();

// CSC 4110 Homework 4 - Facade Design Pattern
// The RegistrationFacade handles validation, database operations,
// and confirmation emails through one interface.
const registrationFacade = new RegistrationFacade();

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// People imported from the old waitlist have no Discord username yet.
// They can still complete their registration using the form.
const incompleteWaitlistEntry = and(
  eq(registrationsTable.source, "waitlist"),
  isNull(registrationsTable.discordUsername),
);

// POST /registrations
// Uses the Facade Design Pattern to simplify registration processing.
router.post("/registrations", async (req, res): Promise<void> => {
  const result = await registrationFacade.register(
    req.body,
    (err, message, registrationId) => {
      req.log.error({ err, registrationId }, message);
    },
  );

  res.status(result.statusCode).json(result.body);
});

// GET /registrations/check
// Checks whether an email is already registered for the event.
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
        eq(
          registrationsTable.email,
          normalizeEmail(parsed.data.email),
        ),
        // An incomplete waitlist entry can still submit the form.
        not(incompleteWaitlistEntry!),
      ),
    );

  res.json({ registered: existing.length > 0 });
});

// GET /information-packet
// Allows participants to download the BuilderWars information packet.
router.get("/information-packet", (_req, res): void => {
  res.download(
    informationPacketPath,
    "BuilderWars-Information-Packet.pdf",
    (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({
          error: "The information packet is unavailable.",
        });
      }
    },
  );
});

export default router;

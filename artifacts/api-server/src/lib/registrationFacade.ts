
import { and, eq, isNull } from "drizzle-orm";
import { db, EVENT_ID, registrationsTable } from "@workspace/db";
import { SubmitRegistrationBody } from "@workspace/api-zod";
import { sendRegistrationConfirmation } from "./registrationConfirmationEmail";

// Facade Design Pattern - CSC 4110 Homework 4
// This class provides one interface for the registration process.
// It coordinates validation, database operations, and confirmation emails.

const DUPLICATE_MESSAGE =
  "This email is already registered for BuilderWars. Check your inbox for the confirmation, or contact awssbg@wayne.edu.";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export type RegistrationResult =
  | { statusCode: 400 | 409 | 500; body: { error: string } }
  | {
      statusCode: 201;
      body: {
        id: number;
        name: string;
        email: string;
        status: string;
        confirmation_email_sent: boolean;
      };
    };

export class RegistrationFacade {
  // One method coordinates the registration workflow.
  async register(
    rawInput: unknown,
    logError: (err: unknown, message: string, registrationId?: number) => void,
  ): Promise<RegistrationResult> {
    // Step 1: Validate the registration.
    const parsed = SubmitRegistrationBody.safeParse(rawInput);

    if (!parsed.success) {
      return {
        statusCode: 400,
        body: {
          error: "Some fields are missing or invalid. Please check the form.",
        },
      };
    }

    const input = parsed.data;

    if (!/^[^\s@]+@[^\s@]+\.edu$/i.test(input.email)) {
      return {
        statusCode: 400,
        body: { error: "A .edu email address is required." },
      };
    }

    const email = normalizeEmail(input.email);
    const teamName =
      input.team_status === "has_team"
        ? input.team_name?.trim() || null
        : null;

    const details = {
      name: input.name.trim(),
      school: input.school.trim(),
      classStanding: input.class_standing,
      experienceLevel: input.experience_level,
      discordUsername: input.discord_username.trim(),
      teamStatus: input.team_status,
      teamName,
    };

    // Step 2: Save the registration to the database.
    // Existing incomplete waitlist entries can be completed.
    let registration;

    try {
      [registration] = await db
        .insert(registrationsTable)
        .values({ ...details, email })
        .returning();
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        try {
          const [completed] = await db
            .update(registrationsTable)
            .set(details)
            .where(
              and(
                eq(registrationsTable.eventId, EVENT_ID),
                eq(registrationsTable.email, email),
                eq(registrationsTable.source, "waitlist"),
                isNull(registrationsTable.discordUsername),
              ),
            )
            .returning();

          if (!completed) {
            return {
              statusCode: 409,
              body: { error: DUPLICATE_MESSAGE },
            };
          }

          registration = completed;
        } catch (updateError: unknown) {
          logError(updateError, "Failed to complete waitlist registration");
          return {
            statusCode: 500,
            body: {
              error: "We couldn't save your registration. Please try again.",
            },
          };
        }
      } else {
        logError(err, "Failed to save registration");
        return {
          statusCode: 500,
          body: {
            error: "We couldn't save your registration. Please try again.",
          },
        };
      }
    }

    if (!registration) {
      return {
        statusCode: 500,
        body: {
          error: "We couldn't save your registration. Please try again.",
        },
      };
    }

    // Step 3: Send the confirmation email.
    // Email failure does not undo a saved registration.
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
      logError(
        err,
        "Registration saved but the confirmation email was not sent",
        registration.id,
      );
    }

    // Step 4: Return the registration result.
    return {
      statusCode: 201,
      body: {
        id: registration.id,
        name: registration.name,
        email: registration.email,
        status: registration.status,
        confirmation_email_sent: emailSent,
      },
    };
  }
}

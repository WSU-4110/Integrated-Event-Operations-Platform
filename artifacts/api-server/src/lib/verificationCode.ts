import { createHash, randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  ACTIVE_STATUSES,
  db,
  EVENT_ID,
  registrationsTable,
  verificationCodesTable,
  type RegistrationStatus,
} from "@workspace/db";
import { sendVerificationCodeEmail } from "./verificationCodeEmail";

// FR-05: a code lasts at most 24 hours.
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;

// No 0/O or 1/I/L, so a code read off a phone screen can't be mistyped.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

// "ABCD-EFGH". randomInt uses the OS's secure random source.
export function generateVerificationCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// People type codes with or without the dash, in any case. The Discord bot
// should normalize and hash the same way before comparing.
export function normalizeVerificationCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function hashVerificationCode(input: string): string {
  return createHash("sha256")
    .update(normalizeVerificationCode(input))
    .digest("hex");
}

export type CodeOutcome =
  | { ok: true; emailSent: boolean }
  | { ok: false; reason: "not_found" | "not_eligible" };

// Creates a new code for the registration, invalidating any earlier unused
// one, and emails it. Only people with active access (pending or approved)
// get a code; removed and waitlisted people never do. A failed email is
// recorded on the code row and doesn't throw: call this again to retry,
// which issues a replacement because only the hash is stored.
export async function issueAndSendVerificationCode(
  registrationId: number,
  log: { error: (obj: object, msg: string) => void },
): Promise<CodeOutcome> {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const issued = await db.transaction(async (tx) => {
    // Lock the row so two simultaneous requests can't both issue a code.
    const [registration] = await tx
      .select()
      .from(registrationsTable)
      .where(
        and(
          eq(registrationsTable.id, registrationId),
          eq(registrationsTable.eventId, EVENT_ID),
        ),
      )
      .for("update");
    if (!registration) return "not_found" as const;
    if (!ACTIVE_STATUSES.includes(registration.status as RegistrationStatus)) {
      return "not_eligible" as const;
    }

    await tx
      .update(verificationCodesTable)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(verificationCodesTable.registrationId, registrationId),
          isNull(verificationCodesTable.usedAt),
          isNull(verificationCodesTable.invalidatedAt),
        ),
      );
    const [row] = await tx
      .insert(verificationCodesTable)
      .values({
        registrationId,
        codeHash: hashVerificationCode(code),
        expiresAt,
      })
      .returning({ id: verificationCodesTable.id });
    return { codeId: row!.id, name: registration.name, email: registration.email };
  });

  if (issued === "not_found" || issued === "not_eligible") {
    return { ok: false, reason: issued };
  }

  // The code is saved; a failed email must not undo it.
  try {
    await sendVerificationCodeEmail({
      name: issued.name,
      email: issued.email,
      code,
      expiresAt,
    });
    await db
      .update(verificationCodesTable)
      .set({ emailSentAt: new Date() })
      .where(eq(verificationCodesTable.id, issued.codeId));
    return { ok: true, emailSent: true };
  } catch (err) {
    // IDs only, never the code or the address (NFR-02).
    log.error({ err, registrationId }, "Verification code email was not sent");
    await db
      .update(verificationCodesTable)
      .set({ emailFailedAt: new Date() })
      .where(eq(verificationCodesTable.id, issued.codeId));
    return { ok: true, emailSent: false };
  }
}

// Called when someone is removed: their outstanding codes stop working.
export async function invalidateVerificationCodes(
  registrationId: number,
  executor: Pick<typeof db, "update"> = db,
): Promise<void> {
  await executor
    .update(verificationCodesTable)
    .set({ invalidatedAt: new Date() })
    .where(
      and(
        eq(verificationCodesTable.registrationId, registrationId),
        isNull(verificationCodesTable.usedAt),
        isNull(verificationCodesTable.invalidatedAt),
      ),
    );
}

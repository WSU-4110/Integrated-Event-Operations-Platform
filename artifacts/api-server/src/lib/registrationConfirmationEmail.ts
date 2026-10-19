import { readFile } from "node:fs/promises";

const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "BuilderWars <hello@builderwars.dev>";
const CONTACT_EMAIL = "awssbg@wayne.edu";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

// Sends the registration confirmation through Resend. Throws if Resend isn't
// configured or rejects the message; the caller keeps the registration either
// way and records whether the email went out.
export async function sendRegistrationConfirmation({
  name,
  email,
  packetPath,
}: {
  name: string;
  email: string;
  packetPath: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  const firstName = name.trim().split(/\s+/)[0] ?? name.trim();
  const safeFirstName = escapeHtml(firstName);
  const packetContent = (await readFile(packetPath)).toString("base64");

  const text = `Hi ${firstName},

Thanks for registering for BuilderWars, a 24-hour hackathon hosted by the AWS Student Builder Group at Wayne State University, on November 14–15, 2026 at Newlab Detroit.

Your registration is pending. Organizers review every registration, and we'll email you once yours is approved, along with how to get access to the participant Discord channels.

We've attached the event information packet. It covers the rules, schedule, and venue details, so please read it before the event.

If you have questions, reach us at ${CONTACT_EMAIL}.

See you at BuilderWars,
AWS Student Builder Group at Wayne State`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#20242a;line-height:1.6">
      <p>Hi ${safeFirstName},</p>
      <p>Thanks for registering for <strong>BuilderWars</strong>, a 24-hour hackathon hosted by the AWS Student Builder Group at Wayne State University, on November 14–15, 2026 at Newlab Detroit.</p>
      <p>Your registration is <strong>pending</strong>. Organizers review every registration, and we'll email you once yours is approved, along with how to get access to the participant Discord channels.</p>
      <p>We've attached the event information packet. It covers the rules, schedule, and venue details, so please read it before the event.</p>
      <p>If you have questions, reach us at <a href="mailto:${CONTACT_EMAIL}" style="color:#7c3aed">${CONTACT_EMAIL}</a>.</p>
      <p>See you at BuilderWars,<br />AWS Student Builder Group at Wayne State</p>
    </div>
  `;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: "Your BuilderWars registration",
      text,
      html,
      attachments: [
        {
          filename: "BuilderWars-Information-Packet.pdf",
          content: packetContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Resend rejected the confirmation email (${response.status}): ${details}`,
    );
  }
}

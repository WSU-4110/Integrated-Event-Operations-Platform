import { ReplitConnectors } from "@replit/connectors-sdk";
import { readFile } from "node:fs/promises";

const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "AWSSBG <awssbg@awsbuilderwars.dev>";

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

export async function sendWaitlistConfirmation({
  name,
  email,
  packetPath,
}: {
  name: string;
  email: string;
  packetPath: string;
}): Promise<void> {
  const firstName = name.trim().split(/\s+/)[0] ?? name.trim();
  const safeFirstName = escapeHtml(firstName);
  const packetContent = (await readFile(packetPath)).toString("base64");
  const connectors = new ReplitConnectors();

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: {
      from: EMAIL_FROM,
      to: [email],
      subject: "AWS BuilderWars Hackathon waitlist confirmation",
      text: `Hi ${firstName},

Thank you for joining the waitlist for AWS BuilderWars Hackathon! We’ve successfully received your information and added you to our waitlist.

While you’re waiting, please help us spread the word! Feel free to share this event with your friends, classmates, and anyone else who may be interested — including non-WSU students and recent graduates. We’d love to have as many people involved as possible.

📅 Registration is expected to open next month, so keep an eye on your inbox and our event updates for when registration officially opens.

📎 We’ve also attached the event information packet to this email. Please take some time to look through it, as it contains important information about the event, what to expect, and other details you’ll want to know.

If you have any questions in the meantime, please don’t hesitate to reach out to us at awssbg@wayne.edu.

We look forward to seeing you at the event!

Best,
AWS SBG Team`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#20242a;line-height:1.6">
          <p>Hi ${safeFirstName},</p>
          <p>Thank you for joining the waitlist for AWS BuilderWars Hackathon! We’ve successfully received your information and added you to our waitlist.</p>
          <p>While you’re waiting, please help us spread the word! Feel free to share this event with your friends, classmates, and anyone else who may be interested — including non-WSU students and recent graduates. We’d love to have as many people involved as possible.</p>
          <p>📅 Registration is expected to open next month, so keep an eye on your inbox and our event updates for when registration officially opens.</p>
          <p>📎 We’ve also attached the event information packet to this email. Please take some time to look through it, as it contains important information about the event, what to expect, and other details you’ll want to know.</p>
          <p>If you have any questions in the meantime, please don’t hesitate to reach out to us at <a href="mailto:awssbg@wayne.edu" style="color:#c47700">awssbg@wayne.edu</a>.</p>
          <p>We look forward to seeing you at the event!</p>
          <p>Best,<br />AWS SBG Team</p>
        </div>
      `,
      attachments: [
        {
          filename: "BuilderWars-Information-Packet.pdf",
          content: packetContent,
        },
      ],
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Resend rejected the confirmation email (${response.status}): ${details}`,
    );
  }
}
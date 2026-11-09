import { fileURLToPath } from "node:url";
import { createEmailSender, type EmailSender } from "./email/emailSender";

// Relative to the bundled server file (artifacts/api-server/dist/index.mjs).
export const informationPacketPath = fileURLToPath(
  new URL(
    "../../../attached_assets/BuilderWars_Information_Packet.pdf",
    import.meta.url,
  ),
);

const CONTACT_EMAIL = "awssbg@wayne.edu";
const DISCORD_INVITE_URL = "https://discord.com/invite/mrYkakzvUj";
const INSTAGRAM_URL = "https://www.instagram.com/builderwars.hack/";

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

// The registration confirmation: thanks, plus how to join the Discord and
// verify there with /verify.
export function buildRegistrationEmail({
  name,
  email,
  discordUsername,
}: {
  name: string;
  email: string;
  discordUsername: string | null;
}): { subject: string; text: string; html: string } {
  const firstName = name.trim().split(/\s+/)[0] ?? name.trim();
  const usernameNote = discordUsername
    ? ` Your Discord username has to match the one you registered with: ${discordUsername}.`
    : "";

  const text = `Hi ${firstName},

Thanks for registering for BuilderWars, a 24-hour hackathon hosted by the AWS Student Builder Group at Wayne State University, on November 14–15, 2026 at Newlab Detroit.

Next, join the BuilderWars Discord. Event updates, resources, and team channels are there:

1. Join the server: ${DISCORD_INVITE_URL}
2. In #how-to-verify, react to the message to unlock the verification channel.
3. In #☑️-builderwars-verification, use the /verify command and enter the email you registered with (${email}).${usernameNote}

Follow BuilderWars on Instagram for updates: ${INSTAGRAM_URL}

If you have questions, reach us at ${CONTACT_EMAIL}.

See you at BuilderWars,
AWS Student Builder Group at Wayne State`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#20242a;line-height:1.6">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Thanks for registering for <strong>BuilderWars</strong>, a 24-hour hackathon hosted by the AWS Student Builder Group at Wayne State University, on November 14–15, 2026 at Newlab Detroit.</p>
      <p>Next, join the BuilderWars Discord. Event updates, resources, and team channels are there:</p>
      <ol>
        <li><a href="${DISCORD_INVITE_URL}" style="color:#7c3aed">Join the BuilderWars Discord</a></li>
        <li>In <strong>#how-to-verify</strong>, react to the message to unlock the verification channel.</li>
        <li>In <strong>#☑️-builderwars-verification</strong>, use the <code>/verify</code> command and enter the email you registered with (${escapeHtml(email)}).${escapeHtml(usernameNote)}</li>
      </ol>
      <p><a href="${DISCORD_INVITE_URL}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Join the Discord</a></p>
      <p>Follow BuilderWars on <a href="${INSTAGRAM_URL}" style="color:#7c3aed">Instagram</a> for updates.</p>
      <p>If you have questions, reach us at <a href="mailto:${CONTACT_EMAIL}" style="color:#7c3aed">${CONTACT_EMAIL}</a>.</p>
      <p>See you at BuilderWars,<br />AWS Student Builder Group at Wayne State</p>
    </div>
  `;

  return {
    subject: "Thanks for registering for BuilderWars",
    text,
    html,
  };
}

type ConfirmationDetails = {
  name: string;
  email: string;
  discordUsername: string | null;
};

// The context of the Strategy pattern: builds the confirmation and hands it to
// whichever EmailSender it was given. Throws if the sender fails; the caller
// keeps the registration either way and records whether the email went out.
export class RegistrationConfirmationMailer {
  constructor(private readonly sender: EmailSender) {}

  async sendConfirmation(details: ConfirmationDetails): Promise<void> {
    const { subject, text, html } = buildRegistrationEmail(details);
    await this.sender.send({ to: details.email, subject, text, html });
  }
}

export const confirmationMailer = new RegistrationConfirmationMailer(
  createEmailSender(),
);

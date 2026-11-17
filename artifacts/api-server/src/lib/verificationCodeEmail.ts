// The email that carries a Discord verification code (FR-05).
const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "BuilderWars <hello@builderwars.dev>";
const CONTACT_EMAIL = "awssbg@wayne.edu";
const DISCORD_INVITE_URL = "https://discord.com/invite/mrYkakzvUj";

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

export type VerificationCodeEmailDetails = {
  name: string;
  email: string;
  code: string;
  expiresAt: Date;
};

export function buildVerificationCodeEmail({
  name,
  email,
  code,
  expiresAt,
}: VerificationCodeEmailDetails): { subject: string; text: string; html: string } {
  const firstName = name.trim().split(/\s+/)[0] ?? name.trim();
  const expires =
    expiresAt.toLocaleString("en-US", {
      timeZone: "America/Detroit",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " ET";

  const text = `Hi ${firstName},

Here is your BuilderWars verification code:

${code}

It works once and expires on ${expires}. If you request a new code, this one stops working.

To link your Discord account:

1. Join the server if you haven't: ${DISCORD_INVITE_URL}
2. In #how-to-verify, react to the message to unlock the verification channel.
3. In #☑️-builderwars-verification, use the /verify command with the email you registered with (${email}) and this code.

If you didn't register for BuilderWars, you can ignore this email. Questions: ${CONTACT_EMAIL}.

AWS Student Builder Group at Wayne State`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#20242a;line-height:1.6">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Here is your <strong>BuilderWars</strong> verification code:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px;font-family:monospace">${escapeHtml(code)}</p>
      <p>It works once and expires on ${escapeHtml(expires)}. If you request a new code, this one stops working.</p>
      <ol>
        <li><a href="${DISCORD_INVITE_URL}" style="color:#7c3aed">Join the BuilderWars Discord</a> if you haven't</li>
        <li>In <strong>#how-to-verify</strong>, react to the message to unlock the verification channel.</li>
        <li>In <strong>#☑️-builderwars-verification</strong>, use the <code>/verify</code> command with the email you registered with (${escapeHtml(email)}) and this code.</li>
      </ol>
      <p>If you didn't register for BuilderWars, you can ignore this email. Questions: <a href="mailto:${CONTACT_EMAIL}" style="color:#7c3aed">${CONTACT_EMAIL}</a>.</p>
      <p>AWS Student Builder Group at Wayne State</p>
    </div>
  `;

  return { subject: "Your BuilderWars verification code", text, html };
}

// Throws if Resend isn't configured or rejects the message. The caller
// records the outcome.
export async function sendVerificationCodeEmail(
  details: VerificationCodeEmailDetails,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }
  const { subject, text, html } = buildVerificationCodeEmail(details);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [details.email], subject, text, html }),
  });

  if (!response.ok) {
    // Status only: the body could echo the recipient or the message.
    throw new Error(
      `Resend rejected the verification code email (${response.status}).`,
    );
  }
}

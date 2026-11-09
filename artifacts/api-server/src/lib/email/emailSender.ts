// Strategy pattern: how an email is delivered is a strategy behind the
// EmailSender interface. Code that sends email (RegistrationConfirmationMailer)
// depends only on the interface, so the provider can change (Resend today,
// Amazon SES later) or be replaced in tests without touching that code.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

const RESEND_API_URL = "https://api.resend.com/emails";

// Delivers through the Resend API.
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Resend rejected the email (${response.status}): ${details}`,
      );
    }
  }
}

// Used when no email provider is configured (local development and tests).
// Every send fails, so callers record that the email didn't go out, exactly
// as they do when a provider rejects a message.
export class UnconfiguredEmailSender implements EmailSender {
  async send(): Promise<void> {
    throw new Error("RESEND_API_KEY is not set.");
  }
}

// Picks the strategy from the environment once, at startup.
export function createEmailSender(
  env: NodeJS.ProcessEnv = process.env,
): EmailSender {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return new UnconfiguredEmailSender();
  return new ResendEmailSender(
    apiKey,
    env.RESEND_FROM_EMAIL ?? "BuilderWars <hello@builderwars.dev>",
  );
}

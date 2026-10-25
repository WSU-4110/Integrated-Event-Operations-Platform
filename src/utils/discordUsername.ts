// Discord usernames are 2–32 characters of a-z, 0-9, `_` and `.`, with no
// two periods in a row.
const VALID_USERNAME = /^(?!.*\.\.)[a-z0-9_.]{2,32}$/;

/**
 * Normalizes a Discord username for comparison. Applied to both sides of
 * every match: what the website stored and `interaction.user.username`.
 * Returns null when the value can't be a valid username.
 */
export function normalizeDiscordUsername(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/#\d{1,4}$/, ''); // legacy discriminator: #0, #1234
  return VALID_USERNAME.test(normalized) ? normalized : null;
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

// All times are stored in UTC and shown with Discord timestamp markup, so each
// participant sees them in their own time zone.

export type TimestampStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

export function discordTimestamp(date: Date, style: TimestampStyle = 'F'): string {
  const seconds = Math.floor(date.getTime() / 1000);
  if (Number.isNaN(seconds)) throw new Error('Invalid date');
  return `<t:${seconds}:${style}>`;
}

// Content files write times as `{t:2026-11-14T12:00:00-05:00|F}` (ISO 8601
// with an explicit offset, then an optional style), which stays readable for
// organizers editing them.
const PLACEHOLDER = /\{t:([^|}]+)(?:\|([tTdDfFR]))?\}/g;
const HAS_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

export function renderTimePlaceholders(text: string): string {
  return text.replace(PLACEHOLDER, (_match, iso: string, style?: string) => {
    if (!HAS_OFFSET.test(iso)) {
      throw new Error(`Time "${iso}" needs a UTC offset, for example 2026-11-14T12:00:00-05:00`);
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid time "${iso}"`);
    return discordTimestamp(date, (style as TimestampStyle | undefined) ?? 'F');
  });
}

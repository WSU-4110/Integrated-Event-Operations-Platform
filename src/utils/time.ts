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

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', number>;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/;

/**
 * Parses a time typed by an organizer: `2026-11-14 14:00` in the event's
 * time zone, or ISO 8601 with an explicit offset. Returns null if invalid.
 */
export function parseEventTime(input: string, timeZone: string): Date | null {
  const text = input.trim();
  if (HAS_OFFSET.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const match = LOCAL_DATE_TIME.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes so times near a DST change use the offset in effect then.
  let date = new Date(wallClock - zoneOffsetMs(new Date(wallClock), timeZone));
  date = new Date(wallClock - zoneOffsetMs(date, timeZone));

  // Rejects impossible dates (Feb 30, 25:00) and wall-clock times skipped by DST.
  const roundTrip = new Date(date.getTime() + zoneOffsetMs(date, timeZone));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

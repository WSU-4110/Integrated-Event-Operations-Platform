import { describe, expect, it } from 'vitest';
import {
  discordTimestamp,
  isValidTimeZone,
  formatEventTime,
  parseEventTime,
  renderTimePlaceholders,
} from '../../src/utils/time.js';

// Hacking starts at noon Detroit time (EST, UTC-5) = 17:00 UTC.
const HACKING_STARTS = Date.UTC(2026, 10, 14, 17, 0, 0) / 1000;

describe('discordTimestamp', () => {
  it('formats a date as Discord timestamp markup', () => {
    expect(discordTimestamp(new Date(HACKING_STARTS * 1000), 'R')).toBe(`<t:${HACKING_STARTS}:R>`);
    expect(discordTimestamp(new Date(HACKING_STARTS * 1000))).toBe(`<t:${HACKING_STARTS}:F>`);
  });

  it('rejects invalid dates', () => {
    expect(() => discordTimestamp(new Date('nope'))).toThrow();
  });
});

describe('renderTimePlaceholders', () => {
  it('converts offset ISO times to UTC timestamps', () => {
    expect(renderTimePlaceholders('Starts {t:2026-11-14T12:00:00-05:00|t}!')).toBe(
      `Starts <t:${HACKING_STARTS}:t>!`,
    );
  });

  it('defaults to the full date/time style', () => {
    expect(renderTimePlaceholders('{t:2026-11-14T17:00:00Z}')).toBe(`<t:${HACKING_STARTS}:F>`);
  });

  it('leaves text without placeholders untouched', () => {
    expect(renderTimePlaceholders('No times {here}')).toBe('No times {here}');
  });

  it('requires an explicit UTC offset so times are never ambiguous', () => {
    expect(() => renderTimePlaceholders('{t:2026-11-14T12:00:00}')).toThrow(/offset/);
  });

  it('rejects invalid times', () => {
    expect(() => renderTimePlaceholders('{t:2026-13-45T99:00:00Z}')).toThrow(/Invalid/);
  });
});

describe('parseEventTime', () => {
  const zone = 'America/Detroit';
  const iso = (input: string, tz = zone) => parseEventTime(input, tz)?.toISOString();

  it('reads wall-clock times in the event time zone', () => {
    expect(iso('2026-11-14 12:00')).toBe('2026-11-14T17:00:00.000Z'); // EST
    expect(iso('2026-07-04T09:30')).toBe('2026-07-04T13:30:00.000Z'); // EDT
    expect(iso(' 2026-11-15 7:05 ')).toBe('2026-11-15T12:05:00.000Z');
    expect(iso('2026-11-14 12:00', 'UTC')).toBe('2026-11-14T12:00:00.000Z');
  });

  it('handles the DST change around the event', () => {
    // Clocks fall back on Nov 1, 2026: 01:30 happens twice; either is acceptable.
    expect(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']).toContain(
      iso('2026-11-01 01:30'),
    );
    expect(iso('2026-11-01 03:00')).toBe('2026-11-01T08:00:00.000Z');
    // Clocks spring forward on Mar 8, 2026: 02:30 never happens.
    expect(iso('2026-03-08 02:30')).toBeUndefined();
  });

  it('accepts ISO times with an explicit offset as-is', () => {
    expect(iso('2026-11-14T12:00:00-05:00')).toBe('2026-11-14T17:00:00.000Z');
    expect(iso('2026-11-14T17:00:00Z')).toBe('2026-11-14T17:00:00.000Z');
  });

  it('rejects anything else', () => {
    for (const input of ['saturday 2pm', '2026-02-30 10:00', '2026-11-14 25:00', '11/14 2pm', '']) {
      expect(parseEventTime(input, zone), input).toBeNull();
    }
  });
});

describe('formatEventTime', () => {
  it('writes times the way organizers type them, and round-trips through parseEventTime', () => {
    const zone = 'America/Detroit';
    expect(formatEventTime(new Date('2026-11-14T19:00:00Z'), zone)).toBe('2026-11-14 14:00');
    expect(formatEventTime(new Date('2026-07-04T16:30:00Z'), zone)).toBe('2026-07-04 12:30'); // EDT
    for (const text of ['2026-11-14 00:05', '2026-11-01 01:30', '2026-03-08 03:00']) {
      expect(formatEventTime(parseEventTime(text, zone)!, zone)).toBe(text);
    }
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones only', () => {
    expect(isValidTimeZone('America/Detroit')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

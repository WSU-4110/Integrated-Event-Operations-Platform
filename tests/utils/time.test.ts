import { describe, expect, it } from 'vitest';
import { discordTimestamp, renderTimePlaceholders } from '../../src/utils/time.js';

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

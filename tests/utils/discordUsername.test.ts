import { describe, expect, it } from 'vitest';
import { normalizeDiscordUsername, normalizeEmail } from '../../src/utils/discordUsername.js';

describe('normalizeDiscordUsername', () => {
  it.each([
    ['Ada_Example', 'ada_example'],
    ['  ada.example  ', 'ada.example'],
    ['@ada_example', 'ada_example'],
    ['ada_example#0', 'ada_example'],
    ['Ada_Example#1234', 'ada_example'],
    [' @Ada.Example#0 ', 'ada.example'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeDiscordUsername(input)).toBe(expected);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['too short', 'a'],
    ['too long', 'a'.repeat(33)],
    ['spaces inside', 'ada example'],
    ['other symbols', 'ada-example!'],
    ['consecutive periods', 'ada..example'],
    ['only an @', '@'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeDiscordUsername(input)).toBeNull();
  });

  it('accepts the length limits exactly', () => {
    expect(normalizeDiscordUsername('ab')).toBe('ab');
    expect(normalizeDiscordUsername('a'.repeat(32))).toBe('a'.repeat(32));
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ada@Wayne.EDU ')).toBe('ada@wayne.edu');
  });
});

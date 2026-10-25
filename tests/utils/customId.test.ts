import { describe, expect, it } from 'vitest';
import { buildCustomId, parseCustomId } from '../../src/utils/customId.js';

describe('custom IDs', () => {
  it('round-trips namespace, action and args', () => {
    const id = buildCustomId('workshop', 'register', 42);
    expect(id).toBe('workshop:register:42');
    expect(parseCustomId(id)).toEqual({ namespace: 'workshop', action: 'register', args: ['42'] });
  });

  it('rejects parts that would break parsing', () => {
    expect(() => buildCustomId('help', 'show', 'a:b')).toThrow();
    expect(() => buildCustomId('help', '')).toThrow();
  });

  it("enforces Discord's 100-character limit", () => {
    expect(() => buildCustomId('x', 'y', 'z'.repeat(100))).toThrow(/100/);
  });

  it('returns null for IDs without an action', () => {
    expect(parseCustomId('lonely')).toBeNull();
    expect(parseCustomId('')).toBeNull();
  });
});

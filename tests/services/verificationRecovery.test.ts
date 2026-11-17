
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RATE_LIMIT,
  createVerificationService,
} from '../../src/services/verificationService.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/testDatabase.js';

const USER = {
  discordUserId: '500000000000008008',
  discordUsername: 'recovery_test_user',
};

let t: TestDatabase;
let service: ReturnType<typeof createVerificationService>;

beforeEach(async () => {
  t = await createTestDatabase();
  service = createVerificationService(t.repos);
});

afterEach(async () => {
  await t.close();
});

describe('FR-08 verification failure recovery', () => {
  it('uses five failures and a 15-minute window', () => {
    expect(RATE_LIMIT.maxFailures).toBe(5);
    expect(RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
  });

  it('blocks verification after five failed attempts', async () => {
    await t.addRegistration({
      email: 'participant@wayne.edu',
      discordUsername: USER.discordUsername,
    });

    for (let i = 0; i < 5; i++) {
      const result = await service.verify({
        ...USER,
        email: `wrong${i}@wayne.edu`,
      });

      expect(result.kind).toBe('no_match');
    }

    expect(await service.isRateLimited(USER.discordUserId)).toBe(true);

    const blocked = await service.verify({
      ...USER,
      email: 'participant@wayne.edu',
    });

    expect(blocked.kind).toBe('rate_limited');
    expect(await service.getLink(USER.discordUserId)).toBeNull();
  });

  it('allows recovery after the 15-minute lockout expires', async () => {
    await t.addRegistration({
      email: 'participant@wayne.edu',
      discordUsername: USER.discordUsername,
    });

    for (let i = 0; i < 5; i++) {
      await service.verify({
        ...USER,
        email: `wrong${i}@wayne.edu`,
      });
    }

    expect(await service.isRateLimited(USER.discordUserId)).toBe(true);

    // Simulate the passage of 16 minutes without waiting.
    await t.pg.query(
      "UPDATE discord_bot.verification_attempts SET created_at = created_at - interval '16 minutes' WHERE discord_user_id = $1",
      [USER.discordUserId],
    );

    expect(await service.isRateLimited(USER.discordUserId)).toBe(false);

    const recovered = await service.verify({
      ...USER,
      email: 'participant@wayne.edu',
    });

    expect(recovered.kind).toBe('verified');
  });
});

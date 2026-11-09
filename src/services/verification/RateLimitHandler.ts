import { RATE_LIMIT, type VerifyOutcome } from '../verificationService.js';
import { AbstractVerificationHandler } from './AbstractVerificationHandler.js';
import type { VerificationRequest } from './VerificationRequest.js';

/** Stops users who have failed too many times recently. */
export class RateLimitHandler extends AbstractVerificationHandler {
  async handle(request: VerificationRequest): Promise<VerifyOutcome> {
    const failures = await this.repos.attempts.countRecentFailures(
      request.discordUserId,
      RATE_LIMIT.windowMs,
    );
    if (failures >= RATE_LIMIT.maxFailures) {
      await this.record(request, 'RATE_LIMITED');
      return { kind: 'rate_limited' };
    }
    return this.passToNext(request);
  }
}

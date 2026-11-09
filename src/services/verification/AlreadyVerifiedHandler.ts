import type { VerifyOutcome } from '../verificationService.js';
import { AbstractVerificationHandler } from './AbstractVerificationHandler.js';
import type { VerificationRequest } from './VerificationRequest.js';

/** Stops early if this Discord user is already linked. */
export class AlreadyVerifiedHandler extends AbstractVerificationHandler {
  async handle(request: VerificationRequest): Promise<VerifyOutcome> {
    const existing = await this.repos.links.findByDiscordUserId(request.discordUserId);
    if (existing) return { kind: 'already_verified', link: existing };
    return this.passToNext(request);
  }
}

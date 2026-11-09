import { normalizeDiscordUsername, normalizeEmail } from '../../utils/discordUsername.js';
import type { VerifyOutcome } from '../verificationService.js';
import { AbstractVerificationHandler } from './AbstractVerificationHandler.js';
import type { VerificationRequest } from './VerificationRequest.js';

/** Finds registrations matching BOTH the email and the Discord username. */
export class RegistrationMatchHandler extends AbstractVerificationHandler {
  async handle(request: VerificationRequest): Promise<VerifyOutcome> {
    const username = normalizeDiscordUsername(request.discordUsername);
    request.normalizedUsername = username;
    const byEmail = await this.repos.registrations.findByEmail(normalizeEmail(request.email));
    request.candidates = byEmail.filter(
      (reg) => username !== null && normalizeDiscordUsername(reg.discordUsername) === username,
    );

    if (request.candidates.length === 0) {
      await this.record(request, 'NO_MATCH');
      return { kind: 'no_match' };
    }
    return this.passToNext(request);
  }
}

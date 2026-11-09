import type { VerifyOutcome } from '../verificationService.js';
import { AbstractVerificationHandler } from './AbstractVerificationHandler.js';
import type { VerificationRequest } from './VerificationRequest.js';

/** End of the chain: creates the link, handling races and already-taken registrations. */
export class LinkCreationHandler extends AbstractVerificationHandler {
  async handle(request: VerificationRequest): Promise<VerifyOutcome> {
    const { registration, discordUserId } = request;
    if (!registration) throw new Error('LinkCreationHandler needs a chosen registration');

    const created = await this.repos.links.create({
      discordUserId,
      registrationId: registration.id,
      linkedBy: null,
    });
    if (!created.ok) {
      if (created.conflict === 'discord_user') {
        // Lost a race with this user's own concurrent /verify.
        const link = await this.repos.links.findByDiscordUserId(discordUserId);
        if (link) return { kind: 'already_verified', link };
      }
      await this.record(request, 'ALREADY_LINKED', registration.id);
      return { kind: 'already_linked', registrationId: registration.id };
    }

    await this.record(request, 'MATCHED', registration.id);
    await this.repos.attempts.resolveForUser(discordUserId);
    return { kind: 'verified', link: created.link };
  }
}

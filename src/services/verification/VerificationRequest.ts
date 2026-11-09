import type { RegistrationMatchCandidate } from '../../database/repositories/websiteRegistrationRepository.js';

/**
 * Everything one /verify attempt carries down the chain. The first three
 * fields come from the user; the rest are filled in by handlers as they run.
 */
export class VerificationRequest {
  /** Set by RegistrationMatchHandler: the Discord username, normalized (null if unusable). */
  normalizedUsername: string | null = null;
  /** Set by RegistrationMatchHandler: registrations matching BOTH email and username. */
  candidates: RegistrationMatchCandidate[] = [];
  /** Set by EligibilityHandler: the single registration being linked. */
  registration: RegistrationMatchCandidate | null = null;

  constructor(
    readonly discordUserId: string,
    readonly discordUsername: string,
    readonly email: string,
  ) {}
}

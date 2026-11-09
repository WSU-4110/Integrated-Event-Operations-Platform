import { isEligibleStatus } from '../../database/website/registrations.js';
import type { VerifyOutcome } from '../verificationService.js';
import { AbstractVerificationHandler } from './AbstractVerificationHandler.js';
import type { VerificationRequest } from './VerificationRequest.js';

/** Picks the single candidate and requires it to be pending or approved. */
export class EligibilityHandler extends AbstractVerificationHandler {
  async handle(request: VerificationRequest): Promise<VerifyOutcome> {
    const [registration] = request.candidates;
    if (!registration) throw new Error('EligibilityHandler needs a matched registration');
    request.registration = registration;

    if (!isEligibleStatus(registration.status)) {
      await this.record(request, 'INELIGIBLE', registration.id);
      return { kind: 'ineligible', status: registration.status };
    }
    return this.passToNext(request);
  }
}

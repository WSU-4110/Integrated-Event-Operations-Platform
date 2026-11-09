import type { VerifyOutcome } from '../verificationService.js';
import { AbstractVerificationHandler } from './AbstractVerificationHandler.js';
import type { VerificationRequest } from './VerificationRequest.js';

/** Refuses to guess when more than one registration matches. */
export class AmbiguousMatchHandler extends AbstractVerificationHandler {
  async handle(request: VerificationRequest): Promise<VerifyOutcome> {
    if (request.candidates.length > 1) {
      await this.record(request, 'AMBIGUOUS');
      return { kind: 'ambiguous', registrationIds: request.candidates.map((c) => c.id) };
    }
    return this.passToNext(request);
  }
}

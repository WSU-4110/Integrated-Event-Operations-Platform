import type { VerifyOutcome } from '../verificationService.js';
import type { VerificationRequest } from './VerificationRequest.js';

export interface VerificationHandler {
  /** Sets the handler that runs after this one and returns it, so calls can be chained. */
  setNext(handler: VerificationHandler): VerificationHandler;
  /** Either settles the request with an outcome, or passes it to the next handler. */
  handle(request: VerificationRequest): Promise<VerifyOutcome>;
}

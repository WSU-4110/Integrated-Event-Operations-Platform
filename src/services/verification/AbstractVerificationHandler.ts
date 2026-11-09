import type { Repositories } from '../../database/repositories/index.js';
import type { VerifyOutcome } from '../verificationService.js';
import type { VerificationHandler } from './VerificationHandler.js';
import type { VerificationRequest } from './VerificationRequest.js';

export abstract class AbstractVerificationHandler implements VerificationHandler {
  protected next: VerificationHandler | null = null;

  constructor(protected readonly repos: Repositories) {}

  setNext(handler: VerificationHandler): VerificationHandler {
    this.next = handler;
    return handler;
  }

  abstract handle(request: VerificationRequest): Promise<VerifyOutcome>;

  /** Forwards the request to the next handler. The chain must end in a handler that settles it. */
  protected passToNext(request: VerificationRequest): Promise<VerifyOutcome> {
    if (!this.next) {
      throw new Error(
        `${this.constructor.name} is the end of the chain but did not settle the request`,
      );
    }
    return this.next.handle(request);
  }

  /** Records a verification attempt for this request's user. */
  protected record(
    request: VerificationRequest,
    result: Parameters<Repositories['attempts']['record']>[0]['result'],
    registrationId?: number,
  ): Promise<unknown> {
    return this.repos.attempts.record({
      discordUserId: request.discordUserId,
      discordUsername: request.discordUsername,
      result,
      registrationId,
    });
  }
}

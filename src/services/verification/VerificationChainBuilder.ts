// Chain of Responsibility pattern for the Discord /verify flow (FR-06, FR-08).
//
// Verification is a series of checks (already linked? rate limited? any match?
// ambiguous? eligible?) where each one either settles the request with an
// outcome or passes it on. Each check is its own handler class, so a check can
// be tested alone, and adding or reordering a rule means changing this wiring
// instead of editing one long function full of early returns.

import type { Repositories } from '../../database/repositories/index.js';
import { AlreadyVerifiedHandler } from './AlreadyVerifiedHandler.js';
import { AmbiguousMatchHandler } from './AmbiguousMatchHandler.js';
import { EligibilityHandler } from './EligibilityHandler.js';
import { LinkCreationHandler } from './LinkCreationHandler.js';
import { RateLimitHandler } from './RateLimitHandler.js';
import { RegistrationMatchHandler } from './RegistrationMatchHandler.js';
import type { VerificationHandler } from './VerificationHandler.js';

/** Wires the handlers in order and returns the first one. */
export function buildVerificationChain(repos: Repositories): VerificationHandler {
  const first = new AlreadyVerifiedHandler(repos);
  first
    .setNext(new RateLimitHandler(repos))
    .setNext(new RegistrationMatchHandler(repos))
    .setNext(new AmbiguousMatchHandler(repos))
    .setNext(new EligibilityHandler(repos))
    .setNext(new LinkCreationHandler(repos));
  return first;
}

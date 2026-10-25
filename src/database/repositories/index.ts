import type { Database } from '../types.js';
import {
  createParticipantLinkRepository,
  type ParticipantLinkRepository,
} from './participantLinkRepository.js';
import {
  createVerificationAttemptRepository,
  type VerificationAttemptRepository,
} from './verificationAttemptRepository.js';
import {
  createWebsiteRegistrationRepository,
  type WebsiteRegistrationRepository,
} from './websiteRegistrationRepository.js';

export interface Repositories {
  registrations: WebsiteRegistrationRepository;
  links: ParticipantLinkRepository;
  attempts: VerificationAttemptRepository;
}

export function createRepositories(db: Database, eventId: string): Repositories {
  return {
    registrations: createWebsiteRegistrationRepository(db, eventId),
    links: createParticipantLinkRepository(db),
    attempts: createVerificationAttemptRepository(db),
  };
}

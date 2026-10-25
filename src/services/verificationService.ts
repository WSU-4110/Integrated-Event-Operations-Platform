import type { Repositories } from '../database/repositories/index.js';
import type { ParticipantLink } from '../database/schema/index.js';
import { isEligibleStatus } from '../database/website/registrations.js';
import { normalizeDiscordUsername, normalizeEmail } from '../utils/discordUsername.js';

// Links Discord accounts to website registrations. A self-service link needs
// BOTH the Discord username stored on the registration AND the registration
// email, and the registration must be pending or approved. A username alone
// is never enough: anyone can rename themselves to match someone else.

export const RATE_LIMIT = { maxFailures: 5, windowMs: 60 * 60 * 1000 };

export type VerifyOutcome =
  | { kind: 'verified'; link: ParticipantLink }
  | { kind: 'already_verified'; link: ParticipantLink }
  | { kind: 'no_match' }
  | { kind: 'ineligible'; status: string }
  | { kind: 'ambiguous'; registrationIds: number[] }
  | { kind: 'already_linked'; registrationId: number }
  | { kind: 'rate_limited' };

export type ManualLinkOutcome =
  | {
      kind: 'linked';
      link: ParticipantLink;
      registration: { id: number; name: string; status: string };
    }
  | { kind: 'registration_not_found' }
  | { kind: 'ambiguous_email'; registrationIds: number[] }
  | { kind: 'ineligible'; status: string }
  | { kind: 'registration_taken'; discordUserId: string }
  | { kind: 'user_already_linked'; registrationId: number };

export interface SyncResult {
  /** Links turned inactive this run, with the website status that caused it. */
  deactivated: (ParticipantLink & { status: string })[];
  reactivated: ParticipantLink[];
  /** Every link that is active after this run. */
  active: ParticipantLink[];
}

export type VerificationService = ReturnType<typeof createVerificationService>;

export function createVerificationService(repos: Repositories) {
  const { registrations, links, attempts } = repos;

  async function isRateLimited(discordUserId: string): Promise<boolean> {
    const failures = await attempts.countRecentFailures(discordUserId, RATE_LIMIT.windowMs);
    return failures >= RATE_LIMIT.maxFailures;
  }

  return {
    getLink: (discordUserId: string) => links.findByDiscordUserId(discordUserId),
    isRateLimited,

    async verify(input: {
      discordUserId: string;
      discordUsername: string;
      email: string;
    }): Promise<VerifyOutcome> {
      const { discordUserId, discordUsername } = input;
      const record = (
        result: Parameters<typeof attempts.record>[0]['result'],
        registrationId?: number,
      ) => attempts.record({ discordUserId, discordUsername, result, registrationId });

      const existing = await links.findByDiscordUserId(discordUserId);
      if (existing) return { kind: 'already_verified', link: existing };

      if (await isRateLimited(discordUserId)) {
        await record('RATE_LIMITED');
        return { kind: 'rate_limited' };
      }

      const username = normalizeDiscordUsername(discordUsername);
      const candidates = (await registrations.findByEmail(normalizeEmail(input.email))).filter(
        (reg) => username !== null && normalizeDiscordUsername(reg.discordUsername) === username,
      );

      if (candidates.length === 0) {
        await record('NO_MATCH');
        return { kind: 'no_match' };
      }
      if (candidates.length > 1) {
        await record('AMBIGUOUS');
        return { kind: 'ambiguous', registrationIds: candidates.map((c) => c.id) };
      }

      const [registration] = candidates as [(typeof candidates)[number]];
      if (!isEligibleStatus(registration.status)) {
        await record('INELIGIBLE', registration.id);
        return { kind: 'ineligible', status: registration.status };
      }

      const created = await links.create({
        discordUserId,
        registrationId: registration.id,
        linkedBy: null,
      });
      if (!created.ok) {
        if (created.conflict === 'discord_user') {
          // Lost a race with this user's own concurrent /verify.
          const link = await links.findByDiscordUserId(discordUserId);
          if (link) return { kind: 'already_verified', link };
        }
        await record('ALREADY_LINKED', registration.id);
        return { kind: 'already_linked', registrationId: registration.id };
      }

      await record('MATCHED', registration.id);
      await attempts.resolveForUser(discordUserId);
      return { kind: 'verified', link: created.link };
    },

    /** Organizer override: link by registration ID or email, bypassing the username check. */
    async linkManually(input: {
      discordUserId: string;
      organizerId: string;
      registrationId?: number;
      email?: string;
    }): Promise<ManualLinkOutcome> {
      let registrationId = input.registrationId;
      if (registrationId === undefined && input.email) {
        const matches = await registrations.findByEmail(normalizeEmail(input.email));
        if (matches.length > 1) {
          return { kind: 'ambiguous_email', registrationIds: matches.map((m) => m.id) };
        }
        registrationId = matches[0]?.id;
      }
      if (registrationId === undefined) return { kind: 'registration_not_found' };

      const registration = await registrations.findById(registrationId);
      if (!registration) return { kind: 'registration_not_found' };
      if (!isEligibleStatus(registration.status)) {
        return { kind: 'ineligible', status: registration.status };
      }

      const userLink = await links.findByDiscordUserId(input.discordUserId);
      if (userLink) return { kind: 'user_already_linked', registrationId: userLink.registrationId };
      const registrationLink = await links.findByRegistrationId(registration.id);
      if (registrationLink) {
        return { kind: 'registration_taken', discordUserId: registrationLink.discordUserId };
      }

      const created = await links.create({
        discordUserId: input.discordUserId,
        registrationId: registration.id,
        linkedBy: input.organizerId,
      });
      if (!created.ok) {
        // Someone verified between our checks and the insert; report what's there now.
        const current = await links.findByRegistrationId(registration.id);
        return current
          ? { kind: 'registration_taken', discordUserId: current.discordUserId }
          : { kind: 'user_already_linked', registrationId: registration.id };
      }

      await attempts.resolveForUser(input.discordUserId);
      return { kind: 'linked', link: created.link, registration };
    },

    unlink: (discordUserId: string) => links.deleteByDiscordUserId(discordUserId),

    getRegistration: (registrationId: number) => registrations.findById(registrationId),

    /** Unresolved failed attempts for organizers, latest per user. */
    listVerificationQueue: (limit = 20) => attempts.listUnresolved(limit),

    /** True if a registration that could be verified uses this Discord username. */
    async hasLikelyRegistration(discordUsername: string): Promise<boolean> {
      const username = normalizeDiscordUsername(discordUsername);
      if (!username) return false;
      return (await registrations.listWithDiscordUsername()).some(
        (reg) =>
          isEligibleStatus(reg.status) &&
          normalizeDiscordUsername(reg.discordUsername) === username,
      );
    },

    /**
     * Matches link state to the website: links whose registration is no longer
     * pending/approved (or was deleted) become inactive, and come back if the
     * registration is approved again. Discord roles are handled by the caller.
     */
    async syncLinkStatuses(): Promise<SyncResult> {
      const all = await links.listAll();
      const statuses = await registrations.findStatuses(all.map((l) => l.registrationId));

      const deactivated: SyncResult['deactivated'] = [];
      const reactivated: ParticipantLink[] = [];
      const active: ParticipantLink[] = [];

      for (const link of all) {
        const status = statuses.get(link.registrationId);
        const eligible = isEligibleStatus(status);
        if (link.active && !eligible) {
          deactivated.push({ ...link, active: false, status: status ?? 'deleted' });
        } else if (!link.active && eligible) {
          reactivated.push({ ...link, active: true });
          active.push({ ...link, active: true });
        } else if (link.active) {
          active.push(link);
        }
      }

      await links.setActive(
        deactivated.map((l) => l.id),
        false,
      );
      await links.setActive(
        reactivated.map((l) => l.id),
        true,
      );
      return { deactivated, reactivated, active };
    },
  };
}

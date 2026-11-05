import { isUniqueViolation } from '../database/errors.js';
import type { Repositories } from '../database/repositories/index.js';
import type {
  LockedTeam,
  TeamContent,
  TeamMember,
  TeamRequestDetails,
  TeamWithCount,
} from '../database/repositories/teamRepository.js';
import {
  TEAM_MEMBER_UNIQUE,
  type LftProfile,
  type ParticipantLink,
  type Team,
  type TeamJoinRequest,
} from '../database/schema/index.js';

// Team formation. The website has no team tables, so these live in discord_bot.
// Anything that depends on a team's size or owner runs under a row lock on the
// team (TeamRepository.withLock). The unique constraint on team_members is the
// final guard for "one team per participant", because two different teams'
// locks don't block each other.

export const TEAM_LIMITS = {
  name: { min: 2, max: 32 },
  description: 300,
  skillsInput: 200,
  skillCount: 6,
  skillLength: 30,
  blurb: 200,
  /** Open requests one participant can have, so nobody can flood owners with DMs. */
  pendingRequests: 5,
  /** Open invites one team can have. */
  pendingInvites: 10,
} as const;

/** How long after a "no" the same person and team can't ask each other again. */
export const REJECTION_COOLDOWN_MS = 60 * 60 * 1000;

export interface TeamInput {
  name: string;
  description: string;
  /** Comma-separated, as typed. */
  skills: string;
}

export interface TeamDetails {
  team: Team;
  members: TeamMember[];
  owner: TeamMember | null;
}

export interface TeamFilters {
  skill?: string | null;
  keyword?: string | null;
  minSpots?: number;
}

export type CreateOutcome =
  | { kind: 'created'; team: Team }
  | { kind: 'name_taken' }
  | { kind: 'already_on_team' }
  | { kind: 'invalid'; reason: string };

export type UpdateOutcome =
  | { kind: 'saved'; team: Team; renamed: boolean }
  | { kind: 'name_taken' }
  | { kind: 'not_owner' }
  | { kind: 'not_found' }
  | { kind: 'invalid'; reason: string };

export type LeaveOutcome =
  | { kind: 'left'; team: Team; dissolved: boolean; newOwner: TeamMember | null }
  | { kind: 'not_on_team' };

export type RequestOutcome =
  | { kind: 'requested'; request: TeamJoinRequest; team: Team; owner: TeamMember | null }
  | { kind: 'already_on_team' }
  | { kind: 'already_pending' }
  | { kind: 'has_invite'; request: TeamJoinRequest }
  | { kind: 'too_many' }
  | { kind: 'rejected_recently' }
  | { kind: 'full' }
  | { kind: 'not_found' };

export type InviteOutcome =
  | { kind: 'invited'; request: TeamJoinRequest; team: Team; target: ParticipantLink }
  | { kind: 'not_owner' }
  | { kind: 'target_not_available' }
  | { kind: 'target_on_team' }
  | { kind: 'already_pending' }
  | { kind: 'too_many' }
  | { kind: 'rejected_recently' }
  | { kind: 'full' };

export type RespondOutcome =
  | {
      kind: 'accepted';
      team: Team;
      request: TeamJoinRequest;
      joiner: string;
      owner: TeamMember | null;
    }
  | {
      kind: 'rejected';
      team: Team;
      request: TeamJoinRequest;
      joiner: string;
      owner: TeamMember | null;
    }
  | { kind: 'not_allowed' }
  | { kind: 'not_pending' }
  | { kind: 'full'; team: Team }
  | { kind: 'joiner_on_team'; team: Team }
  | { kind: 'joiner_inactive'; team: Team };

export type WithdrawOutcome =
  | { kind: 'withdrawn'; team: { id: number; name: string } }
  | { kind: 'not_allowed' }
  | { kind: 'not_pending' };

export type LftOutcome =
  | { kind: 'listed'; profile: LftProfile }
  | { kind: 'on_team' }
  | { kind: 'invalid'; reason: string };

export type OverrideOutcome =
  | { kind: 'added'; team: Team }
  | { kind: 'transferred'; team: Team; previousOwner: string | null }
  | { kind: 'not_found' }
  | { kind: 'full' }
  | { kind: 'already_on_team' }
  | { kind: 'not_a_member' };

export type TeamService = ReturnType<typeof createTeamService>;

// Characters that would turn a name into a mention, formatting or a link once
// it's shown in Discord, plus invisible ones that would dodge the duplicate check.
const FORBIDDEN_NAME_CHARS = /[@#:<>`*_~|\\/\p{Cc}\p{Cf}]/u;

/** The form a team name is stored in: tidied up, or why it can't be used. */
export function normalizeTeamName(raw: string): { name: string } | { reason: string } {
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const { min, max } = TEAM_LIMITS.name;
  if (name.length < min || name.length > max) {
    return { reason: `Team names must be ${min} to ${max} characters.` };
  }
  if (FORBIDDEN_NAME_CHARS.test(name) || !/[\p{L}\p{N}]/u.test(name)) {
    return {
      reason: "Team names need a letter or number, and can't use @ # : < > ` * _ ~ | \\ or /.",
    };
  }
  return { name };
}

/** "ML, backend,  ml" becomes ["ML", "backend"], or why it can't be used. */
export function parseSkills(raw: string): { skills: string[] } | { reason: string } {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const skill = part.replace(/\s+/g, ' ').trim();
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    if (skill.length > TEAM_LIMITS.skillLength) {
      return { reason: `Each skill can be at most ${TEAM_LIMITS.skillLength} characters.` };
    }
    seen.add(key);
    skills.push(skill);
  }
  if (skills.length > TEAM_LIMITS.skillCount) {
    return { reason: `List at most ${TEAM_LIMITS.skillCount} skills, separated by commas.` };
  }
  return { skills };
}

function parseContent(input: TeamInput): TeamContent | { reason: string } {
  const name = normalizeTeamName(input.name);
  if ('reason' in name) return name;
  const description = input.description.trim();
  if (description.length > TEAM_LIMITS.description) {
    return { reason: `Descriptions can be at most ${TEAM_LIMITS.description} characters.` };
  }
  const skills = parseSkills(input.skills);
  if ('reason' in skills) return skills;
  return { name: name.name, description, skillsNeeded: skills.skills };
}

const contains = (text: string, query: string) => text.toLowerCase().includes(query.toLowerCase());

/** Teams with room, narrowed by the /find-team filters. */
export function filterOpenTeams(
  list: readonly TeamWithCount[],
  filters: TeamFilters,
  maxSize: number,
): TeamWithCount[] {
  const minSpots = Math.max(1, filters.minSpots ?? 1);
  const skill = filters.skill?.trim();
  const keyword = filters.keyword?.trim();
  return list.filter(
    (team) =>
      maxSize - team.memberCount >= minSpots &&
      (!skill || team.skillsNeeded.some((s) => contains(s, skill))) &&
      (!keyword ||
        contains(team.name, keyword) ||
        contains(team.description, keyword) ||
        team.skillsNeeded.some((s) => contains(s, keyword))),
  );
}

/** Each skill open teams ask for, once, however it's capitalized. */
export function distinctSkills(list: readonly TeamWithCount[]): string[] {
  const byKey = new Map<string, string>();
  for (const team of list) {
    for (const skill of team.skillsNeeded) {
      const key = skill.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, skill);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export function createTeamService(
  repos: Repositories,
  { maxSize, now = () => new Date() }: { maxSize: number; now?: () => Date },
) {
  const { teams, links } = repos;

  async function details(team: Team): Promise<TeamDetails> {
    const members = await teams.members(team.id);
    return { team, members, owner: members.find((x) => x.linkId === team.ownerLinkId) ?? null };
  }

  const inCooldown = (rejectedAt: Date | null) =>
    !!rejectedAt && now().getTime() - rejectedAt.getTime() < REJECTION_COOLDOWN_MS;

  /** Removes a member under the team's lock, handing over or dissolving as needed. */
  async function removeUnderLock(
    locked: LockedTeam,
    participantLinkId: number,
  ): Promise<LeaveOutcome> {
    const { team } = locked;
    const members = await locked.members();
    if (!members.some((x) => x.linkId === participantLinkId)) return { kind: 'not_on_team' };

    await locked.removeMember(participantLinkId);
    const next = members.find((x) => x.linkId !== participantLinkId);
    if (!next) {
      await locked.deleteTeam();
      return { kind: 'left', team, dissolved: true, newOwner: null };
    }
    if (team.ownerLinkId !== participantLinkId) {
      return { kind: 'left', team, dissolved: false, newOwner: null };
    }
    await locked.setOwner(next.linkId);
    return {
      kind: 'left',
      team: { ...team, ownerLinkId: next.linkId },
      dissolved: false,
      newOwner: next,
    };
  }

  async function leave(participantLinkId: number): Promise<LeaveOutcome> {
    const teamId = await teams.teamIdForMember(participantLinkId);
    if (teamId === null) return { kind: 'not_on_team' };
    const outcome = await teams.withLock(teamId, (locked) =>
      removeUnderLock(locked, participantLinkId),
    );
    return outcome ?? { kind: 'not_on_team' };
  }

  return {
    maxSize,
    get: (id: number) => teams.findById(id),
    listAll: () => teams.listAll(),
    search: (query: string, limit = 25) => teams.search(query, limit),
    allMembers: () => teams.allMembers(),
    setDiscordResources: (
      id: number,
      resources: { discordRoleId: string | null; discordChannelId: string | null },
    ) => teams.setDiscordResources(id, resources),

    async detailsFor(teamId: number): Promise<TeamDetails | null> {
      const team = await teams.findById(teamId);
      return team ? details(team) : null;
    },

    /** The team this participant is on. */
    async forMember(link: ParticipantLink): Promise<TeamDetails | null> {
      const teamId = await teams.teamIdForMember(link.id);
      if (teamId === null) return null;
      const team = await teams.findById(teamId);
      return team ? details(team) : null;
    },

    async listOpen(filters: TeamFilters = {}) {
      const all = await teams.listAll();
      return {
        teams: filterOpenTeams(all, filters, maxSize),
        skills: distinctSkills(filterOpenTeams(all, {}, maxSize)),
      };
    },

    async create(link: ParticipantLink, input: TeamInput): Promise<CreateOutcome> {
      const content = parseContent(input);
      if ('reason' in content) return { kind: 'invalid', reason: content.reason };
      const result = await teams.createWithOwner(content, link.id);
      if (result.ok) return { kind: 'created', team: result.team };
      return { kind: result.conflict === 'name' ? 'name_taken' : 'already_on_team' };
    },

    async update(teamId: number, owner: ParticipantLink, input: TeamInput): Promise<UpdateOutcome> {
      const content = parseContent(input);
      if ('reason' in content) return { kind: 'invalid', reason: content.reason };
      const team = await teams.findById(teamId);
      if (!team) return { kind: 'not_found' };
      if (team.ownerLinkId !== owner.id) return { kind: 'not_owner' };
      const result = await teams.update(teamId, content);
      if (!result) return { kind: 'not_found' };
      if (!result.ok) return { kind: 'name_taken' };
      return { kind: 'saved', team: result.team, renamed: result.team.name !== team.name };
    },

    /** Organizer rename, for a name that shouldn't stand. Other details stay as they are. */
    async rename(teamId: number, rawName: string): Promise<UpdateOutcome> {
      const name = normalizeTeamName(rawName);
      if ('reason' in name) return { kind: 'invalid', reason: name.reason };
      const result = await teams.update(teamId, { name: name.name });
      if (!result) return { kind: 'not_found' };
      if (!result.ok) return { kind: 'name_taken' };
      return { kind: 'saved', team: result.team, renamed: true };
    },

    isOnTeam: async (link: ParticipantLink) => (await teams.teamIdForMember(link.id)) !== null,

    leave: (link: ParticipantLink) => leave(link.id),

    /** A participant left the event: off their team, and out of the running for others. */
    async removeParticipant(participantLinkId: number): Promise<LeaveOutcome> {
      const outcome = await leave(participantLinkId);
      await teams.clearOpenings(participantLinkId);
      return outcome;
    },

    /**
     * Takes everyone with an inactive registration off their team. Checks the
     * current state each time, so anyone a failed run missed is caught by the next.
     */
    async removeInactiveMembers() {
      const removed: { discordUserId: string; outcome: Extract<LeaveOutcome, { kind: 'left' }> }[] =
        [];
      for (const member of await teams.inactiveMembers()) {
        const outcome = await leave(member.linkId);
        if (outcome.kind === 'left') {
          removed.push({ discordUserId: member.discordUserId, outcome });
        }
      }
      return removed;
    },

    /** Drops someone's pending requests, invites and LFT listing. */
    clearOpenings: (participantLinkId: number) => teams.clearOpenings(participantLinkId),

    async requestToJoin(link: ParticipantLink, teamId: number): Promise<RequestOutcome> {
      if ((await teams.teamIdForMember(link.id)) !== null) return { kind: 'already_on_team' };
      if (inCooldown(await teams.lastRejectedAt(teamId, link.id))) {
        return { kind: 'rejected_recently' };
      }
      const open = await teams.countPendingForParticipant(link.id, 'REQUEST');
      if (open >= TEAM_LIMITS.pendingRequests) return { kind: 'too_many' };

      const outcome = await teams.withLock(teamId, async (locked): Promise<RequestOutcome> => {
        const members = await locked.members();
        if (members.length >= maxSize) return { kind: 'full' };
        const request = await locked.createRequest(link.id, 'REQUEST');
        if (!request) return { kind: 'already_pending' };
        return {
          kind: 'requested',
          request,
          team: locked.team,
          owner: members.find((x) => x.linkId === locked.team.ownerLinkId) ?? null,
        };
      });
      if (!outcome) return { kind: 'not_found' };
      if (outcome.kind !== 'already_pending') return outcome;

      // Already invited? Pressing "Request to Join" shouldn't dead-end them.
      const existing = (await teams.pendingForParticipant(link.id)).find(
        (r) => r.teamId === teamId && r.kind === 'INVITE',
      );
      return existing ? { kind: 'has_invite', request: existing } : outcome;
    },

    async invite(owner: ParticipantLink, targetLinkId: number): Promise<InviteOutcome> {
      const teamId = await teams.teamIdForMember(owner.id);
      if (teamId === null) return { kind: 'not_owner' };
      const target = await links.findById(targetLinkId);
      if (!target?.active) return { kind: 'target_not_available' };
      if ((await teams.teamIdForMember(target.id)) !== null) return { kind: 'target_on_team' };
      if (inCooldown(await teams.lastRejectedAt(teamId, target.id))) {
        return { kind: 'rejected_recently' };
      }
      if ((await teams.countPendingForTeam(teamId, 'INVITE')) >= TEAM_LIMITS.pendingInvites) {
        return { kind: 'too_many' };
      }

      const outcome = await teams.withLock(teamId, async (locked): Promise<InviteOutcome> => {
        if (locked.team.ownerLinkId !== owner.id) return { kind: 'not_owner' };
        if ((await locked.members()).length >= maxSize) return { kind: 'full' };
        const request = await locked.createRequest(target.id, 'INVITE');
        if (!request) return { kind: 'already_pending' };
        return { kind: 'invited', request, team: locked.team, target };
      });
      return outcome ?? { kind: 'not_owner' };
    },

    getRequest: (id: number): Promise<TeamRequestDetails | null> => teams.findRequest(id),

    /** Requests and invites waiting on this team. */
    pendingForTeam: (teamId: number) => teams.pendingForTeam(teamId),

    /** Requests this participant sent and invites they received. */
    pendingForParticipant: (link: ParticipantLink) => teams.pendingForParticipant(link.id),

    /**
     * Accepts or rejects. The owner answers requests; the invited person
     * answers invites. Capacity and everything else is re-checked here,
     * under the lock, however long the request has been waiting.
     */
    async respond(
      actor: ParticipantLink,
      requestId: number,
      accept: boolean,
    ): Promise<RespondOutcome> {
      const found = await teams.findRequest(requestId);
      if (!found) return { kind: 'not_pending' };

      try {
        const outcome = await teams.withLock(
          found.teamId,
          async (locked): Promise<RespondOutcome> => {
            const { team } = locked;
            const request = await locked.findRequest(requestId);
            if (request?.status !== 'PENDING') return { kind: 'not_pending' };

            const answersIt =
              request.kind === 'REQUEST'
                ? team.ownerLinkId === actor.id
                : request.participantLinkId === actor.id;
            if (!answersIt) return { kind: 'not_allowed' };

            const members = await locked.members();
            const owner = members.find((x) => x.linkId === team.ownerLinkId) ?? null;
            if (!accept) {
              await locked.setRequestStatus(request.id, 'REJECTED');
              return { kind: 'rejected', team, request, joiner: found.discordUserId, owner };
            }

            const joiner = await locked.findLink(request.participantLinkId);
            if (!joiner?.active) {
              await locked.setRequestStatus(request.id, 'CANCELLED');
              return { kind: 'joiner_inactive', team };
            }
            if (members.length >= maxSize) return { kind: 'full', team };

            await locked.addMember(joiner.id);
            await locked.setRequestStatus(request.id, 'ACCEPTED');
            // Expires their other requests and invites, and their LFT listing.
            await locked.clearOpenings(joiner.id);
            return {
              kind: 'accepted',
              team,
              request,
              joiner: joiner.discordUserId,
              owner,
            };
          },
        );
        return outcome ?? { kind: 'not_pending' };
      } catch (err) {
        if (!isUniqueViolation(err, TEAM_MEMBER_UNIQUE)) throw err;
        // They joined another team a moment ago, so this one can't happen.
        await teams.closeRequest(requestId, 'CANCELLED');
        const team = await teams.findById(found.teamId);
        return team ? { kind: 'joiner_on_team', team } : { kind: 'not_pending' };
      }
    },

    /** Takes back a request (the requester) or an invite (the team owner). */
    async withdraw(actor: ParticipantLink, requestId: number): Promise<WithdrawOutcome> {
      const request = await teams.findRequest(requestId);
      if (!request) return { kind: 'not_pending' };
      const allowed =
        request.kind === 'REQUEST'
          ? request.participantLinkId === actor.id
          : request.ownerLinkId === actor.id;
      if (!allowed) return { kind: 'not_allowed' };
      const closed = await teams.closeRequest(requestId, 'CANCELLED');
      if (!closed) return { kind: 'not_pending' };
      return { kind: 'withdrawn', team: { id: request.teamId, name: request.teamName } };
    },

    getProfile: (link: Pick<ParticipantLink, 'id'>) => teams.findProfile(link.id),
    unlist: (link: ParticipantLink) => teams.deleteProfile(link.id),

    async list(
      link: ParticipantLink,
      input: { skills: string; blurb: string },
    ): Promise<LftOutcome> {
      if ((await teams.teamIdForMember(link.id)) !== null) return { kind: 'on_team' };
      const blurb = input.blurb.trim();
      if (blurb.length > TEAM_LIMITS.blurb) {
        return {
          kind: 'invalid',
          reason: `Your note can be at most ${TEAM_LIMITS.blurb} characters.`,
        };
      }
      const skills = parseSkills(input.skills);
      if ('reason' in skills) return { kind: 'invalid', reason: skills.reason };
      return {
        kind: 'listed',
        profile: await teams.saveProfile(link.id, { skills: skills.skills, blurb }),
      };
    },

    async listings(page: number, pageSize: number) {
      const [listings, total] = await Promise.all([
        teams.listProfiles(pageSize, page * pageSize),
        teams.countProfiles(),
      ]);
      return { listings, total };
    },

    // Organizer overrides. The team-size and one-team rules still apply.

    async addMember(teamId: number, target: ParticipantLink): Promise<OverrideOutcome> {
      try {
        const outcome = await teams.withLock(teamId, async (locked): Promise<OverrideOutcome> => {
          if ((await locked.members()).length >= maxSize) return { kind: 'full' };
          await locked.addMember(target.id);
          await locked.clearOpenings(target.id);
          return { kind: 'added', team: locked.team };
        });
        return outcome ?? { kind: 'not_found' };
      } catch (err) {
        if (isUniqueViolation(err, TEAM_MEMBER_UNIQUE)) return { kind: 'already_on_team' };
        throw err;
      }
    },

    async transferOwnership(teamId: number, target: ParticipantLink): Promise<OverrideOutcome> {
      const outcome = await teams.withLock(teamId, async (locked): Promise<OverrideOutcome> => {
        const members = await locked.members();
        if (!members.some((x) => x.linkId === target.id)) return { kind: 'not_a_member' };
        const previous = members.find((x) => x.linkId === locked.team.ownerLinkId);
        await locked.setOwner(target.id);
        return {
          kind: 'transferred',
          team: { ...locked.team, ownerLinkId: target.id },
          previousOwner: previous?.discordUserId ?? null,
        };
      });
      return outcome ?? { kind: 'not_found' };
    },

    /** Deletes a team outright. Returns what was removed, for cleanup on Discord. */
    async dissolve(teamId: number): Promise<TeamDetails | null> {
      return teams.withLock(teamId, async (locked) => {
        const members = await locked.members();
        await locked.deleteTeam();
        return {
          team: locked.team,
          members,
          owner: members.find((x) => x.linkId === locked.team.ownerLinkId) ?? null,
        };
      });
    },
  };
}

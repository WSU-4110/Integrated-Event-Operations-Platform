import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TeamWithCount } from '../../src/database/repositories/teamRepository.js';
import type { ParticipantLink } from '../../src/database/schema/index.js';
import {
  createTeamService,
  distinctSkills,
  filterOpenTeams,
  normalizeTeamName,
  parseSkills,
  REJECTION_COOLDOWN_MS,
  TEAM_LIMITS,
  type TeamInput,
  type TeamService,
} from '../../src/services/teamService.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const MAX_SIZE = 4;

let t: TestDatabase;
let teams: TeamService;
let userCounter = 0;

beforeEach(async () => {
  t = await createTestDatabase();
  teams = createTeamService(t.repos, { maxSize: MAX_SIZE });
});
afterEach(async () => {
  await t.close();
});

async function participant(): Promise<ParticipantLink> {
  userCounter++;
  const registrationId = await t.addRegistration({ email: `p${userCounter}@example.edu` });
  const result = await t.repos.links.create({
    discordUserId: String(400000000000000000n + BigInt(userCounter)),
    registrationId,
    linkedBy: null,
  });
  if (!result.ok) throw new Error('link failed');
  return result.link;
}

const input = (overrides: Partial<TeamInput> = {}): TeamInput => ({
  name: 'Neural Ninjas',
  description: 'An AI study assistant',
  skills: 'ML, Frontend',
  ...overrides,
});

async function team(owner: ParticipantLink, overrides: Partial<TeamInput> = {}) {
  const outcome = await teams.create(owner, input(overrides));
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  return outcome.team;
}

/** A team with `size` members; the first is the owner. */
async function teamOfSize(size: number, name = 'Neural Ninjas') {
  const owner = await participant();
  const created = await team(owner, { name });
  const members = [owner];
  for (let i = 1; i < size; i++) {
    const member = await participant();
    expect((await teams.addMember(created.id, member)).kind).toBe('added');
    members.push(member);
  }
  return { team: created, owner, members };
}

async function requested(link: ParticipantLink, teamId: number) {
  const outcome = await teams.requestToJoin(link, teamId);
  if (outcome.kind !== 'requested') throw new Error(outcome.kind);
  return outcome.request;
}

const memberIds = async (teamId: number) =>
  (await teams.detailsFor(teamId))?.members.map((m) => m.linkId);

describe('team names', () => {
  it('tidies whitespace', () => {
    expect(normalizeTeamName('  Neural   Ninjas ')).toEqual({ name: 'Neural Ninjas' });
  });

  it.each([
    ['too short', 'x'],
    ['too long', 'x'.repeat(TEAM_LIMITS.name.max + 1)],
    ['a mass mention', '@everyone'],
    ['a role mention', '<@&123>'],
    ['a channel mention', '#general'],
    ['markdown', '**Bold**'],
    ['a link', 'https://evil.example'],
    ['a zero-width character', 'Neural​Ninjas'],
    ['no letters or numbers', '!!!'],
  ])('rejects %s', (_label, name) => {
    expect(normalizeTeamName(name)).toHaveProperty('reason');
  });

  it('folds lookalike characters, so they can not dodge the duplicate check', () => {
    expect(normalizeTeamName('Ｎｅｕｒａｌ')).toEqual({ name: 'Neural' });
  });
});

describe('skills', () => {
  it('splits on commas, trims and drops repeats', () => {
    expect(parseSkills(' ML,  backend, ml ,,')).toEqual({ skills: ['ML', 'backend'] });
    expect(parseSkills('')).toEqual({ skills: [] });
  });

  it('limits how many and how long', () => {
    expect(parseSkills('a,b,c,d,e,f,g')).toHaveProperty('reason');
    expect(parseSkills('x'.repeat(TEAM_LIMITS.skillLength + 1))).toHaveProperty('reason');
  });
});

describe('creating a team', () => {
  it('makes the creator the owner and first member', async () => {
    const owner = await participant();
    const created = await team(owner);
    const details = await teams.forMember(owner);
    expect(details?.team.id).toBe(created.id);
    expect(details?.owner?.linkId).toBe(owner.id);
    expect(details?.members.map((m) => m.linkId)).toEqual([owner.id]);
    expect(created.skillsNeeded).toEqual(['ML', 'Frontend']);
  });

  it('rejects duplicate names, whatever the case', async () => {
    await team(await participant());
    const other = await participant();
    expect(await teams.create(other, input({ name: 'neural NINJAS' }))).toEqual({
      kind: 'name_taken',
    });
    expect(await teams.forMember(other)).toBeNull();
  });

  it('rejects a second team for someone already on one', async () => {
    const owner = await participant();
    await team(owner);
    expect(await teams.create(owner, input({ name: 'Second Team' }))).toEqual({
      kind: 'already_on_team',
    });
  });

  it('rejects bad input without saving', async () => {
    const owner = await participant();
    const outcome = await teams.create(owner, input({ name: '@everyone' }));
    expect(outcome.kind).toBe('invalid');
    expect(await teams.listAll()).toEqual([]);
  });

  it('clears the creator’s open requests and LFT listing', async () => {
    const other = await teamOfSize(1, 'Other');
    const me = await participant();
    await requested(me, other.team.id);
    await teams.list(me, { skills: 'Python', blurb: '' });

    await team(me);
    expect(await teams.pendingForTeam(other.team.id)).toEqual([]);
    expect(await teams.getProfile(me)).toBeNull();
  });
});

describe('editing a team', () => {
  it('lets the owner edit, and tells a rename apart', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const same = await teams.update(created.id, owner, input({ description: 'New plan' }));
    expect(same).toMatchObject({ kind: 'saved', renamed: false });
    const renamed = await teams.update(created.id, owner, input({ name: 'Renamed' }));
    expect(renamed).toMatchObject({ kind: 'saved', renamed: true, team: { name: 'Renamed' } });
  });

  it('refuses anyone else', async () => {
    const { team: created, members } = await teamOfSize(2);
    const outcome = await teams.update(created.id, members[1]!, input({ name: 'Mine now' }));
    expect(outcome).toEqual({ kind: 'not_owner' });
    expect((await teams.get(created.id))?.name).toBe('Neural Ninjas');
  });

  it('refuses a name another team has', async () => {
    await teamOfSize(1, 'Taken');
    const { team: created, owner } = await teamOfSize(1, 'Mine');
    expect(await teams.update(created.id, owner, input({ name: 'TAKEN' }))).toEqual({
      kind: 'name_taken',
    });
  });

  it('lets a team keep its own name in a different case', async () => {
    const { team: created, owner } = await teamOfSize(1, 'Mine');
    expect(await teams.update(created.id, owner, input({ name: 'MINE' }))).toMatchObject({
      kind: 'saved',
    });
  });
});

describe('leaving', () => {
  it('dissolves the team when the last member leaves', async () => {
    const { team: created, owner } = await teamOfSize(1);
    expect(await teams.leave(owner)).toMatchObject({ kind: 'left', dissolved: true });
    expect(await teams.get(created.id)).toBeNull();
  });

  it('hands ownership to the longest-standing member when the owner leaves', async () => {
    const { team: created, owner, members } = await teamOfSize(3);
    const outcome = await teams.leave(owner);
    expect(outcome).toMatchObject({
      kind: 'left',
      dissolved: false,
      newOwner: { linkId: members[1]!.id },
    });
    expect((await teams.get(created.id))?.ownerLinkId).toBe(members[1]!.id);
  });

  it('keeps the owner when someone else leaves', async () => {
    const { team: created, owner, members } = await teamOfSize(3);
    expect(await teams.leave(members[2]!)).toMatchObject({ kind: 'left', newOwner: null });
    expect((await teams.get(created.id))?.ownerLinkId).toBe(owner.id);
    expect(await memberIds(created.id)).toEqual([owner.id, members[1]!.id]);
  });

  it('refuses someone not on a team', async () => {
    expect(await teams.leave(await participant())).toEqual({ kind: 'not_on_team' });
  });

  it('frees the name of a dissolved team', async () => {
    const { owner } = await teamOfSize(1, 'Reusable');
    await teams.leave(owner);
    expect((await teams.create(owner, input({ name: 'Reusable' }))).kind).toBe('created');
  });
});

describe('join requests', () => {
  it('adds the requester when the owner accepts', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    const request = await requested(me, created.id);

    expect(await teams.pendingForTeam(created.id)).toHaveLength(1);
    const outcome = await teams.respond(owner, request.id, true);
    expect(outcome).toMatchObject({ kind: 'accepted', joiner: me.discordUserId });
    expect(await memberIds(created.id)).toEqual([owner.id, me.id]);
    expect(await teams.pendingForTeam(created.id)).toEqual([]);
  });

  it('leaves the team alone when the owner rejects', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    const request = await requested(me, created.id);
    expect(await teams.respond(owner, request.id, false)).toMatchObject({ kind: 'rejected' });
    expect(await memberIds(created.id)).toEqual([owner.id]);
  });

  it("does not let anyone act on someone else's team", async () => {
    const { team: created, members } = await teamOfSize(2);
    const me = await participant();
    const stranger = await teamOfSize(1, 'Other');
    const request = await requested(me, created.id);

    for (const actor of [me, members[1]!, stranger.owner]) {
      expect(await teams.respond(actor, request.id, true)).toEqual({ kind: 'not_allowed' });
      expect(await teams.respond(actor, request.id, false)).toEqual({ kind: 'not_allowed' });
    }
    expect(await memberIds(created.id)).not.toContain(me.id);
  });

  it('after a handover, the new owner answers and the old one can not', async () => {
    const { team: created, owner, members } = await teamOfSize(2);
    const me = await participant();
    const request = await requested(me, created.id);
    await teams.leave(owner);
    expect(await teams.respond(owner, request.id, true)).toEqual({ kind: 'not_allowed' });
    expect(await teams.respond(members[1]!, request.id, true)).toMatchObject({ kind: 'accepted' });
  });

  it('counts a double press once', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const request = await requested(await participant(), created.id);
    expect((await teams.respond(owner, request.id, true)).kind).toBe('accepted');
    expect(await teams.respond(owner, request.id, true)).toEqual({ kind: 'not_pending' });
  });

  it('refuses duplicate requests, and asking while on a team', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    await requested(me, created.id);
    expect(await teams.requestToJoin(me, created.id)).toEqual({ kind: 'already_pending' });
    expect(await teams.requestToJoin(owner, created.id)).toEqual({ kind: 'already_on_team' });
  });

  it('refuses a full team and a missing team', async () => {
    const { team: created } = await teamOfSize(MAX_SIZE);
    expect(await teams.requestToJoin(await participant(), created.id)).toEqual({ kind: 'full' });
    expect(await teams.requestToJoin(await participant(), 9999)).toEqual({ kind: 'not_found' });
  });

  it('re-checks capacity at accept time', async () => {
    const { team: created, owner } = await teamOfSize(MAX_SIZE - 1);
    const first = await participant();
    const second = await participant();
    const firstRequest = await requested(first, created.id);
    const secondRequest = await requested(second, created.id);

    expect((await teams.respond(owner, firstRequest.id, true)).kind).toBe('accepted');
    expect(await teams.respond(owner, secondRequest.id, true)).toMatchObject({ kind: 'full' });
    expect(await memberIds(created.id)).toHaveLength(MAX_SIZE);

    // Still pending: if a spot opens up, the owner can take them after all.
    await teams.leave(first);
    expect((await teams.respond(owner, secondRequest.id, true)).kind).toBe('accepted');
  });

  it('expires other pending requests when the requester joins a team', async () => {
    const a = await teamOfSize(1, 'Team A');
    const b = await teamOfSize(1, 'Team B');
    const me = await participant();
    const toA = await requested(me, a.team.id);
    const toB = await requested(me, b.team.id);
    await teams.list(me, { skills: 'Python', blurb: '' });

    await teams.respond(a.owner, toA.id, true);
    expect(await teams.pendingForTeam(b.team.id)).toEqual([]);
    expect(await teams.respond(b.owner, toB.id, true)).toEqual({ kind: 'not_pending' });
    expect(await teams.getProfile(me)).toBeNull();
  });

  it('refuses someone whose registration went inactive while they waited', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    const request = await requested(me, created.id);
    await t.repos.links.setActive([me.id], false);
    expect(await teams.respond(owner, request.id, true)).toMatchObject({ kind: 'joiner_inactive' });
    expect(await memberIds(created.id)).not.toContain(me.id);
  });

  it('limits open requests per person', async () => {
    const me = await participant();
    for (let i = 0; i < TEAM_LIMITS.pendingRequests; i++) {
      const { team: open } = await teamOfSize(1, `Team ${i}`);
      await requested(me, open.id);
    }
    const { team: extra } = await teamOfSize(1, 'One Too Many');
    expect(await teams.requestToJoin(me, extra.id)).toEqual({ kind: 'too_many' });
  });

  it('holds off re-asking for a while after a no', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    await teams.respond(owner, (await requested(me, created.id)).id, false);
    expect(await teams.requestToJoin(me, created.id)).toEqual({ kind: 'rejected_recently' });

    const later = createTeamService(t.repos, {
      maxSize: MAX_SIZE,
      now: () => new Date(Date.now() + REJECTION_COOLDOWN_MS + 60_000),
    });
    expect((await later.requestToJoin(me, created.id)).kind).toBe('requested');
  });

  it('lets the requester withdraw, and nobody else', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    const request = await requested(me, created.id);
    expect(await teams.withdraw(owner, request.id)).toEqual({ kind: 'not_allowed' });
    expect(await teams.withdraw(me, request.id)).toMatchObject({ kind: 'withdrawn' });
    expect(await teams.withdraw(me, request.id)).toEqual({ kind: 'not_pending' });
    expect(await teams.respond(owner, request.id, true)).toEqual({ kind: 'not_pending' });
  });

  it('points to the invite if there already is one', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    await teams.list(me, { skills: 'Python', blurb: '' });
    await teams.invite(owner, me.id);
    expect((await teams.requestToJoin(me, created.id)).kind).toBe('has_invite');
  });
});

describe('invites', () => {
  async function invited(owner: ParticipantLink, target: ParticipantLink) {
    const outcome = await teams.invite(owner, target.id);
    if (outcome.kind !== 'invited') throw new Error(outcome.kind);
    return outcome.request;
  }

  it('adds the invited person when they accept', async () => {
    const { team: created, owner } = await teamOfSize(1);
    const me = await participant();
    const invite = await invited(owner, me);
    expect(await teams.respond(me, invite.id, true)).toMatchObject({ kind: 'accepted' });
    expect(await memberIds(created.id)).toEqual([owner.id, me.id]);
  });

  it('only the invited person can answer; the owner can withdraw', async () => {
    const { owner } = await teamOfSize(1);
    const me = await participant();
    const invite = await invited(owner, me);
    expect(await teams.respond(owner, invite.id, true)).toEqual({ kind: 'not_allowed' });
    expect(await teams.withdraw(me, invite.id)).toEqual({ kind: 'not_allowed' });
    expect(await teams.withdraw(owner, invite.id)).toMatchObject({ kind: 'withdrawn' });
  });

  it('is for owners only', async () => {
    const { members } = await teamOfSize(2);
    const noTeam = await participant();
    const target = await participant();
    expect(await teams.invite(members[1]!, target.id)).toEqual({ kind: 'not_owner' });
    expect(await teams.invite(noTeam, target.id)).toEqual({ kind: 'not_owner' });
  });

  it('refuses someone on a team, inactive, missing, or already asked', async () => {
    const { owner } = await teamOfSize(1);
    const other = await teamOfSize(1, 'Other');
    expect(await teams.invite(owner, other.owner.id)).toEqual({ kind: 'target_on_team' });
    expect(await teams.invite(owner, 9999)).toEqual({ kind: 'target_not_available' });

    const inactive = await participant();
    await t.repos.links.setActive([inactive.id], false);
    expect(await teams.invite(owner, inactive.id)).toEqual({ kind: 'target_not_available' });

    const target = await participant();
    await invited(owner, target);
    expect(await teams.invite(owner, target.id)).toEqual({ kind: 'already_pending' });
  });

  it('refuses when the team is full', async () => {
    const { owner } = await teamOfSize(MAX_SIZE);
    expect(await teams.invite(owner, (await participant()).id)).toEqual({ kind: 'full' });
  });
});

describe('looking for a team', () => {
  it('lists, updates and unlists', async () => {
    const me = await participant();
    await teams.list(me, { skills: 'Python, UI', blurb: 'Second-year student' });
    await teams.list(me, { skills: 'Rust', blurb: '' });
    const { listings, total } = await teams.listings(0, 5);
    expect(total).toBe(1);
    expect(listings[0]).toMatchObject({
      skills: ['Rust'],
      blurb: '',
      discordUserId: me.discordUserId,
    });

    expect(await teams.unlist(me)).toBe(true);
    expect(await teams.unlist(me)).toBe(false);
    expect((await teams.listings(0, 5)).total).toBe(0);
  });

  it('is only for people without a team', async () => {
    const { owner } = await teamOfSize(1);
    expect(await teams.list(owner, { skills: 'Python', blurb: '' })).toEqual({ kind: 'on_team' });
  });

  it('rejects a note that is too long', async () => {
    const me = await participant();
    const outcome = await teams.list(me, {
      skills: 'Python',
      blurb: 'x'.repeat(TEAM_LIMITS.blurb + 1),
    });
    expect(outcome.kind).toBe('invalid');
  });

  it('hides people whose registration is inactive', async () => {
    const me = await participant();
    await teams.list(me, { skills: 'Python', blurb: '' });
    await t.repos.links.setActive([me.id], false);
    expect(await teams.listings(0, 5)).toEqual({ listings: [], total: 0 });
  });

  it('pages through listings', async () => {
    for (let i = 0; i < 3; i++) await teams.list(await participant(), { skills: 'x', blurb: '' });
    const pageTwo = await teams.listings(1, 2);
    expect(pageTwo.total).toBe(3);
    expect(pageTwo.listings).toHaveLength(1);
  });
});

describe('finding teams', () => {
  const row = (overrides: Partial<TeamWithCount>): TeamWithCount => ({
    id: 1,
    name: 'A',
    description: '',
    skillsNeeded: [],
    ownerLinkId: 1,
    discordRoleId: null,
    discordChannelId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberCount: 1,
    ...overrides,
  });

  it('hides full teams', () => {
    const list = [row({ id: 1, memberCount: 4 }), row({ id: 2, memberCount: 3 })];
    expect(filterOpenTeams(list, {}, 4).map((x) => x.id)).toEqual([2]);
  });

  it('filters by skill, keyword and open spots', () => {
    const list = [
      row({ id: 1, skillsNeeded: ['ML Engineer'], memberCount: 3 }),
      row({ id: 2, name: 'Robots', skillsNeeded: ['Frontend'], memberCount: 1 }),
      row({ id: 3, description: 'A robot arm', memberCount: 2 }),
    ];
    const ids = (filters: Parameters<typeof filterOpenTeams>[1]) =>
      filterOpenTeams(list, filters, 4).map((x) => x.id);
    expect(ids({ skill: 'ml' })).toEqual([1]);
    expect(ids({ keyword: 'ROBOT' })).toEqual([2, 3]);
    expect(ids({ keyword: 'frontend' })).toEqual([2]);
    expect(ids({ minSpots: 2 })).toEqual([2, 3]);
    expect(ids({ minSpots: 3 })).toEqual([2]);
    expect(ids({ skill: 'frontend', minSpots: 2, keyword: 'robot' })).toEqual([2]);
  });

  it('offers each skill once, sorted', () => {
    const list = [
      row({ skillsNeeded: ['ml', 'Design'] }),
      row({ skillsNeeded: ['ML', 'Backend'] }),
    ];
    expect(distinctSkills(list)).toEqual(['Backend', 'Design', 'ml']);
  });

  it('counts members from the database', async () => {
    await teamOfSize(MAX_SIZE, 'Full Team');
    await teamOfSize(2, 'Open Team');
    const { teams: open } = await teams.listOpen();
    expect(open.map((x) => [x.name, x.memberCount])).toEqual([['Open Team', 2]]);
  });
});

describe('organizer overrides and removals', () => {
  it('adding still respects size and the one-team rule', async () => {
    const { team: full } = await teamOfSize(MAX_SIZE, 'Full');
    const { team: open, owner } = await teamOfSize(1, 'Open');
    expect(await teams.addMember(full.id, await participant())).toEqual({ kind: 'full' });
    const other = await teamOfSize(1, 'Other');
    expect(await teams.addMember(open.id, other.owner)).toEqual({ kind: 'already_on_team' });
    expect(await teams.addMember(open.id, owner)).toEqual({ kind: 'already_on_team' });
    expect(await teams.addMember(9999, await participant())).toEqual({ kind: 'not_found' });
  });

  it('transfers ownership only to a member', async () => {
    const { team: created, owner, members } = await teamOfSize(2);
    expect(await teams.transferOwnership(created.id, await participant())).toEqual({
      kind: 'not_a_member',
    });
    expect(await teams.transferOwnership(created.id, members[1]!)).toMatchObject({
      kind: 'transferred',
      previousOwner: owner.discordUserId,
    });
    expect((await teams.get(created.id))?.ownerLinkId).toBe(members[1]!.id);
  });

  it('renames, with the same name rules', async () => {
    const { team: created } = await teamOfSize(1, 'Bad Name');
    await teamOfSize(1, 'Taken');
    expect((await teams.rename(created.id, '@here')).kind).toBe('invalid');
    expect(await teams.rename(created.id, 'taken')).toEqual({ kind: 'name_taken' });
    expect(await teams.rename(created.id, 'Good Name')).toMatchObject({
      kind: 'saved',
      team: { name: 'Good Name' },
    });
  });

  it('dissolving removes the team and its pending requests', async () => {
    const { team: created, owner } = await teamOfSize(2);
    const request = await requested(await participant(), created.id);
    const removed = await teams.dissolve(created.id);
    expect(removed?.members).toHaveLength(2);
    expect(await teams.get(created.id)).toBeNull();
    expect(await teams.forMember(owner)).toBeNull();
    expect(await teams.respond(owner, request.id, true)).toEqual({ kind: 'not_pending' });
    expect(await teams.dissolve(created.id)).toBeNull();
  });

  it('removing a participant takes them off everything', async () => {
    const { team: created, owner, members } = await teamOfSize(2);
    const other = await teamOfSize(1, 'Other');
    const waiting = await participant();
    await requested(waiting, other.team.id);
    await teams.list(waiting, { skills: 'x', blurb: '' });

    expect(await teams.removeParticipant(owner.id)).toMatchObject({
      kind: 'left',
      newOwner: { linkId: members[1]!.id },
    });
    expect(await memberIds(created.id)).toEqual([members[1]!.id]);

    expect(await teams.removeParticipant(waiting.id)).toEqual({ kind: 'not_on_team' });
    expect(await teams.pendingForTeam(other.team.id)).toEqual([]);
    expect(await teams.getProfile(waiting)).toBeNull();
  });

  it('a link with a team can be deleted once they have been removed', async () => {
    const { owner, members } = await teamOfSize(2);
    await expect(t.repos.links.deleteByDiscordUserId(owner.discordUserId)).rejects.toThrow();
    await teams.removeParticipant(owner.id);
    expect(await t.repos.links.deleteByDiscordUserId(owner.discordUserId)).not.toBeNull();
    expect(await teams.forMember(members[1]!)).not.toBeNull();
  });
});

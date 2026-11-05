import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { componentHandlers } from '../../src/components/index.js';
import { TeamFields, TeamMessages } from '../../src/components/embeds/teamEmbeds.js';
import type { ParticipantLink } from '../../src/database/schema/index.js';
import { InteractionRouter } from '../../src/interactions/router.js';
import type { BotContext } from '../../src/interactions/types.js';
import { runParticipantSync } from '../../src/jobs/participantSync.js';
import { ORGANIZER_ONLY_MESSAGE } from '../../src/middleware/permissions.js';
import { createTeamService } from '../../src/services/teamService.js';
import { createVerificationService } from '../../src/services/verificationService.js';
import { fakeContext, fakeInteraction, ORGANIZER_ROLE } from '../helpers/fakes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

let t: TestDatabase;
let ctx: BotContext;
let router: InteractionRouter;
let users = 0;

beforeEach(async () => {
  t = await createTestDatabase();
  ({ ctx } = await fakeContext({
    verification: createVerificationService(t.repos),
    teams: createTeamService(t.repos, { maxSize: 4 }),
  }));
  router = new InteractionRouter(ctx, commands, componentHandlers);
});
afterEach(async () => {
  await t.close();
});

async function verified(): Promise<ParticipantLink> {
  users++;
  const registrationId = await t.addRegistration({ email: `u${users}@example.edu` });
  const result = await t.repos.links.create({
    discordUserId: String(410000000000000000n + BigInt(users)),
    registrationId,
    linkedBy: null,
  });
  if (!result.ok) throw new Error('link failed');
  return result.link;
}

const lastCall = (fn: unknown): unknown => (fn as Mock).mock.calls.at(-1)?.[0];
const json = (value: unknown) => JSON.stringify(value);
const replied = (i: { editReply: unknown; reply: unknown; followUp: unknown }) =>
  json(lastCall(i.editReply)) + json(lastCall(i.reply)) + json(lastCall(i.followUp));

const form = (name: string, description = '', skills = '') => ({
  [TeamFields.name]: name,
  [TeamFields.description]: description,
  [TeamFields.skills]: skills,
});

async function createTeam(owner: ParticipantLink, name = 'Neural Ninjas') {
  const outcome = await ctx.services.teams.create(owner, {
    name,
    description: 'A study assistant',
    skills: 'ML',
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  return outcome.team;
}

async function press(
  link: ParticipantLink,
  customId: string,
  kind: 'button' | 'select' = 'button',
) {
  const interaction = fakeInteraction({ kind, customId, userId: link.discordUserId });
  await router.handle(interaction);
  return interaction;
}

describe('gating', () => {
  it.each([
    ['/team', { kind: 'command' as const, commandName: 'team' }],
    ['/find-team', { kind: 'command' as const, commandName: 'find-team' }],
    ['My Team', { kind: 'button' as const, customId: 'team:mine' }],
    ['Find a Team', { kind: 'button' as const, customId: 'team:find' }],
    ['Request to Join', { kind: 'button' as const, customId: 'team:request:1' }],
    ['Leave', { kind: 'button' as const, customId: 'team:leave' }],
  ])('blocks unverified users from %s', async (_label, options) => {
    const interaction = fakeInteraction(options);
    await router.handle(interaction);
    expect(replied(interaction)).toContain('/verify');
  });

  it('blocks unverified users from creating a team when the form comes back', async () => {
    const interaction = fakeInteraction({
      kind: 'modal',
      customId: 'team:save',
      fields: form('Sneaky'),
    });
    await router.handle(interaction);
    expect(replied(interaction)).toContain('/verify');
    expect(await ctx.services.teams.listAll()).toEqual([]);
  });

  it('blocks people whose registration went inactive', async () => {
    const link = await verified();
    await t.repos.links.setActive([link.id], false);
    const interaction = fakeInteraction({
      kind: 'command',
      commandName: 'team',
      userId: link.discordUserId,
    });
    await router.handle(interaction);
    expect(replied(interaction)).not.toContain('Team Management');
  });
});

describe('/team', () => {
  it('offers the four actions, greyed out as they apply', async () => {
    const link = await verified();
    const before = fakeInteraction({
      kind: 'command',
      commandName: 'team',
      userId: link.discordUserId,
    });
    await router.handle(before);
    const buttons = (i: typeof before) =>
      (
        JSON.parse(json(lastCall(i.editReply))) as {
          components: { components: { custom_id: string; disabled?: boolean }[] }[];
        }
      ).components[0]!.components.map((b) => [b.custom_id, !!b.disabled]);
    expect(buttons(before)).toEqual([
      ['team:create', false],
      ['team:find', false],
      ['team:mine', false],
      ['team:leave', true],
    ]);

    await createTeam(link);
    const after = fakeInteraction({
      kind: 'command',
      commandName: 'team',
      userId: link.discordUserId,
    });
    await router.handle(after);
    expect(json(lastCall(after.editReply))).toContain('Neural Ninjas');
    expect(buttons(after)).toEqual([
      ['team:create', true],
      ['team:find', false],
      ['team:mine', false],
      ['team:leave', false],
    ]);
  });

  it('Create Team opens the form right away', async () => {
    const interaction = fakeInteraction({ kind: 'button', customId: 'team:create' });
    await router.handle(interaction);
    expect(json(lastCall(interaction.showModal))).toContain('team:save');
  });

  it('creates a team from the form and shows it', async () => {
    const link = await verified();
    const interaction = fakeInteraction({
      kind: 'modal',
      customId: 'team:save',
      userId: link.discordUserId,
      fields: form('Neural Ninjas', 'A study assistant', 'ML, Design'),
    });
    await router.handle(interaction);

    const reply = json(lastCall(interaction.editReply));
    expect(reply).toContain('Neural Ninjas');
    expect(reply).toContain(`<@${link.discordUserId}> 👑`);
    expect(reply).toContain('ML, Design');
    expect((await ctx.services.teams.forMember(link))?.team.name).toBe('Neural Ninjas');
  });

  it.each([
    ['a duplicate name', 'neural ninjas', TeamMessages.nameTaken],
    ['an unusable name', '@everyone', 'Team names'],
  ])('refuses %s', async (_label, name, message) => {
    await createTeam(await verified());
    const link = await verified();
    const interaction = fakeInteraction({
      kind: 'modal',
      customId: 'team:save',
      userId: link.discordUserId,
      fields: form(name),
    });
    await router.handle(interaction);
    expect(replied(interaction)).toContain(message);
    expect(await ctx.services.teams.forMember(link)).toBeNull();
  });

  it('refuses a second team', async () => {
    const link = await verified();
    await createTeam(link);
    const interaction = fakeInteraction({
      kind: 'modal',
      customId: 'team:save',
      userId: link.discordUserId,
      fields: form('Second'),
    });
    await router.handle(interaction);
    expect(replied(interaction)).toContain("You're already on a team");
  });

  it('lets only the owner edit', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);

    const blocked = await press(member, 'team:edit');
    expect(blocked.showModal).not.toHaveBeenCalled();
    expect(replied(blocked)).toContain(TeamMessages.notOwner);

    const forged = fakeInteraction({
      kind: 'modal',
      customId: `team:save:${team.id}`,
      userId: member.discordUserId,
      fields: form('Stolen'),
    });
    await router.handle(forged);
    expect(replied(forged)).toContain(TeamMessages.notOwner);
    expect((await ctx.services.teams.get(team.id))?.name).toBe('Neural Ninjas');

    const allowed = await press(owner, 'team:edit');
    expect(json(lastCall(allowed.showModal))).toContain('Neural Ninjas');
    const saved = fakeInteraction({
      kind: 'modal',
      customId: `team:save:${team.id}`,
      userId: owner.discordUserId,
      fields: form('Renamed', 'New plan', 'Rust'),
    });
    await router.handle(saved);
    expect(json(lastCall(saved.editReply))).toContain('Renamed');
  });
});

describe('My Team', () => {
  it('shows pending requests to the owner only', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);
    const asker = await verified();
    await ctx.services.teams.requestToJoin(asker, team.id);

    const asOwner = json(lastCall((await press(owner, 'team:mine')).editReply));
    expect(asOwner).toContain(`<@${asker.discordUserId}> asked to join`);
    expect(asOwner).toContain('joinreq:review');

    const asMember = json(lastCall((await press(member, 'team:mine')).editReply));
    expect(asMember).toContain('Neural Ninjas');
    expect(asMember).not.toContain(asker.discordUserId);
    expect(asMember).not.toContain('joinreq:review');
    expect(asMember).not.toContain('team:edit');
  });

  it('shows someone without a team their requests and invites', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const inviter = await verified();
    await createTeam(inviter, 'Inviters');
    const me = await verified();
    await ctx.services.teams.requestToJoin(me, team.id);
    await ctx.services.teams.invite(inviter, me.id);

    const reply = json(lastCall((await press(me, 'team:mine')).editReply));
    expect(reply).toContain('You asked to join **Neural Ninjas**');
    expect(reply).toContain('**Inviters** invited you');
    expect(reply).toContain('joinreq:review');
  });
});

describe('leaving', () => {
  it('asks first, and warns the owner what will happen', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);

    const confirm = await press(owner, 'team:leave');
    expect(json(lastCall(confirm.editReply))).toContain(
      `<@${member.discordUserId}> will become the owner`,
    );
    expect((await ctx.services.teams.get(team.id))?.ownerLinkId).toBe(owner.id);
  });

  it('warns the last member that the team will dissolve', async () => {
    const owner = await verified();
    await createTeam(owner);
    const confirm = await press(owner, 'team:leave');
    expect(json(lastCall(confirm.editReply))).toContain('dissolved');
  });

  it('Stay changes nothing', async () => {
    const owner = await verified();
    await createTeam(owner);
    await press(owner, 'team:leave-cancel');
    expect(await ctx.services.teams.forMember(owner)).not.toBeNull();
  });

  it('hands over ownership, and tells the new owner', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);

    const interaction = await press(owner, 'team:leave-confirm');
    expect(json(lastCall(interaction.editReply))).toContain('You left **Neural Ninjas**');
    expect((await ctx.services.teams.get(team.id))?.ownerLinkId).toBe(member.id);
    expect(interaction.dms[0]).toMatchObject({ userId: member.discordUserId });
    expect(json(interaction.dms[0]?.message)).toContain('now the owner');
  });

  it('dissolves when the last member leaves', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const interaction = await press(owner, 'team:leave-confirm');
    expect(json(lastCall(interaction.editReply))).toContain('dissolved');
    expect(await ctx.services.teams.get(team.id)).toBeNull();
  });

  it('refuses someone not on a team', async () => {
    const interaction = await press(await verified(), 'team:leave');
    expect(replied(interaction)).toContain(TeamMessages.notOnTeam);
  });
});

describe('/find-team', () => {
  const find = (link: ParticipantLink, options: Record<string, unknown> = {}) =>
    fakeInteraction({
      kind: 'command',
      commandName: 'find-team',
      userId: link.discordUserId,
      options,
    });

  it('lists teams with open spots', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const interaction = find(await verified());
    await router.handle(interaction);
    const reply = json(lastCall(interaction.editReply));
    expect(reply).toContain('Teams Looking for Members');
    expect(reply).toContain('Neural Ninjas');
    expect(reply).toContain('Looking for: ML');
    expect(reply).toContain('3 spots remaining');
    expect(reply).toContain(`"value":"${team.id}"`);
  });

  it('does not list full teams', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    for (let i = 0; i < 3; i++) await ctx.services.teams.addMember(team.id, await verified());
    const interaction = find(await verified());
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('No teams have open spots');
  });

  it('applies filters from the command, and keeps them across the menus', async () => {
    await createTeam(await verified(), 'ML Team');
    const web = await ctx.services.teams.create(await verified(), {
      name: 'Web Team',
      description: '',
      skills: 'Frontend',
    });
    expect(web.kind).toBe('created');
    const me = await verified();

    const filtered = find(me, { skill: 'frontend', keyword: 'web team' });
    await router.handle(filtered);
    const reply = json(lastCall(filtered.editReply));
    expect(reply).toContain('Web Team');
    expect(reply).not.toContain('ML Team');
    expect(reply).toContain('team:spots:frontend:web%20team');

    const narrowed = fakeInteraction({
      kind: 'select',
      customId: 'team:spots:frontend:web%20team',
      values: ['2'],
      userId: me.discordUserId,
    });
    await router.handle(narrowed);
    expect(json(lastCall(narrowed.editReply))).toContain('Web Team');
  });

  it('filters when a menu is used, in place', async () => {
    await createTeam(await verified(), 'ML Team');
    const me = await verified();
    const interaction = fakeInteraction({
      kind: 'select',
      customId: 'team:skill:1:-',
      values: ['Frontend'],
      userId: me.discordUserId,
    });
    await router.handle(interaction);
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(json(lastCall(interaction.editReply))).toContain('No teams match');
  });

  it('survives custom IDs with odd filter text', async () => {
    const me = await verified();
    const interaction = await press(me, 'team:page:-1:0:%E0%A4%A:-');
    expect(replied(interaction)).toContain('Teams Looking for Members');
  });

  it.each([
    ['accents', '日本語'.repeat(10), 'é'.repeat(30)],
    ['emoji, never cut in half', '🚀'.repeat(15), '🧠'.repeat(15)],
  ])('keeps custom IDs within Discord’s limit with %s', async (_label, skill, keyword) => {
    await createTeam(await verified());
    const interaction = find(await verified(), { skill, keyword });
    await router.handle(interaction);
    expect(replied(interaction)).toContain('Teams Looking for Members');
    expect(replied(interaction)).not.toContain('Something went wrong');
  });

  it('copes with a team that needs a skill called "any"', async () => {
    const owner = await verified();
    await ctx.services.teams.create(owner, { name: 'Any Team', description: '', skills: 'any' });
    const interaction = find(await verified());
    await router.handle(interaction);
    const { components } = JSON.parse(json(lastCall(interaction.editReply))) as {
      components: {
        components: { custom_id: string; options?: { value: string }[] }[];
      }[];
    };
    const skillMenu = components
      .flatMap((r) => r.components)
      .find((c) => c.custom_id.startsWith('team:skill'));
    const values = skillMenu?.options?.map((o) => o.value) ?? [];
    expect(values).toContain('any');
    expect(new Set(values).size).toBe(values.length);
  });

  it('suggests skills open teams need', async () => {
    await createTeam(await verified());
    const interaction = fakeInteraction({
      kind: 'autocomplete',
      commandName: 'find-team',
      focused: 'm',
      focusedOption: 'skill',
    });
    await router.handle(interaction);
    expect(lastCall(interaction.respond)).toEqual([{ name: 'ML', value: 'ML' }]);
  });

  it('View Team shows the card with Request to Join', async () => {
    const team = await createTeam(await verified());
    const me = await verified();
    const interaction = fakeInteraction({
      kind: 'select',
      customId: 'team:view',
      values: [String(team.id)],
      userId: me.discordUserId,
    });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain(`team:request:${team.id}`);
  });
});

describe('join requests', () => {
  it('DMs the owner with Accept and Reject', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();

    const interaction = await press(me, `team:request:${team.id}`);
    expect(json(lastCall(interaction.editReply))).toContain('was sent');
    expect(interaction.dms).toHaveLength(1);
    expect(interaction.dms[0]?.userId).toBe(owner.discordUserId);
    const dm = json(interaction.dms[0]?.message);
    expect(dm).toContain('joinreq:accept:');
    expect(dm).toContain('joinreq:reject:');
    expect(dm).toContain(`<@${me.discordUserId}>`);
  });

  it('includes their LFT profile for the owner', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();
    await ctx.services.teams.list(me, { skills: 'Python', blurb: 'Loves robots' });
    const interaction = await press(me, `team:request:${team.id}`);
    const dm = json(interaction.dms[0]?.message);
    expect(dm).toContain('Python');
    expect(dm).toContain('Loves robots');
  });

  it('still succeeds if the owner’s DMs are closed', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const interaction = fakeInteraction({
      kind: 'button',
      customId: `team:request:${team.id}`,
      userId: (await verified()).discordUserId,
    });
    (interaction.client.users.fetch as Mock).mockRejectedValue(new Error('DMs closed'));
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain("couldn't DM the owner");
    expect(await ctx.services.teams.pendingForTeam(team.id)).toHaveLength(1);
  });

  it('accepting adds them and DMs them', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();
    const outcome = await ctx.services.teams.requestToJoin(me, team.id);
    if (outcome.kind !== 'requested') throw new Error(outcome.kind);

    const interaction = await press(owner, `joinreq:accept:${outcome.request.id}`);
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(lastCall(interaction.editReply)).toMatchObject({ embeds: [], components: [] });
    expect((await ctx.services.teams.forMember(me))?.team.id).toBe(team.id);
    expect(interaction.dms[0]).toMatchObject({ userId: me.discordUserId });
    expect(json(interaction.dms[0]?.message)).toContain("You're on");
  });

  it('rejecting leaves them off and DMs them', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();
    const outcome = await ctx.services.teams.requestToJoin(me, team.id);
    if (outcome.kind !== 'requested') throw new Error(outcome.kind);

    const interaction = await press(owner, `joinreq:reject:${outcome.request.id}`);
    expect(await ctx.services.teams.forMember(me)).toBeNull();
    expect(json(interaction.dms[0]?.message)).toContain("wasn't accepted");
  });

  it('refuses a stranger pressing Accept, and leaves the buttons for the owner', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();
    const outcome = await ctx.services.teams.requestToJoin(me, team.id);
    if (outcome.kind !== 'requested') throw new Error(outcome.kind);

    const interaction = await press(await verified(), `joinreq:accept:${outcome.request.id}`);
    expect(replied(interaction)).toContain(TeamMessages.notAllowed);
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(await ctx.services.teams.forMember(me)).toBeNull();
  });

  it('tells the owner when the team filled up, and keeps the buttons', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();
    const outcome = await ctx.services.teams.requestToJoin(me, team.id);
    if (outcome.kind !== 'requested') throw new Error(outcome.kind);
    for (let i = 0; i < 3; i++) await ctx.services.teams.addMember(team.id, await verified());

    const interaction = await press(owner, `joinreq:accept:${outcome.request.id}`);
    expect(replied(interaction)).toContain('is full');
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('says so if it was already answered', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();
    const outcome = await ctx.services.teams.requestToJoin(me, team.id);
    if (outcome.kind !== 'requested') throw new Error(outcome.kind);
    await press(owner, `joinreq:accept:${outcome.request.id}`);

    const again = await press(owner, `joinreq:accept:${outcome.request.id}`);
    expect(json(lastCall(again.editReply))).toContain(TeamMessages.requestClosed);
  });

  it('lets people review only their own from the menu', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const me = await verified();
    const outcome = await ctx.services.teams.requestToJoin(me, team.id);
    if (outcome.kind !== 'requested') throw new Error(outcome.kind);

    const review = (link: ParticipantLink) =>
      fakeInteraction({
        kind: 'select',
        customId: 'joinreq:review',
        values: [String(outcome.request.id)],
        userId: link.discordUserId,
      });

    const asOwner = review(owner);
    await router.handle(asOwner);
    expect(json(lastCall(asOwner.editReply))).toContain('joinreq:accept');

    const asRequester = review(me);
    await router.handle(asRequester);
    const requesterView = json(lastCall(asRequester.editReply));
    expect(requesterView).toContain('joinreq:withdraw');
    expect(requesterView).not.toContain('joinreq:accept');

    const asStranger = review(await verified());
    await router.handle(asStranger);
    expect(replied(asStranger)).toContain(TeamMessages.notAllowed);
  });

  it('withdrawing closes it', async () => {
    const team = await createTeam(await verified());
    const me = await verified();
    const outcome = await ctx.services.teams.requestToJoin(me, team.id);
    if (outcome.kind !== 'requested') throw new Error(outcome.kind);
    const interaction = await press(me, `joinreq:withdraw:${outcome.request.id}`);
    expect(json(lastCall(interaction.editReply))).toContain('Withdrawn');
    expect(await ctx.services.teams.pendingForTeam(team.id)).toEqual([]);
  });
});

describe('looking for a team', () => {
  it('toggles: the form when unlisted, off when listed', async () => {
    const me = await verified();
    const first = await press(me, 'lft:toggle');
    expect(json(lastCall(first.showModal))).toContain('lft:save');

    const saved = fakeInteraction({
      kind: 'modal',
      customId: 'lft:save',
      userId: me.discordUserId,
      fields: { skills: 'Python, UI', blurb: 'Second-year student' },
    });
    await router.handle(saved);
    expect(json(lastCall(saved.editReply))).toContain("You're listed");
    expect((await ctx.services.teams.getProfile(me))?.skills).toEqual(['Python', 'UI']);

    const second = await press(me, 'lft:toggle');
    expect(second.showModal).not.toHaveBeenCalled();
    expect(json(lastCall(second.reply))).toContain('no longer listed');
    expect(await ctx.services.teams.getProfile(me)).toBeNull();
  });

  it('is not for someone already on a team', async () => {
    const owner = await verified();
    await createTeam(owner);
    const interaction = await press(owner, 'lft:toggle');
    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(replied(interaction)).toContain("You're already on a team");
  });

  it('shows the invite menu to owners with room, and not to anyone else', async () => {
    const listed = await verified();
    await ctx.services.teams.list(listed, { skills: 'Python', blurb: 'Hi' });
    const owner = await verified();
    await createTeam(owner);

    const asOwner = json(lastCall((await press(owner, 'lft:browse:0')).editReply));
    expect(asOwner).toContain('lft:invite');
    expect(asOwner).toContain(`<@${listed.discordUserId}>`);
    expect(asOwner).toContain('Python');

    const asOther = json(lastCall((await press(await verified(), 'lft:browse:0')).editReply));
    expect(asOther).toContain('Python');
    expect(asOther).not.toContain('lft:invite');
  });

  it('inviting DMs them, and they can accept', async () => {
    const listed = await verified();
    await ctx.services.teams.list(listed, { skills: 'Python', blurb: '' });
    const owner = await verified();
    const team = await createTeam(owner);

    const invite = fakeInteraction({
      kind: 'select',
      customId: 'lft:invite',
      values: [String(listed.id)],
      userId: owner.discordUserId,
    });
    await router.handle(invite);
    expect(json(lastCall(invite.editReply))).toContain('Invited');
    expect(invite.dms[0]?.userId).toBe(listed.discordUserId);
    const dm = json(invite.dms[0]?.message);
    const requestId = /joinreq:accept:(\d+)/.exec(dm)?.[1];
    expect(requestId).toBeDefined();

    const accept = await press(listed, `joinreq:accept:${requestId}`);
    expect(json(lastCall(accept.editReply))).toContain("You're on");
    expect((await ctx.services.teams.forMember(listed))?.team.id).toBe(team.id);
    expect(accept.dms[0]).toMatchObject({ userId: owner.discordUserId });
    expect(await ctx.services.teams.getProfile(listed)).toBeNull();
  });

  it('refuses invites from non-owners', async () => {
    const listed = await verified();
    await ctx.services.teams.list(listed, { skills: 'Python', blurb: '' });
    const invite = fakeInteraction({
      kind: 'select',
      customId: 'lft:invite',
      values: [String(listed.id)],
      userId: (await verified()).discordUserId,
    });
    await router.handle(invite);
    expect(replied(invite)).toContain(TeamMessages.notOwner);
    expect(invite.dms).toEqual([]);
  });
});

describe('/admin team', () => {
  function admin(subcommand: string, options: Record<string, unknown>, roles = [ORGANIZER_ROLE]) {
    return fakeInteraction({
      kind: 'command',
      commandName: 'admin',
      subcommandGroup: 'team',
      subcommand,
      options,
      roles,
    });
  }
  const discordUser = (link: ParticipantLink) => ({ id: link.discordUserId, bot: false });

  it.each(['list', 'add', 'kick', 'owner', 'rename', 'delete'])(
    '%s is for organizers only',
    async (subcommand) => {
      const interaction = admin(subcommand, {}, []);
      await router.handle(interaction);
      expect(json(lastCall(interaction.reply))).toContain(ORGANIZER_ONLY_MESSAGE);
    },
  );

  it('lists teams with their owners', async () => {
    const owner = await verified();
    await createTeam(owner);
    const interaction = admin('list', {});
    await router.handle(interaction);
    const reply = json(lastCall(interaction.editReply));
    expect(reply).toContain('Neural Ninjas');
    expect(reply).toContain('1/4');
    expect(reply).toContain(`<@${owner.discordUserId}>`);
  });

  it('adds someone, within the rules', async () => {
    const team = await createTeam(await verified());
    const me = await verified();
    const interaction = admin('add', { team: team.id, user: discordUser(me) });
    await router.handle(interaction);
    expect((await ctx.services.teams.forMember(me))?.team.id).toBe(team.id);
    expect(interaction.dms[0]).toMatchObject({ userId: me.discordUserId });

    const again = admin('add', { team: team.id, user: discordUser(me) });
    await router.handle(again);
    expect(replied(again)).toContain('already on a team');
  });

  it('refuses to add someone unverified or inactive', async () => {
    const team = await createTeam(await verified());
    const unverified = admin('add', {
      team: team.id,
      user: { id: '499999999999999999', bot: false },
    });
    await router.handle(unverified);
    expect(replied(unverified)).toContain("isn't verified");

    const inactive = await verified();
    await t.repos.links.setActive([inactive.id], false);
    const blocked = admin('add', { team: team.id, user: discordUser(inactive) });
    await router.handle(blocked);
    expect(replied(blocked)).toContain("isn't active");
  });

  it('kicks, handing over ownership if needed', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);

    const interaction = admin('kick', { user: discordUser(owner) });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('is the new owner');
    expect((await ctx.services.teams.get(team.id))?.ownerLinkId).toBe(member.id);

    const nobody = admin('kick', { user: discordUser(owner) });
    await router.handle(nobody);
    expect(replied(nobody)).toContain("isn't on a team");
  });

  it('changes the owner', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);
    await router.handle(admin('owner', { team: team.id, user: discordUser(member) }));
    expect((await ctx.services.teams.get(team.id))?.ownerLinkId).toBe(member.id);
  });

  it('renames', async () => {
    const team = await createTeam(await verified());
    const interaction = admin('rename', { team: team.id, name: 'Clean Name' });
    await router.handle(interaction);
    expect((await ctx.services.teams.get(team.id))?.name).toBe('Clean Name');
  });

  it('deletes only when confirmed, and tells the members', async () => {
    const owner = await verified();
    const team = await createTeam(owner);

    const unconfirmed = admin('delete', { team: team.id, confirm: false });
    await router.handle(unconfirmed);
    expect(replied(unconfirmed)).toContain('Nothing changed');
    expect(await ctx.services.teams.get(team.id)).not.toBeNull();

    const interaction = admin('delete', { team: team.id, confirm: true });
    await router.handle(interaction);
    expect(await ctx.services.teams.get(team.id)).toBeNull();
    expect(interaction.dms[0]).toMatchObject({ userId: owner.discordUserId });
  });

  it('suggests teams by name, to organizers only', async () => {
    const team = await createTeam(await verified());
    const suggest = (roles: string[]) =>
      fakeInteraction({
        kind: 'autocomplete',
        commandName: 'admin',
        focusedOption: 'team',
        focused: 'neural',
        roles,
      });
    const organizer = suggest([ORGANIZER_ROLE]);
    await router.handle(organizer);
    expect(lastCall(organizer.respond)).toEqual([{ name: team.name, value: team.id }]);
    const member = suggest([]);
    await router.handle(member);
    expect(lastCall(member.respond)).toEqual([]);
  });

  it('/admin unlink of a team owner hands over the team first', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);

    const interaction = fakeInteraction({
      kind: 'command',
      commandName: 'admin',
      subcommand: 'unlink',
      options: { user: discordUser(owner) },
      roles: [ORGANIZER_ROLE],
    });
    await router.handle(interaction);
    expect(json(lastCall(interaction.editReply))).toContain('Unlinked');
    expect(await ctx.services.verification.getLink(owner.discordUserId)).toBeNull();
    expect((await ctx.services.teams.get(team.id))?.ownerLinkId).toBe(member.id);
  });
});

describe('when the website removes a registration', () => {
  it('the participant sync takes them off their team', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);
    await t.setStatus(owner.registrationId, 'declined');

    const interaction = fakeInteraction({ kind: 'button', customId: 'x:y' });
    const client = {
      ...interaction.client,
      guilds: {
        fetch: vi.fn(async () => ({ members: { fetch: vi.fn(async () => new Map()) } })),
      },
    };
    await runParticipantSync(client as never, ctx);

    expect(await ctx.services.teams.forMember(owner)).toBeNull();
    expect((await ctx.services.teams.get(team.id))?.ownerLinkId).toBe(member.id);
    expect(json(interaction.channelSends.at(-1)?.message)).toContain(
      'also removed from team **Neural Ninjas**',
    );
    expect(interaction.dms[0]).toMatchObject({ userId: member.discordUserId });
  });

  it('a later run catches anyone an earlier run missed', async () => {
    const owner = await verified();
    const team = await createTeam(owner);
    const member = await verified();
    await ctx.services.teams.addMember(team.id, member);
    // Already inactive, as if the last run saved that and then failed.
    await t.setStatus(member.registrationId, 'declined');
    await t.repos.links.setActive([member.id], false);

    const interaction = fakeInteraction({ kind: 'button', customId: 'x:y' });
    const client = {
      ...interaction.client,
      guilds: {
        fetch: vi.fn(async () => ({ members: { fetch: vi.fn(async () => new Map()) } })),
      },
    };
    await runParticipantSync(client as never, ctx);

    expect(await ctx.services.teams.forMember(member)).toBeNull();
    expect(json(interaction.channelSends.at(-1)?.message)).toContain('removed from team');
  });
});

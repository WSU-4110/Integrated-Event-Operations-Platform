import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
} from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantLink } from '../../src/database/schema/index.js';
import type { BotContext } from '../../src/interactions/types.js';
import { isIdleTeamSync, runTeamSync } from '../../src/jobs/teamSync.js';
import {
  CATEGORY_SOFT_LIMIT,
  describeProvisionProblem,
  GUILD_ROLE_LIMIT,
  provisionTeam,
  removeTeamResources,
  setTeamRole,
  teamChannelName,
  teamRoleName,
} from '../../src/services/teamResources.js';
import { createTeamService } from '../../src/services/teamService.js';
import { fakeConfig, fakeContext, ORGANIZER_ROLE } from '../helpers/fakes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/testDatabase.js';

const GUILD_ID = '300000000000000001';
const CATEGORY_ID = '800000000000000001';
const MENTOR_ROLE = '100000000000000009';
const BOT_ID = '200000000000000001';

type FakeChannel = {
  id: string;
  name: string;
  type: ChannelType;
  parentId: string | null;
  permissionOverwrites: { cache: Map<string, unknown> };
  isSendable: () => boolean;
  send: ReturnType<typeof vi.fn>;
};

/** A Collection-like Map: filter and find, as discord.js has. */
class FakeCollection<V> extends Map<string, V> {
  filter(fn: (value: V) => boolean) {
    return new FakeCollection<V>([...this].filter(([, value]) => fn(value)));
  }
  find(fn: (value: V) => boolean) {
    return [...this.values()].find(fn);
  }
  get size_() {
    return this.size;
  }
}

function fakeGuild() {
  let nextId = 900000000000000000n;
  const id = () => String(++nextId);
  const roles = new FakeCollection<{ id: string; name: string }>();
  const channels = new FakeCollection<FakeChannel>();
  const members = new Map<
    string,
    {
      id: string;
      roles: {
        cache: Map<string, unknown>;
        add: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
      };
    }
  >();
  const addChannel = (name: string, type: ChannelType, parentId: string | null, chanId = id()) => {
    const channel: FakeChannel = {
      id: chanId,
      name,
      type,
      parentId,
      permissionOverwrites: { cache: new Map() },
      isSendable: () => type === ChannelType.GuildText,
      send: vi.fn(async () => ({})),
    };
    channels.set(chanId, channel);
    return channel;
  };
  addChannel('Teams', ChannelType.GuildCategory, null, CATEGORY_ID);

  const memberFor = (userId: string) => {
    let member = members.get(userId);
    if (!member) {
      const cache = new Map<string, unknown>();
      member = {
        id: userId,
        roles: {
          cache,
          add: vi.fn(async (roleId: string) => void cache.set(roleId, {})),
          remove: vi.fn(async (roleId: string) => void cache.delete(roleId)),
        },
      };
      members.set(userId, member);
    }
    return member;
  };

  const guild = {
    id: GUILD_ID,
    client: { user: { id: BOT_ID } },
    roles: {
      everyone: { id: GUILD_ID },
      fetch: vi.fn(async () => roles),
      create: vi.fn(async (o: { name: string }) => {
        const role = { id: id(), name: o.name };
        roles.set(role.id, role);
        return role;
      }),
      delete: vi.fn(async (roleId: string) => void roles.delete(roleId)),
    },
    channels: {
      fetch: vi.fn(async () => channels),
      create: vi.fn(async (o: { name: string; type: ChannelType; parent?: string }) =>
        addChannel(o.name, o.type, o.parent ?? null),
      ),
      delete: vi.fn(async (channelId: string) => void channels.delete(channelId)),
    },
    members: {
      cache: members,
      fetch: vi.fn(async (userId: string) => memberFor(userId)),
    },
  };
  return { guild, roles, channels, members, memberFor, addChannel };
}

let t: TestDatabase;
let ctx: BotContext;
let g: ReturnType<typeof fakeGuild>;
let client: Client;
let logSends: unknown[];
let users = 0;

beforeEach(async () => {
  t = await createTestDatabase();
  ({ ctx } = await fakeContext({ teams: createTeamService(t.repos, { maxSize: 4 }) }));
  ctx.config = fakeConfig({
    teams: { maxSize: 4, channelsEnabled: true, categoryId: CATEGORY_ID },
  });
  ctx.config.roles.mentorRoleId = MENTOR_ROLE;
  g = fakeGuild();
  logSends = [];
  client = {
    guilds: { fetch: vi.fn(async () => g.guild) },
    channels: {
      fetch: vi.fn(async () => ({
        isSendable: () => true,
        send: vi.fn(async (m: unknown) => void logSends.push(m)),
      })),
    },
  } as unknown as Client;
});
afterEach(async () => {
  await t.close();
});

async function verified(): Promise<ParticipantLink> {
  users++;
  const registrationId = await t.addRegistration({ email: `r${users}@example.edu` });
  const result = await t.repos.links.create({
    discordUserId: String(420000000000000000n + BigInt(users)),
    registrationId,
    linkedBy: null,
  });
  if (!result.ok) throw new Error('link failed');
  return result.link;
}

async function createTeam(name = 'Neural Ninjas') {
  const owner = await verified();
  const outcome = await ctx.services.teams.create(owner, { name, description: '', skills: '' });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  return { team: outcome.team, owner };
}

describe('names', () => {
  it('makes safe channel names', () => {
    expect(teamChannelName({ id: 7, name: 'Neural Ninjas!' })).toBe('team-neural-ninjas');
    expect(teamChannelName({ id: 7, name: 'Équipe' })).toBe('team-equipe');
    expect(teamChannelName({ id: 7, name: '日本語' })).toBe('team-7');
  });

  it('prefixes role names, so a team can not pose as a real role', () => {
    expect(teamRoleName('Organizer')).toBe('Team: Organizer');
  });
});

describe('setting up a team', () => {
  it('does nothing when the feature is off', async () => {
    ctx.config = fakeConfig();
    const { team } = await createTeam();
    expect(await provisionTeam(client, ctx, team.id)).toBe('disabled');
    expect(g.guild.roles.create).not.toHaveBeenCalled();
    expect(g.guild.channels.create).not.toHaveBeenCalled();
  });

  it('creates a powerless role and a private channel, and saves them', async () => {
    const { team, owner } = await createTeam();
    expect(await provisionTeam(client, ctx, team.id)).toBe('ok');

    expect(g.guild.roles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Team: Neural Ninjas',
        permissions: [],
        mentionable: false,
      }),
    );
    const saved = await ctx.services.teams.get(team.id);
    expect(saved?.discordRoleId).toBeTruthy();
    expect(saved?.discordChannelId).toBeTruthy();
    expect(g.memberFor(owner.discordUserId).roles.add).toHaveBeenCalledWith(
      saved?.discordRoleId,
      'Team member',
    );

    const options = g.guild.channels.create.mock.calls[0]![0] as unknown as {
      name: string;
      type: ChannelType;
      parent: string;
      permissionOverwrites: { id: string; allow?: bigint[]; deny?: bigint[] }[];
    };
    expect(options).toMatchObject({
      name: 'team-neural-ninjas',
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
    });
    const overwrite = (id: string) => options.permissionOverwrites.find((o) => o.id === id);
    const { ViewChannel } = PermissionFlagsBits;
    expect(overwrite(GUILD_ID)?.deny).toContain(ViewChannel);
    expect(overwrite(saved!.discordRoleId!)?.allow).toContain(ViewChannel);
    expect(overwrite(ORGANIZER_ROLE)?.allow).toContain(ViewChannel);
    expect(overwrite(MENTOR_ROLE)?.allow).toContain(ViewChannel);
    expect(overwrite(BOT_ID)?.allow).toContain(ViewChannel);
  });

  it('welcomes members, pinging only them', async () => {
    const { team, owner } = await createTeam();
    await provisionTeam(client, ctx, team.id);
    const channel = [...g.channels.values()].find((c) => c.name === 'team-neural-ninjas');
    expect(channel?.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: [owner.discordUserId] } }),
    );
  });

  it('is safe to repeat, and shares one run when calls overlap', async () => {
    const { team } = await createTeam();
    await Promise.all([
      provisionTeam(client, ctx, team.id),
      provisionTeam(client, ctx, team.id),
      provisionTeam(client, ctx, team.id),
    ]);
    await provisionTeam(client, ctx, team.id);
    expect(g.guild.roles.create).toHaveBeenCalledTimes(1);
    expect(g.guild.channels.create).toHaveBeenCalledTimes(1);
  });

  it('stops at the server role limit', async () => {
    for (let i = 0; i < GUILD_ROLE_LIMIT; i++) g.roles.set(`r${i}`, { id: `r${i}`, name: 'x' });
    const { team } = await createTeam();
    expect(await provisionTeam(client, ctx, team.id)).toBe('role_limit');
    expect(g.guild.roles.create).not.toHaveBeenCalled();
    expect(describeProvisionProblem('role_limit', team.name)).toContain('250-role limit');
  });

  it('overflows into a second category before Discord’s limit', async () => {
    for (let i = 0; i < CATEGORY_SOFT_LIMIT; i++) {
      g.addChannel(`c${i}`, ChannelType.GuildText, CATEGORY_ID);
    }
    const { team } = await createTeam();
    expect(await provisionTeam(client, ctx, team.id)).toBe('ok');
    expect(g.guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Teams 2', type: ChannelType.GuildCategory }),
    );
    const overflow = [...g.channels.values()].find((c) => c.name === 'Teams 2');
    const channel = [...g.channels.values()].find((c) => c.name === 'team-neural-ninjas');
    expect(channel?.parentId).toBe(overflow?.id);
  });

  it('reports failures instead of throwing', async () => {
    g.guild.roles.create.mockRejectedValueOnce(new Error('Missing Permissions'));
    const { team } = await createTeam();
    expect(await provisionTeam(client, ctx, team.id)).toBe('failed');
    expect(describeProvisionProblem('failed', team.name)).toContain('Manage Roles');
    expect(describeProvisionProblem('ok', team.name)).toBeNull();
  });

  it('reports a category that is not one', async () => {
    ctx.config.teams.categoryId = '800000000000009999';
    const { team } = await createTeam();
    expect(await provisionTeam(client, ctx, team.id)).toBe('failed');
  });
});

describe('member roles and cleanup', () => {
  it('adds and removes a role, ignoring people who left the server', async () => {
    const team = { id: 1, discordRoleId: '777' };
    await setTeamRole(client, ctx, team, '1234', true);
    expect(g.memberFor('1234').roles.add).toHaveBeenCalled();
    await setTeamRole(client, ctx, team, '1234', false);
    expect(g.memberFor('1234').roles.remove).toHaveBeenCalled();

    g.guild.members.fetch.mockRejectedValueOnce(new Error('network'));
    await expect(setTeamRole(client, ctx, team, '5678', true)).resolves.toBeUndefined();
  });

  it('skips roles when the team has none yet', async () => {
    await setTeamRole(client, ctx, { id: 1, discordRoleId: null }, '1234', true);
    expect(g.guild.members.fetch).not.toHaveBeenCalled();
  });

  it('deletes a dissolved team’s role and channel', async () => {
    const team = { id: 1, discordRoleId: '777', discordChannelId: '888' };
    expect(await removeTeamResources(client, ctx, team)).toBe(true);
    expect(g.guild.channels.delete).toHaveBeenCalledWith('888', expect.any(String));
    expect(g.guild.roles.delete).toHaveBeenCalledWith('777', expect.any(String));
  });

  it('says so when it could not clean up', async () => {
    g.guild.roles.delete.mockRejectedValueOnce(new Error('Missing Permissions'));
    const team = { id: 1, discordRoleId: '777', discordChannelId: null };
    expect(await removeTeamResources(client, ctx, team)).toBe(false);
  });
});

describe('the team sync job', () => {
  it('does nothing when the feature is off', async () => {
    ctx.config = fakeConfig();
    await createTeam();
    expect(isIdleTeamSync(await runTeamSync(client, ctx))).toBe(true);
    expect(g.guild.roles.fetch).not.toHaveBeenCalled();
  });

  it('sets up teams missing a role or channel, then goes idle', async () => {
    const { team } = await createTeam();
    const first = await runTeamSync(client, ctx);
    expect(first.provisioned).toBe(1);
    expect((await ctx.services.teams.get(team.id))?.discordChannelId).toBeTruthy();

    expect(isIdleTeamSync(await runTeamSync(client, ctx))).toBe(true);
  });

  it('recreates a channel someone deleted', async () => {
    const { team } = await createTeam();
    await runTeamSync(client, ctx);
    const saved = await ctx.services.teams.get(team.id);
    g.channels.delete(saved!.discordChannelId!);

    expect((await runTeamSync(client, ctx)).provisioned).toBe(1);
    expect(g.guild.channels.create).toHaveBeenCalledTimes(2);
    expect(g.guild.roles.create).toHaveBeenCalledTimes(1);
  });

  it('gives the role to members missing it and takes it from others', async () => {
    const { team, owner } = await createTeam();
    await runTeamSync(client, ctx);
    const saved = await ctx.services.teams.get(team.id);
    const roleId = saved!.discordRoleId!;

    g.memberFor(owner.discordUserId).roles.cache.delete(roleId);
    const intruder = g.memberFor('499999999999999999');
    intruder.roles.cache.set(roleId, {});
    g.memberFor('499999999999999998');

    const summary = await runTeamSync(client, ctx);
    expect(summary).toMatchObject({ rolesAdded: 1, rolesRemoved: 1 });
    expect(g.memberFor(owner.discordUserId).roles.cache.has(roleId)).toBe(true);
    expect(intruder.roles.cache.has(roleId)).toBe(false);
  });

  it('uses the member cache, never the rate-limited request for every member', async () => {
    const { owner } = await createTeam();
    await runTeamSync(client, ctx);
    for (const [arg] of g.guild.members.fetch.mock.calls) {
      expect(arg).toBe(owner.discordUserId);
    }
  });

  it('skips members who left the server', async () => {
    const { owner } = await createTeam();
    await runTeamSync(client, ctx);
    g.members.delete(owner.discordUserId);
    g.guild.members.fetch.mockRejectedValueOnce(
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.UnknownMember, message: 'Unknown Member' },
        RESTJSONErrorCodes.UnknownMember,
        404,
        'GET',
        '/members',
        {},
      ),
    );
    const summary = await runTeamSync(client, ctx);
    expect(summary.failed).toBe(0);
    expect(summary.rolesAdded).toBe(0);
  });

  it('tells organizers about a problem once, not every run', async () => {
    g.guild.roles.create.mockRejectedValue(new Error('Missing Permissions'));
    await createTeam();
    expect((await runTeamSync(client, ctx)).failed).toBe(1);
    expect((await runTeamSync(client, ctx)).failed).toBe(1);
    expect(logSends).toHaveLength(1);
    expect(JSON.stringify(logSends[0])).toContain('Manage Roles');
  });
});

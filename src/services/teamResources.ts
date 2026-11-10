import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type Collection,
  type Guild,
  type GuildBasedChannel,
  type MessageCreateOptions,
  type NonThreadGuildBasedChannel,
  type OverwriteResolvable,
  type Role,
} from 'discord.js';
import type { Team } from '../database/schema/index.js';
import type { BotContext } from '../interactions/types.js';

// Each team's Discord role and private channel (TEAM_CHANNELS_ENABLED). The
// database is the source of truth and is saved first, so nothing here undoes a
// team change: failures are logged and the team sync job tries again later.

type TeamContext = Pick<BotContext, 'config' | 'logger' | 'services'>;
type ChannelMap = Collection<string, NonThreadGuildBasedChannel | null>;

/** Discord's server-wide limits. */
export const GUILD_ROLE_LIMIT = 250;
export const GUILD_CHANNEL_LIMIT = 500;
/** Discord allows 50 channels per category; this leaves room for organizers' own. */
export const CATEGORY_SOFT_LIMIT = 45;

export type ProvisionResult =
  'disabled' | 'ok' | 'gone' | 'role_limit' | 'channel_limit' | 'failed';

export function teamRoleName(teamName: string): string {
  return `Team: ${teamName}`;
}

export function teamChannelName(team: Pick<Team, 'id' | 'name'>): string {
  const slug = team.name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `team-${slug || team.id}`;
}

function isUnknown(err: unknown, ...codes: RESTJSONErrorCodes[]): boolean {
  return err instanceof DiscordAPIError && codes.includes(Number(err.code));
}

function channelOverwrites(guild: Guild, role: Role, ctx: TeamContext): OverwriteResolvable[] {
  const { ViewChannel, SendMessages, ReadMessageHistory, AttachFiles, EmbedLinks, AddReactions } =
    PermissionFlagsBits;
  const staff = [...ctx.config.roles.organizerRoleIds];
  if (ctx.config.roles.mentorRoleId) staff.push(ctx.config.roles.mentorRoleId);
  return [
    { id: guild.roles.everyone.id, deny: [ViewChannel] },
    {
      id: guild.client.user.id,
      allow: [ViewChannel, SendMessages, ReadMessageHistory, EmbedLinks],
    },
    {
      id: role.id,
      allow: [ViewChannel, SendMessages, ReadMessageHistory, AttachFiles, EmbedLinks, AddReactions],
    },
    ...staff.map((id) => ({ id, allow: [ViewChannel, SendMessages, ReadMessageHistory] })),
  ];
}

/** The team category, or a numbered overflow category once it's nearly full. */
async function categoryWithRoom(
  guild: Guild,
  channels: ChannelMap,
  ctx: TeamContext,
): Promise<string> {
  const base = channels.get(ctx.config.teams.categoryId ?? '');
  if (base?.type !== ChannelType.GuildCategory) {
    throw new Error('TEAM_CATEGORY_ID is not a category in this server');
  }
  const hasRoom = (id: string) =>
    channels.filter((c) => c?.parentId === id).size < CATEGORY_SOFT_LIMIT;
  if (hasRoom(base.id)) return base.id;

  for (let n = 2; ; n++) {
    const name = `${base.name} ${n}`;
    const existing = channels.find((c) => c?.type === ChannelType.GuildCategory && c.name === name);
    if (!existing) {
      const created = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [...base.permissionOverwrites.cache.values()],
        reason: 'Team channels: the previous category is full',
      });
      return created.id;
    }
    if (hasRoom(existing.id)) return existing.id;
  }
}

async function provision(
  client: Client,
  ctx: TeamContext,
  teamId: number,
): Promise<ProvisionResult> {
  const details = await ctx.services.teams.detailsFor(teamId);
  if (!details) return 'gone';
  const { team, members } = details;

  const guild = await client.guilds.fetch(ctx.config.discord.guildId);
  const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);

  let role = team.discordRoleId ? (roles.get(team.discordRoleId) ?? null) : null;
  if (!role) {
    if (roles.size >= GUILD_ROLE_LIMIT) return 'role_limit';
    role = await guild.roles.create({
      name: teamRoleName(team.name),
      permissions: [],
      mentionable: false,
      hoist: false,
      reason: `Team #${team.id}`,
    });
  }

  let channel: GuildBasedChannel | null = team.discordChannelId
    ? (channels.get(team.discordChannelId) ?? null)
    : null;
  let channelIsNew = false;
  if (!channel) {
    if (channels.size >= GUILD_CHANNEL_LIMIT) {
      await ctx.services.teams.setDiscordResources(team.id, {
        discordRoleId: role.id,
        discordChannelId: null,
      });
      return 'channel_limit';
    }
    channel = await guild.channels.create({
      name: teamChannelName(team),
      type: ChannelType.GuildText,
      parent: await categoryWithRoom(guild, channels, ctx),
      topic: `Private channel for team ${team.name}.`,
      permissionOverwrites: channelOverwrites(guild, role, ctx),
      reason: `Team #${team.id}`,
    });
    channelIsNew = true;
  }

  await ctx.services.teams.setDiscordResources(team.id, {
    discordRoleId: role.id,
    discordChannelId: channel.id,
  });

  const ids = members.map((m) => m.discordUserId);
  await Promise.all(ids.map((id) => giveRole(guild, role, id, ctx)));
  if (channelIsNew && channel.isSendable()) {
    await channel
      .send({
        content: `👋 Welcome, **${team.name}**! This channel is private to your team, organizers and mentors. ${ids.map((id) => `<@${id}>`).join(' ')}`,
        allowedMentions: { users: ids },
      })
      .catch((err: unknown) => ctx.logger.warn({ err, teamId }, 'Could not post team welcome'));
  }
  return 'ok';
}

async function giveRole(guild: Guild, role: Role, userId: string, ctx: TeamContext): Promise<void> {
  try {
    const member = await guild.members.fetch(userId);
    if (!member.roles.cache.has(role.id)) await member.roles.add(role.id, 'Team member');
  } catch (err) {
    if (isUnknown(err, RESTJSONErrorCodes.UnknownMember)) return;
    ctx.logger.error({ err, userId, roleId: role.id }, 'Could not add team role');
  }
}

const inFlight = new Map<number, Promise<ProvisionResult>>();

/**
 * Creates whatever this team is missing on Discord and gives members the role.
 * Safe to call repeatedly. Calls overlapping for one team share one run, so
 * the sync job and a button press can't create two channels. Never throws.
 */
export function provisionTeam(
  client: Client,
  ctx: TeamContext,
  teamId: number,
): Promise<ProvisionResult> {
  if (!ctx.config.teams.channelsEnabled) return Promise.resolve('disabled');
  const running = inFlight.get(teamId);
  if (running) return running;

  const run = provision(client, ctx, teamId)
    .catch((err: unknown): ProvisionResult => {
      ctx.logger.error({ err, teamId }, 'Could not set up team role and channel');
      return 'failed';
    })
    .finally(() => inFlight.delete(teamId));
  inFlight.set(teamId, run);
  return run;
}

/** Adds or removes a member's team role. Failures are logged; the sync job repairs them. */
export async function setTeamRole(
  client: Client,
  ctx: TeamContext,
  team: Pick<Team, 'id' | 'discordRoleId'>,
  userId: string,
  give: boolean,
): Promise<void> {
  if (!ctx.config.teams.channelsEnabled || !team.discordRoleId) return;
  try {
    const guild = await client.guilds.fetch(ctx.config.discord.guildId);
    const member = await guild.members.fetch(userId);
    if (give) await member.roles.add(team.discordRoleId, `Joined team #${team.id}`);
    else await member.roles.remove(team.discordRoleId, `Left team #${team.id}`);
  } catch (err) {
    if (isUnknown(err, RESTJSONErrorCodes.UnknownMember)) return;
    ctx.logger.error({ err, userId, teamId: team.id, give }, 'Could not change team role');
  }
}

/** Deletes a dissolved team's role and channel. False if something couldn't be removed. */
export async function removeTeamResources(
  client: Client,
  ctx: TeamContext,
  team: Pick<Team, 'id' | 'discordRoleId' | 'discordChannelId'>,
): Promise<boolean> {
  if (!ctx.config.teams.channelsEnabled) return true;
  if (!team.discordRoleId && !team.discordChannelId) return true;
  let ok = true;
  try {
    const guild = await client.guilds.fetch(ctx.config.discord.guildId);
    const reason = `Team #${team.id} dissolved`;
    if (team.discordChannelId) {
      await guild.channels.delete(team.discordChannelId, reason).catch((err: unknown) => {
        if (isUnknown(err, RESTJSONErrorCodes.UnknownChannel)) return;
        ok = false;
        ctx.logger.error({ err, teamId: team.id }, 'Could not delete team channel');
      });
    }
    if (team.discordRoleId) {
      await guild.roles.delete(team.discordRoleId, reason).catch((err: unknown) => {
        if (isUnknown(err, RESTJSONErrorCodes.UnknownRole)) return;
        ok = false;
        ctx.logger.error({ err, teamId: team.id }, 'Could not delete team role');
      });
    }
  } catch (err) {
    ok = false;
    ctx.logger.error({ err, teamId: team.id }, 'Could not clean up team resources');
  }
  return ok;
}

/**
 * Renames a team's role and channel. Discord allows two channel renames per
 * ten minutes and discord.js waits out the limit rather than failing, so
 * callers shouldn't await this before answering the user.
 */
export async function renameTeamResources(
  client: Client,
  ctx: TeamContext,
  team: Pick<Team, 'id' | 'name' | 'discordRoleId' | 'discordChannelId'>,
): Promise<void> {
  if (!ctx.config.teams.channelsEnabled) return;
  try {
    const guild = await client.guilds.fetch(ctx.config.discord.guildId);
    if (team.discordRoleId) {
      await guild.roles.edit(team.discordRoleId, { name: teamRoleName(team.name) });
    }
    if (team.discordChannelId) {
      await guild.channels.edit(team.discordChannelId, { name: teamChannelName(team) });
    }
  } catch (err) {
    ctx.logger.warn({ err, teamId: team.id }, 'Could not rename team role or channel');
  }
}

/** Posts in the team's channel. False if it has none, or the post failed. */
export async function postToTeamChannel(
  client: Client,
  ctx: Pick<BotContext, 'logger'>,
  team: Pick<Team, 'id' | 'discordChannelId'>,
  message: MessageCreateOptions,
): Promise<boolean> {
  if (!team.discordChannelId) return false;
  try {
    const channel = await client.channels.fetch(team.discordChannelId);
    if (!channel?.isSendable()) return false;
    await channel.send(message);
    return true;
  } catch (err) {
    ctx.logger.warn({ err, teamId: team.id }, 'Could not post in team channel');
    return false;
  }
}

/** What an organizer should do about a failed set-up. Null if there's nothing to do. */
export function describeProvisionProblem(result: ProvisionResult, teamName: string): string | null {
  switch (result) {
    case 'role_limit':
      return `⚠️ Team **${teamName}** has no role or channel: this server has reached Discord's ${GUILD_ROLE_LIMIT}-role limit.`;
    case 'channel_limit':
      return `⚠️ Team **${teamName}** has no channel: this server has reached Discord's ${GUILD_CHANNEL_LIMIT}-channel limit.`;
    case 'failed':
      return `⚠️ I couldn't set up the role and channel for team **${teamName}**. Check that I have Manage Roles and Manage Channels and that TEAM_CATEGORY_ID is right. I'll keep retrying.`;
    default:
      return null;
  }
}

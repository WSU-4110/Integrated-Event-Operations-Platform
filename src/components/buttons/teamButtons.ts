import { MessageFlags, type RepliableInteraction } from 'discord.js';
import type { ParticipantLink, Team } from '../../database/schema/index.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext, ComponentHandler, MessageView } from '../../interactions/types.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { sendDirectMessage } from '../../services/directMessages.js';
import { announceDeparture, announceJoin } from '../../services/teamNotifications.js';
import {
  describeProvisionProblem,
  postToTeamChannel,
  provisionTeam,
  renameTeamResources,
} from '../../services/teamResources.js';
import { postVerificationLog } from '../../services/verificationLog.js';
import {
  buildFindTeamView,
  buildLeaveConfirm,
  buildLftList,
  buildLftModal,
  buildMyTeamView,
  buildNoTeamView,
  buildRequestCard,
  buildTeamCard,
  buildTeamModal,
  decodeFilter,
  isAnySkill,
  JOIN_REQUEST_NAMESPACE,
  LFT_NAMESPACE,
  LFT_PER_PAGE,
  LftFields,
  TEAM_NAMESPACE,
  TeamFields,
  TeamMessages,
  type FindState,
} from '../embeds/teamEmbeds.js';

const closed = (content: string) => ({ content, embeds: [], components: [] });

function parseId(raw: string | undefined, what: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Bad ${what} ID: ${raw}`);
  return id;
}

function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 0;
}

/** Discord usernames for menus, which can't show mentions. Missing ones fall back to the ID. */
async function usernames(
  interaction: RepliableInteraction,
  userIds: readonly string[],
  ctx: BotContext,
): Promise<Map<string, string>> {
  if (userIds.length === 0 || !interaction.guild) return new Map();
  const names = new Map<string, string>();
  try {
    const members = await interaction.guild.members.fetch({ user: [...userIds] });
    for (const [id, member] of members) names.set(id, member.user.username);
  } catch (err) {
    ctx.logger.warn({ err }, 'Could not fetch usernames');
  }
  return names;
}

/** "My Team" for this participant, whether or not they're on one. */
export async function buildMyTeamFor(
  interaction: RepliableInteraction,
  link: ParticipantLink,
  ctx: BotContext,
): Promise<MessageView> {
  const { teams } = ctx.services;
  const details = await teams.forMember(link);
  if (!details) return buildNoTeamView(await teams.pendingForParticipant(link));

  const isOwner = details.team.ownerLinkId === link.id;
  const pending = isOwner ? await teams.pendingForTeam(details.team.id) : [];
  return buildMyTeamView(details, {
    maxSize: teams.maxSize,
    viewerLinkId: link.id,
    pending,
    names: await usernames(
      interaction,
      pending.map((r) => r.discordUserId),
      ctx,
    ),
  });
}

export async function buildFindTeamFor(
  link: ParticipantLink,
  state: FindState,
  ctx: BotContext,
): Promise<MessageView> {
  const { teams } = ctx.services;
  const [open, profile] = await Promise.all([teams.listOpen(state), teams.getProfile(link)]);
  return buildFindTeamView(open.teams, {
    state,
    skills: open.skills,
    maxSize: teams.maxSize,
    listed: !!profile,
  });
}

/** Sets up the team's Discord role and channel, telling organizers if that can't happen. */
async function setUpOnDiscord(
  interaction: RepliableInteraction,
  team: Team,
  ctx: BotContext,
): Promise<void> {
  const result = await provisionTeam(interaction.client, ctx, team.id);
  const problem = describeProvisionProblem(result, team.name);
  if (problem) await postVerificationLog(interaction.client, ctx, problem);
}

export const teamHandler: ComponentHandler = {
  namespace: TEAM_NAMESPACE,

  async handle(interaction, customId, ctx) {
    const { teams } = ctx.services;
    const { action, args } = customId;

    switch (action) {
      // Opens straight away: verification is checked when the form comes back.
      case 'create': {
        if (!interaction.isButton()) throw new Error('team:create must be a button');
        await interaction.showModal(buildTeamModal());
        return;
      }

      case 'save': {
        if (!interaction.isModalSubmit()) throw new Error('team:save must be a modal');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        const input = {
          name: interaction.fields.getTextInputValue(TeamFields.name),
          description: interaction.fields.getTextInputValue(TeamFields.description),
          skills: interaction.fields.getTextInputValue(TeamFields.skills),
        };

        if (args[0] === undefined) {
          const outcome = await teams.create(link, input);
          switch (outcome.kind) {
            case 'invalid':
              throw new UserFacingError(outcome.reason);
            case 'name_taken':
              throw new UserFacingError(TeamMessages.nameTaken);
            case 'already_on_team':
              throw new UserFacingError(TeamMessages.alreadyOnTeam);
            case 'created':
              ctx.logger.info(
                { userId: interaction.user.id, teamId: outcome.team.id },
                'Team created',
              );
              await setUpOnDiscord(interaction, outcome.team, ctx);
              await interaction.editReply(await buildMyTeamFor(interaction, link, ctx));
              return;
          }
        }

        const outcome = await teams.update(parseId(args[0], 'team'), link, input);
        switch (outcome.kind) {
          case 'invalid':
            throw new UserFacingError(outcome.reason);
          case 'name_taken':
            throw new UserFacingError(TeamMessages.nameTaken);
          case 'not_owner':
            throw new UserFacingError(TeamMessages.notOwner);
          case 'not_found':
            throw new UserFacingError(TeamMessages.notFound);
          case 'saved':
            ctx.logger.info(
              { userId: interaction.user.id, teamId: outcome.team.id },
              'Team edited',
            );
            // Not awaited: channel renames can wait minutes on Discord's rate limit.
            if (outcome.renamed) void renameTeamResources(interaction.client, ctx, outcome.team);
            await interaction.editReply(await buildMyTeamFor(interaction, link, ctx));
            return;
        }
        return;
      }

      case 'edit': {
        if (!interaction.isButton()) throw new Error('team:edit must be a button');
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        const details = await teams.forMember(link);
        if (!details) throw new UserFacingError(TeamMessages.notOnTeam);
        if (details.team.ownerLinkId !== link.id) throw new UserFacingError(TeamMessages.notOwner);
        await interaction.showModal(buildTeamModal(details.team));
        return;
      }

      case 'find': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        await interaction.editReply(
          await buildFindTeamFor(link, { page: 0, minSpots: 1, skill: null, keyword: null }, ctx),
        );
        return;
      }

      case 'mine': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        await interaction.editReply(await buildMyTeamFor(interaction, link, ctx));
        return;
      }

      case 'leave': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        const details = await teams.forMember(link);
        if (!details) throw new UserFacingError(TeamMessages.notOnTeam);
        await interaction.editReply(buildLeaveConfirm(details, link.id));
        return;
      }

      case 'leave-cancel': {
        if (!interaction.isButton()) throw new Error('team:leave-cancel must be a button');
        await interaction.update(closed('👍 You stayed on your team.'));
        return;
      }

      case 'leave-confirm': {
        if (!interaction.isButton()) throw new Error('team:leave-confirm must be a button');
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        await interaction.deferUpdate();
        const outcome = await teams.leave(link);
        if (outcome.kind === 'not_on_team') {
          await interaction.editReply(closed(`❌ ${TeamMessages.notOnTeam}`));
          return;
        }
        ctx.logger.info(
          {
            userId: interaction.user.id,
            teamId: outcome.team.id,
            dissolved: outcome.dissolved,
          },
          'Left team',
        );
        await interaction.editReply(
          closed(
            outcome.dissolved
              ? `🚪 You left **${outcome.team.name}**, and the team was dissolved.`
              : `🚪 You left **${outcome.team.name}**.`,
          ),
        );
        await announceDeparture(interaction.client, ctx, outcome, interaction.user.id);
        return;
      }

      case 'view': {
        if (!interaction.isStringSelectMenu()) throw new Error('team:view must be a select menu');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        const details = await teams.detailsFor(parseId(interaction.values[0], 'team'));
        if (!details) throw new UserFacingError(TeamMessages.notFound);
        await interaction.editReply(buildTeamCard(details, teams.maxSize));
        return;
      }

      case 'request': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        const outcome = await teams.requestToJoin(link, parseId(args[0], 'team'));
        switch (outcome.kind) {
          case 'already_on_team':
            throw new UserFacingError(TeamMessages.alreadyOnTeam);
          case 'already_pending':
            throw new UserFacingError(TeamMessages.alreadyPending);
          case 'too_many':
            throw new UserFacingError(TeamMessages.tooManyRequests);
          case 'rejected_recently':
            throw new UserFacingError(TeamMessages.rejectedRecently);
          case 'full':
            throw new UserFacingError(TeamMessages.full);
          case 'not_found':
            throw new UserFacingError(TeamMessages.notFound);
          case 'has_invite':
            await interaction.editReply(
              '✉️ This team already invited you. Answer it in `/team` → My Team, or in the DM I sent.',
            );
            return;
          case 'requested':
            break;
        }

        const { request, team, owner } = outcome;
        ctx.logger.info(
          { userId: interaction.user.id, teamId: team.id, requestId: request.id },
          'Join request',
        );
        const card = buildRequestCard(
          { ...request, teamName: team.name, discordUserId: interaction.user.id },
          'owner',
          { username: interaction.user.username, profile: await teams.getProfile(link) },
        );
        const reached =
          !!owner &&
          ((await sendDirectMessage(interaction.client, ctx, owner.discordUserId, card)) ||
            (await postToTeamChannel(interaction.client, ctx, team, {
              ...card,
              content: `<@${owner.discordUserId}>, you have a join request:`,
              allowedMentions: { users: [owner.discordUserId] },
            })));
        await interaction.editReply(
          reached
            ? `📨 Your request to join **${team.name}** was sent. You'll get a DM when the owner answers.`
            : `📨 Your request to join **${team.name}** is in. I couldn't DM the owner, but they'll see it in \`/team\` → My Team.`,
        );
        return;
      }

      // /find-team paging and filters. All state is in the custom ID.
      case 'page':
      case 'skill':
      case 'spots': {
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        await interaction.deferUpdate();
        const chosen = interaction.isStringSelectMenu() ? interaction.values[0] : undefined;
        let state: FindState;
        if (action === 'page') {
          state = {
            page: parsePage(args[0]),
            minSpots: parsePage(args[1]) || 1,
            skill: decodeFilter(args[2]),
            keyword: decodeFilter(args[3]),
          };
        } else if (action === 'skill') {
          state = {
            page: 0,
            minSpots: parsePage(args[0]) || 1,
            skill: isAnySkill(chosen) ? null : (chosen ?? null),
            keyword: decodeFilter(args[1]),
          };
        } else {
          state = {
            page: 0,
            minSpots: parsePage(chosen) || 1,
            skill: decodeFilter(args[0]),
            keyword: decodeFilter(args[1]),
          };
        }
        await interaction.editReply(await buildFindTeamFor(link, state, ctx));
        return;
      }

      default:
        throw new Error(`Unexpected team component: ${interaction.customId}`);
    }
  },
};

export const joinRequestHandler: ComponentHandler = {
  namespace: JOIN_REQUEST_NAMESPACE,

  async handle(interaction, customId, ctx) {
    const { teams } = ctx.services;
    const { client } = interaction;

    if (customId.action === 'review') {
      if (!interaction.isStringSelectMenu()) throw new Error('joinreq:review must be a select');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const link = await requireVerified(interaction, ctx);
      if (!link) return;
      const request = await teams.getRequest(parseId(interaction.values[0], 'request'));
      if (request?.status !== 'PENDING') throw new UserFacingError(TeamMessages.requestClosed);
      const viewer =
        request.participantLinkId === link.id
          ? 'joiner'
          : request.ownerLinkId === link.id
            ? 'owner'
            : null;
      if (!viewer) throw new UserFacingError(TeamMessages.notAllowed);
      const profile =
        viewer === 'owner' ? await teams.getProfile({ id: request.participantLinkId }) : null;
      await interaction.editReply(buildRequestCard(request, viewer, { profile }));
      return;
    }

    const requestId = parseId(customId.args[0], 'request');
    if (!interaction.isButton()) throw new Error('joinreq actions must be buttons');
    const link = await requireVerified(interaction, ctx);
    if (!link) return;
    await interaction.deferUpdate();

    if (customId.action === 'withdraw') {
      const outcome = await teams.withdraw(link, requestId);
      switch (outcome.kind) {
        case 'not_allowed':
          throw new UserFacingError(TeamMessages.notAllowed);
        case 'not_pending':
          await interaction.editReply(closed(`ℹ️ ${TeamMessages.requestClosed}`));
          return;
        case 'withdrawn':
          await interaction.editReply(closed(`↩️ Withdrawn (**${outcome.team.name}**).`));
          return;
      }
    }

    const accepting = customId.action === 'accept';
    if (!accepting && customId.action !== 'reject') {
      throw new Error(`Unexpected join request action: ${customId.action}`);
    }
    const outcome = await teams.respond(link, requestId, accepting);
    switch (outcome.kind) {
      case 'not_allowed':
        throw new UserFacingError(TeamMessages.notAllowed);
      case 'full':
        // Buttons stay: a spot may open up.
        throw new UserFacingError(
          `**${outcome.team.name}** is full. Someone has to leave before anyone else can join.`,
        );
      case 'not_pending':
        await interaction.editReply(closed(`ℹ️ ${TeamMessages.requestClosed}`));
        return;
      case 'joiner_on_team':
        await interaction.editReply(closed('ℹ️ They already joined another team.'));
        return;
      case 'joiner_inactive':
        await interaction.editReply(closed("ℹ️ They aren't active in the event anymore."));
        return;
      case 'rejected': {
        const { team, request, joiner, owner } = outcome;
        ctx.logger.info(
          { userId: interaction.user.id, teamId: team.id, requestId },
          'Join request rejected',
        );
        if (request.kind === 'REQUEST') {
          await interaction.editReply(closed(`❌ You turned down <@${joiner}>.`));
          await sendDirectMessage(
            client,
            ctx,
            joiner,
            `Your request to join **${team.name}** wasn't accepted. \`/find-team\` has other teams with open spots.`,
          );
        } else {
          await interaction.editReply(closed(`❌ You declined the invite to **${team.name}**.`));
          if (owner) {
            await sendDirectMessage(
              client,
              ctx,
              owner.discordUserId,
              `<@${joiner}> declined the invite to **${team.name}**.`,
            );
          }
        }
        return;
      }
      case 'accepted': {
        const { team, request, joiner, owner } = outcome;
        ctx.logger.info(
          { userId: interaction.user.id, teamId: team.id, requestId },
          'Join request accepted',
        );
        const channelNote = team.discordChannelId
          ? ` Your team channel: <#${team.discordChannelId}>`
          : '';
        if (request.kind === 'REQUEST') {
          await interaction.editReply(closed(`✅ <@${joiner}> is on **${team.name}** now.`));
          await announceJoin(client, ctx, team, joiner, {
            userId: joiner,
            message: `✅ You're on **${team.name}**!${channelNote}`,
          });
        } else {
          await interaction.editReply(closed(`✅ You're on **${team.name}**!${channelNote}`));
          await announceJoin(
            client,
            ctx,
            team,
            joiner,
            owner && {
              userId: owner.discordUserId,
              message: `✅ <@${joiner}> accepted your invite to **${team.name}**.`,
            },
          );
        }
        return;
      }
    }
  },
};

export const lftHandler: ComponentHandler = {
  namespace: LFT_NAMESPACE,

  async handle(interaction, customId, ctx) {
    const { teams } = ctx.services;

    switch (customId.action) {
      case 'toggle': {
        if (!interaction.isButton()) throw new Error('lft:toggle must be a button');
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        if (await teams.unlist(link)) {
          await interaction.reply({
            content: "👋 You're no longer listed as looking for a team.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (await teams.isOnTeam(link)) throw new UserFacingError(TeamMessages.alreadyOnTeam);
        await interaction.showModal(buildLftModal());
        return;
      }

      case 'save': {
        if (!interaction.isModalSubmit()) throw new Error('lft:save must be a modal');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        const outcome = await teams.list(link, {
          skills: interaction.fields.getTextInputValue(LftFields.skills),
          blurb: interaction.fields.getTextInputValue(LftFields.blurb),
        });
        switch (outcome.kind) {
          case 'on_team':
            throw new UserFacingError(TeamMessages.alreadyOnTeam);
          case 'invalid':
            throw new UserFacingError(outcome.reason);
          case 'listed':
            ctx.logger.info({ userId: interaction.user.id }, 'Listed as looking for a team');
            await interaction.editReply(
              "🙋 You're listed. Team owners can see this and invite you. You come off the list automatically when you join a team, or press **Stop Looking** in `/find-team`.",
            );
            return;
        }
        return;
      }

      case 'browse': {
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        // Back/Next carry a marker and update in place; the first press opens a new message.
        if (customId.args[1]) {
          await interaction.deferUpdate();
        } else {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        const page = parsePage(customId.args[0]);
        const [{ listings, total }, details] = await Promise.all([
          teams.listings(page, LFT_PER_PAGE),
          teams.forMember(link),
        ]);
        const canInvite =
          details?.team.ownerLinkId === link.id && details.members.length < teams.maxSize;
        await interaction.editReply(
          buildLftList(listings, {
            page,
            total,
            canInvite,
            names: canInvite
              ? await usernames(
                  interaction,
                  listings.map((l) => l.discordUserId),
                  ctx,
                )
              : new Map(),
          }),
        );
        return;
      }

      case 'invite': {
        if (!interaction.isStringSelectMenu()) throw new Error('lft:invite must be a select menu');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const link = await requireVerified(interaction, ctx);
        if (!link) return;
        const outcome = await teams.invite(link, parseId(interaction.values[0], 'participant'));
        switch (outcome.kind) {
          case 'not_owner':
            throw new UserFacingError(TeamMessages.notOwner);
          case 'target_not_available':
            throw new UserFacingError(TeamMessages.targetUnavailable);
          case 'target_on_team':
            throw new UserFacingError(TeamMessages.targetOnTeam);
          case 'already_pending':
            throw new UserFacingError(TeamMessages.invitePending);
          case 'too_many':
            throw new UserFacingError(TeamMessages.tooManyInvites);
          case 'rejected_recently':
            throw new UserFacingError(TeamMessages.inviteRejectedRecently);
          case 'full':
            throw new UserFacingError('Your team is full.');
          case 'invited':
            break;
        }
        const { request, team, target } = outcome;
        ctx.logger.info(
          { userId: interaction.user.id, teamId: team.id, requestId: request.id },
          'Team invite',
        );
        const reached = await sendDirectMessage(
          interaction.client,
          ctx,
          target.discordUserId,
          buildRequestCard(
            { ...request, teamName: team.name, discordUserId: target.discordUserId },
            'joiner',
          ),
        );
        await interaction.editReply(
          reached
            ? `✉️ Invited <@${target.discordUserId}> to **${team.name}**.`
            : `✉️ Invited <@${target.discordUserId}>. I couldn't DM them, but they'll see it in \`/team\` → My Team.`,
        );
        return;
      }

      default:
        throw new Error(`Unexpected LFT component: ${interaction.customId}`);
    }
  },
};

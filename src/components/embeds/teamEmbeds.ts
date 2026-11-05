import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type {
  LftListing,
  TeamRequestDetails,
  TeamWithCount,
} from '../../database/repositories/teamRepository.js';
import type { LftProfile, Team } from '../../database/schema/index.js';
import type { MessageView } from '../../interactions/types.js';
import { TEAM_LIMITS, type TeamDetails } from '../../services/teamService.js';
import { buildCustomId } from '../../utils/customId.js';
import { Colors, EMBED_DESCRIPTION_LIMIT } from './theme.js';

export const TEAM_NAMESPACE = 'team';
export const JOIN_REQUEST_NAMESPACE = 'joinreq';
export const LFT_NAMESPACE = 'lft';

export const TeamFields = {
  name: 'name',
  description: 'description',
  skills: 'skills',
} as const;

export const LftFields = { skills: 'skills', blurb: 'blurb' } as const;

export const TEAMS_PER_PAGE = 5;
export const LFT_PER_PAGE = 5;
const SELECT_OPTIONS_LIMIT = 25;
// Starts with a comma, which no skill can contain (they're split on commas), so
// a team asking for a skill called "any" can't create a duplicate menu value.
const ANY_SKILL = ',any';
/** Filters travel in custom IDs (100 characters at most), so each one gets a budget. */
const FILTER_ID_BUDGET = 38;

export interface FindState {
  page: number;
  minSpots: number;
  skill: string | null;
  keyword: string | null;
}

export const TeamMessages = {
  notOnTeam: "You're not on a team.",
  alreadyOnTeam:
    "You're already on a team. Leave it with `/team` before joining or creating another.",
  nameTaken: 'That team name is already taken.',
  notFound: "That team doesn't exist anymore.",
  notOwner: 'Only the team owner can do that.',
  full: 'That team is full.',
  requestClosed: 'This has already been answered or withdrawn.',
  notAllowed: "That's not yours to answer.",
  tooManyRequests: `You have ${TEAM_LIMITS.pendingRequests} requests waiting. Withdraw one in \`/team\` → My Team, or wait for an answer.`,
  tooManyInvites: `Your team has ${TEAM_LIMITS.pendingInvites} invites waiting. Withdraw one in \`/team\` → My Team first.`,
  alreadyPending: 'You already asked to join that team. The owner will get back to you.',
  rejectedRecently: 'That team said no recently. Please give it an hour before asking again.',
  inviteRejectedRecently:
    'They said no recently. Please give it an hour before inviting them again.',
  targetUnavailable: "That person isn't available anymore.",
  targetOnTeam: "They've already joined a team.",
  invitePending:
    'There is already a request or invite between your team and them. See `/team` → My Team.',
} as const;

const row = (...components: MessageActionRowComponentBuilder[]) =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(components);

const button = (customId: string, label: string, style: ButtonStyle, emoji?: string) => {
  const built = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  return emoji ? built.setEmoji(emoji) : built;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function spotsLabel(openSpots: number): string {
  return openSpots <= 0 ? 'Full' : `${plural(openSpots, 'spot')} remaining`;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

// Custom IDs for /find-team

function encodeFilter(value: string | null): string {
  if (!value) return '-';
  // By code point, so an emoji is never cut in half (encodeURIComponent throws on that).
  // Cutting a filter short only widens the results, which is harmless.
  const chars = Array.from(value);
  while (encodeURIComponent(chars.join('')).length > FILTER_ID_BUDGET) chars.pop();
  return encodeURIComponent(chars.join('')) || '-';
}

export function decodeFilter(value: string | undefined): string | null {
  if (!value || value === '-') return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function pageId(state: FindState, page: number): string {
  return buildCustomId(
    TEAM_NAMESPACE,
    'page',
    page,
    state.minSpots,
    encodeFilter(state.skill),
    encodeFilter(state.keyword),
  );
}

// Modals

export function buildTeamModal(team?: Team): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildCustomId(TEAM_NAMESPACE, 'save', ...(team ? [team.id] : [])))
    .setTitle(team ? 'Edit team' : 'Create a team')
    .addLabelComponents(
      (label) =>
        label.setLabel('Team name').setTextInputComponent((input) => {
          input
            .setCustomId(TeamFields.name)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(TEAM_LIMITS.name.min)
            .setMaxLength(TEAM_LIMITS.name.max);
          if (team) input.setValue(team.name);
          return input;
        }),
      (label) =>
        label.setLabel('Project description').setTextInputComponent((input) => {
          input
            .setCustomId(TeamFields.description)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(TEAM_LIMITS.description)
            .setPlaceholder('What are you building? It’s fine if you don’t know yet.');
          if (team?.description) input.setValue(team.description);
          return input;
        }),
      (label) =>
        label
          .setLabel('Skills needed')
          .setDescription('Separate them with commas. Shown to people looking for a team.')
          .setTextInputComponent((input) => {
            input
              .setCustomId(TeamFields.skills)
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(TEAM_LIMITS.skillsInput)
              .setPlaceholder('Frontend, ML, Design');
            if (team?.skillsNeeded.length) input.setValue(team.skillsNeeded.join(', '));
            return input;
          }),
    );
}

export function buildLftModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildCustomId(LFT_NAMESPACE, 'save'))
    .setTitle('Looking for a team')
    .addLabelComponents(
      (label) =>
        label
          .setLabel('Your skills')
          .setDescription('Separate them with commas.')
          .setTextInputComponent((input) =>
            input
              .setCustomId(LftFields.skills)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(TEAM_LIMITS.skillsInput)
              .setPlaceholder('Python, UI design'),
          ),
      (label) =>
        label
          .setLabel('A short note')
          .setDescription('Team owners see this next to your name. Please skip personal details.')
          .setTextInputComponent((input) =>
            input
              .setCustomId(LftFields.blurb)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(TEAM_LIMITS.blurb),
          ),
    );
}

// The /team panel

export function buildTeamPanel(current: TeamDetails | null): MessageView {
  const embed = new EmbedBuilder()
    .setColor(Colors.teams)
    .setTitle('👥 Team Management')
    .setDescription(
      current
        ? `You're on **${current.team.name}**.`
        : "You're not on a team yet. Create one, or find one that needs you.",
    );
  return {
    embeds: [embed],
    components: [
      row(
        button(
          buildCustomId(TEAM_NAMESPACE, 'create'),
          'Create Team',
          ButtonStyle.Primary,
          '🚀',
        ).setDisabled(!!current),
        button(buildCustomId(TEAM_NAMESPACE, 'find'), 'Find a Team', ButtonStyle.Secondary, '🔎'),
        button(buildCustomId(TEAM_NAMESPACE, 'mine'), 'My Team', ButtonStyle.Secondary, '👥'),
        button(
          buildCustomId(TEAM_NAMESPACE, 'leave'),
          'Leave Team',
          ButtonStyle.Danger,
          '🚪',
        ).setDisabled(!current),
      ),
    ],
  };
}

function teamEmbed(details: TeamDetails, maxSize: number): EmbedBuilder {
  const { team, members, owner } = details;
  const embed = new EmbedBuilder()
    .setColor(Colors.teams)
    .setTitle(`👥 ${team.name}`)
    .addFields(
      {
        name: `Members (${members.length}/${maxSize})`,
        value: members
          .map((m) => `<@${m.discordUserId}>${m.linkId === owner?.linkId ? ' 👑' : ''}`)
          .join('\n'),
      },
      { name: 'Open spots', value: spotsLabel(maxSize - members.length), inline: true },
    );
  if (team.description) embed.setDescription(team.description);
  if (team.skillsNeeded.length > 0) {
    embed.addFields({
      name: 'Looking for',
      value: team.skillsNeeded.join(', '),
      inline: true,
    });
  }
  return embed;
}

function pendingLine(request: TeamRequestDetails): string {
  return request.kind === 'REQUEST'
    ? `📨 <@${request.discordUserId}> asked to join`
    : `✉️ You invited <@${request.discordUserId}>`;
}

function reviewMenu(
  requests: readonly TeamRequestDetails[],
  label: (r: TeamRequestDetails) => string,
) {
  return new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(JOIN_REQUEST_NAMESPACE, 'review'))
    .setPlaceholder('Review a request or invite…')
    .addOptions(
      requests
        .slice(0, SELECT_OPTIONS_LIMIT)
        .map((r) =>
          new StringSelectMenuOptionBuilder().setLabel(clip(label(r), 100)).setValue(String(r.id)),
        ),
    );
}

/** "My Team" for someone on a team. Only owners see pending requests. */
export function buildMyTeamView(
  details: TeamDetails,
  options: {
    maxSize: number;
    viewerLinkId: number;
    pending: readonly TeamRequestDetails[];
    /** Discord usernames by user ID, for the review menu (menus can't show mentions). */
    names: ReadonlyMap<string, string>;
  },
): MessageView {
  const { team, owner } = details;
  const isOwner = owner?.linkId === options.viewerLinkId;
  const embed = teamEmbed(details, options.maxSize);
  if (team.discordChannelId) {
    embed.addFields({ name: 'Team channel', value: `<#${team.discordChannelId}>`, inline: true });
  }
  if (isOwner && options.pending.length > 0) {
    embed.addFields({
      name: `Waiting on you (${options.pending.length})`,
      value: clip(options.pending.map(pendingLine).join('\n'), 1024),
    });
  }

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (isOwner && options.pending.length > 0) {
    components.push(
      row(
        reviewMenu(options.pending, (r) => {
          const who = options.names.get(r.discordUserId) ?? `User ${r.discordUserId}`;
          return r.kind === 'REQUEST' ? `Request from ${who}` : `Invite to ${who}`;
        }),
      ),
    );
  }
  components.push(
    row(
      ...(isOwner
        ? [
            button(buildCustomId(TEAM_NAMESPACE, 'edit'), 'Edit Team', ButtonStyle.Secondary, '✏️'),
            button(
              buildCustomId(LFT_NAMESPACE, 'browse', 0),
              'Find People',
              ButtonStyle.Secondary,
              '🔎',
            ),
          ]
        : []),
      button(buildCustomId(TEAM_NAMESPACE, 'leave'), 'Leave Team', ButtonStyle.Danger, '🚪'),
    ),
  );
  return { embeds: [embed], components };
}

/** "My Team" for someone without one: their open requests and invites. */
export function buildNoTeamView(pending: readonly TeamRequestDetails[]): MessageView {
  const embed = new EmbedBuilder().setColor(Colors.teams).setTitle('👥 My Team');
  const lines = pending.map((r) =>
    r.kind === 'INVITE'
      ? `✉️ **${r.teamName}** invited you`
      : `📨 You asked to join **${r.teamName}**`,
  );
  embed.setDescription(
    ["You're not on a team yet.", ...(lines.length > 0 ? ['', ...lines] : [])].join('\n'),
  );

  const components = [];
  if (pending.length > 0) {
    components.push(
      row(
        reviewMenu(pending, (r) =>
          r.kind === 'INVITE' ? `Invite from ${r.teamName}` : `Request to ${r.teamName}`,
        ),
      ),
    );
  }
  components.push(
    row(
      button(buildCustomId(TEAM_NAMESPACE, 'create'), 'Create Team', ButtonStyle.Primary, '🚀'),
      button(buildCustomId(TEAM_NAMESPACE, 'find'), 'Find a Team', ButtonStyle.Secondary, '🔎'),
    ),
  );
  return { embeds: [embed], components };
}

export function buildLeaveConfirm(details: TeamDetails, viewerLinkId: number): MessageView {
  const { team, members, owner } = details;
  const successor = members.find((m) => m.linkId !== viewerLinkId);
  let note = '';
  if (!successor) {
    note = " You're the only member, so the team will be dissolved.";
  } else if (owner?.linkId === viewerLinkId) {
    note = ` <@${successor.discordUserId}> will become the owner.`;
  }
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.warning)
        .setTitle(`Leave ${team.name}?`)
        .setDescription(`Are you sure?${note}`),
    ],
    components: [
      row(
        button(buildCustomId(TEAM_NAMESPACE, 'leave-confirm'), 'Leave Team', ButtonStyle.Danger),
        button(buildCustomId(TEAM_NAMESPACE, 'leave-cancel'), 'Stay', ButtonStyle.Secondary),
      ),
    ],
  };
}

// /find-team

/** One team's public card, with the Request to Join button. */
export function buildTeamCard(details: TeamDetails, maxSize: number): MessageView {
  const full = details.members.length >= maxSize;
  return {
    embeds: [teamEmbed(details, maxSize)],
    components: [
      row(
        button(
          buildCustomId(TEAM_NAMESPACE, 'request', details.team.id),
          'Request to Join',
          ButtonStyle.Primary,
          '📨',
        ).setDisabled(full),
      ),
    ],
  };
}

export function buildFindTeamView(
  list: readonly TeamWithCount[],
  options: {
    state: FindState;
    skills: readonly string[];
    maxSize: number;
    listed: boolean;
  },
): MessageView {
  const { state, skills, maxSize, listed } = options;
  const pageCount = Math.max(1, Math.ceil(list.length / TEAMS_PER_PAGE));
  const page = Math.min(Math.max(0, state.page), pageCount - 1);
  const shown = list.slice(page * TEAMS_PER_PAGE, (page + 1) * TEAMS_PER_PAGE);

  const filters = [
    state.skill && `skill "${state.skill}"`,
    state.keyword && `keyword "${state.keyword}"`,
    state.minSpots > 1 && `${state.minSpots}+ spots`,
  ].filter(Boolean);

  const embed = new EmbedBuilder().setColor(Colors.teams).setTitle('🔎 Teams Looking for Members');
  embed.setDescription(
    shown.length === 0
      ? filters.length > 0
        ? 'No teams match those filters.'
        : 'No teams have open spots yet. Be the first with `/team`!'
      : shown
          .map((team) => {
            const lines = [`🚀 **${team.name}**`];
            if (team.description) lines.push(`Project: ${clip(team.description, 120)}`);
            if (team.skillsNeeded.length > 0) {
              lines.push(`Looking for: ${team.skillsNeeded.join(', ')}`);
            }
            lines.push(spotsLabel(maxSize - team.memberCount));
            return lines.join('\n');
          })
          .join('\n\n')
          .slice(0, EMBED_DESCRIPTION_LIMIT),
  );
  const footer = [
    filters.length > 0 ? `Filtered by ${filters.join(', ')}` : null,
    list.length > 0 ? `Page ${page + 1} of ${pageCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (footer) embed.setFooter({ text: footer });

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (shown.length > 0) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(buildCustomId(TEAM_NAMESPACE, 'view'))
          .setPlaceholder('View a team…')
          .addOptions(
            shown.map((team) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(team.name)
                .setDescription(spotsLabel(maxSize - team.memberCount))
                .setValue(String(team.id)),
            ),
          ),
      ),
    );
  }
  if (skills.length > 0) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(
            buildCustomId(TEAM_NAMESPACE, 'skill', state.minSpots, encodeFilter(state.keyword)),
          )
          .setPlaceholder('Filter by skill needed…')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('Any skill')
              .setValue(ANY_SKILL)
              .setDefault(!state.skill),
            ...skills.slice(0, SELECT_OPTIONS_LIMIT - 1).map((skill) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(skill)
                .setValue(skill)
                .setDefault(skill.toLowerCase() === state.skill?.toLowerCase()),
            ),
          ),
      ),
    );
  }
  if (maxSize > 2) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(
            buildCustomId(
              TEAM_NAMESPACE,
              'spots',
              encodeFilter(state.skill),
              encodeFilter(state.keyword),
            ),
          )
          .setPlaceholder('Spots open…')
          .addOptions(
            Array.from(
              { length: Math.min(maxSize - 1, SELECT_OPTIONS_LIMIT) },
              (_, i) => i + 1,
            ).map((spots) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`At least ${plural(spots, 'spot')}`)
                .setValue(String(spots))
                .setDefault(spots === Math.max(1, state.minSpots)),
            ),
          ),
      ),
    );
  }
  components.push(
    row(
      button(pageId(state, page - 1), 'Back', ButtonStyle.Secondary, '◀️').setDisabled(page === 0),
      button(pageId(state, page + 1), 'Next', ButtonStyle.Secondary, '▶️').setDisabled(
        page >= pageCount - 1,
      ),
      button(
        buildCustomId(LFT_NAMESPACE, 'toggle'),
        listed ? 'Stop Looking' : "I'm Looking for a Team",
        listed ? ButtonStyle.Secondary : ButtonStyle.Success,
        '🙋',
      ),
      button(buildCustomId(LFT_NAMESPACE, 'browse', 0), 'Find People', ButtonStyle.Secondary, '🔎'),
    ),
  );
  return { embeds: [embed], components };
}

export function isAnySkill(value: string | undefined): boolean {
  return value === ANY_SKILL;
}

// Requests and invites

/** The card someone answers from, in a DM or from My Team. */
export function buildRequestCard(
  request: Pick<TeamRequestDetails, 'id' | 'kind' | 'teamName' | 'discordUserId'>,
  viewer: 'owner' | 'joiner',
  extra: { username?: string; profile?: Pick<LftProfile, 'skills' | 'blurb'> | null } = {},
): MessageView {
  const who = extra.username
    ? `<@${request.discordUserId}> (\`${extra.username}\`)`
    : `<@${request.discordUserId}>`;
  const embed = new EmbedBuilder().setColor(Colors.teams);
  const accept = buildCustomId(JOIN_REQUEST_NAMESPACE, 'accept', request.id);
  const reject = buildCustomId(JOIN_REQUEST_NAMESPACE, 'reject', request.id);
  const withdraw = buildCustomId(JOIN_REQUEST_NAMESPACE, 'withdraw', request.id);

  let buttons: ButtonBuilder[];
  if (request.kind === 'REQUEST' && viewer === 'owner') {
    embed
      .setTitle(`📨 Join request for ${request.teamName}`)
      .setDescription(`${who} wants to join your team.`);
    buttons = [
      button(accept, 'Accept', ButtonStyle.Success, '✅'),
      button(reject, 'Reject', ButtonStyle.Danger, '❌'),
    ];
  } else if (request.kind === 'INVITE' && viewer === 'joiner') {
    embed
      .setTitle(`✉️ Invitation to ${request.teamName}`)
      .setDescription(
        `**${request.teamName}** invited you to join. See who's on it with \`/find-team\`.`,
      );
    buttons = [
      button(accept, 'Accept', ButtonStyle.Success, '✅'),
      button(reject, 'Decline', ButtonStyle.Danger, '❌'),
    ];
  } else if (request.kind === 'REQUEST') {
    embed
      .setTitle(`📨 Your request to ${request.teamName}`)
      .setDescription('Waiting on the team owner.');
    buttons = [button(withdraw, 'Withdraw Request', ButtonStyle.Secondary)];
  } else {
    embed
      .setTitle('✉️ Your invite')
      .setDescription(`You invited ${who} to **${request.teamName}**.`);
    buttons = [button(withdraw, 'Withdraw Invite', ButtonStyle.Secondary)];
  }

  if (extra.profile) {
    if (extra.profile.skills.length > 0) {
      embed.addFields({ name: 'Skills', value: extra.profile.skills.join(', ') });
    }
    if (extra.profile.blurb) embed.addFields({ name: 'About', value: extra.profile.blurb });
  }
  return { embeds: [embed], components: [row(...buttons)] };
}

// Looking for a team

export function buildLftList(
  listings: readonly LftListing[],
  options: {
    page: number;
    total: number;
    canInvite: boolean;
    names: ReadonlyMap<string, string>;
  },
): MessageView {
  const { page, total, canInvite, names } = options;
  const pageCount = Math.max(1, Math.ceil(total / LFT_PER_PAGE));
  const embed = new EmbedBuilder().setColor(Colors.teams).setTitle('🙋 Looking for a Team');
  embed.setDescription(
    listings.length === 0
      ? 'Nobody is listed right now.'
      : listings
          .map((l) => {
            const lines = [`<@${l.discordUserId}>`];
            if (l.skills.length > 0) lines.push(`Skills: ${l.skills.join(', ')}`);
            if (l.blurb) lines.push(clip(l.blurb, 200));
            return lines.join('\n');
          })
          .join('\n\n'),
  );
  if (total > 0) embed.setFooter({ text: `Page ${page + 1} of ${pageCount}` });

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (canInvite && listings.length > 0) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(buildCustomId(LFT_NAMESPACE, 'invite'))
          .setPlaceholder('Invite someone to your team…')
          .addOptions(
            listings.map((l) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(clip(names.get(l.discordUserId) ?? `User ${l.discordUserId}`, 100))
                .setValue(String(l.participantLinkId)),
            ),
          ),
      ),
    );
  }
  components.push(
    row(
      button(
        buildCustomId(LFT_NAMESPACE, 'browse', Math.max(0, page - 1), 'back'),
        'Back',
        ButtonStyle.Secondary,
        '◀️',
      ).setDisabled(page === 0),
      button(
        buildCustomId(LFT_NAMESPACE, 'browse', page + 1, 'next'),
        'Next',
        ButtonStyle.Secondary,
        '▶️',
      ).setDisabled(page >= pageCount - 1),
    ),
  );
  return { embeds: [embed], components };
}

// /admin team list

export function buildTeamRoster(
  list: readonly TeamWithCount[],
  owners: ReadonlyMap<number, string>,
  maxSize: number,
): MessageView {
  const embed = new EmbedBuilder().setColor(Colors.teams).setTitle(`👥 Teams (${list.length})`);
  let text = 'No teams yet.';
  if (list.length > 0) {
    const lines = list.map((team) => {
      const owner = owners.get(team.id);
      return `**${team.name}** · ${team.memberCount}/${maxSize}${owner ? ` · 👑 <@${owner}>` : ''}`;
    });
    text = '';
    let shown = 0;
    for (const line of lines) {
      const remaining = `\n…and ${lines.length - shown} more`;
      if (text.length + line.length + 1 + remaining.length > EMBED_DESCRIPTION_LIMIT) {
        text += remaining;
        break;
      }
      text += `${shown === 0 ? '' : '\n'}${line}`;
      shown++;
    }
  }
  return { embeds: [embed.setDescription(text)], components: [] };
}

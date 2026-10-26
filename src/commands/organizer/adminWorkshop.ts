import {
  AttachmentBuilder,
  ChannelType,
  DiscordAPIError,
  RESTJSONErrorCodes,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type SlashCommandSubcommandsOnlyBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import {
  buildWorkshopCard,
  shortEventTime,
  WorkshopMessages,
} from '../../components/embeds/workshopEmbeds.js';
import type {
  WorkshopInput,
  WorkshopWithCounts,
} from '../../database/repositories/workshopRepository.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext } from '../../interactions/types.js';
import { isOrganizer } from '../../middleware/permissions.js';
import { sendDirectMessage } from '../../services/directMessages.js';
import {
  announcePromotions,
  markCardRemoved,
  refreshWorkshopCard,
} from '../../services/workshopNotifications.js';
import type { SaveOutcome } from '../../services/workshopService.js';
import { toCsv } from '../../utils/csv.js';
import { discordTimestamp, parseEventTime } from '../../utils/time.js';

// /admin workshop add|edit|remove|post and /admin workshop-roster.

type GuildCommand = ChatInputCommandInteraction<'cached'>;

const WORKSHOP_OPTION = 'workshop';
const LIMITS = { name: 100, description: 1000, speaker: 100, location: 100 } as const;

function workshopOption(sub: SlashCommandSubcommandBuilder) {
  return sub.addIntegerOption((o) =>
    o
      .setName(WORKSHOP_OPTION)
      .setDescription('Start typing the workshop name')
      .setRequired(true)
      .setAutocomplete(true),
  );
}

/** Options shared by add and edit; `required` only for add. */
function detailOptions(sub: SlashCommandSubcommandBuilder, required: boolean) {
  return sub
    .addStringOption((o) =>
      o
        .setName('name')
        .setDescription('Workshop name')
        .setMaxLength(LIMITS.name)
        .setRequired(required),
    )
    .addStringOption((o) =>
      o
        .setName('start')
        .setDescription('Start, in event time: 2026-11-14 14:00')
        .setMaxLength(40)
        .setRequired(required),
    )
    .addIntegerOption((o) =>
      o
        .setName('duration')
        .setDescription('Length in minutes')
        .setMinValue(5)
        .setMaxValue(720)
        .setRequired(required),
    )
    .addStringOption((o) =>
      o
        .setName('location')
        .setDescription('Room or place')
        .setMaxLength(LIMITS.location)
        .setRequired(required),
    )
    .addIntegerOption((o) =>
      o
        .setName('capacity')
        .setDescription('Maximum attendees')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(required),
    )
    .addStringOption((o) =>
      o.setName('description').setDescription('What it covers').setMaxLength(LIMITS.description),
    )
    .addStringOption((o) =>
      o.setName('speaker').setDescription('Who is running it').setMaxLength(LIMITS.speaker),
    );
}

export function addWorkshopAdminCommands(
  builder: SlashCommandSubcommandsOnlyBuilder,
): SlashCommandSubcommandsOnlyBuilder {
  return builder
    .addSubcommandGroup((group) =>
      group
        .setName('workshop')
        .setDescription('Manage workshops')
        .addSubcommand((sub) =>
          detailOptions(sub.setName('add').setDescription('Create a workshop'), true),
        )
        .addSubcommand((sub) =>
          detailOptions(
            workshopOption(
              sub.setName('edit').setDescription('Change a workshop (only the options you give)'),
            ),
            false,
          ),
        )
        .addSubcommand((sub) =>
          workshopOption(
            sub.setName('remove').setDescription('Delete a workshop and its signups'),
          ).addBooleanOption((o) =>
            o
              .setName('force')
              .setDescription('Remove even if people are signed up (they get a DM)'),
          ),
        )
        .addSubcommand((sub) =>
          workshopOption(
            sub.setName('post').setDescription('Post a workshop card with signup buttons'),
          ).addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Where to post it (default: this channel)')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
          ),
        ),
    )
    .addSubcommand((sub) =>
      workshopOption(
        sub
          .setName('workshop-roster')
          .setDescription('Download who is signed up, as a CSV (private)'),
      ),
    );
}

/** Suggests workshops by name; the value is the workshop ID. */
export async function autocompleteWorkshop(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!isOrganizer(interaction.member, ctx)) {
    await interaction.respond([]);
    return;
  }
  const query = String(interaction.options.getFocused());
  const matches = await ctx.services.workshops.search(query, 25);
  await interaction.respond(
    matches.map((w) => ({
      name: `${w.name} · ${shortEventTime(w.startTime, ctx.config.eventTimeZone)}`.slice(0, 100),
      value: w.id,
    })),
  );
}

function parseStart(input: string, ctx: BotContext): Date {
  const date = parseEventTime(input, ctx.config.eventTimeZone);
  if (!date) {
    throw new UserFacingError(
      `I couldn't read \`${input}\` as a time. Use \`YYYY-MM-DD HH:MM\` in ${ctx.config.eventTimeZone}, for example \`2026-11-14 14:00\`.`,
    );
  }
  return date;
}

const MINUTE = 60_000;

function saveError(outcome: Exclude<SaveOutcome, { kind: 'saved' }>): UserFacingError {
  switch (outcome.kind) {
    case 'name_taken':
      return new UserFacingError('Another workshop already has that name.');
    case 'invalid':
      return new UserFacingError(outcome.reason);
    case 'not_found':
      return new UserFacingError("That workshop doesn't exist (anymore).");
  }
}

async function getWorkshop(interaction: GuildCommand, ctx: BotContext) {
  const workshop = await ctx.services.workshops.get(
    interaction.options.getInteger(WORKSHOP_OPTION, true),
  );
  if (!workshop) throw new UserFacingError("That workshop doesn't exist. Pick one from the list.");
  return workshop;
}

function summary(w: { name: string; startTime: Date; endTime: Date; location: string }): string {
  return `**${w.name}**, ${discordTimestamp(w.startTime, 'F')} – ${discordTimestamp(w.endTime, 't')} in ${w.location}`;
}

/** The card without its buttons, so organizers don't sign up from the preview. */
function preview(workshop: WorkshopWithCounts, ctx: BotContext) {
  return buildWorkshopCard(workshop, { started: ctx.services.workshops.hasStarted(workshop) })
    .embeds;
}

async function add(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const { options } = interaction;
  const startTime = parseStart(options.getString('start', true), ctx);
  const input: WorkshopInput = {
    name: options.getString('name', true).trim(),
    description: options.getString('description')?.trim() ?? '',
    speaker: options.getString('speaker')?.trim() || null,
    startTime,
    endTime: new Date(startTime.getTime() + options.getInteger('duration', true) * MINUTE),
    location: options.getString('location', true).trim(),
    capacity: options.getInteger('capacity', true),
  };

  const outcome = await ctx.services.workshops.create(input);
  if (outcome.kind !== 'saved') throw saveError(outcome);
  const { workshop } = outcome;
  ctx.logger.info(
    { organizerId: interaction.user.id, workshopId: workshop.id },
    'Workshop created',
  );

  await interaction.editReply({
    content: `✅ Created ${summary(workshop)}.\nPost a signup card with \`/admin workshop post\`. Preview:`,
    embeds: preview({ ...workshop, registered: 0, waitlisted: 0 }, ctx),
  });
}

async function edit(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const { options } = interaction;
  const current = await getWorkshop(interaction, ctx);

  const patch: Partial<WorkshopInput> = {};
  const name = options.getString('name')?.trim();
  if (name) patch.name = name;
  const location = options.getString('location')?.trim();
  if (location) patch.location = location;
  const description = options.getString('description');
  if (description !== null) patch.description = description.trim();
  const speaker = options.getString('speaker');
  if (speaker !== null) patch.speaker = speaker.trim() || null;
  const capacity = options.getInteger('capacity');
  if (capacity !== null) patch.capacity = capacity;

  // A new start keeps the length unless a new duration is given too.
  const start = options.getString('start');
  const duration = options.getInteger('duration');
  if (start !== null || duration !== null) {
    const startTime = start !== null ? parseStart(start, ctx) : current.startTime;
    const length =
      duration !== null
        ? duration * MINUTE
        : current.endTime.getTime() - current.startTime.getTime();
    patch.startTime = startTime;
    patch.endTime = new Date(startTime.getTime() + length);
  }

  if (Object.keys(patch).length === 0) {
    throw new UserFacingError('Give at least one option to change.');
  }

  const outcome = await ctx.services.workshops.update(current.id, patch);
  if (outcome.kind !== 'saved') throw saveError(outcome);
  ctx.logger.info(
    { organizerId: interaction.user.id, workshopId: current.id, fields: Object.keys(patch) },
    'Workshop edited',
  );

  await refreshWorkshopCard(interaction.client, ctx, current.id);
  await announcePromotions(interaction.client, ctx, outcome.promoted);

  const updated = await ctx.services.workshops.get(current.id);
  const promotedNote =
    outcome.promoted.length > 0
      ? `\n${outcome.promoted.length} waitlisted ${outcome.promoted.length === 1 ? 'person was' : 'people were'} moved into the new spots and notified.`
      : '';
  const timeNote =
    patch.startTime !== undefined &&
    patch.startTime.getTime() !== current.startTime.getTime() &&
    current.registered + current.waitlisted > 0
      ? '\n⚠️ The time changed and people are signed up; consider letting them know.'
      : '';
  await interaction.editReply({
    content: `✅ Updated ${summary(outcome.workshop)}.${promotedNote}${timeNote}`,
    embeds: updated ? preview(updated, ctx) : [],
  });
}

async function remove(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const workshop = await getWorkshop(interaction, ctx);
  const signedUp = workshop.registered + workshop.waitlisted;
  if (signedUp > 0 && !interaction.options.getBoolean('force')) {
    throw new UserFacingError(
      `${signedUp} ${signedUp === 1 ? 'person is' : 'people are'} signed up for **${workshop.name}**. Run this again with \`force: True\` to remove it anyway; they'll get a DM.`,
    );
  }

  const removed = await ctx.services.workshops.remove(workshop.id);
  if (!removed) throw new UserFacingError("That workshop doesn't exist (anymore).");
  ctx.logger.info(
    { organizerId: interaction.user.id, workshopId: workshop.id, signedUp },
    'Workshop removed',
  );

  await markCardRemoved(interaction.client, ctx, removed.workshop);
  let notified = 0;
  for (const userId of removed.affectedDiscordUserIds) {
    if (
      await sendDirectMessage(
        interaction.client,
        ctx,
        userId,
        WorkshopMessages.removedDm(removed.workshop),
      )
    ) {
      notified++;
    }
  }

  const dmNote =
    removed.affectedDiscordUserIds.length > 0
      ? ` Notified ${notified} of ${removed.affectedDiscordUserIds.length} signed-up people by DM.`
      : '';
  await interaction.editReply(`🗑️ Removed **${removed.workshop.name}**.${dmNote}`);
}

async function post(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const workshop = await getWorkshop(interaction, ctx);
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!channel?.isSendable()) throw new UserFacingError("I can't post in that channel.");

  const started = ctx.services.workshops.hasStarted(workshop);
  let message;
  try {
    message = await channel.send(buildWorkshopCard(workshop, { started }));
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.MissingAccess) {
      throw new UserFacingError(`I don't have permission to post in <#${channel.id}>.`);
    }
    if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.MissingPermissions) {
      throw new UserFacingError(`I need Send Messages and Embed Links in <#${channel.id}>.`);
    }
    throw err;
  }

  // Only one card is kept up to date. The old one's buttons still work.
  const previous = workshop.channelId && workshop.messageId ? workshop : null;
  await ctx.services.workshops.setPost(workshop.id, {
    channelId: channel.id,
    messageId: message.id,
  });
  ctx.logger.info(
    { organizerId: interaction.user.id, workshopId: workshop.id, channelId: channel.id },
    'Workshop card posted',
  );

  const previousNote = previous
    ? `\nThe earlier card (https://discord.com/channels/${interaction.guildId}/${previous.channelId}/${previous.messageId}) won't show live counts anymore; you can delete it.`
    : '';
  await interaction.editReply(`📌 Posted **${workshop.name}** in ${message.url}.${previousNote}`);
}

/** Current usernames of server members, 100 per request (Discord's limit). */
async function fetchUsernames(
  guild: Guild,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const usernames = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 100) {
    const members = await guild.members.fetch({ user: userIds.slice(i, i + 100) });
    for (const [id, member] of members) usernames.set(id, member.user.username);
  }
  return usernames;
}

async function roster(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const workshop = await getWorkshop(interaction, ctx);
  const rows = await ctx.services.workshops.roster(workshop.id);

  const usernames = await fetchUsernames(
    interaction.guild,
    rows.map((row) => row.discordUserId),
  );

  let waitlistPlace = 0;
  const csv = toCsv(
    [
      'status',
      'waitlist_position',
      'discord_username',
      'discord_user_id',
      'registration_id',
      'name',
      'signed_up_at',
    ],
    rows.map((row) => [
      row.status === 'REGISTERED' ? 'registered' : 'waitlisted',
      row.status === 'WAITLISTED' ? ++waitlistPlace : '',
      usernames.get(row.discordUserId) ?? '(not in server)',
      row.discordUserId,
      row.registrationId,
      row.name ?? '(registration not found)',
      row.registeredAt.toISOString(),
    ]),
  );

  ctx.logger.info({ organizerId: interaction.user.id, workshopId: workshop.id }, 'Roster exported');
  await interaction.editReply({
    content: `📋 **${workshop.name}**: ${workshop.registered} registered, ${workshop.waitlisted} waitlisted. Contains participant names; please don't post it publicly.`,
    files: [
      new AttachmentBuilder(Buffer.from(csv, 'utf8'), {
        name: `workshop-${workshop.id}-roster.csv`,
      }),
    ],
  });
}

/** Runs /admin workshop <sub> and /admin workshop-roster (already deferred, organizer-checked). */
export async function handleWorkshopAdmin(
  interaction: GuildCommand,
  ctx: BotContext,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (interaction.options.getSubcommandGroup() !== 'workshop') {
    if (sub === 'workshop-roster') return roster(interaction, ctx);
    throw new Error(`Unknown /admin subcommand: ${sub}`);
  }
  switch (sub) {
    case 'add':
      return add(interaction, ctx);
    case 'edit':
      return edit(interaction, ctx);
    case 'remove':
      return remove(interaction, ctx);
    case 'post':
      return post(interaction, ctx);
    default:
      throw new Error(`Unknown /admin workshop subcommand: ${sub}`);
  }
}

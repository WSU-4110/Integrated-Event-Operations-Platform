import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { EVENT_TYPE_STYLES } from '../../components/embeds/scheduleEmbeds.js';
import { shortEventTime } from '../../components/embeds/workshopEmbeds.js';
import type { EventInput } from '../../database/repositories/eventRepository.js';
import { EVENT_TYPES, type EventType, type ScheduleEvent } from '../../database/schema/index.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext } from '../../interactions/types.js';
import type { EventSaveOutcome } from '../../services/scheduleService.js';
import { discordTimestamp } from '../../utils/time.js';
import { MINUTE, parseStart } from './adminWorkshop.js';

// /admin event add|edit|remove. Workshops are managed with /admin workshop
// and show up in the schedule on their own.

type GuildCommand = ChatInputCommandInteraction<'cached'>;

export const EVENT_OPTION = 'event';
const LIMITS = { name: 100, description: 1000, location: 100 } as const;
/** Typed into an optional text option on edit to remove its value. */
const CLEAR = '-';

const typeChoices = EVENT_TYPES.map((type) => ({
  name: EVENT_TYPE_STYLES[type].label,
  value: type,
}));

function eventOption(sub: SlashCommandSubcommandBuilder) {
  return sub.addIntegerOption((o) =>
    o
      .setName(EVENT_OPTION)
      .setDescription('Start typing the event name')
      .setRequired(true)
      .setAutocomplete(true),
  );
}

/** Options shared by add and edit; `editing` makes them optional and allows clearing. */
function detailOptions(sub: SlashCommandSubcommandBuilder, editing: boolean) {
  const clearHint = editing ? ` (${CLEAR} to remove)` : '';
  return sub
    .addStringOption((o) =>
      o
        .setName('name')
        .setDescription('Event name')
        .setMaxLength(LIMITS.name)
        .setRequired(!editing),
    )
    .addStringOption((o) =>
      o
        .setName('start')
        .setDescription('Start, in event time: 2026-11-14 12:00')
        .setMaxLength(40)
        .setRequired(!editing),
    )
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('What kind of event')
        .addChoices(...typeChoices)
        .setRequired(!editing),
    )
    .addIntegerOption((o) =>
      o
        .setName('duration')
        .setDescription(
          editing
            ? 'Length in minutes (0 makes it a moment, like a deadline)'
            : 'Length in minutes; leave out for a moment, like a deadline',
        )
        .setMinValue(editing ? 0 : 1)
        .setMaxValue(1440),
    )
    .addStringOption((o) =>
      o
        .setName('location')
        .setDescription(`Room or place${clearHint}`)
        .setMaxLength(LIMITS.location),
    )
    .addStringOption((o) =>
      o
        .setName('description')
        .setDescription(`Details shown in /next${clearHint}`)
        .setMaxLength(LIMITS.description),
    );
}

export function addEventAdminCommands(
  builder: SlashCommandSubcommandsOnlyBuilder,
): SlashCommandSubcommandsOnlyBuilder {
  return builder.addSubcommandGroup((group) =>
    group
      .setName('event')
      .setDescription('Manage the schedule')
      .addSubcommand((sub) =>
        detailOptions(sub.setName('add').setDescription('Add an event to the schedule'), false),
      )
      .addSubcommand((sub) =>
        detailOptions(
          eventOption(
            sub.setName('edit').setDescription('Change an event (only the options you give)'),
          ),
          true,
        ),
      )
      .addSubcommand((sub) =>
        eventOption(sub.setName('remove').setDescription('Remove an event from the schedule')),
      ),
  );
}

/** Suggests events by name; the value is the event ID. Organizer-checked by the caller. */
export async function autocompleteEvent(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  const matches = await ctx.services.schedule.search(String(interaction.options.getFocused()), 25);
  await interaction.respond(
    matches.map((e) => ({
      name: `${e.name} · ${shortEventTime(e.startTime, ctx.config.eventTimeZone)}`.slice(0, 100),
      value: e.id,
    })),
  );
}

function summary(e: ScheduleEvent): string {
  const end = e.endTime ? ` – ${discordTimestamp(e.endTime, 't')}` : '';
  const where = e.location ? ` in ${e.location}` : '';
  return `${EVENT_TYPE_STYLES[e.type].emoji} **${e.name}**, ${discordTimestamp(e.startTime, 'F')}${end}${where}`;
}

function saveError(outcome: Exclude<EventSaveOutcome, { kind: 'saved' }>): UserFacingError {
  return outcome.kind === 'invalid'
    ? new UserFacingError(outcome.reason)
    : new UserFacingError("That event doesn't exist (anymore).");
}

async function getEvent(interaction: GuildCommand, ctx: BotContext): Promise<ScheduleEvent> {
  const event = await ctx.services.schedule.get(interaction.options.getInteger(EVENT_OPTION, true));
  if (!event) throw new UserFacingError("That event doesn't exist. Pick one from the list.");
  return event;
}

async function add(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const { options } = interaction;
  const startTime = parseStart(options.getString('start', true), ctx);
  const duration = options.getInteger('duration');
  const type = options.getString('type', true) as EventType;
  const input: EventInput = {
    name: options.getString('name', true).trim(),
    description: options.getString('description')?.trim() ?? '',
    startTime,
    endTime: duration ? new Date(startTime.getTime() + duration * MINUTE) : null,
    location: options.getString('location')?.trim() || null,
    type,
  };

  const outcome = await ctx.services.schedule.create(input);
  if (outcome.kind !== 'saved') throw saveError(outcome);
  ctx.logger.info({ organizerId: interaction.user.id, eventId: outcome.event.id }, 'Event created');

  const workshopNote =
    type === 'WORKSHOP'
      ? '\nTo take signups, create it with `/admin workshop add` instead (and remove this one). Workshops appear in the schedule on their own.'
      : '';
  await interaction.editReply(`✅ Added ${summary(outcome.event)}.${workshopNote}`);
}

/** An optional text option on edit: undefined if not given, null if cleared. */
function editedText(interaction: GuildCommand, name: string): string | null | undefined {
  const value = interaction.options.getString(name);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === CLEAR || trimmed === '' ? null : trimmed;
}

async function edit(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const { options } = interaction;
  const current = await getEvent(interaction, ctx);

  const patch: Partial<EventInput> = {};
  const name = options.getString('name')?.trim();
  if (name) patch.name = name;
  const type = options.getString('type');
  if (type) patch.type = type as EventType;
  const location = editedText(interaction, 'location');
  if (location !== undefined) patch.location = location;
  const description = editedText(interaction, 'description');
  if (description !== undefined) patch.description = description ?? '';

  // A new start keeps the length unless a new duration is given too.
  const start = options.getString('start');
  const duration = options.getInteger('duration');
  if (start !== null || duration !== null) {
    const startTime = start !== null ? parseStart(start, ctx) : current.startTime;
    const length =
      duration !== null
        ? duration * MINUTE
        : current.endTime
          ? current.endTime.getTime() - current.startTime.getTime()
          : 0;
    patch.startTime = startTime;
    patch.endTime = length > 0 ? new Date(startTime.getTime() + length) : null;
  }

  if (Object.keys(patch).length === 0) {
    throw new UserFacingError('Give at least one option to change.');
  }

  const outcome = await ctx.services.schedule.update(current.id, patch);
  if (outcome.kind !== 'saved') throw saveError(outcome);
  ctx.logger.info(
    { organizerId: interaction.user.id, eventId: current.id, fields: Object.keys(patch) },
    'Event edited',
  );
  await interaction.editReply(`✅ Updated ${summary(outcome.event)}.`);
}

async function remove(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const event = await getEvent(interaction, ctx);
  const removed = await ctx.services.schedule.remove(event.id);
  if (!removed) throw new UserFacingError("That event doesn't exist (anymore).");
  ctx.logger.info({ organizerId: interaction.user.id, eventId: event.id }, 'Event removed');
  await interaction.editReply(`🗑️ Removed ${summary(removed)} from the schedule.`);
}

/** Runs /admin event <sub> (already deferred, organizer-checked). */
export async function handleEventAdmin(interaction: GuildCommand, ctx: BotContext): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'add':
      return add(interaction, ctx);
    case 'edit':
      return edit(interaction, ctx);
    case 'remove':
      return remove(interaction, ctx);
    default:
      throw new Error(`Unknown /admin event subcommand: ${sub}`);
  }
}

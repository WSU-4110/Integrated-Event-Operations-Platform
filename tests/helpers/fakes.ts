import { MessageFlags, type Interaction } from 'discord.js';
import { vi } from 'vitest';
import type { Config } from '../../src/config/env.js';
import type { BotContext, Services } from '../../src/interactions/types.js';
import { loadContent } from '../../src/services/contentService.js';
import type { VerificationService } from '../../src/services/verificationService.js';
import type { WorkshopService } from '../../src/services/workshopService.js';
import type { Logger } from '../../src/utils/logger.js';

export const ORGANIZER_ROLE = '100000000000000001';
export const PARTICIPANT_ROLE = '100000000000000002';
export const LOG_CHANNEL = '100000000000000003';
export const USER_ID = '400000000000000001';
export const CHANNEL_ID = '500000000000000001';
export const MESSAGE_ID = '600000000000000001';

export function fakeConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: 'test',
    logLevel: 'silent',
    discord: {
      token: 'x'.repeat(72),
      clientId: '200000000000000001',
      guildId: '300000000000000001',
    },
    roles: { organizerRoleIds: [ORGANIZER_ROLE], participantRoleId: PARTICIPANT_ROLE },
    channels: { verificationLogId: LOG_CHANNEL },
    database: { url: 'postgres://localhost/test', ssl: { mode: 'disable' } },
    eventId: 'builderwars-2026',
    eventTimeZone: 'America/Detroit',
    registrationUrl: 'https://builderwars.dev/#register',
    syncIntervalMinutes: 15,
    ...overrides,
  };
}

export function fakeLogger() {
  const logger = {
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
  return logger as typeof logger & Logger;
}

/** A verification service where nobody is linked, for tests that don't need a database. */
export function stubVerificationService(
  overrides: Partial<VerificationService> = {},
): VerificationService {
  return {
    getLink: vi.fn(async () => null),
    isRateLimited: vi.fn(async () => false),
    hasLikelyRegistration: vi.fn(async () => false),
    ...overrides,
  } as unknown as VerificationService;
}

/** A workshop service with no workshops, for tests that don't need a database. */
export function stubWorkshopService(overrides: Partial<WorkshopService> = {}): WorkshopService {
  return {
    listUpcoming: vi.fn(async () => []),
    statusesFor: vi.fn(async () => new Map()),
    fillAllOpenSpots: vi.fn(async () => []),
    ...overrides,
  } as unknown as WorkshopService;
}

export async function fakeContext(services: Partial<Services> = {}) {
  const logger = fakeLogger();
  const content = await loadContent({
    vars: { registrationUrl: 'https://builderwars.dev/#register' },
  });
  const ctx: BotContext = {
    config: fakeConfig(),
    logger,
    content,
    services: {
      verification: stubVerificationService(),
      workshops: stubWorkshopService(),
      ...services,
    },
  };
  return { ctx, logger };
}

interface FakeOptions {
  kind: 'command' | 'button' | 'select' | 'modal' | 'autocomplete';
  commandName?: string;
  customId?: string;
  values?: string[];
  roles?: string[];
  fields?: Record<string, string>;
  username?: string;
  userId?: string;
  subcommand?: string;
  subcommandGroup?: string;
  options?: Record<string, unknown>;
  /** Autocomplete: what the user has typed so far. */
  focused?: string;
  /** Component interactions: the message the component is on. */
  message?: { id?: string; ephemeral?: boolean };
}

/** A duck-typed interaction with just what the router and handlers touch. */
export function fakeInteraction(options: FakeOptions) {
  // `ephemeral` mirrors discord.js: null until deferReply/reply, and deferUpdate leaves it null.
  const state = { deferred: false, replied: false, ephemeral: null as boolean | null };
  const sent: unknown[] = [];
  const cardEdits: { messageId: string; view: unknown }[] = [];
  const dms: { userId: string; message: unknown }[] = [];
  const isEphemeral = (payload: unknown) =>
    ((payload as { flags?: number } | undefined)?.flags ?? 0) === Number(MessageFlags.Ephemeral);
  const postChannel = {
    id: CHANNEL_ID,
    isSendable: () => true,
    send: vi.fn(async (_m: unknown) => ({
      id: MESSAGE_ID,
      url: `https://discord.com/channels/300000000000000001/${CHANNEL_ID}/${MESSAGE_ID}`,
    })),
  };
  const member = {
    id: USER_ID,
    roles: { cache: new Map<string, unknown>(), add: vi.fn(), remove: vi.fn() },
  };
  const interaction = {
    type: { command: 2, button: 3, select: 3, autocomplete: 4, modal: 5 }[options.kind],
    commandName: options.commandName,
    customId: options.customId,
    values: options.values ?? [],
    user: { id: options.userId ?? USER_ID, username: options.username ?? 'test_user', bot: false },
    options: {
      getSubcommand: () => options.subcommand,
      getSubcommandGroup: () => options.subcommandGroup ?? null,
      getUser: (name: string) => options.options?.[name] ?? null,
      getString: (name: string) => options.options?.[name] ?? null,
      getInteger: (name: string) => options.options?.[name] ?? null,
      getBoolean: (name: string) => options.options?.[name] ?? null,
      getChannel: (name: string) => options.options?.[name] ?? null,
      getFocused: () => options.focused ?? '',
    },
    message: {
      id: options.message?.id ?? MESSAGE_ID,
      flags: {
        has: (flag: number) =>
          flag === Number(MessageFlags.Ephemeral) && !!options.message?.ephemeral,
      },
    },
    channel: postChannel,
    guildId: '300000000000000001',
    member: { roles: options.roles ?? [] },
    guild: {
      id: '300000000000000001',
      members: {
        // fetch(id) returns the member; fetch({ user: ids }) returns a map of them.
        fetch: vi.fn(async (arg?: unknown) =>
          arg && typeof arg === 'object' && 'user' in arg
            ? new Map(
                (arg as { user: string[] }).user.map((id) => [
                  id,
                  { user: { username: `user_${id.slice(-4)}` } },
                ]),
              )
            : member,
        ),
      },
    },
    client: {
      channels: {
        fetch: vi.fn(async () => ({
          isSendable: () => true,
          isTextBased: () => true,
          send: vi.fn(async (m: unknown) => sent.push(m)),
          messages: {
            edit: vi.fn(async (messageId: string, view: unknown) => {
              cardEdits.push({ messageId, view });
            }),
          },
        })),
      },
      users: {
        fetch: vi.fn(async (userId: string) => ({
          send: vi.fn(async (message: unknown) => dms.push({ userId, message })),
        })),
      },
    },
    fields: { getTextInputValue: (id: string) => options.fields?.[id] ?? '' },
    /** Messages posted to the verification log channel. */
    logMessages: sent,
    /** Edits to posted messages (workshop cards). */
    cardEdits,
    /** Direct messages sent, by recipient. */
    dms,
    /** The channel `/admin workshop post` posts in by default. */
    postChannel,
    fetchedMember: member,
    get deferred() {
      return state.deferred;
    },
    get replied() {
      return state.replied;
    },
    get ephemeral() {
      return state.ephemeral;
    },
    responded: false,
    inGuild: () => true,
    inCachedGuild: () => true,
    isCommand: () => options.kind === 'command',
    isChatInputCommand: () => options.kind === 'command',
    isButton: () => options.kind === 'button',
    isAnySelectMenu: () => options.kind === 'select',
    isStringSelectMenu: () => options.kind === 'select',
    isModalSubmit: () => options.kind === 'modal',
    isAutocomplete: () => options.kind === 'autocomplete',
    isMessageComponent: () => options.kind === 'button' || options.kind === 'select',
    reply: vi.fn(async (payload?: unknown) => {
      state.replied = true;
      state.ephemeral = isEphemeral(payload);
    }),
    update: vi.fn(async (_payload?: unknown) => {
      state.replied = true;
    }),
    showModal: vi.fn(async (_modal?: unknown) => {
      state.replied = true;
    }),
    deferReply: vi.fn(async (payload?: unknown) => {
      state.deferred = true;
      state.ephemeral = isEphemeral(payload);
    }),
    deferUpdate: vi.fn(async () => {
      state.deferred = true;
    }),
    respond: vi.fn(async (_choices: unknown[]) => {
      interaction.responded = true;
    }),
    editReply: vi.fn(async (_payload?: unknown) => {
      state.replied = true;
    }),
    followUp: vi.fn(async (_payload?: unknown) => {}),
  };
  return interaction as typeof interaction & Interaction;
}

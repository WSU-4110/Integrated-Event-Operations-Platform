import type { Interaction } from 'discord.js';
import { vi } from 'vitest';
import type { Config } from '../../src/config/env.js';
import type { BotContext, Services } from '../../src/interactions/types.js';
import { loadContent } from '../../src/services/contentService.js';
import type { VerificationService } from '../../src/services/verificationService.js';
import type { Logger } from '../../src/utils/logger.js';

export const ORGANIZER_ROLE = '100000000000000001';
export const PARTICIPANT_ROLE = '100000000000000002';
export const LOG_CHANNEL = '100000000000000003';
export const USER_ID = '400000000000000001';

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

export async function fakeContext(services: Partial<Services> = {}) {
  const logger = fakeLogger();
  const content = await loadContent({
    vars: { registrationUrl: 'https://builderwars.dev/#register' },
  });
  const ctx: BotContext = {
    config: fakeConfig(),
    logger,
    content,
    services: { verification: stubVerificationService(), ...services },
  };
  return { ctx, logger };
}

interface FakeOptions {
  kind: 'command' | 'button' | 'select' | 'modal';
  commandName?: string;
  customId?: string;
  values?: string[];
  roles?: string[];
  fields?: Record<string, string>;
  username?: string;
  userId?: string;
  subcommand?: string;
  options?: Record<string, unknown>;
}

/** A duck-typed interaction with just what the router and handlers touch. */
export function fakeInteraction(options: FakeOptions) {
  const state = { deferred: false, replied: false };
  const sent: unknown[] = [];
  const member = {
    id: USER_ID,
    roles: { cache: new Map<string, unknown>(), add: vi.fn(), remove: vi.fn() },
  };
  const interaction = {
    type: options.kind === 'command' ? 2 : options.kind === 'modal' ? 5 : 3,
    commandName: options.commandName,
    customId: options.customId,
    values: options.values ?? [],
    user: { id: options.userId ?? USER_ID, username: options.username ?? 'test_user', bot: false },
    options: {
      getSubcommand: () => options.subcommand,
      getUser: (name: string) => options.options?.[name] ?? null,
      getString: (name: string) => options.options?.[name] ?? null,
      getInteger: (name: string) => options.options?.[name] ?? null,
    },
    guildId: '300000000000000001',
    member: { roles: options.roles ?? [] },
    guild: { id: '300000000000000001', members: { fetch: vi.fn(async () => member) } },
    client: {
      channels: {
        fetch: vi.fn(async () => ({
          isSendable: () => true,
          send: vi.fn(async (m: unknown) => sent.push(m)),
        })),
      },
    },
    fields: { getTextInputValue: (id: string) => options.fields?.[id] ?? '' },
    /** Messages posted to the verification log channel. */
    logMessages: sent,
    fetchedMember: member,
    get deferred() {
      return state.deferred;
    },
    get replied() {
      return state.replied;
    },
    inGuild: () => true,
    inCachedGuild: () => true,
    isCommand: () => options.kind === 'command',
    isChatInputCommand: () => options.kind === 'command',
    isButton: () => options.kind === 'button',
    isAnySelectMenu: () => options.kind === 'select',
    isStringSelectMenu: () => options.kind === 'select',
    isModalSubmit: () => options.kind === 'modal',
    reply: vi.fn(async (_payload?: unknown) => {
      state.replied = true;
    }),
    update: vi.fn(async (_payload?: unknown) => {
      state.replied = true;
    }),
    showModal: vi.fn(async (_modal?: unknown) => {
      state.replied = true;
    }),
    deferReply: vi.fn(async (_payload?: unknown) => {
      state.deferred = true;
    }),
    editReply: vi.fn(async (_payload?: unknown) => {
      state.replied = true;
    }),
    followUp: vi.fn(async (_payload?: unknown) => {}),
  };
  return interaction as typeof interaction & Interaction;
}

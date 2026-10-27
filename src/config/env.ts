import { z } from 'zod';
import { isValidTimeZone } from '../utils/time.js';

const snowflake = z
  .string()
  .trim()
  .regex(/^\d{17,20}$/, 'must be a Discord ID (17–20 digits)');

// An empty value in .env (`NAME=`) counts as not set.
const optionalSnowflake = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  snowflake.optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DISCORD_TOKEN: z.string().trim().min(50, 'is missing or too short to be a bot token'),
    DISCORD_CLIENT_ID: snowflake,
    DISCORD_GUILD_ID: snowflake,

    ORGANIZER_ROLE_IDS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      )
      .pipe(z.array(snowflake).min(1, 'needs at least one role ID')),
    PARTICIPANT_ROLE_ID: snowflake,
    VERIFICATION_LOG_CHANNEL_ID: snowflake,
    ANNOUNCEMENT_CHANNEL_ID: optionalSnowflake,

    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres:// connection string')
      // node-postgres lets URL parameters override the ssl option, which
      // could silently turn off certificate checks.
      .refine((url) => !/[?&](sslmode|ssl|sslrootcert)=/i.test(url), {
        message: 'must not contain SSL parameters; use DB_SSL_MODE and DB_SSL_CA_PATH',
      }),
    DB_SSL_MODE: z.enum(['verify-full', 'disable']).default('verify-full'),
    DB_SSL_CA_PATH: z.string().trim().optional(),

    EVENT_ID: z.string().trim().min(1).default('builderwars-2026'),
    EVENT_TIMEZONE: z
      .string()
      .trim()
      .default('America/Detroit')
      .refine(isValidTimeZone, 'must be an IANA time zone, for example America/Detroit'),
    REGISTRATION_URL: z.url({ protocol: /^https$/, error: 'must be an https:// URL' }),
    SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(59).default(15),
  })
  .superRefine((env, ctx) => {
    if (env.DB_SSL_MODE === 'verify-full' && !env.DB_SSL_CA_PATH) {
      ctx.addIssue({
        code: 'custom',
        path: ['DB_SSL_CA_PATH'],
        message: 'is required when DB_SSL_MODE is verify-full',
      });
    }
  });

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: string;
  discord: {
    token: string;
    clientId: string;
    guildId: string;
  };
  roles: {
    organizerRoleIds: string[];
    participantRoleId: string;
  };
  channels: {
    verificationLogId: string;
    /** Where /announce posts; null disables /announce. */
    announcementId: string | null;
  };
  database: {
    url: string;
    ssl: { mode: 'verify-full'; caPath: string } | { mode: 'disable' };
  };
  eventId: string;
  /** Times organizers type in commands are read in this zone. */
  eventTimeZone: string;
  registrationUrl: string;
  syncIntervalMinutes: number;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Validates environment variables once at startup. Error messages name the
 * variable and the problem but never echo the value, so secrets can't leak
 * into logs.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'} ${issue.message}`,
    );
    throw new ConfigError(
      `Invalid configuration. Fix these environment variables (see .env.example):\n${problems.join('\n')}`,
    );
  }

  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    discord: {
      token: e.DISCORD_TOKEN,
      clientId: e.DISCORD_CLIENT_ID,
      guildId: e.DISCORD_GUILD_ID,
    },
    roles: {
      organizerRoleIds: e.ORGANIZER_ROLE_IDS,
      participantRoleId: e.PARTICIPANT_ROLE_ID,
    },
    channels: {
      verificationLogId: e.VERIFICATION_LOG_CHANNEL_ID,
      announcementId: e.ANNOUNCEMENT_CHANNEL_ID ?? null,
    },
    database: {
      url: e.DATABASE_URL,
      ssl:
        e.DB_SSL_MODE === 'verify-full'
          ? { mode: 'verify-full', caPath: e.DB_SSL_CA_PATH ?? '' }
          : { mode: 'disable' },
    },
    eventId: e.EVENT_ID,
    eventTimeZone: e.EVENT_TIMEZONE,
    registrationUrl: e.REGISTRATION_URL,
    syncIntervalMinutes: e.SYNC_INTERVAL_MINUTES,
  };
}

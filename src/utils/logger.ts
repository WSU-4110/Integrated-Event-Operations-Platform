import { pino, type Logger } from 'pino';

export type { Logger };

// Belt and braces: code should never log these, but if an object containing
// them slips into a log call, pino replaces the value.
const REDACT_PATHS = [
  'token',
  '*.token',
  'password',
  '*.password',
  'email',
  '*.email',
  'headers.authorization',
  '*.headers.authorization',
];

export function createLogger(options: { level: string; pretty: boolean }): Logger {
  return pino({
    level: options.level,
    base: { app: 'builderwars-bot' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(options.pretty && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,app' },
      },
    }),
  });
}

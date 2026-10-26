import dotenv from 'dotenv';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { ScheduledTask } from 'node-cron';
import { commands } from './commands/index.js';
import { componentHandlers } from './components/index.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createDatabase, createPool, waitForDatabase } from './database/client.js';
import { createRepositories } from './database/repositories/index.js';
import { registerGuildMemberAdd } from './events/guildMemberAdd.js';
import { registerInteractionCreate } from './events/interactionCreate.js';
import { registerReady } from './events/ready.js';
import { InteractionRouter } from './interactions/router.js';
import type { BotContext } from './interactions/types.js';
import { ContentError, loadContent } from './services/contentService.js';
import { createVerificationService } from './services/verificationService.js';
import { createWorkshopService } from './services/workshopService.js';
import { createLogger } from './utils/logger.js';

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });
  const content = await loadContent({ vars: { registrationUrl: config.registrationUrl } });

  const pool = createPool(config.database, logger);
  await waitForDatabase(pool, logger);
  const repos = createRepositories(createDatabase(pool), config.eventId);

  const ctx: BotContext = {
    config,
    logger,
    content,
    services: {
      verification: createVerificationService(repos),
      workshops: createWorkshopService(repos),
    },
  };
  const router = new InteractionRouter(ctx, commands, componentHandlers);

  // GuildMembers (privileged) is needed for join events and the role sync.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  const jobs: ScheduledTask[] = [];
  registerReady(client, ctx, jobs);
  registerInteractionCreate(client, ctx, router);
  registerGuildMemberAdd(client, ctx);
  client.on(Events.Error, (err) => logger.error({ err }, 'Discord client error'));
  client.on(Events.Warn, (message) => logger.warn(message));

  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    for (const job of jobs) void job.stop();
    void client
      .destroy()
      .then(() => pool.end())
      .catch((err: unknown) => logger.error({ err }, 'Error during shutdown'))
      .finally(() => {
        logger.flush();
        process.exit(0);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info({ commands: commands.length, env: config.nodeEnv }, 'Starting bot');
  await client.login(config.discord.token);
}

main().catch((err: unknown) => {
  // The logger may not exist yet, so write directly to stderr.
  const message =
    err instanceof ConfigError || err instanceof ContentError
      ? err.message
      : `Fatal startup error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

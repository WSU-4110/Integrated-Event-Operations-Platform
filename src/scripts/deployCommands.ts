// Registers slash commands for the hackathon guild. Run after adding or
// changing a command: `npm run commands:deploy`. Guild commands update
// instantly, unlike global ones.
import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { commands } from '../commands/index.js';
import { ConfigError, loadConfig } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });

  const body = commands.map((command) => command.data.toJSON());
  const rest = new REST().setToken(config.discord.token);
  const registered = (await rest.put(
    Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
    { body },
  )) as { name: string }[];

  logger.info(
    { guildId: config.discord.guildId, commands: registered.map((c) => `/${c.name}`) },
    `Registered ${registered.length} guild commands`,
  );
  logger.flush();
}

main().catch((err: unknown) => {
  const message =
    err instanceof ConfigError
      ? err.message
      : `Command deploy failed: ${err instanceof Error ? err.message : String(err)}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

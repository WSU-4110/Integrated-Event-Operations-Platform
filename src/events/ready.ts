import { Events, type Client } from 'discord.js';
import type { ScheduledTask } from 'node-cron';
import type { BotContext } from '../interactions/types.js';
import { startJobs } from '../jobs/index.js';

export function registerReady(client: Client, ctx: BotContext, jobs: ScheduledTask[]): void {
  client.once(Events.ClientReady, (ready) => {
    ctx.logger.info({ bot: ready.user.tag, guilds: ready.guilds.cache.size }, 'Bot is online');

    if (!ready.guilds.cache.has(ctx.config.discord.guildId)) {
      ctx.logger.warn(
        { guildId: ctx.config.discord.guildId },
        'The bot is not in DISCORD_GUILD_ID. Invite it or fix the ID.',
      );
      return;
    }
    jobs.push(...startJobs(ready, ctx));
  });
}

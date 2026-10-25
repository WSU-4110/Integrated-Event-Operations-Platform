import type { Client } from 'discord.js';
import cron, { type ScheduledTask } from 'node-cron';
import type { BotContext } from '../interactions/types.js';
import { runParticipantSync } from './participantSync.js';

/** Runs `task`, skipping a run if the previous one hasn't finished. */
function guarded(name: string, ctx: BotContext, task: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      ctx.logger.warn({ job: name }, 'Previous run still in progress; skipping');
      return;
    }
    running = true;
    const started = Date.now();
    try {
      const result = await task();
      ctx.logger.info({ job: name, ms: Date.now() - started, result }, 'Job finished');
    } catch (err) {
      ctx.logger.error({ err, job: name }, 'Job failed');
    } finally {
      running = false;
    }
  };
}

/** Starts scheduled jobs. Call once the client is ready. */
export function startJobs(client: Client, ctx: BotContext): ScheduledTask[] {
  const sync = guarded('participant-sync', ctx, () => runParticipantSync(client, ctx));

  void sync(); // reconcile right away after a restart
  return [cron.schedule(`*/${ctx.config.syncIntervalMinutes} * * * *`, sync)];
}

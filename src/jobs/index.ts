import type { Client } from 'discord.js';
import cron, { type ScheduledTask } from 'node-cron';
import type { BotContext } from '../interactions/types.js';
import { runParticipantSync } from './participantSync.js';
import { isIdleAnnouncementRun, runScheduledAnnouncements } from './scheduledAnnouncements.js';
import { isIdleTeamSync, runTeamSync } from './teamSync.js';

/**
 * Runs `task`, skipping a run if the previous one hasn't finished. Runs
 * where `isIdle` says nothing happened are logged at debug level, so a
 * once-a-minute job doesn't flood the logs.
 */
function guarded<T>(
  name: string,
  ctx: BotContext,
  task: () => Promise<T>,
  { isIdle }: { isIdle?: (result: T) => boolean } = {},
): () => Promise<void> {
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
      const level = isIdle?.(result) ? 'debug' : 'info';
      ctx.logger[level]({ job: name, ms: Date.now() - started, result }, 'Job finished');
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
  const announcements = guarded(
    'scheduled-announcements',
    ctx,
    () => runScheduledAnnouncements(client, ctx),
    { isIdle: isIdleAnnouncementRun },
  );

  const teams = guarded('team-sync', ctx, () => runTeamSync(client, ctx), {
    isIdle: isIdleTeamSync,
  });

  // In this order: the participant sync takes removed people off their teams and
  // fills the member cache that the team sync reads. `guarded` never rejects.
  const syncAll = async () => {
    await sync();
    await teams();
  };

  // Catch up right away after a restart.
  void syncAll();
  void announcements();
  return [
    cron.schedule(`*/${ctx.config.syncIntervalMinutes} * * * *`, syncAll),
    cron.schedule('* * * * *', announcements),
  ];
}

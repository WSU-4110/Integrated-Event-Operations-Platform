import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * The only schema the bot owns. Created by the database admin (the bot role
 * can't create schemas); every migration targets this schema only.
 */
export const discordBot = pgSchema('discord_bot');

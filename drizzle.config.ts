import { defineConfig } from 'drizzle-kit';

// Used for `npm run db:generate` only. Migrations are applied with
// `npm run db:migrate` (src/database/migrate.ts), not drizzle-kit migrate.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  // Never look at, diff or touch anything outside the bot's schema.
  schemaFilter: ['discord_bot'],
  migrations: { schema: 'discord_bot', table: '__drizzle_migrations' },
});

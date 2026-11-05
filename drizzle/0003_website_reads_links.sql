-- The website's admin dashboard shows each registration's Discord status, read
-- from this table (see docs/deployment.md on main). The bot owns the table, so
-- the grant runs as the bot. Skipped where the website's role doesn't exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builderwars') THEN
    GRANT SELECT ON discord_bot.participant_links TO builderwars;
  END IF;
END
$$;

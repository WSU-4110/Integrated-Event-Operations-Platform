-- LOCAL DEVELOPMENT AND TESTS ONLY.
-- Same role, schema and grants as production, so local runs and tests
-- hit the same permission limits.
-- The password is a throwaway for the local container.

CREATE ROLE discord_bot_app WITH LOGIN PASSWORD 'discord_bot_app_local' CONNECTION LIMIT 10;
ALTER ROLE discord_bot_app SET statement_timeout = '15s';
ALTER ROLE discord_bot_app SET idle_in_transaction_session_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS discord_bot;
GRANT USAGE, CREATE ON SCHEMA discord_bot TO discord_bot_app;

GRANT USAGE ON SCHEMA public TO discord_bot_app;
GRANT SELECT ON public.registrations TO discord_bot_app;

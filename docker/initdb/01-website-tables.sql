-- LOCAL DEVELOPMENT AND TESTS ONLY.
-- Mirrors the website's public.registrations table on builderwars-db
-- (introspected 2026-10-25). Never run this against builderwars-db:
-- the website owns the real table.

CREATE TABLE public.registrations (
  id serial PRIMARY KEY,
  event_id text NOT NULL DEFAULT 'builderwars-2026',
  name text NOT NULL,
  email text NOT NULL,
  school text NOT NULL,
  class_standing text NOT NULL,
  experience_level text NOT NULL,
  discord_username text,
  team_status text,
  team_name text,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'website',
  confirmation_email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  status_updated_at timestamptz,
  CONSTRAINT registrations_event_email_unique UNIQUE (event_id, email)
);

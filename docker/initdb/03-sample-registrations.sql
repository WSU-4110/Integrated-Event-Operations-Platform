-- LOCAL DEVELOPMENT ONLY: fake registrations to verify against.
-- To test /verify with your own account, add a row with your Discord
-- username, for example:
--   docker compose exec db psql -U postgres -c "INSERT INTO registrations
--     (name, email, school, class_standing, experience_level, discord_username, status)
--     VALUES ('Me', 'me@school.edu', 'WSU', 'junior', 'beginner', 'my_discord_name', 'approved')"

INSERT INTO public.registrations
  (name, email, school, class_standing, experience_level, discord_username, team_status, status, source)
VALUES
  ('Ada Example',   'ada@example.edu',   'Wayne State', 'junior',    'advanced',     'ada_example',   'looking',  'approved',   'website'),
  ('Ben Example',   'ben@example.edu',   'Wayne State', 'sophomore', 'beginner',     'Ben.Example',   'solo',     'pending',    'website'),
  ('Cy Example',    'cy@example.edu',    'U of M',      'senior',    'intermediate', 'cy_example',    'has_team', 'waitlisted', 'website'),
  ('Dee Example',   'dee@example.edu',   'Wayne State', 'freshman',  'beginner',     'dee_example',   'looking',  'declined',   'website'),
  ('Eve Waitlist',  'eve@example.edu',   'Wayne State', 'junior',    'beginner',     NULL,            NULL,       'pending',    'waitlist');

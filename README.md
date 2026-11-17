# BuilderWars Discord Bot

The Discord bot for **BuilderWars** (AWS Student Builder Group @ Wayne State, November 14–15, 2026). Participants use it to verify their registration, find information, sign up for workshops, follow the schedule and announcements, and form teams. Mentor help and submission tracking are planned for later phases.

Registration happens on the website ([builderwars.dev](https://builderwars.dev)), never in Discord. The bot links Discord accounts to existing registrations.

## Status

| Phase | Scope                                                                                 | State   |
| ----- | ------------------------------------------------------------------------------------- | ------- |
| 0     | Database discovery, bot DB role, Discord app                                          | ✅ Done |
| 1     | Skeleton, `/help`, `/rules`, `/faq`, `/resources`                                     | ✅ Done |
| 2     | Database, `/verify`, `/profile`, `/admin link\|unlink\|verification-queue`, role sync | ✅ Done |
| 3     | Workshops: signups, waitlist, cards, organizer management, roster CSV                 | ✅ Done |
| 4     | Schedule, `/next`, `/announce` with preview and scheduled sends                       | ✅ Done |
| 5     | Teams: `/team`, `/find-team`, join requests, invites, LFT, roles and channels         | ✅ Done |
| —     | Verification hardening: 15-minute lockout and recovery (FR-08), DB clock (NFR-06)     | ✅ Done |
| 6–7   | Event-day features, launch                                                            | Planned |

## Commands

| Command                                | Who        | What                                                                          |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `/help`                                | Everyone   | Menu of everything the bot does. Verify is highlighted until you're verified. |
| `/rules`, `/faq`, `/resources`         | Everyone   | Official rules, FAQ picker, resource links by category                        |
| `/verify`                              | Everyone   | Private form asking for your registration email; links your Discord account   |
| `/profile`                             | Everyone   | Your linked registration (name, website status, access, check-in)             |
| `/admin link user email\|registration` | Organizers | Link a member to a registration (for missing or changed usernames)            |
| `/admin unlink user`                   | Organizers | Remove a link and the Participant role                                        |
| `/admin verification-queue`            | Organizers | Failed or conflicting verification attempts to review                         |
| `/workshops`                           | Everyone   | Upcoming workshops with your own status; open one to register, cancel or wait |
| `/admin workshop add\|edit\|remove`    | Organizers | Create, change or delete a workshop (times in `EVENT_TIMEZONE`)               |
| `/admin workshop post workshop`        | Organizers | Post a public card with Register / Cancel buttons and live counts             |
| `/admin workshop-roster workshop`      | Organizers | Private CSV of who's registered and waitlisted, with website names            |
| `/schedule`, `/next`                   | Everyone   | Events and workshops by day; what's next and what's on now                    |
| `/admin event add\|edit\|remove`        | Organizers | Manage schedule events                                                        |
| `/announce`                            | Organizers | Announcement form, private preview, send now or at a set time                 |
| `/admin announcement list\|cancel`      | Organizers | Scheduled and failed announcements                                            |
| `/team`                                | Verified   | Create a team, see yours, or leave it                                         |
| `/find-team skill keyword spots`       | Verified   | Teams with open spots; request to join; list yourself as looking for a team   |
| `/admin team list\|add\|kick\|owner`    | Organizers | Organizer override for team membership and ownership                          |
| `/admin team rename\|delete`            | Organizers | Rename a team, or dissolve it (with `confirm: True`)                          |

## How verification works

1. The participant registers on the website with their Discord username.
2. In Discord they run `/verify` (or press **Verify** in `/help`). A private form asks for the email they registered with.
3. The bot links them only if **one** registration for `EVENT_ID` has **both** their current Discord username (normalized: case, spaces, `@`, `#0` ignored) **and** that email, and its status is `pending` or `approved`. They then get the **Participant** role.
4. From then on the bot identifies them by Discord user ID, so username changes don't matter.

Safeguards:

- A username alone never grants access (someone can rename themselves to match another registrant). Joining the server with a matching username only changes the welcome DM.
- **Lockout (FR-08):** 5 failed attempts within 15 minutes lock that member out of `/verify` for 15 minutes, counted from the fifth failure. Failures are `NO_MATCH`, `INELIGIBLE`, `AMBIGUOUS` and `ALREADY_LINKED`; attempts made while locked out are recorded as `RATE_LIMITED` and don't count, so they never extend the lockout. Once it expires the member gets a fresh 5 attempts.
- **One clock (NFR-06):** the lockout check compares stored attempt times against the database's `now()`, not the bot host's clock, so clock drift on the instance can't shorten or lengthen a lockout.
- **Recovery messages:** every failure tells the member what to check (Discord username, registration email), links `REGISTRATION_URL` if they haven't registered, and points them to an organizer. Messages never reveal anything about another participant's registration. A locked-out member is told before the form opens. A malformed email is rejected without counting as an attempt, and a temporary error (database or Discord hiccup) is logged and the member is told to wait a few minutes and retry.
- Conflicts (a registration already linked to another account, or several matching registrations) are never auto-resolved. They're posted to `#verification-log` and appear in `/admin verification-queue`.
- The typed email is never stored or logged; only the result is.
- Every 15 minutes (`SYNC_INTERVAL_MINUTES`) a sync job removes the Participant role from registrations that became `waitlisted`, `declined` or deleted, restores it if they're approved again, and re-adds it if someone removed it by mistake.

## How workshops work

- Anyone can browse `/workshops`; registering, cancelling and joining a waitlist require an active verification (`requireVerified`).
- Signups close when a workshop starts. If it's full, **Register** offers **Join Waitlist**. When someone cancels, or an organizer raises the capacity, the earliest waitlisted person is registered automatically and gets a DM.
- Capacity checks run in one transaction holding `SELECT … FOR UPDATE` on the workshop row, so simultaneous clicks on the last spot can't overbook. The unique constraint on (workshop, participant) is the final guard.
- Cards are persistent: their buttons (`workshop:register:<id>` etc.) work after restarts. Every signup refreshes the posted card's counts.
- Organizers type times as `2026-11-14 14:00`, read in `EVENT_TIMEZONE`. A workshop with signups can only be removed with `force: True`, and everyone signed up is DMed.
- `/admin unlink` deletes that person's signups and hands any freed spots to the waitlist.

## How the schedule and announcements work

- The schedule lives in `discord_bot.events` and is edited from Discord with `/admin event add|edit|remove`. Changes show up in `/schedule` and `/next` immediately; no restart or deploy. Workshops are read from their own table and merged in, so they never need a copy in `events`.
- An event without an end time is a moment (a deadline, doors locking). `/admin event edit` changes only the options given; a new `start` keeps the event's length unless `duration` is given too, `duration: 0` turns it into a moment, and `-` clears `location` or `description`.
- Until the first event exists, `/schedule` shows the `schedule` section of `src/config/content/help.json`.
- The production schedule was loaded from the run of show on [builderwars.dev](https://builderwars.dev/#schedule) (16 items, `America/Detroit`). If the website changes, update the bot with `/admin event` too; the two aren't linked.
- `/announce` opens a form, shows a private preview, then posts to `ANNOUNCEMENT_CHANNEL_ID` now or at a set time. A job sends scheduled announcements; `/admin announcement list|cancel` shows and cancels pending or failed ones.

## How teams work

- **The bot owns teams** (`discord_bot.teams`, `team_members`, `team_join_requests`, `lft_profiles`). The website has no team tables, so a team made in Discord doesn't appear on the website. Team size comes from the website's rule (`MAX_TEAM_SIZE`, default 4).
- Everything requires an active verification. Team size and ownership are checked in a transaction holding `SELECT … FOR UPDATE` on the team row. A unique constraint on `team_members.participant_link_id` is the final guard for "one team per person", because two teams' locks don't block each other. Names are unique ignoring case (a unique index on `lower(name)`).
- **Joining:** Request to Join DMs the owner Accept/Reject buttons (or posts in the team channel if DMs are closed; it's also always in `/team` → My Team). Owners can also invite people listed as looking for a team. Capacity is re-checked at accept time. Joining expires that person's other requests and invites and takes them off the list.
- **Limits on nagging:** 5 open requests per person, 10 open invites per team, and an hour's wait after a "no".
- **Leaving:** ownership passes to the longest-standing member; the last member leaving dissolves the team.
- **Removed from the event** (the website's "Remove from event", or `/admin unlink`): they come off their team and lose its role on the next sync. If they're restored, they can ask to rejoin.
- **Team roles and channels** are optional (`TEAM_CHANNELS_ENABLED`). Each team gets a permissionless, unmentionable `Team: <name>` role and a private channel under `TEAM_CATEGORY_ID` for its members, organizers and mentors. A second category is created at 45 channels. Role and channel failures never undo a team change: organizers are told in the verification log and the `team-sync` job retries, and also repairs missing roles and channels every `SYNC_INTERVAL_MINUTES`.

## Requirements

- Node.js 22 LTS (`.nvmrc`). Node 20 reached end of life in April 2026.
- A Discord application with a bot user
- Access to the club AWS account (Lightsail) for deployment
- Docker, only for a local database (tests don't need it)

## Installation

```bash
npm install
cp .env.example .env   # then fill it in
```

## Environment variables

Validated at startup by `src/config/env.ts`. A missing or invalid variable stops the bot with a message naming it (never its value).

| Variable                      | Description                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                    | `development` (pretty logs), `production` (JSON logs) or `test`                                                                |
| `LOG_LEVEL`                   | `info` by default; `debug` logs every button click                                                                             |
| `DISCORD_TOKEN`               | Bot token (Developer Portal → Bot → Reset Token). **Secret.**                                                                  |
| `DISCORD_CLIENT_ID`           | Application ID (Developer Portal → General Information)                                                                        |
| `DISCORD_GUILD_ID`            | The hackathon server's ID                                                                                                      |
| `ORGANIZER_ROLE_IDS`          | Comma-separated role IDs allowed to use organizer commands                                                                     |
| `PARTICIPANT_ROLE_ID`         | Role given to verified participants                                                                                            |
| `ANNOUNCEMENT_CHANNEL_ID`     | Where `/announce` posts; `/announce` is off until this is set                                                       |
| `MENTOR_ROLE_ID`              | Optional. Can see team channels                                                                                     |
| `MAX_TEAM_SIZE`               | Largest team (default 4, the website's rule)                                                                        |
| `TEAM_CHANNELS_ENABLED`       | `true` gives each team a role and private channel (default `false`). Needs Manage Roles and Manage Channels         |
| `TEAM_CATEGORY_ID`            | Category for team channels; required when `TEAM_CHANNELS_ENABLED=true`                                              |
| `VERIFICATION_LOG_CHANNEL_ID` | Organizer-only channel for verification events                                                                                 |
| `DATABASE_URL`                | `postgres://discord_bot_app:<password>@<endpoint>:5432/postgres`. **Secret.** No SSL parameters in the URL.                    |
| `DB_SSL_MODE`                 | `verify-full` (default; checks the server certificate) or `disable` (local Docker only)                                        |
| `DB_SSL_CA_PATH`              | Path to the [AWS RDS CA bundle](https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem); required for `verify-full` |
| `EVENT_ID`                    | `registrations.event_id` to verify against (default `builderwars-2026`)                                                        |
| `EVENT_TIMEZONE`              | IANA time zone for times typed in organizer commands (default `America/Detroit`)                                               |
| `REGISTRATION_URL`            | Website registration page (`https://` only)                                                                                    |
| `SYNC_INTERVAL_MINUTES`       | Role sync interval, 1–59 (default 15)                                                                                          |

## Discord setup

1. Create an application at <https://discord.com/developers/applications>.
2. **Bot** tab: turn on **Server Members Intent** (required for join events and the role sync), leave Presence and Message Content off, and turn off **Public Bot**. Click **Reset Token** and put the token in `.env`.
3. Invite the bot with only these permissions (no Administrator): View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Roles, Manage Channels.
   `https://discord.com/oauth2/authorize?client_id=<APP_ID>&permissions=268553232&integration_type=0&scope=bot+applications.commands`
4. Create the **Organizer**, **Mentor** and **Participant** roles, then drag the bot's role **above Participant** (it can only assign roles below its own).
5. Create `#announcements`, `#mentor-help`, `#verification-log` (visible to Organizer and the bot only) and a **Teams** category.
6. Run `npm run commands:deploy`. Re-run it whenever commands are added or changed.
7. `/admin` is hidden from members without **Manage Server**. If organizers don't have that permission, allow the Organizer role under **Server Settings → Integrations → BuilderWars Bot → /admin**. The bot checks `ORGANIZER_ROLE_IDS` itself either way.

## Database

The bot shares `builderwars-db` with the website. Rules:

- The bot connects as `discord_bot_app`: SELECT on `public.registrations`, full rights in the `discord_bot` schema, nothing else. The grants are in `docker/initdb/02-discord-bot-role.sql`, the same SQL the database admin ran in production (with a different password).
- Website tables are never migrated or written. Their read model lives in `src/database/website/`, outside the drizzle-kit schema; only `websiteRegistrationRepository` reads them.
- Bot tables in `discord_bot`: `participant_links`, `verification_attempts`, `workshops`, `workshop_registrations`, `events`, `announcements`, `teams`, `team_members`, `team_join_requests`, `lft_profiles`. They store Discord IDs and registration IDs only, never names or emails. The workshop roster reads names from the website table when it's exported.
- The website's organizer dashboard reads `discord_bot.participant_links` (`id, discord_user_id, registration_id, linked_at, active, checked_in, checked_in_at`), so don't rename those columns.

Migrations:

```bash
npm run db:generate   # after changing src/database/schema/: writes SQL to drizzle/
npm run db:migrate    # applies pending migrations to DATABASE_URL
```

`db:migrate` uses a small migrator (`src/database/migrate.ts`) instead of `drizzle-kit migrate`. Drizzle's migrator always runs `CREATE SCHEMA IF NOT EXISTS`, and Postgres checks the create-schema privilege before checking whether the schema exists, so it fails for the bot role. The replacement reads the same journal and history format. If `db:generate` ever emits `CREATE SCHEMA "discord_bot"`, delete that statement: the schema is created by the database admin.

**Never run `db:migrate` against `builderwars-db` without an organizer's go-ahead.**

Local database (Docker):

```bash
docker compose up -d   # Postgres 18 with a copy of the website's registrations table,
                       # the discord_bot schema, the bot role and sample registrations
# .env: DATABASE_URL=postgres://discord_bot_app:discord_bot_app_local@localhost:5432/postgres
#       DB_SSL_MODE=disable
npm run db:migrate
```

`docker/initdb/03-sample-registrations.sql` explains how to add a registration with your own Discord username.

## Running locally

```bash
npm run dev              # start with auto-reload (tsx watch)
npm run commands:deploy  # register slash commands in DISCORD_GUILD_ID
npm test                 # all tests; no Discord or Docker needed
npm run typecheck        # type-check src and tests
npm run lint
npm run format           # or format:check
npm run build && npm start
```

Tests run against PGlite, an in-process Postgres 18, set up exactly like production (website table, bot schema, bot role and grants). Migrations and every query run as `discord_bot_app`, so anything production would deny fails in tests too.

PGlite has a single connection, so its transactions never overlap. `tests/database/workshopConcurrency.test.ts` runs real overlapping signups on separate connections when `TEST_DATABASE_URL` points at a **throwaway** Postgres (for example a fresh `docker compose` database as the `postgres` user); otherwise it's skipped. Never point it at `builderwars-db`.

## Editing content

Rules, FAQ, resources and help text live in [`src/config/content/`](src/config/content/). Edit them, then restart the bot. The files are validated at startup against Discord's limits (25 FAQ questions, 100-character labels, https-only links, 5,800 characters of rules), and a mistake stops the bot with the file name and problem.

Write times as `{t:2026-11-14T12:00:00-05:00|F}`: an ISO time **with its UTC offset**, then a [Discord timestamp style](https://discord.com/developers/docs/reference#message-formatting-timestamp-styles) (`t` short time, `F` full date and time, `R` relative). Discord shows each participant the time in their own time zone. `{registrationUrl}` is replaced with `REGISTRATION_URL`.

The content comes from the official [Event Information Packet](https://builderwars.dev/api/information-packet) and the website. Keep them in sync.

## Architecture

```
src/
├── commands/
│   ├── participant/         /help /rules /faq /resources /verify /profile /workshops /schedule /next /team /find-team
│   └── organizer/           /admin (adminWorkshop, adminEvent, adminAnnouncement, adminTeam), /announce
├── components/
│   ├── buttons/             help:show:<section>, help:menu, workshop:register|cancel|waitlist|view|list
│   ├── modals/              verify:start (button) and verify:submit (form)
│   ├── selectMenus/         faq:select, resources:select
│   └── embeds/              view builders: embeds + their buttons/menus
├── config/
│   ├── env.ts               environment validation
│   └── content/             editable rules, FAQ, resources, help text
├── database/
│   ├── client.ts            pg pool (SSL with CA verification) + Drizzle
│   ├── migrate.ts           migrator for the discord_bot schema
│   ├── schema/              discord_bot tables (migrated)
│   ├── website/             read model for public.registrations (never migrated)
│   └── repositories/        all SQL lives here
├── events/                  ready, interactionCreate, guildMemberAdd
├── interactions/            router, shared types, central error handling
├── jobs/                    participant role sync, scheduled announcements, team sync (node-cron)
├── middleware/              requireOrganizer, requireVerified
├── scripts/                 deployCommands, migrate
├── services/                business rules (verification, workshops, roles, DMs, logs, content)
├── utils/                   logger, custom IDs, time parsing and Discord timestamps, CSV, usernames
└── index.ts                 startup and shutdown
```

- **Flow:** Discord interaction → `InteractionRouter` → handler → service → repository → view builder → reply. Services don't touch Discord, so they're tested directly.
- **Persistent components:** buttons and menus carry their state in a structured custom ID (`namespace:action:args`), so they keep working after a restart.
- **Errors:** every handler error is caught in one place. Users see "❌ Something went wrong…" with an 8-character error ID; the full error is logged under that ID. Expected refusals throw `UserFacingError` and are shown as-is.
- **Logging:** pino, with commands logged by name and user ID only (no arguments). Verification logs the result, never the email. Tokens, passwords and emails are redacted.

## Deployment (Lightsail)

The bot runs on the Lightsail instance `builderwars-bot` (us-east-2, same region as `builderwars-db`, so it connects over the private network) under pm2, which restarts it on crashes and on reboot.

**Build locally, not on the instance.** It has 412 MB of RAM and `tsc` runs out of memory there. There's no git on the instance either.

```bash
# locally
npm run build
# copy dist/, package.json, package-lock.json and drizzle/ to a staging folder on the instance, then there:
npm ci --omit=dev
node dist/scripts/migrate.js         # only with an organizer's go-ahead
node dist/scripts/deployCommands.js  # when commands changed
pm2 restart builderwars-bot          # first time: pm2 start dist/index.js --name builderwars-bot --time
pm2 logs builderwars-bot             # view logs
```

Stage each release in a separate folder and swap it into `~/builderwars-bot`, keeping the previous one (for example `~/builderwars-bot-phase4`) as a rollback copy.

`.env` on the instance is readable only by the `ubuntu` user (`chmod 600`). The CA bundle is at `~/certs/global-bundle.pem`. Full deployment and log-rotation instructions arrive with Phase 7.

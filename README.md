# Integrated Event Operations Platform

Event website and operations tooling for the BuilderWars Hackathon, run by the AWS Student Builder Group at Wayne State University.

It currently includes:

- a public event site with the schedule, prizes, sponsors, and FAQ
- a registration form that stores registrations and sends a confirmation email
- an organizer-only admin dashboard with search, stats, and CSV export

Planned work is tracked in this repository's issues.

## Getting started

Requires Node 24. The pnpm version is pinned in `package.json`; `corepack enable pnpm` sets it up.

```bash
corepack enable pnpm
pnpm install
pnpm run typecheck
PORT=5173 BASE_PATH=/ pnpm run build
```

Copy `.env.example` to `.env` and fill in the values. The app does not load `.env` on its own, so export the variables in your shell before starting a package:

```bash
pnpm --filter @workspace/api-server run dev   # API server
pnpm --filter @workspace/hackathon run dev    # web app
```

The project was first built on Replit, and parts of it still depend on Replit services. `docs/development.md` lists what has to be replaced before it runs fully elsewhere, along with the project layout, commands, and gotchas.

## Project layout

- `artifacts/hackathon/` — React and Vite web app
- `artifacts/api-server/` — Express API
- `lib/` — database schema, API contract, and generated API clients
- `attached_assets/` — logo and PDF packets used by the site and the confirmation email
- `docs/agile/` — product backlog and sprint records (planning, scrum meetings, reviews, retrospectives)
- `docs/development.md` — commands, layout, architecture decisions, and gotchas
- `docs/deployment.md` — hosting on Amazon Lightsail

## AI assistance

AI tools were used on this project, and this section says how.

- **Replit Agent** generated the initial version of the site (the web app, the API, and the database schema) on Replit between July and September 2026, working from written prompts.
- **Claude** (Anthropic) moved the project from Replit into this repository: it removed Replit-only files, checked the code for secrets, and wrote the project notes (now `docs/development.md`) and `.env.example`, and it drafted this README.
- **Agile documentation:** Claude helps draft the files in `docs/agile/` from the team's own notes and from GitHub activity (commits, pull requests, issues). Discussions, decisions, and feedback recorded there come from the team. Peer reviews are written by each student.
- **Coding assistance:** Claude is used as a coding assistant throughout development, under the direction of the team member running it. It has written substantial parts of some changes, including the rebrand, the logo set, and the deployment setup, and it reviews and tests changes before they are committed.

Commits do not carry per-commit AI attribution (one early commit has a `Co-Authored-By: Claude` line); this section is the disclosure for the whole project.

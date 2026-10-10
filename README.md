# Integrated Event Operations Platform

Event website and operations tooling for the AWS BuilderWars Hackathon, run by the AWS Student Builder Group at Wayne State University.

It currently includes:

- a public event site with the schedule, prizes, sponsors, and FAQ
- a waitlist form that stores registrations and sends a confirmation email
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

The project was first built on Replit, and parts of it still depend on Replit services. `CLAUDE.md` lists what has to be replaced before it runs fully elsewhere.

## Project layout

- `artifacts/hackathon/` — React and Vite web app
- `artifacts/api-server/` — Express API
- `lib/` — database schema, API contract, and generated API clients
- `attached_assets/` — logo and PDF packets used by the site and the confirmation email

## AI assistance

AI tools were used on this project, and this section says how.

- **Replit Agent** generated the initial version of the site (the web app, the API, and the database schema) on Replit between July and September 2026, working from written prompts.
- **Claude** (Anthropic) moved the project from Replit into this repository: it removed Replit-only files, checked the code for secrets, and wrote `CLAUDE.md` and `.env.example`, and it drafted this README.
- **From here on**, Claude is used as a coding assistant on some changes. When Claude wrote a substantial part of a change, that commit ends with a `Co-Authored-By: Claude` line. Other commits may still have had minor AI help, such as explanations or small suggestions.

The two setup commits described above (the import and the one adding this README) do not carry that line; this section is their disclosure.

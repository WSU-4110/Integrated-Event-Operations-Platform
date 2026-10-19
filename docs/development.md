# Development notes

How the project is built, laid out, and run. Setup steps for newcomers are in the README.

The site is being rebranded and moved off Replit. Those updates are listed in `docs/agile/product-backlog.md` under the issue that delivers each one; check that list when working on an issue.

## Commands

Uses pnpm workspaces (npm and yarn are blocked by a preinstall check). Node 24, TypeScript 5.9. The pnpm version is pinned in `package.json` (`packageManager`); run `corepack enable pnpm` to use it. pnpm 11 and later ignore `onlyBuiltDependencies` and fail the install.

- `pnpm install` — install everything
- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck, then build all packages. Requires `PORT` and `BASE_PATH`, because the Vite configs check them at load time.
- `pnpm --filter @workspace/hackathon run dev` — web app (Vite). Requires `PORT` and `BASE_PATH`.
- `pnpm --filter @workspace/api-server run dev` — API server (builds, then starts). Requires `PORT`.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push schema changes to a local database (dev only)
- `pnpm --filter @workspace/db run generate` — after changing `lib/db/src/schema/`, generate the SQL migration in `lib/db/drizzle/` and commit it. Production applies migrations on start.
- `docker build -t builderwars .` — production image (API plus built web app). Deployment steps are in `docs/deployment.md`.

Tests: `pnpm --filter @workspace/api-server test` builds the API and runs `artifacts/api-server/test/` against a real PostgreSQL in `TEST_DATABASE_URL` (the server applies migrations to it). They check that every admin endpoint refuses signed-out and non-admin requests without leaking participant data, registration validation and duplicates, and security headers. CI runs them on every pull request with a throwaway PostgreSQL. Locally, any PostgreSQL works; without one installed, `npx @electric-sql/pglite-socket --port 5439 --max-connections 20` starts an in-memory one (then use `postgresql://postgres:postgres@127.0.0.1:5439/postgres`).

Environment variables are listed in `.env.example`. Nothing loads a `.env` file automatically; export them in the shell.

## Layout

- `artifacts/hackathon/` — React + Vite web app (Tailwind 4, shadcn/ui, framer-motion, wouter, TanStack Query)
  - `src/App.tsx` — the whole site: every home section, the registration form, and the admin dashboard. Routes: `/` and `/admin`.
  - `src/config/event.ts` — all event content (name, date, schedule, FAQ, links). Change content here, not in components.
  - `src/components/ui/` — shadcn/ui components
- `artifacts/api-server/` — Express 5 API, bundled with esbuild, mounted at `/api`
  - `src/routes/registration.ts` — `POST /registrations`, `GET /registrations/check`, `GET /information-packet`
  - `src/routes/admin.ts` — `GET /admin/registrations`, `DELETE /admin/registrations/:id`, `GET /admin/stats`, `GET /admin/export` (CSV)
  - `src/routes/auth.ts`, `src/lib/auth.ts`, `src/middlewares/authMiddleware.ts` — Google sign-in (OpenID Connect with PKCE), sessions stored in Postgres. Setup: `docs/google-sign-in.md`
  - `src/lib/registrationConfirmationEmail.ts` — confirmation email with the information packet attached, sent through the Resend API (`RESEND_API_KEY`)
- `artifacts/mockup-sandbox/` — Replit's component preview sandbox. Not part of the product.
- `lib/api-spec/openapi.yaml` — the API contract and source of truth. Orval generates from it.
- `lib/api-zod/`, `lib/api-client-react/` — generated Zod schemas and React Query hooks. Do not edit `src/generated/` by hand.
- `lib/db/` — Drizzle ORM schema and Postgres client. Tables: `registrations`, `registration_status_changes`, `users`, `sessions`. Migrations are in `lib/db/drizzle/`.
- `scripts/src/import-waitlist.ts` — one-time import of the old Replit waitlist CSV into `registrations`
- `lib/replit-auth-web/` — `useAuth()` hook used by the web app
- `attached_assets/` — PDF packets, `brand/` (BuilderWars logo set), and `sponsors/` (sponsor logos). The web app imports them through the `@assets` alias, and the API reads the information packet from here by path. Renaming a file breaks both.
- `screenshots/` — reference screenshots of wayneaws.dev, the design the site was based on. The rebrand moves away from it: purple accent instead of orange, pixel-style BuilderWars logo.
- `docs/agile/` — Scrum records required by the course: product backlog, team, and one folder per sprint (planning, scrum meetings, review, retrospective, contributions). Peer reviews are written by students and are not stored here.
- `docs/deployment.md` — Lightsail hosting setup

## Architecture decisions

- Single-page site with anchor navigation; `/admin` is the only other route.
- Production runs on Amazon Lightsail (container service plus managed PostgreSQL). The API server also serves the built web app, so site and API share one origin. `CANONICAL_HOST` redirects other hostnames, such as www.builderwars.dev, to builderwars.dev. The old awsbuilderwars.dev is not redirected; it goes away with the Replit site.
- Dark theme only. `html` is forced to `class="dark"`; there is no light mode.
- Admin authorization is enforced on the server. Middleware on `/api/admin` looks up the signed-in user's email in the `users` table and checks it against the comma-separated `ADMIN_EMAILS` list: 401 when signed out, 403 for anyone else. The session's public user object does not include the email, so never authorize from client state or the session shape.
- `GET /api/auth/user` returns `{ user: AuthUser | null }`, which is what `useAuth()` expects. Use `useAuth()` for auth state, not the generated API hooks.
- Admin CSV export is a plain browser link to `/api/admin/export`, not a hook.
- Registration requires a `.edu` email and rejects duplicates per event (409). New registrations start as `pending`. If the confirmation email fails, the registration is kept and `confirmation_email_sent_at` stays empty; the admin table shows "email not sent" with a resend button (`POST /api/admin/registrations/:id/resend-confirmation`).
- Organizers change a registration's status in the admin dashboard (FR-04): pending → approved, waitlisted, or declined, following `STATUS_TRANSITIONS` in `lib/db/src/schema/registrations.ts`; nothing returns to pending. The request carries the status the organizer saw, and the server refuses the change (409) if it has changed since. Each change and its `registration_status_changes` history row are saved in one transaction. Approval doesn't send anything yet; the approval email and verification code are #6.
- People imported from the waitlist (`source = waitlist`, no Discord username) can submit the registration form with the same email: it completes their existing row, keeping their original sign-up date, instead of returning 409. The admin table labels them "waitlist · not completed" until then.

## Gotchas

- After any change to `openapi.yaml`, run codegen before touching server or web code.
- In the OpenAPI spec, avoid `format: email` and `type: integer` (use `type: string` with server-side validation, and `type: number`). Orval emits Zod v4 syntax but the typecheck uses v3.
- The Google Fonts `@import url(...)` must be the first line of `index.css`.
- `lib/replit-auth-web` uses `import.meta.env.BASE_URL`, so its tsconfig needs `vite/client` types.
- Rows imported from the old waitlist have `source = waitlist` and no Discord username or team status yet. (The old waitlist stored class standing in its `discord_username` column; the import script maps it to `class_standing`.)
- Keep `App.tsx` formatted with Prettier (`pnpm exec prettier --write artifacts/hackathon/src/App.tsx`) so diffs stay reviewable.

## Still tied to Replit

These need replacing before the app runs fully outside Replit:

1. **Vite plugins.** `@replit/vite-plugin-runtime-error-modal`, `-cartographer`, and `-dev-banner` in both Vite configs and the pnpm catalog.
2. **Leftovers.** `artifacts/mockup-sandbox/`, `scripts/post-merge.sh` (a Replit merge hook), the `@replit/*` entries in `minimumReleaseAgeExclude`, and the `replit-auth-web` package name.
3. **Old deployment.** The Replit site at awsbuilderwars.dev still runs. Turn it off once the waitlist import is verified on the new site.

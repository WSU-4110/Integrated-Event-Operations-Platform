# Integrated Event Operations Platform

Event website and operations tooling for the AWS BuilderWars Hackathon (AWS Student Builder Group at Wayne State). Today it is a public marketing site with a waitlist form, a confirmation email, and an organizer-only admin dashboard. The backlog lives in this repo's GitHub issues.

The code was first built on Replit and imported here. Some of it still depends on Replit services; see "Still tied to Replit" before running it anywhere else.

## Commit and PR rules

- Do not add AI attribution to commits or PR descriptions by default. Automatic attribution is turned off in `.claude/settings.json`.
- Add a co-author line only when the person running the session asks for it on that commit. They ask when Claude wrote a substantial part of the change. Use exactly this as the last line of the commit message:
  `Co-Authored-By: Claude <noreply@anthropic.com>`
- When you finish a change you mostly wrote yourself, say so and ask whether to add the co-author line. Do not decide either way on your own.
- Never add "Generated with" text, session links, or AI attribution in code comments.
- AI use on this project is disclosed in the "AI assistance" section of `README.md`. If the way Claude is used changes, update that section in the same change.
- Commits are authored by the human running the session. Do not change `user.name` or `user.email`.
- Never commit `.env` files or secrets.

## Commands

Uses pnpm workspaces (npm and yarn are blocked by a preinstall check). Node 24, TypeScript 5.9. The pnpm version is pinned in `package.json` (`packageManager`); run `corepack enable pnpm` to use it. pnpm 11 and later ignore `onlyBuiltDependencies` and fail the install.

- `pnpm install` — install everything
- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck, then build all packages. Requires `PORT` and `BASE_PATH`, because the Vite configs check them at load time.
- `pnpm --filter @workspace/hackathon run dev` — web app (Vite). Requires `PORT` and `BASE_PATH`.
- `pnpm --filter @workspace/api-server run dev` — API server (builds, then starts). Requires `PORT`.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push schema changes to the database (dev only)

There are no automated tests yet.

Environment variables are listed in `.env.example`. Nothing loads a `.env` file automatically; export them in the shell.

## Layout

- `artifacts/hackathon/` — React + Vite web app (Tailwind 4, shadcn/ui, framer-motion, wouter, TanStack Query)
  - `src/App.tsx` — the whole site: every home section, the waitlist form, and the admin dashboard. Routes: `/` and `/admin`.
  - `src/config/event.ts` — all event content (name, date, schedule, FAQ, links). Change content here, not in components.
  - `src/components/ui/` — shadcn/ui components
- `artifacts/api-server/` — Express 5 API, bundled with esbuild, mounted at `/api`
  - `src/routes/waitlist.ts` — `POST /waitlist`, `GET /waitlist/check`, `GET /waitlist/information-packet`
  - `src/routes/admin.ts` — `GET /admin/registrations`, `DELETE /admin/registrations/:id`, `GET /admin/stats`, `GET /admin/export` (CSV)
  - `src/routes/auth.ts`, `src/lib/auth.ts`, `src/middlewares/authMiddleware.ts` — OIDC login with PKCE, sessions stored in Postgres
  - `src/lib/waitlistConfirmationEmail.ts` — confirmation email with the information packet attached
- `artifacts/mockup-sandbox/` — Replit's component preview sandbox. Not part of the product.
- `lib/api-spec/openapi.yaml` — the API contract and source of truth. Orval generates from it.
- `lib/api-zod/`, `lib/api-client-react/` — generated Zod schemas and React Query hooks. Do not edit `src/generated/` by hand.
- `lib/db/` — Drizzle ORM schema and Postgres client. Tables: `waitlist_registrations`, `users`, `sessions`.
- `lib/replit-auth-web/` — `useAuth()` hook used by the web app
- `attached_assets/` — logo and PDF packets. The web app imports them through the `@assets` alias, and the API reads the information packet from here by path. Renaming a file breaks both.
- `screenshots/` — reference screenshots of wayneaws.dev, the design the site follows

## Architecture decisions

- Single-page site with anchor navigation; `/admin` is the only other route.
- Dark theme only. `html` is forced to `class="dark"`; there is no light mode.
- Admin authorization is enforced on the server. Middleware on `/api/admin` looks up the signed-in user's email in the `users` table and compares it to `ADMIN_EMAIL`: 401 when signed out, 403 for anyone else. The session's public user object does not include the email, so never authorize from client state or the session shape.
- `GET /api/auth/user` returns `{ user: AuthUser | null }`, which is what `useAuth()` expects. Use `useAuth()` for auth state, not the generated API hooks.
- Admin CSV export is a plain browser link to `/api/admin/export`, not a hook.
- Waitlist signup requires a `.edu` email, rejects duplicates (409), and rolls the registration back with a 502 if the confirmation email fails to send.

## Gotchas

- After any change to `openapi.yaml`, run codegen before touching server or web code.
- In the OpenAPI spec, avoid `format: email` and `type: integer` (use `type: string` with server-side validation, and `type: number`). Orval emits Zod v4 syntax but the typecheck uses v3.
- The Google Fonts `@import url(...)` must be the first line of `index.css`.
- `lib/replit-auth-web` uses `import.meta.env.BASE_URL`, so its tsconfig needs `vite/client` types.
- The waitlist form's "Class standing" field is sent as `discord_username` and stored in the `discord_username` column. There is no class-standing column yet. The admin table shows it as "Class Standing", but the API field and the CSV header are `discord_username`.
- `App.tsx` is about 40 very long unformatted lines. Run Prettier on it before making a reviewable change.

## Still tied to Replit

These need replacing before the app runs fully outside Replit:

1. **Login.** `lib/auth.ts` defaults to the `https://replit.com/oidc` issuer and uses `REPL_ID` as the client id. Admin login needs another OIDC provider or a different auth approach. The `users` and `sessions` tables are generic and can stay.
2. **Email.** `waitlistConfirmationEmail.ts` sends through `@replit/connectors-sdk`, which proxies to Resend. Replace it with a direct Resend API call and a `RESEND_API_KEY`. Until then, waitlist signups fail with a 502.
3. **Vite plugins.** `@replit/vite-plugin-runtime-error-modal`, `-cartographer`, and `-dev-banner` in both Vite configs and the pnpm catalog.
4. **Leftovers.** `artifacts/mockup-sandbox/`, `scripts/post-merge.sh` (a Replit merge hook), the `@replit/*` entries in `minimumReleaseAgeExclude`, and the `replit-auth-web` package name.
5. **Hosting and database.** The site was deployed on Replit autoscale with Replit's Postgres. A new host, a new database, and a data export are needed. The old ports were 8080 (API) and 19235 (web).

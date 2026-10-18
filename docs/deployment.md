# Deployment

The site runs on Amazon Lightsail in the club's AWS account: one container service for the app and one managed PostgreSQL database. Decided 2026-10-11; see `docs/agile/sprint-1/planning.md`.

The `Dockerfile` at the repo root builds a single image. The API server serves the API under `/api` and the built web app for every other path, so the site and API share one origin (this keeps the sign-in cookies simple).

## What it needs

| Piece | Lightsail resource | Notes |
| --- | --- | --- |
| App | Container service, Nano or Micro, 1 node | Listens on port 8080. Health check path: `/api/healthz`. |
| Database | Managed PostgreSQL, standard plan | Automatic daily snapshots cover the backup requirement in #23. Consider the high-availability plan for event weekend only. |
| Domain | builderwars.dev | Not purchased yet. Register it in the club's AWS account (Lightsail or Route 53) so DNS lives next to the app. |
| HTTPS | Container service custom domain certificate | Add builderwars.dev, www.builderwars.dev, and awsbuilderwars.dev to the same certificate. |
| Email | Resend | Sender on builderwars.dev once the domain is verified. |

Confirm prices on the official Lightsail pricing page before creating resources.

## Environment variables

Set these on the container service deployment. Never commit real values.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Connection string for the Lightsail database |
| `CANONICAL_HOST` | `builderwars.dev`. Every other hostname is redirected there. Leave unset until the domain points at the service, or the default Lightsail URL will redirect to a domain that doesn't resolve yet. |
| `ADMIN_EMAIL` | Admin email (becomes a list when Google sign-in lands, #20) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email sending (#1, #6) |
| `LOG_LEVEL` | Optional, defaults to `info` |

`PORT` (8080) and `NODE_ENV` (production) are set in the image.

## First deployment

1. Create the database. Note the endpoint, user, and password.
2. Build and push the image. Docker is needed on the machine that runs these, or run them from GitHub Actions:

   ```bash
   docker build -t builderwars .
   aws lightsail push-container-image --service-name builderwars --label app --image builderwars
   ```

3. Create a deployment on the container service with the pushed image, port 8080, health check `/api/healthz`, and the environment variables above.
4. Create the tables: run `pnpm --filter @workspace/db run push` once with `DATABASE_URL` pointing at the new database.
5. Import the waitlist CSV (kept privately, never in this repo) into the registration table. How depends on the registration fields decided in #1.
6. Once the domain is registered: attach the certificate, point DNS at the container service, then set `CANONICAL_HOST` and redeploy.
7. Redirect awsbuilderwars.dev (see below).

## The old domain: awsbuilderwars.dev

- Registered at Name.com on 2026-08-27; paid through 2027-08-27. The redirect costs nothing until then. Decide before August 2027 whether to renew it.
- Its DNS is managed in Replit (Publishing → Domains → edit icon), which allows manual DNS records (confirmed 2026-10-18). Do not use "Disconnect" there; that would take the domain off the current site.
- Leave its records alone until the new site is live; they currently point at the Replit deployment.
- At cutover: add awsbuilderwars.dev to the container service certificate (that adds a validation record), then point the domain at the container service. The root of a domain can't use a CNAME record, so either use the DNS provider's ALIAS/ANAME record, if it has one, or move the domain's nameservers to a Lightsail DNS zone, which supports this. Name.com's plain URL forwarding is not enough: .dev domains are HTTPS-only, so the redirect needs a certificate.

## Old Replit deployment

Keep it running until the new site is live and the data import is verified, then turn it off in Replit.

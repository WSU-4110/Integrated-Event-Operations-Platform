# Deployment

The site runs on Amazon Lightsail in the club's AWS account: one container service for the app and one managed PostgreSQL database. Decided 2026-10-11; see `docs/agile/sprint-1/planning.md`.

The `Dockerfile` at the repo root builds a single image. The API server serves the API under `/api` and the built web app for every other path, so the site and API share one origin (this keeps the sign-in cookies simple).

## What it needs

| Piece | Lightsail resource | Notes |
| --- | --- | --- |
| App | Container service, Nano or Micro, 1 node | Listens on port 8080. Health check path: `/api/healthz`. |
| Database | Managed PostgreSQL, standard plan | Automatic daily snapshots cover the backup requirement in #23. Consider the high-availability plan for event weekend only. |
| Domain | builderwars.dev | Registered 2026-10-18 through Route 53 in the club's AWS account (Lightsail's registration doesn't offer .dev). DNS will be a Lightsail DNS zone, which can point the bare domain at the container service. |
| HTTPS | Container service custom domain certificate | Add builderwars.dev and www.builderwars.dev to the same certificate. |
| Email | Resend | Sender on builderwars.dev once the domain is verified. |

Confirm prices on the official Lightsail pricing page before creating resources.

## How deploys work

- `.github/workflows/ci.yml` typechecks and builds every pull request and every push to `main`.
- `.github/workflows/deploy.yml` runs on every push to `main` (and by hand from the Actions tab). It builds the image, pushes it to the Lightsail container service, and creates a new deployment with the settings below. It does nothing until the repository variable `DEPLOY_ENABLED` is `true`.
- GitHub signs in to AWS through an IAM role (OpenID Connect), so no AWS access keys are stored anywhere.
- On start, the app applies any new database migrations from `lib/db/drizzle/` (`RUN_MIGRATIONS=true` in the image). After changing `lib/db/src/schema/`, run `pnpm --filter @workspace/db run generate` and commit the new SQL file. Don't use `push` against the production database.
- The image includes AWS's RDS certificate bundle, and `DATABASE_SSL_CA` points the database client at it, so the database connection is encrypted and verified.

## Settings

Stored in GitHub (Settings → Secrets and variables → Actions) and passed to Lightsail on each deploy. Never commit real values.

| Name | Kind | Value |
| --- | --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | Secret | ARN of the IAM role below |
| `DATABASE_URL` | Secret | `postgresql://USER:PASSWORD@ENDPOINT:5432/DBNAME`. Don't add `sslmode`; it would override the certificate check. URL-encode special characters in the password. |
| `ADMIN_EMAILS` | Secret | Comma-separated admin emails (#20) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Secrets | Google sign-in (#20) |
| `RESEND_API_KEY` | Secret | Email sending (#1, #6) |
| `DEPLOY_ENABLED` | Variable | `true` once the steps below are done |
| `RESEND_FROM_EMAIL` | Variable | For example `BuilderWars <hello@builderwars.dev>` |
| `CANONICAL_HOST` | Variable | `builderwars.dev`. Every other hostname is redirected there. Leave unset until the domain points at the service, or the default Lightsail URL will redirect to a domain that doesn't resolve yet. |

`PORT`, `NODE_ENV`, `RUN_MIGRATIONS`, and `DATABASE_SSL_CA` are set in the image.

## One-time setup

All in the club's AWS account, region **US East (Ohio), us-east-2**.

### 1. Database

Lightsail → Databases → Create database:

- Region: Ohio (us-east-2)
- Engine: PostgreSQL, latest version offered
- Login credentials: let Lightsail create a strong password, and save the user name and password somewhere private right away
- Database name: `builderwars`
- Plan: standard (not high availability); smallest plan
- Resource name: `builderwars-db`

When it's available, note the endpoint. Leave **public mode off**. If the app's logs later show it can't reach the database, turn public mode on (the strong password and the verified SSL connection still protect it).

### 2. Container service

Lightsail → Containers → Create container service:

- Region: Ohio (us-east-2)
- Capacity: Nano, scale 1
- Skip "Set up deployment"; GitHub Actions does that
- Service name: `builderwars` (the workflow uses this exact name)

### 3. IAM role for GitHub Actions

IAM → Identity providers → Add provider:

- Type: OpenID Connect
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

IAM → Roles → Create role:

- Trusted entity: Web identity → the provider above, audience `sts.amazonaws.com`
- GitHub organization: `WSU-4110`; repository: `Integrated-Event-Operations-Platform`; branch: `main`
- Skip the permissions page, name the role `builderwars-github-deploy`, create it
- Open the role → Trust relationships → Edit trust policy, and make the `sub` condition exactly the value below. This repository uses GitHub's immutable subject format, which includes the organization and repository IDs, so the value the console wizard generates won't match. (`gh api repos/WSU-4110/Integrated-Event-Operations-Platform/actions/oidc/customization/sub` shows the prefix.)

  ```json
  "token.actions.githubusercontent.com:sub": "repo:WSU-4110@55041847/Integrated-Event-Operations-Platform@1372491483:ref:refs/heads/main"
  ```

- Open the role → Add permissions → Create inline policy → JSON, paste the policy below, name it `lightsail-deploy`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lightsail:CreateContainerServiceRegistryLogin",
        "lightsail:RegisterContainerImage",
        "lightsail:GetContainerImages",
        "lightsail:GetContainerServices",
        "lightsail:CreateContainerServiceDeployment"
      ],
      "Resource": "*"
    }
  ]
}
```

Copy the role's ARN into the `AWS_DEPLOY_ROLE_ARN` secret.

### 4. GitHub settings

Add the secrets and variables from the table above. Changing repository settings needs admin access to the repo; in the WSU-4110 organization that may mean asking the instructor. Set `DEPLOY_ENABLED` to `true` last, then run the Deploy workflow from the Actions tab.

### 5. Domain

Create a Lightsail DNS zone for builderwars.dev, then in Route 53 (Registered domains → builderwars.dev → Edit name servers) replace the name servers with the zone's four Lightsail name servers. Route 53 also created a hosted zone for the domain when it was registered; once the name servers point at Lightsail, delete that hosted zone to stop its monthly charge.

Then on the container service: Custom domains → Create certificate for builderwars.dev and www.builderwars.dev, add the validation records it shows to the Lightsail DNS zone, and once the certificate is valid, attach it and point the zone's records at the container service. Finally set the `CANONICAL_HOST` variable and rerun the Deploy workflow.

### 6. Data

Import the waitlist CSV (kept privately, never in this repo) into the registration table. How depends on the registration fields decided in #1.

## The old domain: awsbuilderwars.dev

Not redirected (decided 2026-10-18). Its DNS is managed in Replit, which only offers A, CNAME, TXT, and MX records; a bare domain can't point at a Lightsail container service with those, and the address wasn't shared widely.

- Registered at Name.com through Replit on 2026-08-27; paid through 2027-08-27. Let it expire.
- Leave its DNS records alone until the Replit site is retired. They include Resend email records (`resend._domainkey`, `send`, `rsend`, `_dmarc`) used by the Replit site's emails; those belong to Replit's Resend connection, so our own Resend account needs its own records on builderwars.dev.

## Old Replit deployment

Keep it running until the new site is live and the data import is verified, then turn it off in Replit.

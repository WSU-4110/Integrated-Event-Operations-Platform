
# Installation Guide

## Overview

This guide explains how to install, configure, build, and run the Integrated Event Operations Platform locally. The project includes a React frontend, an Express API server, and a PostgreSQL database.

## System Requirements

Before starting, make sure you have:

- Node.js 24
- pnpm 11 or later
- Git
- PostgreSQL for database-backed features
- Docker (optional, for production builds)

The project uses pnpm workspaces. npm and Yarn are blocked by the repository's preinstall check.

## Download the Project

Clone the repository:

```bash
git clone https://github.com/WSU-4110/Integrated-Event-Operations-Platform.git
cd Integrated-Event-Operations-Platform
```

## Install Dependencies

Enable pnpm using Corepack:

```bash
corepack enable pnpm
```

Install the dependencies:

```bash
pnpm install
```

## Environment Configuration

The project uses environment variables documented in `.env.example`.

Review that file to identify the variables required for the components you plan to run.

Important variables include:

- `PORT` - Port used by the application server.
- `BASE_PATH` - Base path used by the frontend.
- Database connection variables - Used to connect to PostgreSQL.

The project does not automatically load a `.env` file. Export the required variables in your shell or configure them through your hosting environment.

Never commit passwords, API keys, or other private credentials to GitHub.

## Run the Application Locally

Start the frontend development server:

```bash
pnpm --filter @workspace/hackathon run dev
```

Start the API server in a separate terminal:

```bash
pnpm --filter @workspace/api-server run dev
```

The frontend requires `PORT` and `BASE_PATH`. The API server requires `PORT`.

Database-backed features require a configured PostgreSQL connection.

Refer to `.env.example` and `docs/development.md` for additional configuration details.

## Build and Check the Project

Run TypeScript checks:

```bash
pnpm run typecheck
```

Build the project:

```bash
pnpm run build
```

The build requires `PORT` and `BASE_PATH` to be configured.

## Database Setup

The application uses PostgreSQL and Drizzle ORM.

Configure the database connection using the environment variables documented in `.env.example`.

To push schema changes to a local development database:

```bash
pnpm --filter @workspace/db run push
```

After modifying the database schema, generate migrations with:

```bash
pnpm --filter @workspace/db run generate
```

Generated migrations are stored in `lib/db/drizzle/`.

## Optional Docker Build

To build the production Docker image:

```bash
docker build -t builderwars .
```

For deployment instructions, refer to `docs/deployment.md`.

## Additional Documentation

- `README.md` - Project overview and setup information.
- `docs/development.md` - Development commands and architecture.
- `docs/deployment.md` - Deployment configuration.
- `docs/google-sign-in.md` - Google authentication setup.
- `.env.example` - Environment variable reference.

## Troubleshooting

If the application does not start:

1. Verify that Node.js 24 and pnpm 11 or later are installed.
2. Make sure you are using pnpm instead of npm or Yarn.
3. Check that the required environment variables are configured.
4. Confirm that PostgreSQL is accessible when using database-backed features.
5. Review terminal errors and the existing development documentation.

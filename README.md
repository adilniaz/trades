# Trades Purification Tracker

Track stock trades and compute purification figures (Zakat eligibility).

## Setup

Secrets are managed by [Infisical](https://infisical.com) (EU Cloud). The
infisical CLI fetches them at container startup — no `.env` file needed.

### 1. Set up Infisical

- Create a project at [eu.infisical.com](https://eu.infisical.com)
- Create **dev** and **prod** environments
- Add these secrets to each environment:

| Secret             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `POSTGRES_PASSWORD` | Database password (dev: `trades_dev_password`)      |
| `DATABASE_URL`     | `postgresql://trades:<pwd>@db:5432/trades`          |
| `AUTH_SECRET`      | Generate with `openssl rand -base64 32`              |
| `AUTH_URL`         | `http://localhost:12400` (dev) or production URL     |
| `AUTH_TRUST_HOST`  | `true`                                               |
| `ADMIN_EMAIL`      | Admin account email                                  |
| `ADMIN_PASSWORD`   | Admin account password                               |

- Create a **machine identity** with Universal Auth for each environment
- Copy the generated Client ID and Client Secret
- Update `workspaceId` in `.infisical.json` to match your project

### 2. Set host environment variables

Add these to your shell profile (`~/.zshrc`, `~/.bashrc`) or export them
before running docker compose:

```bash
export INFISICAL_CLIENT_ID="<your-machine-identity-client-id>"
export INFISICAL_CLIENT_SECRET="<your-machine-identity-client-secret>"
# INFISICAL_ENV defaults to "dev" — set to "prod" for production
```

### 3. Run the app

```bash
docker network create caddy_net  # one-time setup
npm run dev                       # Docker-based dev with hot reload
```

The entrypoint authenticates with Infisical, exports secrets, runs
migrations, seeds settings, and starts the app.

Visit `http://localhost:12400/login` — log in with `ADMIN_EMAIL` /
`ADMIN_PASSWORD` from Infisical.

### Local dev without Docker

```bash
npm install -g @infisical/cli
infisical login
infisical run --env=dev -- npm run dev:next
```

## Stack

Next.js 16, React 19, Prisma 7, NextAuth v5 beta, Tailwind v4, Zod v4, Postgres.

## Testing

```bash
npm test           # run all tests once
npm run test:watch # watch mode
```

Tests live in `tests/`, mirroring the `src/` directory structure.

## Production deployment

```bash
export INFISICAL_ENV="prod"
npm start
```

The app runs on port `12400`, joined to an external `caddy_net` Docker network
for reverse proxy routing.

One-time setup: `docker network create caddy_net`

## Conventions

See [AGENTS.md](AGENTS.md) for hard rules, testing conventions, and known
simplifications.

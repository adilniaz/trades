# Trades Purification Tracker

Track stock trades and compute purification figures (Zakat eligibility).

## Setup

```bash
git clone <repo-url> && cd trades
cp .env.example .env
# Fill in AUTH_SECRET (run `npx auth secret`), ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev
# In a separate terminal:
npm run db:seed
```

Visit `http://localhost:3000/login` — log in with the admin credentials from `.env`.

## Stack

Next.js 16, React 19, Prisma 7, NextAuth v5 beta, Tailwind v4, Zod v4, Postgres.

## Testing

```bash
npm test          # run all tests once
npm run test:watch  # watch mode
```

Tests live in `tests/`, mirroring the `src/` directory structure.

## Production deployment

See `docker-compose.yml` for the production stack. Required env vars:

- `POSTGRES_PASSWORD` — database password
- `AUTH_SECRET` — NextAuth secret (generate with `openssl rand -hex 32`)
- `AUTH_URL` — public URL of the app (e.g. `https://trades.example.com`)

The app joins an external `caddy_net` Docker network (shared with sibling apps).
Create it with: `docker network create caddy_net`

## Conventions

See [AGENTS.md](AGENTS.md) for hard rules, testing conventions, and known
simplifications.

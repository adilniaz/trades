# Trades Purification Tracker

Track stock trades and compute purification figures (Zakat eligibility).

## Setup

```bash
git clone <repo-url> && cd trades
cp .env.example .env
# Fill in AUTH_SECRET (run `openssl rand -base64 32`), ADMIN_EMAIL, ADMIN_PASSWORD
docker network create caddy_net  # one-time setup
npm run dev
# In a separate terminal, seed the admin account:
npx tsx prisma/seed.ts
```

Visit `http://localhost:12400/login` — log in with the admin credentials from `.env`.

## Stack

Next.js 16, React 19, Prisma 7, NextAuth v5 beta, Tailwind v4, Zod v4, Postgres.

## Testing

```bash
npm test          # run all tests once
npm run test:watch  # watch mode
```

Tests live in `tests/`, mirroring the `src/` directory structure.

## Production deployment

```bash
npm start
```

The app runs on port `12400`, joined to an external `caddy_net` Docker network
for reverse proxy routing. Required env vars in `.env`:

- `POSTGRES_PASSWORD` — database password
- `AUTH_SECRET` — NextAuth secret (generate with `openssl rand -base64 32`)
- `AUTH_URL` — public URL of the app (e.g. `https://trades.example.com`)

One-time setup: `docker network create caddy_net`

## Conventions

See [AGENTS.md](AGENTS.md) for hard rules, testing conventions, and known
simplifications.

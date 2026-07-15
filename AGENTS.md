# Trades Purification Tracker — project quick reference

Next.js 16 (App Router, Turbopack) + TypeScript + Prisma/PostgreSQL + NextAuth v5 (beta) + Tailwind v4. Full context: `README.md`.

## Tech Stack

- Next.js 16 (App Router, Turbopack) + React + TypeScript
- Prisma + PostgreSQL
- NextAuth v5 (beta), credentials provider
- Tailwind CSS v4, shadcn/ui primitives in `src/components/ui/`
- Vitest (unit), Playwright (e2e)
- Docker Compose for both dev (`docker-compose.dev.yml`) and prod (`docker-compose.yml`)

## Architecture

**Dashboard (authenticated users):** `/overview` (holdings + purification summary), `/companies/[id]` (per-company transactions, purification, breakeven), `/import-transactions` (bulk CSV import), `/request-company` (user-submitted company request), `/settings` (change password).

**Auth:** `/login` (sign-in page; no public signup — accounts are admin-provisioned).

**Admin (`/admin/*`):** `/admin/companies` (CRUD, approve/reject requests, bulk import), `/admin/users` (create, deactivate, reset password), `/admin/settings` (transaction fee), `/admin/audit-log` (immutable before/after snapshots for all admin mutations), `/admin/reports`.

**API routes** (`src/app/api/`): `auth/[...nextauth]`, `health` (unauthenticated DB ping), `export` (CSV transactions), `export/holdings` (CSV holdings).

**`src/lib/` inventory:** `auth.ts`/`auth-guard.ts` (session + guard helpers), `prisma.ts` (client singleton), `prisma-where.ts` (centralized `deletedAt: null` helpers for Company + Transaction), `calculations.ts` (core purification math — position, avgCost, realizedGains, purifiableGains, purifiableDividends, breakeven), `holdings.ts` (computeHoldings aggregation), `to-txn.ts` (Prisma Decimal → JS number converter), `settings.ts` (cached `getSettings()` for `transactionFee`), `rate-limit.ts` (per-account login lockout), `ip-rate-limit.ts` (per-IP credential-stuffing backstop), `export-utils.ts` (CSV encoding + formula injection defense), `import-limits.ts` (bulk CSV size guards), `logger.ts` (pino), `get-client-ip.ts`, `utils.ts`, `validation/` (Zod schemas).

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `POSTGRES_PASSWORD` | used by docker-compose to configure Postgres and construct `DATABASE_URL` |
| `AUTH_SECRET` | NextAuth session signing secret (`openssl rand -base64 32`) |
| `AUTH_URL` | canonical base URL (public `https://` domain in prod, not `localhost`) |
| `AUTH_TRUST_HOST` | `true` when running behind a reverse proxy (Caddy, etc.) |
| `ADMIN_EMAIL`/`ADMIN_PASSWORD` | seed-only, used by `prisma/seed.ts` to create the initial admin user, not read at runtime |

See `.env.example` for a working template.

## npm Scripts

| Script | What it does |
|---|---|
| `dev` | full Docker dev stack (`docker-compose.dev.yml`), hot reload on `:3000` |
| `dev:next` | bare `next dev` against a Postgres you run yourself |
| `build` | `next build` |
| `start` | bare `next start` |
| `test` / `test:watch` | Vitest run / watch mode |
| `lint` | ESLint |
| `db:seed` | `tsx prisma/seed.ts` |

## Deployment (Caddy)

Prod publishes internally on port 3000, joined to an external `caddy_net` Docker network (shared with sibling apps bake_em_up on 3001, hisab on 3002). This app already sends its own HSTS header (`src/proxy.ts`) and CSP — a fronting Caddy instance should only do TLS termination/routing (`reverse_proxy localhost:3000`), not add a second HSTS header. Full Caddyfile example in `README.md`'s "Production" section.

## Hard rules

- Every Server Action and API route handler calls `requireAuth()` /
  `requireAuthApi()` as its first line, even on routes proxy.ts also
  gates. Two sibling-app incidents were caused by skipping this — do not
  rely on proxy/layout checks alone.
- `Company` and `Transaction` are soft-deleted via `deletedAt`. Every
  query must filter `deletedAt: null` unless intentionally listing
  deleted history. Use the centralized helpers in `src/lib/prisma-where.ts`
  (`activeCompanyWhere()` / `activeTransactionWhere()`) — never hand-write
  the `deletedAt: null` filter per query.
- Client and server validation for a given form must import the *same*
  Zod schema from `src/lib/validation/` — never hand-duplicate.
- `Company.nonCompliantPct` is read live at calculation time, not
  snapshotted per-transaction. If historical accuracy across percentage
  changes is ever needed, add a `nonCompliantPctAtEntry` field to
  `Transaction` captured on create — not built currently.
- Money fields are `Decimal` in Postgres/Prisma but converted to plain
  `number` at the `src/lib/calculations.ts` boundary — this app's scale
  doesn't warrant a big-decimal dependency.
- No public signup route exists or should be added; accounts are
  admin-provisioned only (see `src/app/admin/users/actions.ts#createUser`).
- All admin mutations are logged immutably to `AuditLog` with before/after
  JSON snapshots. Any new admin action must wrap its write in
  `prisma.$transaction` and create a corresponding `auditLog.create` entry.

## Gotchas specific to this project

- **No `middleware.ts`.** This Next.js build renamed it to `proxy.ts` (Next 16 forbids having both). Edge-level auth — session validity, `active`/`tokenVersion` revocation, and the ADMIN-vs-USER path split for `/admin/*` — lives in `src/proxy.ts`. Don't go looking for `middleware.ts`; it doesn't exist, and don't create one (build fails if both exist).
- **Soft-delete pattern.** `Company` and `Transaction` use `deletedAt`, not hard deletions. The `prisma-where.ts` helpers (`activeCompanyWhere()`, `activeTransactionWhere()`) apply the `deletedAt: null` filter. Any new query touching these models must use them or explicitly justify why deleted rows should be included.
- **Decimal → number boundary.** Prisma returns `Decimal` for money fields (`pricePerShare`, `amount`). Convert at the I/O boundary with `toTxn()` from `src/lib/to-txn.ts` before passing into `calculations.ts`. Never do arithmetic on raw `Decimal` values.

## Auth guard convention (every session must follow this)

`src/proxy.ts` only gates broad role access (does this user's role reach `/admin` at all). It does **not** protect Server Actions with fine-grained, per-action role checks, and Next.js's own guidance is to never rely on layout/proxy execution to protect a Server Action — treat every `"use server"` mutation as a public POST endpoint.

Every mutation in every `actions.ts` and API `route.ts` must call the guard itself, first line of the function body:
- Server Actions / server components: `await requireAuth({ roles: [...] })` from `@/lib/auth-guard`
- API routes: `const unauthorized = await requireAuthApi({ roles: [...] }); if (unauthorized) return unauthorized`

`requireAuth()` with no `roles` argument defaults to any authenticated user (USER + ADMIN). Explicit `{ roles: ["ADMIN"] }` is required for admin-only mutations.

## Other conventions

- **Theming:** `.dark` class on `<html>` (standard Tailwind class variant), set by a blocking inline script in `layout.tsx` and toggled by `ThemeToggle`. Use the semantic shadcn tokens (`.bg-primary`, `.text-foreground`, etc.), not raw Tailwind color classes.
- **Tests are Vitest** (`npm test` = `vitest run`; unit tests in `tests/`, e2e in `tests/e2e/` via Playwright). Auth env vars use the `AUTH_*` prefix. `npm run dev` is Docker-based; use `dev:next` for bare `next dev`.
- **CSV export:** `src/lib/export-utils.ts#toCsvField` neutralizes leading `= + - @` to prevent formula injection. Every new export path must go through `toCsvField`, not a hand-rolled join.
- **Bulk import limits:** `src/lib/import-limits.ts` caps CSV imports at 5000 rows / 2MB. Validate payload size before parsing.

## Testing

Vitest, `tests/` mirrors `src/`. `src/lib/calculations.ts` is the most
test-critical file in the app — any change to its formulas needs a
corresponding test case, including re-verifying against the worked
example in `_docs/averaging_down.md`.

Playwright e2e tests live in `e2e/` covering: auth, transactions, purification, admin, export.

## Known simplifications (documented, not bugs)

- `src/lib/settings.ts`'s `getSettings()` cache is a plain module-level
  variable — not shared across processes. Fine for the current
  single-container deployment; would need a shared cache (or no caching at
  all — it's a single-row lookup) if ever scaled to multiple instances.
- `src/lib/ip-rate-limit.ts`'s login rate limiting uses an in-memory `Map` —
  not shared across processes. Each instance would have independent counters.
- The whole app assumes one home currency for every `Transaction` — there
  is no per-row currency field or FX conversion. `Setting.displayCurrency`
  only controls a label, not conversion.
- `src/app/admin/companies/actions.ts#bulkImportCompanies` does a naive
  comma-split, not full CSV quoted-field parsing — company names
  containing a literal comma need the comma stripped before import.
- `Company.nonCompliantPct` and `Setting.transactionFee` are read live at
  calculation time. `AuditLog` records *that* and *when* they changed, but
  changing them still recomputes purification figures for any old
  unpurified transaction against the new value — there's no per-transaction
  snapshot of the rate that applied when the transaction was purified.

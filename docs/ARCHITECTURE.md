# Trades Purification Tracker — Architecture Guide

## Next.js 16 Mental Model

This app uses the **App Router** (not Pages Router). Every file under `src/app/` that exports a default function is a route. The folder structure IS the URL structure.

### Server Components vs Client Components

In Next.js App Router, **every component is a Server Component by default** — they run on the server, can be `async`, and can directly call `prisma` or `requireAuth()`.

Add `"use client"` at the top of a file only when you need browser-only features: `useState`, `useEffect`, event handlers (`onClick`, `onChange`), browser APIs, or third-party client libraries (Recharts, Sonner toaster).

**Pattern for data pages:** A `page.tsx` is a server component that calls `requireAuth()`, fetches data with Prisma, and passes it as props to a client component (like a form or table) that handles interactivity.

### Route Groups

- `(auth)` — groups `/login` (unauthenticated)
- `(dashboard)` — groups `/overview`, `/companies/[id]`, `/import-transactions`, `/request-company`, `/settings` (authenticated, sidebar layout)
- `/admin/` — admin-only routes with its own layout guard

Route groups (`(...)` folders) don't affect the URL — they exist purely to share layouts and enforce auth boundaries.

### Layout Nesting

```
src/app/layout.tsx              # Root: <html>, ThemeProvider, Toaster
├── (auth)/layout.tsx           # (none — implicitly root; login page has no wrapper)
├── (dashboard)/layout.tsx      # Sidebar wrapper for authenticated users
│   └── overview/page.tsx
│   └── companies/[id]/page.tsx
│   └── ...
├── admin/layout.tsx            # ADMIN role guard + admin nav
│   └── companies/page.tsx
│   └── users/page.tsx
│   └── ...
```

`admin/layout.tsx` returns `{children}` directly — the sidebar from `(dashboard)/layout.tsx` wraps around it, so admin pages get the side nav too.

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                  # Root layout (ThemeProvider, Toaster)
│   ├── globals.css                 # Tailwind v4 + shadcn CSS tokens
│   ├── proxy.ts                    # Edge middleware: auth validation, CSP, HSTS
│   ├── (auth)/login/               # Login form + server action
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Sidebar nav
│   │   ├── overview/               # Holdings dashboard
│   │   ├── companies/[id]/         # Per-company transactions + purification
│   │   ├── import-transactions/    # Bulk CSV import
│   │   ├── request-company/        # User-submitted company request
│   │   └── settings/               # Change password
│   ├── admin/
│   │   ├── layout.tsx              # ADMIN role guard
│   │   ├── companies/              # CRUD, approve/reject, bulk import
│   │   ├── users/                  # Create, deactivate, reset password
│   │   ├── settings/               # Transaction fee
│   │   ├── audit-log/              # Audit log viewer
│   │   └── reports/                # Admin reports
│   └── api/
│       ├── auth/[...nextauth]/     # NextAuth handler
│       ├── health/                 # Docker liveness probe
│       └── export/                 # CSV export (transactions + holdings)
├── components/
│   ├── layout/sidebar.tsx          # Desktop sidebar + mobile sheet
│   ├── ui/                         # shadcn/ui primitives (button, card, etc.)
│   ├── companies/                  # Company-specific components
│   ├── holdings/                   # Holdings table + chart
│   └── transactions/               # Transaction form, table, purify button
├── lib/
│   ├── auth.ts                     # NextAuth config
│   ├── auth-guard.ts               # requireAuth() / requireAuthApi()
│   ├── prisma.ts                   # PrismaClient singleton (pg adapter)
│   ├── prisma-where.ts             # activeCompanyWhere / activeTransactionWhere
│   ├── calculations.ts             # Core purification math
│   ├── holdings.ts                 # computeHoldings aggregation
│   ├── to-txn.ts                   # Prisma Decimal → JS number
│   ├── settings.ts                 # Cached getSettings()
│   ├── rate-limit.ts               # Per-account login lockout
│   ├── ip-rate-limit.ts            # Per-IP credential stuffing backstop
│   ├── export-utils.ts             # CSV encoding + formula injection defense
│   ├── import-limits.ts            # CSV import size guards
│   ├── logger.ts                   # pino logger
│   ├── get-client-ip.ts            # X-Forwarded-For parsing
│   ├── utils.ts                    # cn() — clsx + tailwind-merge
│   └── validation/                 # Zod schemas (shared client + server)
│       ├── auth.ts                 # loginSchema
│       ├── company.ts              # companySchema
│       ├── company-request.ts      # companyRequestSchema
│       ├── transaction.ts          # transactionSchema + transactionFormSchema
│       ├── settings.ts             # changePassword + transactionFeeSchema
│       └── user.ts                 # strongPassword + createUser + resetPassword
└── types/
    └── next-auth.d.ts              # NextAuth type augmentations (role, id)
```

---

## Authentication

### Three-Layer Defense

```
Layer 1: proxy.ts (Edge Middleware)
  ↓ Validates JWT session, checks tokenVersion + active + role against DB
  ↓ Clears stale cookies, applies CSP/HSTS security headers
  ↓
Layer 2: auth-guard.ts (Per-Mutation)
  ↓ requireAuth() for Server Actions / Server Components
  ↓ requireAuthApi() for API routes
  ↓ Re-verifies active, tokenVersion, role against DB (not just JWT)
  ↓
Layer 3: admin/layout.tsx (Page-level)
  ↓ Requires ADMIN role — catch-all for admin routes
```

**Why three layers?** `proxy.ts` only gates broad role access. Next.js's own guidance says never rely on layout or middleware to protect a Server Action — treat every `"use server"` mutation as a public POST endpoint. The auth guard (layer 2) is the real enforcement; layers 1 and 3 are defense-in-depth.

### Session Details

- **JWT sessions** (not database sessions) — stateless, verifiable without a DB lookup
- **Token version** (`User.tokenVersion`) — embedded in the JWT, checked against DB on every request via `proxy.ts` and the NextAuth `authorized` callback. Incrementing `tokenVersion` instantly invalidates all sessions for that user (used on password change, account deactivation, password reset).
- **`User.active`** — boolean flag. Inactive users cannot authenticate. Checked in `proxy.ts`, the NextAuth `authorized` callback, and `requireAuth()`/`requireAuthApi()`.

### Login Hardening

- bcrypt cost factor 12
- Dummy hash for non-existent emails (timing-safe — no user enumeration via response time)
- Per-account lockout: 5 failed attempts → 15-minute lock (`User.failedAttempts` + `User.lockedUntil`)
- Per-IP rate limit: 20 attempts per 15-min window (in-memory `Map`)
- `failedAttempts` incremented inside a Prisma `$transaction` to prevent TOCTOU races

### No Public Signup

Accounts are admin-provisioned only. There is no `/register` route. New users are created by admins via `/admin/users/new`.

---

## Database Schema

### Models

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| **User** | `email` (unique), `passwordHash`, `role` (ADMIN/USER), `active`, `tokenVersion`, `failedAttempts`, `lockedUntil` | Auth + account management |
| **Company** | `name`, `ticker`, `nonCompliantPct` (Decimal 5,2), `status` (PENDING/APPROVED), `deletedAt`, `requestedById` | Companies whose stocks are tracked; soft-deleted |
| **Transaction** | `userId`, `companyId`, `type` (BUY/SELL/DIVIDEND), `date`, `shares`, `pricePerShare`, `amount`, `purifiedAt`, `deletedAt` | Individual transactions; soft-deleted |
| **Setting** | `key` (PK), `value` | Key-value config: `transactionFee`, `displayCurrency` |
| **AuditLog** | `actorId`, `action`, `targetType`, `targetId`, `before` (JSON), `after` (JSON) | Immutable audit trail for admin mutations |

### Unique Constraints

- `User.email` — global unique
- `Company.ticker` — partial unique index: unique only among rows where `deletedAt IS NULL` (so the same ticker can be reused after soft-deletion)
- `Setting.key` — primary key
- No unique constraint on individual transactions — users can import duplicate rows

### Money Fields

Money fields (`pricePerShare`, `amount`) are `Decimal` in Postgres/Prisma. The `Decimal` type provides exact decimal arithmetic (no floating-point rounding errors).

At the calculations boundary, `Decimal` values are converted to JS `number` via `toTxn()` in `src/lib/to-txn.ts`. Never do arithmetic on raw `Decimal` values — always convert first.

For this app's scale (transaction amounts typically < $1M, precision to 2 decimal places), JS `number` (IEEE 754 double) is sufficient. If precision requirements grow, a big-decimal library (e.g., `decimal.js`) would be needed.

---

## Core Calculations Engine

`src/lib/calculations.ts` is the most critical file in the app. It implements:

| Function | Description |
|----------|-------------|
| `position()` | Net shares held (buys − sells) |
| `avgCost()` | Weighted average buy cost (running-average method) |
| `realizedGains()` | Gain/loss on sold shares using running-average cost basis |
| `dividendsTotal()` | Sum of all dividend amounts |
| `purifiableGains()` | Unrealized gains × `nonCompliantPct` (for unpurified-held shares from unpurified sells) |
| `purifiableDividends()` | Unpurified dividend amounts × `nonCompliantPct` |
| `breakeven()` | Price at which selling remaining shares covers total cost + fees |

### Running-Average Cost Method

This codebase uses the **running-average cost method** (also called "average cost basis"):

1. Each BUY recalculates the average cost: `(oldPosition × oldAvgCost + newBuyShares × newBuyPrice) / newTotalPosition`
2. SELLs do NOT change the average cost — they only reduce the position
3. Realized gain on a SELL = `sharesSold × (sellPrice − currentAvgCost)`

### Purification Logic

Purification is the core Shariah-compliance concept. If a company has `nonCompliantPct = 5%`:

- **Purifiable gains:** 5% of unrealized gains on held shares (from unpurified SELLs) must be donated
- **Purifiable dividends:** 5% of unpurified dividends must be donated

The "Mark as Purified" action sets `Transaction.purifiedAt = now` on all current unpurified transactions, zeroing out the purifiable amounts.

### Important Caveat

`Company.nonCompliantPct` is read **live** at calculation time, not snapshotted per-transaction. If an admin changes a company's percentage from 5% to 10%, all old unpurified transactions are retroactively recomputed against the new 10%. The `AuditLog` records *that* the percentage changed, but there's no per-transaction snapshot of which rate applied at purchase time. If historical accuracy is ever needed, add a `nonCompliantPctAtEntry` field to `Transaction`.

---

## Soft-Delete Pattern

`Company` and `Transaction` use soft-deletion (`deletedAt: DateTime | null`). Rows are never truly removed by application code — they're flagged with a timestamp.

### Centralized Where Helpers

Every query MUST use the centralized helpers in `src/lib/prisma-where.ts`:

```typescript
// Always do this:
const companies = await prisma.company.findMany({
  where: activeCompanyWhere(),
});

// NEVER hand-write:
// where: { deletedAt: null }   ← wrong — bypasses the helper
```

Available helpers:
- `activeCompanyWhere()` — returns `{ deletedAt: null }`
- `activeTransactionWhere()` — returns `{ deletedAt: null }`

### Exception: Rejected Company Requests

When an admin **rejects** a company request (`status: "PENDING"`), the company is **hard-deleted** from the database (not soft-deleted). This is intentional — rejected requests are junk data. Approved companies use soft-delete if later removed.

---

## Audit Logging

Every admin mutation is logged immutably to the `AuditLog` table with:

| Field | Description |
|-------|-------------|
| `actorId` | Which admin performed the action |
| `action` | e.g. `CREATE_COMPANY`, `UPDATE_USER`, `DELETE_COMPANY` |
| `targetType` | `Company`, `User`, `Setting`, etc. |
| `targetId` | The ID of the affected row |
| `before` | JSON snapshot of the row before the mutation (or `null` for creates) |
| `after` | JSON snapshot of the row after the mutation (or `null` for deletes) |

### Required Pattern for New Admin Actions

```typescript
await prisma.$transaction(async (tx) => {
  const result = await tx.company.create({ data: { ... } });

  await tx.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "CREATE_COMPANY",
      targetType: "Company",
      targetId: result.id,
      after: result,
    },
  });

  return result;
});
```

The write + audit MUST be wrapped in `prisma.$transaction` — the mutation and its audit entry succeed or fail together.

---

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth | Session management |
| `/api/health` | GET | Public | Docker liveness probe (DB ping) |
| `/api/export` | GET | `requireAuthApi()` | CSV transaction export |
| `/api/export/holdings` | GET | `requireAuthApi()` | CSV holdings export |

---

## Server Actions

Server Actions are functions marked with `"use server"` that handle form submissions. They're POST endpoints under the hood — Next.js adds built-in CSRF protection via an `Origin`/`next-action` header check.

### Auth Guard Convention

Every Server Action MUST call the guard first:

```typescript
"use server";

export async function addTransaction(formData: FormData) {
  const session = await requireAuth();  // ← FIRST LINE
  // ...
}
```

For admin-only actions:

```typescript
const session = await requireAuth({ roles: ["ADMIN"] });
```

The `requireAuth()` call:
1. Validates the session exists
2. Checks `User.active === true`
3. Verifies `tokenVersion` matches the DB
4. Checks the user's role against the `roles` argument (if provided)

No role argument = any authenticated user (USER + ADMIN).

---

## Security Layers

### 1. Edge Middleware (`proxy.ts`)
- JWT validation on every request
- `tokenVersion` + `active` check against DB
- Clears cookies if session is revoked
- Matches `/admin/*` paths — redirects non-ADMIN users
- Sets headers: CSP (nonce-based `script-src`), HSTS (2-year max-age + preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`
- No `X-Powered-By` header

### 2. Auth Guard (per-mutation)
Re-validates `active`, `tokenVersion`, and role from the DB — does not trust the JWT alone.

### 3. Input Validation
Same Zod schemas used client-side (react-hook-form + `@hookform/resolvers`) and server-side (in every action). No hand-duplicated validation.

### 4. Login Protection
- bcrypt cost 12 + timing-safe dummy hash
- Per-account lockout (5 fails / 15 min)
- Per-IP rate limit (20 fails / 15 min)
- `failedAttempts` in transaction (TOCTOU-safe)

### 5. CSV Formula Injection Defense
Leading `=`, `+`, `-`, `@`, tab, and CR are prefixed with apostrophe in CSV exports (`src/lib/export-utils.ts#toCsvField`).

### 6. Import Limits
CSV imports are capped at 5000 rows and 2 MB (`src/lib/import-limits.ts`). Payload size is validated before parsing.

### 7. Session Revocation
`User.tokenVersion` is incremented on password change, account deactivation, and password reset — instantly invalidating all existing sessions.

---

## Deployment

### Docker (Production)

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    # ...
  app:
    build: .
    environment:
      DATABASE_URL: postgresql://trades:${POSTGRES_PASSWORD}@db:5432/trades
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_URL: ${AUTH_URL}
      AUTH_TRUST_HOST: "true"
    networks:
      - default
      - caddy_net

networks:
  caddy_net:
    external: true
```

The app publishes internally on port 3000 and joins `caddy_net` — the sibling Caddy reverse proxy does TLS termination and routes `trades.example.com → localhost:3000`.

**Important:** This app already sends its own HSTS header and CSP. The fronting Caddy MUST NOT add a second HSTS header.

### Dev (Docker Compose)

```
npm run dev   # docker compose -f docker-compose.dev.yml up --build
```

Hot reloads on `:3000`. Postgres runs in a sibling container. Use `npm run dev:next` for a bare `next dev` against your own Postgres.

### Entrypoint

`scripts/docker-entrypoint.sh` runs on container start:
1. Validates `AUTH_SECRET` is set and not the default placeholder
2. Validates `DATABASE_URL` is set
3. Runs `prisma migrate deploy` (with 5 retries)
4. Starts the Next.js server

---

## Testing

### Unit Tests (Vitest)

`tests/` mirrors `src/`. Key test files:

| File | What it tests |
|------|---------------|
| `tests/lib/calculations.test.ts` | Position, avgCost, realizedGains, purifiableGains, breakeven — verified against `_docs/averaging_down.md` |
| `tests/lib/holdings.test.ts` | computeHoldings aggregation |
| `tests/lib/auth-guard.test.ts` | Role checks, session validation |
| `tests/lib/settings.test.ts` | Cached settings reads |
| `tests/lib/rate-limit.test.ts` | Login lockout logic |
| `tests/lib/to-txn.test.ts` | Decimal → number conversion |
| `tests/lib/export-utils.test.ts` | CSV encoding + formula injection |
| `tests/lib/import-limits.test.ts` | CSV size guards |

Run: `npm test` (single run) or `npm run test:watch` (watch mode).

### E2E Tests (Playwright)

`e2e/` covers: `auth.spec.ts`, `transactions.spec.ts`, `purification.spec.ts`, `admin.spec.ts`, `export.spec.ts`.

Run: `npx playwright test` (headless) or `npx playwright test --ui` (UI mode).

### Manual QA

See `VALIDATION_TEST.md` for a comprehensive end-to-end checklist covering all features.

---

## Known Limitations

### Single-Instance Only

- **In-memory IP rate limiter** (`src/lib/ip-rate-limit.ts`) uses a `Map` — not shared across processes. Multi-instance would need Redis.
- **In-memory settings cache** (`src/lib/settings.ts`) uses a module-level variable with 60s TTL. Multi-instance would have independent caches.

### No Per-Transaction Rate Snapshot

`Company.nonCompliantPct` and `Setting.transactionFee` are read live at calculation time. Changing them retroactively affects unpurified transactions. There's no per-transaction snapshot of which rate applied at purchase time.

### Single Currency

The entire app assumes one home currency. `Setting.displayCurrency` is a UI label only — there's no FX conversion or per-row currency field.

### Naive CSV Import for Companies

`src/app/admin/companies/actions.ts#bulkImportCompanies` uses a naive comma-split (not full CSV quoted-field parsing). Company names containing literal commas must have the comma stripped before import.

### No BigDecimal

Money arithmetic uses JS `number` (IEEE 754 double), not a big-decimal library. Fine for this app's scale (< $1M transaction amounts, 2 decimal places). If precision requirements grow, introduce `decimal.js` or similar.

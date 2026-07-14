> Part of the **Trades Purification Tracker** implementation plan — see [00-overview.md](00-overview.md) for the Goal, Architecture, Tech Stack, full Context, and the complete session list.

## Global Constraints

These apply to every session/task below; the skill-level instructions for
each task implicitly include them.

- **Stack versions:** Next.js 16, React 19, Prisma 7 (`@prisma/adapter-pg` driver adapter — do not use the legacy Prisma engine binary), NextAuth v5 **beta** (import from `next-auth` v5, not v4 APIs), Tailwind v4, Zod v4.
- **IDs:** `cuid()` primary keys everywhere (`@id @default(cuid())`), never auto-increment ints.
- **Field naming:** camelCase in Prisma schema and TypeScript; Prisma maps to Postgres snake_case automatically — do not hand-write `@map`.
- **Soft delete:** `Company` and `Transaction` get a nullable `deletedAt DateTime?`, indexed (`@@index([deletedAt])`). Every query against these models must filter `deletedAt: null` unless explicitly listing deleted history. Never hard-delete rows. **One deliberate exception:** a `Company` row created by a user's request (`status: "PENDING"`, `requestedById` set) that the admin rejects is hard-deleted, not soft-deleted — it was never real approved data, and hard-deleting frees its `ticker` for a future request (Session 4).
- **Auth defense in depth:** every Server Action and API route handler calls `requireAuth()` / `requireAuthApi()` as its **first line**, even though `src/proxy.ts` also gates routes. Do not rely on proxy/layout-level checks alone — this is a hard rule carried over from the sibling apps' `AGENTS.md`, which cites real incidents caused by skipping it.
- **Validation:** every form has a Zod schema in `src/lib/validation/`. The **same schema instance** is imported by both the client component (via `zodResolver`) and the Server Action that receives the submission — never hand-maintain two schemas that are supposed to match.
- **No public signup:** there is no `/signup` route anywhere in this app.
- **Currency/number handling:** Prisma `Decimal` fields are converted to plain JS `number` via `.toNumber()` at the boundary where they enter `src/lib/calculations.ts`, and back to `Decimal`/string only when persisting. This app's amounts are personal-portfolio scale, so plain-`number` arithmetic in the calculation layer is an accepted simplification — do not introduce a big-decimal library for this.
- **Single-currency assumption:** every `Transaction.amount`/`pricePerShare` is assumed to already be in one home currency — there is no per-row currency field and no FX conversion anywhere in the app. This is a conscious v1 decision (Session 1's `Setting` row `displayCurrency` controls only the label shown next to figures, not conversion). If the portfolio ever spans multiple settlement currencies, this assumption must be revisited before trusting portfolio-wide totals.
- **Audit trail:** admin actions that change a value later used in a calculation, or that change account access — company edits (`nonCompliantPct`, ticker, dividend info), `transactionFee` changes, user activation/deactivation, admin password resets — write an `AuditLog` row (model in Session 1; write sites in Sessions 4–5). Never silently mutate config that affects historical purification figures.
- **Testing:** Vitest. Test files live under `tests/`, mirroring the `src/` path of the thing under test (e.g. `src/lib/calculations.ts` → `tests/lib/calculations.test.ts`).
- **Commits:** one commit per completed task/step group, using the message conventions shown inline below. Run `git status` before committing to confirm you're only staging what you intend.

---

## Session 1: Database Schema, Prisma, Seed

**Context recap:** Session 0 produced a running Next.js app with no database schema yet. This session adds the full Prisma schema (users, companies, transactions, settings, audit log), runs the first migration, and writes an idempotent seed script that creates the first admin account from env vars — matching the sibling apps' `prisma/seed.ts` pattern.

**Revision note:** this session's schema was revised after an early plan review (see `analysis.md` items 1b/1c/3e/3g/3h) — `nonCompliantPct` moved from a 0–1 fraction to a 0–100 percentage (fixing a validation bug in Session 4's form), an `AuditLog` model was added, `Company` gained an optional structured `nextDividendDate`, and a `displayCurrency` `Setting` row was added to make the single-currency assumption explicit rather than implicit.

**Prerequisites:** Session 0 complete (`npm run dev` works, Postgres reachable).

**Files to create:**
- `/home/adil/projects/trades/prisma/schema.prisma`
- `/home/adil/projects/trades/prisma/seed.ts`
- `/home/adil/projects/trades/src/lib/prisma.ts`
- `/home/adil/projects/trades/prisma.config.ts`

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

Delete the generated `prisma/schema.prisma` starter content and replace with the schema below.

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  USER
}

enum CompanyStatus {
  PENDING
  APPROVED
  REJECTED
}

enum TransactionType {
  BUY
  SELL
  DIVIDEND
}

model User {
  id              String        @id @default(cuid())
  email           String        @unique
  passwordHash    String
  role            Role          @default(USER)
  active          Boolean       @default(true)
  tokenVersion    Int           @default(0)
  failedAttempts  Int           @default(0)
  lockedUntil     DateTime?
  createdAt       DateTime      @default(now())
  transactions    Transaction[]
  companyRequests Company[]     @relation("RequestedBy")
  auditLogs       AuditLog[]
}

model Company {
  id               String        @id @default(cuid())
  name             String
  ticker           String        @unique
  // Stored as a 0-100 percentage (e.g. 4.94 = 4.94%), not a 0-1 fraction.
  // Decimal(5,2) covers 0.00-100.00 with the 2 decimal places the source
  // data uses. calculations.ts callers divide by 100 at the read boundary.
  nonCompliantPct  Decimal       @db.Decimal(5, 2)
  dividendPeriod   String?
  // Optional structured reminder date, alongside the free-text dividendPeriod
  // above (kept for flexibility per the original "free-text" decision).
  nextDividendDate DateTime?
  status           CompanyStatus @default(APPROVED)
  requestedById    String?
  requestedBy      User?         @relation("RequestedBy", fields: [requestedById], references: [id])
  deletedAt        DateTime?
  createdAt        DateTime      @default(now())
  transactions     Transaction[]

  @@index([status])
  @@index([deletedAt])
}

model Transaction {
  id            String          @id @default(cuid())
  userId        String
  user          User            @relation(fields: [userId], references: [id])
  companyId     String
  company       Company         @relation(fields: [companyId], references: [id])
  type          TransactionType
  date          DateTime
  shares        Decimal?        @db.Decimal(18, 6)
  pricePerShare Decimal?        @db.Decimal(18, 6)
  amount        Decimal?        @db.Decimal(18, 6)
  purifiedAt    DateTime?
  deletedAt     DateTime?
  createdAt     DateTime        @default(now())

  @@index([userId, companyId])
  @@index([deletedAt])
  @@index([date])
}

model Setting {
  key   String @id
  value String
}

// Records who changed what admin-controlled value, and when, for anything
// that could silently alter historical purification figures or account
// access. before/after store the pre-/post-change value as JSON (a single
// field's value, not a full row snapshot) — e.g. { "nonCompliantPct": 0.43 }
// -> { "nonCompliantPct": 0.5 }. Never edited or deleted after creation.
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String
  actor      User     @relation(fields: [actorId], references: [id])
  action     String // e.g. "company.update", "setting.transactionFee", "user.deactivate", "user.resetPassword"
  targetType String // e.g. "Company", "User", "Setting"
  targetId   String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([targetType, targetId])
  @@index([createdAt])
}
```

- [ ] **Step 3: Write `prisma.config.ts`** (Prisma 7's config format)

```typescript
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
});
```

- [ ] **Step 4: Run the first migration**

```bash
npx prisma migrate dev --name init
```

Expected: creates `prisma/migrations/<timestamp>_init/migration.sql` and applies it to the dev database (must be running — `npm run dev` or at minimum the `db` service up).

- [ ] **Step 5: Write `src/lib/prisma.ts`** (singleton with driver adapter, matching sibling convention)

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 6: Write `prisma/seed.ts`** (idempotent — safe to re-run)

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin account");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      role: "ADMIN",
    },
  });

  await prisma.setting.upsert({
    where: { key: "transactionFee" },
    update: {},
    create: { key: "transactionFee", value: "1" },
  });

  // Display-only label — see the Global Constraints' single-currency
  // assumption note. Does not enable multi-currency support or conversion.
  await prisma.setting.upsert({
    where: { key: "displayCurrency" },
    update: {},
    create: { key: "displayCurrency", value: "USD" },
  });

  console.log(`Seeded admin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 7: Add seed script wiring to `package.json`**

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
},
"scripts": {
  "db:seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 8: Verify**

```bash
npm run db:seed
npx prisma studio
```

Expected: `Seeded admin: admin@example.com` printed; Prisma Studio (opens in browser) shows one `User` row with `role = ADMIN` and one `Setting` row `transactionFee = 1`. Re-run `npm run db:seed` and confirm no duplicate/error (idempotency).

- [ ] **Step 9: Commit**

```bash
git add prisma/ src/lib/prisma.ts prisma.config.ts package.json package-lock.json
git commit -m "feat: add Prisma schema, migration, and admin seed script"
```

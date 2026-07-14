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

## Session 6: User — Dashboard / Holdings Overview

**Context recap:** This is the first user-facing (non-admin) page and the first place `src/lib/calculations.ts` (Session 3) gets wired to real data. It lists every company the logged-in user holds a position in (or has ever transacted), with derived numbers per row plus portfolio-wide totals.

**Revision note:** this session was revised after an early plan review (`analysis.md` items 1b/1d/4e/5b):
- `toTxn()` now includes the `date` field Session 3's `Txn` type requires.
- `nonCompliantPct` is now divided by 100 when read here, since it's stored as a 0–100 percentage (Session 1/4), not a 0–1 fraction.
- The company query now has a deterministic `orderBy` instead of relying on incidental DB row order.
- A minimal `/settings` page is built in this session (not deferred to Session 9) so the sidebar link Sessions 6–8 all render never 404s — Session 9 extends this same page with the CSV export link rather than creating it from scratch.
- The sidebar now also links to the `/admin/reports` and `/admin/audit-log` routes Session 5 added.
- `Sidebar` gained a sign-out button (`signOut` from `next-auth/react`) at the bottom of the nav — there was previously no way to log out anywhere in the app other than waiting for the JWT's 24h expiry or clearing cookies.
- `getSettings()` now returns `displayCurrency` alongside `transactionFee` (Session 5's `settings.ts` queries both rows), and the totals section shows it next to the monetary figures — `displayCurrency` was seeded from Session 1 but never actually read by any code before (dead data).

**Prerequisites:** Sessions 1–3 **and 5** complete — `Sidebar` (Step 2 below) hardcodes links to `/admin/reports` and `/admin/audit-log`, both added in Session 5; building this session first would silently reintroduce the same dead-link problem `/settings` had before this revision (see `analysis.md` 4e), just unflagged for these two routes. Session 4 is helpful for having real company data to test against, but not strictly required (can seed a company directly via Prisma Studio).

**Known interim dead link (expected, not a bug to fix here):** `HoldingsTable` (Step 4 below) links each row to `/companies/${companyId}`, but that route isn't created until Session 7. This is the same category of gap `/settings` used to have — but unlike `/settings`, it isn't worth building a minimal version early here, since a holdings row (and thus this link) only appears once a user has transactions, and Session 7 is the very next session. If you're verifying this session in isolation before Session 7 exists, don't click through from a holdings row — inserting test `Transaction` rows via Prisma Studio (Step 6's Verify) is enough to confirm the dashboard numbers without needing the destination page to exist yet.

**Files to create:**
- `/home/adil/projects/trades/src/app/(dashboard)/overview/page.tsx`
- `/home/adil/projects/trades/src/components/holdings/holdings-table.tsx`
- `/home/adil/projects/trades/src/components/layout/sidebar.tsx`
- `/home/adil/projects/trades/src/app/(dashboard)/layout.tsx`
- `/home/adil/projects/trades/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Write `src/app/(dashboard)/layout.tsx`**

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/layout/sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";

export function Sidebar({ role }: { role: Role }) {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r p-4 text-sm">
      <div className="flex-1 space-y-2">
        <Link href="/overview" className="block">Overview</Link>
        <Link href="/request-company" className="block">Request a company</Link>
        <Link href="/settings" className="block">Settings</Link>
        {role === "ADMIN" && (
          <>
            <hr className="my-2" />
            <Link href="/admin/companies" className="block">Admin: Companies</Link>
            <Link href="/admin/users" className="block">Admin: Users</Link>
            <Link href="/admin/settings" className="block">Admin: Settings</Link>
            <Link href="/admin/reports" className="block">Admin: Reports</Link>
            <Link href="/admin/audit-log" className="block">Admin: Audit log</Link>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="block text-left"
      >
        Sign out
      </button>
    </nav>
  );
}
```

- [ ] **Step 3: Write `src/app/(dashboard)/overview/page.tsx`**

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  position,
  avgCost,
  realizedGains,
  purifiableGains,
  purifiableDividends,
  breakeven,
  type Txn,
} from "@/lib/calculations";
import { HoldingsTable, type HoldingRow } from "@/components/holdings/holdings-table";

function toTxn(t: {
  type: string;
  date: Date;
  shares: unknown;
  pricePerShare: unknown;
  amount: unknown;
  purifiedAt: Date | null;
}): Txn {
  return {
    type: t.type as Txn["type"],
    date: t.date,
    shares: t.shares === null ? null : Number(t.shares),
    pricePerShare: t.pricePerShare === null ? null : Number(t.pricePerShare),
    amount: t.amount === null ? null : Number(t.amount),
    purifiedAt: t.purifiedAt,
  };
}

export default async function OverviewPage() {
  const user = await requireAuth();
  const { transactionFee, displayCurrency } = await getSettings();

  const companies = await prisma.company.findMany({
    where: { status: "APPROVED", deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      transactions: {
        where: { userId: user.id, deletedAt: null },
        orderBy: { date: "asc" },
      },
    },
  });

  const rows: HoldingRow[] = companies
    .filter((c) => c.transactions.length > 0)
    .map((c) => {
      const txns = c.transactions.map(toTxn);
      // nonCompliantPct is stored as a 0-100 percentage (Session 1/4);
      // calculations.ts's purifiableGains/purifiableDividends take a 0-1
      // fraction, so divide here at the read boundary.
      const pct = Number(c.nonCompliantPct) / 100;
      return {
        companyId: c.id,
        name: c.name,
        ticker: c.ticker,
        sharesHeld: position(txns),
        avgCost: avgCost(txns),
        realizedGains: realizedGains(txns),
        breakeven: breakeven(txns, transactionFee),
        gainsToPurify: purifiableGains(txns, pct),
        dividendsToPurify: purifiableDividends(txns, pct),
      };
    });

  const totals = rows.reduce(
    (acc, r) => ({
      gainsToPurify: acc.gainsToPurify + r.gainsToPurify,
      dividendsToPurify: acc.dividendsToPurify + r.dividendsToPurify,
    }),
    { gainsToPurify: 0, dividendsToPurify: 0 }
  );

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Your holdings</h1>
      <div className="flex gap-6 text-sm">
        <div className="rounded border p-3">
          <div className="text-muted-foreground">Total gains to purify</div>
          <div className="text-lg font-semibold">
            {totals.gainsToPurify.toFixed(2)} {displayCurrency}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-muted-foreground">Total dividends to purify</div>
          <div className="text-lg font-semibold">
            {totals.dividendsToPurify.toFixed(2)} {displayCurrency}
          </div>
        </div>
      </div>
      <HoldingsTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/holdings/holdings-table.tsx`**

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type HoldingRow = {
  companyId: string;
  name: string;
  ticker: string;
  sharesHeld: number;
  avgCost: number | null;
  realizedGains: number;
  breakeven: number | null;
  gainsToPurify: number;
  dividendsToPurify: number;
};

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Shares held</TableHead>
          <TableHead>Avg cost</TableHead>
          <TableHead>Breakeven</TableHead>
          <TableHead>Realized gains</TableHead>
          <TableHead>Gains to purify</TableHead>
          <TableHead>Dividends to purify</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.companyId}>
            <TableCell>
              <Link href={`/companies/${r.companyId}`} className="underline">
                {r.name} ({r.ticker})
              </Link>
            </TableCell>
            <TableCell>{r.sharesHeld}</TableCell>
            <TableCell>{r.avgCost?.toFixed(2) ?? "—"}</TableCell>
            <TableCell>{r.breakeven?.toFixed(2) ?? "—"}</TableCell>
            <TableCell>{r.realizedGains.toFixed(2)}</TableCell>
            <TableCell>{r.gainsToPurify.toFixed(2)}</TableCell>
            <TableCell>{r.dividendsToPurify.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 5: Write `src/app/(dashboard)/settings/page.tsx`** (minimal — built here so the sidebar link never dead-ends; Session 9 adds the CSV export link to this same file)

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";

export default async function SettingsPage() {
  await requireAuth();
  const { transactionFee } = await getSettings();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Current transaction fee (used in breakeven calculations): {transactionFee.toFixed(2)}.
        This is set globally by an admin.
      </p>
      {/* Session 9 adds: <a href="/api/export">Export my transactions (CSV)</a> */}
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Using Prisma Studio, manually insert a couple of `Transaction` rows for the logged-in test user against a seeded company (one `BUY`, one partial `SELL`). Reload `/overview` and confirm the row's numbers match hand-calculated expectations (cross-check against the Session 3 test cases' arithmetic style) — note `nonCompliantPct` is now read as `Number(c.nonCompliantPct) / 100`, so a company with e.g. `4.94` stored should purify at the same rate the old `0.0494`-fraction version did. Confirm a company with zero transactions for this user does not appear, and that companies now list in alphabetical order. Click "Settings" in the sidebar and confirm it renders (no 404) for both `USER` and `ADMIN` roles.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\) src/components/holdings src/components/layout
git commit -m "feat: add user dashboard with derived holdings, portfolio totals, and a settings page"
```

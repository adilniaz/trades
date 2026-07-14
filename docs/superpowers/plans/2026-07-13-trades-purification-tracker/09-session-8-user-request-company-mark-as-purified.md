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

## Session 8: User — Request Company & Mark-as-Purified

**Context recap:** Two remaining pieces close the loop described in the original request and the purify-tracking decision: (1) a user-facing form to request a new company (creates a `PENDING` `Company` row that Session 4's admin queue already handles), and (2) a "mark as purified" action per company holding that stamps `purifiedAt` on all currently-unpurified transactions for that user+company, per the Data Model design in the Context section.

**Revision note:** this session was revised after an early plan review (`analysis.md` item 1d) — Step 5 previously described the unpurified-totals calculation in prose ("same `toTxn` mapping approach as Session 6's overview page") without giving literal merged code, which risked a plausible implementation reusing Session 7's desc-ordered transaction array directly. Since Session 3's `realizedGains`/`purifiableGains` now sort internally by `date` regardless of input order, that risk is structurally closed — but Step 5 below now gives literal code anyway, for the same reason Session 4 and 6 do: a fresh session shouldn't have to improvise the merge.

**Prerequisites:** Sessions 1–4, 6, 7 complete.

**Files to create:**
- `/home/adil/projects/trades/src/lib/validation/company-request.ts`
- `/home/adil/projects/trades/src/app/(dashboard)/request-company/page.tsx`
- `/home/adil/projects/trades/src/app/(dashboard)/request-company/actions.ts`
- Modify: `/home/adil/projects/trades/src/app/(dashboard)/companies/[id]/actions.ts` (add `markPurified`)
- Modify: `/home/adil/projects/trades/src/app/(dashboard)/companies/[id]/page.tsx` (add button)

- [ ] **Step 1: Write `src/lib/validation/company-request.ts`**

```typescript
import { z } from "zod";

export const companyRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
});

export type CompanyRequestInput = z.infer<typeof companyRequestSchema>;
```

- [ ] **Step 2: Write `src/app/(dashboard)/request-company/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { companyRequestSchema } from "@/lib/validation/company-request";

export async function requestCompany(input: unknown) {
  const user = await requireAuth();
  const data = companyRequestSchema.parse(input);
  await prisma.company.create({
    data: {
      name: data.name,
      ticker: data.ticker,
      nonCompliantPct: 0,
      status: "PENDING",
      requestedById: user.id,
    },
  });
  revalidatePath("/admin/companies");
}
```

`ticker` has a unique constraint (Session 1 schema) — if a user requests a ticker that already exists (approved, pending, or rejected), this throws a Prisma unique-constraint error. Catch it in the form and surface "This ticker has already been requested or added" rather than a raw 500.

- [ ] **Step 3: Write `src/app/(dashboard)/request-company/page.tsx`**

Client Component form (mirrors `CompanyForm` shape) with just `name`/`ticker` fields, `companyRequestSchema` validation, calling `requestCompany`, showing a success message on submit (no redirect needed — pending requests aren't visible to the user, only to admin, so land back on the same page with a confirmation, e.g. local `useState` toggling a "Request submitted" message instead of a table).

- [ ] **Step 4: Add `markPurified` to `src/app/(dashboard)/companies/[id]/actions.ts`**

```typescript
export async function markPurified(companyId: string) {
  const user = await requireAuth();
  await prisma.transaction.updateMany({
    where: { companyId, userId: user.id, deletedAt: null, purifiedAt: null },
    data: { purifiedAt: new Date() },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
}
```

- [ ] **Step 5: Add a "Mark as purified" button to the company detail page**

Modify `src/app/(dashboard)/companies/[id]/page.tsx` (from Session 7) to compute and display unpurified totals, using the exact same `toTxn` shape Session 6's overview page uses (including the `date` field Session 3's `Txn` type requires, and dividing `nonCompliantPct` by 100 since it's stored as a 0–100 percentage):

```tsx
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { purifiableGains, purifiableDividends, type Txn } from "@/lib/calculations";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { MarkPurifiedButton } from "@/components/transactions/mark-purified-button";

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

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company || company.deletedAt || company.status !== "APPROVED") notFound();

  const transactions = await prisma.transaction.findMany({
    where: { companyId: id, userId: user.id, deletedAt: null },
    orderBy: { date: "desc" },
  });

  const txns = transactions.map(toTxn);
  const pct = Number(company.nonCompliantPct) / 100;
  const gainsToPurify = purifiableGains(txns, pct);
  const dividendsToPurify = purifiableDividends(txns, pct);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">
        {company.name} ({company.ticker})
      </h1>
      <div className="flex items-center gap-4 rounded border p-3 text-sm">
        <span>Unpurified gains: {gainsToPurify.toFixed(2)}</span>
        <span>Unpurified dividends: {dividendsToPurify.toFixed(2)}</span>
        <MarkPurifiedButton
          companyId={id}
          total={gainsToPurify + dividendsToPurify}
        />
      </div>
      <TransactionForm companyId={id} />
      <TransactionTable companyId={id} transactions={transactions} />
    </div>
  );
}
```

And `src/components/transactions/mark-purified-button.tsx`:

```tsx
"use client";

import { markPurified } from "@/app/(dashboard)/companies/[id]/actions";
import { Button } from "@/components/ui/button";

export function MarkPurifiedButton({ companyId, total }: { companyId: string; total: number }) {
  if (total <= 0) return null;
  return (
    <Button
      size="sm"
      onClick={() => {
        if (window.confirm(`Mark ${total.toFixed(2)} as purified?`)) {
          markPurified(companyId);
        }
      }}
    >
      Mark as purified
    </Button>
  );
}
```

- [ ] **Step 6: Verify**

As a user with an open position and unpurified realized gains/dividends (from Session 7's test data), visit `/companies/<id>`, confirm the outstanding purify amount shown matches `/overview`'s figure for that company, click "Mark as purified", confirm both figures drop to 0 while `/overview`'s realized-gains figure (not purify-specific) is unchanged. Add a new `DIVIDEND` transaction afterward and confirm the purify amount starts accruing again from just that new transaction (old purified ones stay excluded). Separately, as a user, submit a company request via `/request-company`, then confirm as admin it appears in `/admin/companies`'s pending queue (Session 4) and can be approved.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/company-request.ts "src/app/(dashboard)/request-company" "src/app/(dashboard)/companies/[id]" src/components/transactions/mark-purified-button.tsx
git commit -m "feat: add company requests and mark-as-purified tracking"
```

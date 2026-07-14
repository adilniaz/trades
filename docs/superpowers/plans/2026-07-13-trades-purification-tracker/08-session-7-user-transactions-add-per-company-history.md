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

## Session 7: User — Transactions (Add / Per-Company History)

**Context recap:** Users need to actually create the `BUY`/`SELL`/`DIVIDEND` transactions that Session 6's dashboard reads. This session adds the per-company detail page (`/companies/[id]`) with a transaction form and history table, and the dropdown-driven "add transaction against any held/approved company" entry point referenced in the original request.

**Revision note:** this session was revised after an early plan review (`analysis.md` items 1e/2c/3c/5a/4d):
- `addTransaction` now checks the target company is `APPROVED` and not soft-deleted before allowing a write — previously a user could create a permanently invisible, un-deletable orphan transaction against a pending/rejected/deleted company ID.
- Added `updateTransaction` + an edit UI, so fixing a typo'd share count or price doesn't require delete-and-re-add.
- Transaction dates are now displayed with UTC-based formatting to match how the `<input type="date">` value was parsed, fixing an off-by-one-day display bug for users in negative-UTC-offset timezones.
- The comment claiming the delete pattern matches "`hisab`/`cookbook`" was removed — those apps aren't in this repo, so the claim was unverifiable; the pattern is explained standalone.
- `TransactionTable` now shows a "No transactions yet." empty-state message instead of an empty table when there are zero transactions, matching `HoldingsTable`'s pattern from Session 6.

**Prerequisites:** Sessions 1–3, 6 complete. Session 4 needed for real approved companies to select from.

**Files to create:**
- `/home/adil/projects/trades/src/lib/validation/transaction.ts`
- `/home/adil/projects/trades/src/app/(dashboard)/companies/[id]/page.tsx`
- `/home/adil/projects/trades/src/app/(dashboard)/companies/[id]/actions.ts`
- `/home/adil/projects/trades/src/components/transactions/transaction-form.tsx`
- `/home/adil/projects/trades/src/components/transactions/transaction-table.tsx`

- [ ] **Step 1: Write `src/lib/validation/transaction.ts`**

```typescript
import { z } from "zod";

export const transactionSchema = z
  .object({
    type: z.enum(["BUY", "SELL", "DIVIDEND"]),
    date: z.coerce.date(),
    shares: z.coerce.number().positive().optional(),
    pricePerShare: z.coerce.number().positive().optional(),
    amount: z.coerce.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.type === "DIVIDEND"
        ? data.amount !== undefined
        : data.shares !== undefined && data.pricePerShare !== undefined,
    { message: "Buy/Sell need shares and price; Dividend needs an amount" }
  );

export type TransactionInput = z.infer<typeof transactionSchema>;
```

- [ ] **Step 2: Write `src/app/(dashboard)/companies/[id]/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { transactionSchema, type TransactionInput } from "@/lib/validation/transaction";

/**
 * transactionSchema's .refine() only asserts the fields REQUIRED for the
 * chosen type are present — it never asserts the other type's fields are
 * absent. Because the form (transaction-form.tsx) doesn't unmount/clear
 * fields when the user switches the type dropdown (react-hook-form keeps
 * unmounted field values by default), a submission can legitimately arrive
 * as e.g. `{ type: "DIVIDEND", shares: 10, pricePerShare: 100, amount: 5 }`
 * if the user filled in Buy fields, then switched to Dividend before
 * submitting. Persisting that verbatim would leave a DIVIDEND row that also
 * displays a stale share count/price in the history table, CSV export, and
 * audit review — actively misleading in a financial record-keeping tool.
 * Normalize server-side (defense in depth, consistent with this app's other
 * guards) rather than trusting client-side field visibility alone.
 */
function normalizeTransactionFields(data: TransactionInput) {
  if (data.type === "DIVIDEND") {
    return { ...data, shares: undefined, pricePerShare: undefined };
  }
  return { ...data, amount: undefined };
}

export async function addTransaction(companyId: string, input: unknown) {
  const user = await requireAuth();
  const data = normalizeTransactionFields(transactionSchema.parse(input));
  // Guard: only allow transactions against companies that are actually
  // approved and not soft-deleted. Without this, a user could write a
  // transaction against a PENDING/REJECTED/deleted companyId, creating a
  // permanently invisible, un-deletable orphan row — the dashboard filters
  // status: "APPROVED" and this page 404s for non-approved companies, so
  // there'd be no UI path to ever see or clean it up (see analysis.md 1e/2c).
  const company = await prisma.company.findFirst({
    where: { id: companyId, status: "APPROVED", deletedAt: null },
  });
  if (!company) throw new Error("Company not found, not approved, or has been deleted");

  await prisma.transaction.create({
    data: {
      userId: user.id,
      companyId,
      type: data.type,
      date: data.date,
      shares: data.shares ?? null,
      pricePerShare: data.pricePerShare ?? null,
      amount: data.amount ?? null,
    },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
}

export async function updateTransaction(id: string, companyId: string, input: unknown) {
  const user = await requireAuth();
  const data = normalizeTransactionFields(transactionSchema.parse(input));
  // Ownership-scoped update: only modifies the row if it belongs to this
  // user, a no-op otherwise. This mirrors deleteTransaction's pattern below
  // — the caller gets no useful signal either way from an edit form on
  // their own page, so a silent no-op is acceptable here.
  // Note: `companyId` intentionally does NOT appear in the where clause —
  // `id` alone is a globally unique Transaction id, so it can't collide
  // across companies. companyId is only used below for revalidatePath; a
  // caller passing a mismatched companyId just gets a stale revalidation
  // path, not a security gap (ownership is still enforced via userId).
  await prisma.transaction.updateMany({
    where: { id, userId: user.id, deletedAt: null },
    data: {
      type: data.type,
      date: data.date,
      shares: data.shares ?? null,
      pricePerShare: data.pricePerShare ?? null,
      amount: data.amount ?? null,
    },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
}

export async function deleteTransaction(id: string, companyId: string) {
  const user = await requireAuth();
  // Ownership-scoped soft-delete: updateMany with userId in the where
  // clause (rather than update by id alone) makes this a no-op if the
  // transaction doesn't belong to the caller, instead of throwing — the
  // caller gets no useful signal either way from a delete button on their
  // own page.
  await prisma.transaction.updateMany({
    where: { id, userId: user.id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
}
```

- [ ] **Step 3: Write `src/app/(dashboard)/companies/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionTable } from "@/components/transactions/transaction-table";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company || company.deletedAt || company.status !== "APPROVED") notFound();

  const transactions = await prisma.transaction.findMany({
    where: { companyId: id, userId: user.id, deletedAt: null },
    orderBy: { date: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">
        {company.name} ({company.ticker})
      </h1>
      <TransactionForm companyId={id} />
      <TransactionTable companyId={id} transactions={transactions} />
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/transactions/transaction-form.tsx`**

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionSchema, type TransactionInput } from "@/lib/validation/transaction";
import { addTransaction, updateTransaction } from "@/app/(dashboard)/companies/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import type { Transaction } from "@prisma/client";

export function TransactionForm({
  companyId,
  editing,
  onDone,
}: {
  companyId: string;
  /** When set, the form edits this existing transaction instead of adding a new one. */
  editing?: Transaction;
  onDone?: () => void;
}) {
  const [type, setType] = useState<TransactionInput["type"]>(editing?.type ?? "BUY");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: editing
      ? {
          type: editing.type,
          // HTML <input type="date"> needs a "YYYY-MM-DD" string as its seed
          // value — a raw Date object (TransactionInput's type after
          // z.coerce.date() parses it) stringifies to something like "Mon
          // Jul 13 2026 ...", which the browser's date input rejects and
          // renders blank. This string is only ever consumed by the native
          // input's defaultValue; transactionSchema re-coerces it back to a
          // Date on submit, so the cast below is safe, not a type escape
          // hatch hiding a real mismatch.
          date: editing.date.toISOString().slice(0, 10) as unknown as Date,
          shares: editing.shares === null ? undefined : Number(editing.shares),
          pricePerShare: editing.pricePerShare === null ? undefined : Number(editing.pricePerShare),
          amount: editing.amount === null ? undefined : Number(editing.amount),
        }
      : undefined,
  });

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        if (editing) {
          await updateTransaction(editing.id, companyId, data);
        } else {
          await addTransaction(companyId, data);
          reset();
        }
        onDone?.();
      })}
      className="flex flex-wrap items-end gap-3 rounded border p-4"
    >
      <div>
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          {...register("type")}
          onChange={(e) => setType(e.target.value as TransactionInput["type"])}
          className="block rounded border px-2 py-1"
        >
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
          <option value="DIVIDEND">Dividend</option>
        </select>
      </div>
      <div>
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" {...register("date")} />
        {errors.date && <p className="text-sm text-red-600">{errors.date.message}</p>}
      </div>
      {type !== "DIVIDEND" ? (
        <>
          <div>
            <Label htmlFor="shares">Shares</Label>
            <Input id="shares" type="number" step="any" {...register("shares")} />
            {errors.shares && <p className="text-sm text-red-600">{errors.shares.message}</p>}
          </div>
          <div>
            <Label htmlFor="pricePerShare">Price/share</Label>
            <Input id="pricePerShare" type="number" step="any" {...register("pricePerShare")} />
            {errors.pricePerShare && (
              <p className="text-sm text-red-600">{errors.pricePerShare.message}</p>
            )}
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" type="number" step="any" {...register("amount")} />
          {errors.amount && <p className="text-sm text-red-600">{errors.amount.message}</p>}
        </div>
      )}
      {/* transactionSchema's top-level .refine() (Buy/Sell need shares+price;
          Dividend needs an amount) attaches its message to errors.root — the
          per-field errors above cover the common case (a field left blank
          coerces to 0 via z.coerce.number(), which fails .positive() on that
          field directly, not the refine). */}
      {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {editing ? "Save" : "Add"}
      </Button>
      {editing && onDone && (
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Write `src/components/transactions/transaction-table.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { deleteTransaction } from "@/app/(dashboard)/companies/[id]/actions";
import { TransactionForm } from "./transaction-form";
import type { Transaction } from "@prisma/client";

// The date is stored as a UTC-midnight instant (the HTML <input type="date">
// value is coerced with z.coerce.date(), which parses "2026-07-13" as UTC
// midnight). Formatting with the browser's local timezone instead of UTC
// would show the wrong calendar day for any negative-UTC-offset user (e.g.
// US) — see analysis.md 5a. Using the UTC getters keeps display consistent
// with what the user actually typed.
function formatUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

export function TransactionTable({
  companyId,
  transactions,
}: {
  companyId: string;
  transactions: Transaction[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Shares</TableHead>
          <TableHead>Price/share</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Purified</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((t) =>
          editingId === t.id ? (
            <TableRow key={t.id}>
              <TableCell colSpan={7}>
                <TransactionForm
                  companyId={companyId}
                  editing={t}
                  onDone={() => setEditingId(null)}
                />
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={t.id}>
              <TableCell>{formatUtcDate(t.date)}</TableCell>
              <TableCell>{t.type}</TableCell>
              <TableCell>{t.shares?.toString() ?? "—"}</TableCell>
              <TableCell>{t.pricePerShare?.toString() ?? "—"}</TableCell>
              <TableCell>{t.amount?.toString() ?? "—"}</TableCell>
              <TableCell>{t.purifiedAt ? "Yes" : "No"}</TableCell>
              <TableCell className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingId(t.id)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteTransaction(t.id, companyId)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          )
        )}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 6: Verify**

As a user, from `/overview` click into an approved company (or navigate to `/companies/<id>` directly using an ID from Prisma Studio), add a `BUY` of 10 shares @ 100, confirm it appears in the history table and `/overview` now shows this holding with `avgCost=100`, `breakeven≈100+fee*2/10` (Session 3's revised formula — confirm it matches the updated test expectations there, not the pre-fix `100.1`). Add a `SELL` of 4 @ 120, confirm realized gains and breakeven update per Session 3's formulas. Click "Edit" on a transaction, change the price, confirm the dashboard recalculates without needing a delete+re-add. Delete a transaction, confirm it disappears from history and recalculates the dashboard. Pick a date in `<input type="date">` (e.g. `2026-07-13`) and confirm the history table displays that exact same date back, regardless of your machine's timezone. Manually try to call `addTransaction` (e.g. via browser devtools or a throwaway test) against a `PENDING` or soft-deleted company ID and confirm it throws rather than silently creating an orphan row.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/transaction.ts "src/app/(dashboard)/companies" src/components/transactions
git commit -m "feat: add per-company transaction entry, editing, and history with a company-status guard"
```

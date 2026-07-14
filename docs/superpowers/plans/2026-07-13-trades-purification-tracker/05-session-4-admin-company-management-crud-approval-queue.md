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

## Session 4: Admin — Company Management (CRUD + Approval Queue)

**Context recap:** Admin needs to create/edit companies directly, and approve or reject companies users have requested (built in Session 8, but the schema/status already exists from Session 1 — `Company.status` is `PENDING | APPROVED | REJECTED`). This session builds the full admin-facing company management UI. It's the first CRUD feature and establishes the pattern (`page.tsx` + `actions.ts` + form/table components) that Sessions 5, 7, and 8 repeat.

**Revision note:** this session was revised after an early plan review (`analysis.md` items 1b/1c/1e/3a/3b/3d/3e/3h):
- `nonCompliantPct` is now entered/validated/stored/displayed consistently as a 0–100 percentage everywhere (the original form/schema mismatch that rejected most real values is gone).
- `updateCompany`/`approveCompanyRequest` now guard against editing a soft-deleted or already-processed row.
- `deleteCompany` now checks for live user holdings first and requires an explicit `force` confirmation rather than silently hiding a user's data.
- `rejectCompanyRequest` now hard-deletes the pending row (documented exception to the soft-delete rule) instead of just flipping `status`, so the ticker can be requested again.
- A bulk CSV import action + admin page were added so the ~80 real companies don't have to be entered one at a time.
- `updateCompany`/`approveCompanyRequest`/`deleteCompany`/`rejectCompanyRequest`/bulk import now write `AuditLog` rows.
- The form gained an optional `nextDividendDate` field alongside the existing free-text `dividendPeriod`.
- Added `src/app/admin/layout.tsx` with `requireAuth({ roles: ["ADMIN"] })` — defense in depth per the Global Constraints' auth rule, so no admin route renders without a guard even if an individual page forgets to call it.
- `bulkImportCompanies` now captures per-row `name (ticker)` strings in the audit log's `after.names` array alongside the counts, so a bulk import is auditable per-row rather than only recording a total created count.

**Prerequisites:** Sessions 1–2 complete (schema + auth guards exist).

**Files to create:**
- `/home/adil/projects/trades/src/lib/validation/company.ts`
- `/home/adil/projects/trades/src/app/admin/layout.tsx`
- `/home/adil/projects/trades/src/app/admin/companies/page.tsx`
- `/home/adil/projects/trades/src/app/admin/companies/actions.ts`
- `/home/adil/projects/trades/src/app/admin/companies/new/page.tsx`
- `/home/adil/projects/trades/src/app/admin/companies/[id]/edit/page.tsx`
- `/home/adil/projects/trades/src/app/admin/companies/import/page.tsx`
- `/home/adil/projects/trades/src/components/companies/company-form.tsx`
- `/home/adil/projects/trades/src/components/companies/pending-requests-table.tsx`
- `/home/adil/projects/trades/src/components/companies/delete-company-button.tsx`

- [ ] **Step 0: Write `src/app/admin/layout.tsx`** — defense-in-depth admin route guard

Every admin page and its Server Actions already call `requireAuth({ roles: ["ADMIN"] })` individually (per the Global Constraints' defense-in-depth rule), but a layout-level check ensures no admin route renders without it, even if a future page forgets. Session 6's `Sidebar` renders admin links conditionally based on `role`, but the layout is the actual gate.

```tsx
import { requireAuth } from "@/lib/auth-guard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAuth({ roles: ["ADMIN"] });
  return <>{children}</>;
}
```

This is minimal — it doesn't add a wrapper `<div>` or sidebar (the app's `Sidebar` from Session 6 lives in the `(dashboard)` layout group, not here), so it composes cleanly with whatever wrapper Session 2's top-level `layout.tsx` provides. Admin pages are bare with no sidebar now or later — the `Sidebar` only wraps dashboard routes. This is intentional and correct.

- [ ] **Step 1: Write `src/lib/validation/company.ts`**

```typescript
import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(1, "Name is required"),
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  // 0-100 percentage (e.g. 4.94 = 4.94%), matching both Decimal(5,2) storage
  // (Session 1) and the source CSV's values directly — no /100 conversion
  // anywhere in this app. calculations.ts callers divide by 100 once, at
  // the read boundary (Sessions 6/8), since its functions expect a 0-1
  // fraction as their nonCompliantPct argument.
  nonCompliantPct: z.coerce.number().min(0).max(100),
  dividendPeriod: z.string().optional(),
  nextDividendDate: z.coerce.date().optional(),
});

export type CompanyInput = z.infer<typeof companySchema>;
```

- [ ] **Step 2: Write `src/app/admin/companies/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { companySchema } from "@/lib/validation/company";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// Prisma's generated types for a nullable Json field deliberately exclude a
// bare `null` literal — you must use Prisma.DbNull (semantically "no
// value") to disambiguate from Prisma.JsonNull ("store the JSON literal
// null"). Passing plain `null` fails `tsc`/throws PrismaClientValidationError
// at runtime. Every "no before/after value" audit log write in this file
// uses Prisma.DbNull for that reason — this is not optional boilerplate.

export async function createCompany(input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const data = companySchema.parse(input);
  const company = await prisma.company.create({ data: { ...data, status: "APPROVED" } });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.create",
      targetType: "Company",
      targetId: company.id,
      before: Prisma.DbNull,
      after: {
        name: data.name,
        ticker: data.ticker,
        nonCompliantPct: data.nonCompliantPct,
        dividendPeriod: data.dividendPeriod,
        nextDividendDate: data.nextDividendDate?.toISOString() ?? null,
      },
    },
  });
  revalidatePath("/admin/companies");
}

export async function updateCompany(id: string, input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const data = companySchema.parse(input);
  // Guard against editing a soft-deleted company directly via the Server
  // Action — the edit page's notFound() check alone isn't defense in depth
  // (see analysis.md 1e).
  const before = await prisma.company.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new Error("Company not found or has been deleted");
  await prisma.company.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.update",
      targetType: "Company",
      targetId: id,
      before: {
        ticker: before.ticker,
        // Number(...) here matters: `before` comes straight from Prisma, so
        // nonCompliantPct is a Decimal instance whose JSON serialization is
        // a STRING ("10.00"), while `data.nonCompliantPct` below is already
        // a plain number from Zod — leaving this as a raw Decimal would
        // store two different JSON types for the same field across
        // before/after in one audit record.
        nonCompliantPct: Number(before.nonCompliantPct),
        dividendPeriod: before.dividendPeriod,
        // nextDividendDate is "dividend info" per the Global Constraints'
        // audit-trail rule, same as dividendPeriod — must be captured too,
        // or an admin could silently change it with zero audit trail.
        nextDividendDate: before.nextDividendDate?.toISOString() ?? null,
      },
      after: {
        ticker: data.ticker,
        nonCompliantPct: data.nonCompliantPct,
        dividendPeriod: data.dividendPeriod,
        nextDividendDate: data.nextDividendDate?.toISOString() ?? null,
      },
    },
  });
  revalidatePath("/admin/companies");
}

export async function deleteCompany(id: string, force = false) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  if (!force) {
    const affected = await prisma.transaction.findMany({
      where: { companyId: id, deletedAt: null },
      distinct: ["userId"],
      select: { userId: true },
    });
    if (affected.length > 0) {
      // Deleting a company a user holds a position in would silently drop
      // their shares/gains/dividends from every dashboard with no warning
      // (see analysis.md 3b) — block by default and require the caller to
      // explicitly re-call with force: true after being shown this count.
      throw new Error(
        `${affected.length} user(s) hold live transactions against this company. ` +
          `Deleting it will remove their holdings from every dashboard (the ` +
          `transaction rows themselves are preserved — see the soft-delete rule ` +
          `in Global Constraints). Call deleteCompany(id, true) to confirm.`
      );
    }
  }

  const before = await prisma.company.findUnique({ where: { id } });
  await prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.delete",
      targetType: "Company",
      targetId: id,
      before: { deletedAt: before?.deletedAt ?? null },
      after: { deletedAt: new Date().toISOString() },
    },
  });
  revalidatePath("/admin/companies");
}

export async function approveCompanyRequest(id: string, input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const data = companySchema.parse(input);
  const before = await prisma.company.findFirst({
    where: { id, deletedAt: null, status: "PENDING" },
  });
  if (!before) throw new Error("Company request not found, already processed, or deleted");
  await prisma.company.update({ where: { id }, data: { ...data, status: "APPROVED" } });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.approve",
      targetType: "Company",
      targetId: id,
      before: { status: "PENDING" },
      after: {
        status: "APPROVED",
        nonCompliantPct: data.nonCompliantPct,
        dividendPeriod: data.dividendPeriod,
        nextDividendDate: data.nextDividendDate?.toISOString() ?? null,
      },
    },
  });
  revalidatePath("/admin/companies");
}

export async function rejectCompanyRequest(id: string) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const before = await prisma.company.findFirst({ where: { id, status: "PENDING" } });
  if (!before) throw new Error("Company request not found or already processed");
  // Hard delete, not soft delete: a rejected PENDING request was never real
  // approved data (documented exception in Global Constraints), and
  // hard-deleting frees its `ticker` unique constraint for a future request
  // instead of permanently blocking it (see analysis.md 3d).
  await prisma.company.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.reject",
      targetType: "Company",
      targetId: id,
      before: { name: before.name, ticker: before.ticker, status: "PENDING" },
      after: Prisma.DbNull,
    },
  });
  revalidatePath("/admin/companies");
}

const bulkImportRowSchema = z.object({
  name: z.string().min(1),
  ticker: z.string().min(1).toUpperCase(),
  nonCompliantPct: z.coerce.number().min(0).max(100),
  dividendPeriod: z.string().optional(),
});

export type BulkImportResult = {
  created: number;
  skipped: { line: string; reason: string }[];
};

/**
 * Naive comma-split CSV import (no quoted-field support) — good enough for
 * an admin-controlled paste of name/ticker/nonCompliantPct/dividendPeriod
 * rows without embedded commas. Names containing a comma (a few rows in the
 * real source CSV do, e.g. "dmg mori co., ltd.") must have the comma
 * stripped or replaced before pasting; this is a documented v1 limitation,
 * not a silent data-corruption risk — such rows fail schema validation and
 * are reported in `skipped`, never partially imported.
 */
export async function bulkImportCompanies(csvText: string): Promise<BulkImportResult> {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const lines = csvText
    .trim()
    .split("\n")
    .slice(1) // skip header row
    .filter((l) => l.trim().length > 0);

  const result: BulkImportResult = { created: 0, skipped: [] };
  const createdNames: string[] = [];

  for (const line of lines) {
    const [name, ticker, nonCompliantPct, dividendPeriod] = line.split(",").map((s) => s.trim());
    const parsed = bulkImportRowSchema.safeParse({ name, ticker, nonCompliantPct, dividendPeriod });
    if (!parsed.success) {
      result.skipped.push({ line, reason: parsed.error.issues[0]?.message ?? "invalid row" });
      continue;
    }
    try {
      await prisma.company.create({ data: { ...parsed.data, status: "APPROVED" } });
      result.created += 1;
      createdNames.push(`${parsed.data.name} (${parsed.data.ticker})`);
    } catch {
      // Most likely a unique `ticker` constraint violation (already exists)
      // — skip this row rather than failing the whole batch.
      result.skipped.push({ line, reason: "ticker already exists or invalid" });
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.bulkImport",
      targetType: "Company",
      targetId: "bulk",
      before: Prisma.DbNull,
      after: { created: result.created, skippedCount: result.skipped.length, names: createdNames },
    },
  });

  revalidatePath("/admin/companies");
  return result;
}
```

- [ ] **Step 3: Write `src/app/admin/companies/page.tsx`**

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PendingRequestsTable } from "@/components/companies/pending-requests-table";
import { DeleteCompanyButton } from "@/components/companies/delete-company-button";

export default async function AdminCompaniesPage() {
  await requireAuth({ roles: ["ADMIN"] });

  const [approved, pending] = await Promise.all([
    prisma.company.findMany({
      where: { status: "APPROVED", deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.company.findMany({
      where: { status: "PENDING", deletedAt: null },
      include: { requestedBy: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8 p-6">
      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Pending requests</h2>
          <PendingRequestsTable requests={pending} />
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Companies</h2>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/companies/import">Bulk import (CSV)</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/companies/new">Add company</Link>
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Non-compliant %</TableHead>
              <TableHead>Dividend period</TableHead>
              <TableHead>Next dividend</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {approved.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.ticker}</TableCell>
                {/* nonCompliantPct is stored as a 0-100 percentage directly — no *100 here */}
                <TableCell>{Number(c.nonCompliantPct).toFixed(2)}%</TableCell>
                <TableCell>{c.dividendPeriod ?? "—"}</TableCell>
                <TableCell>
                  {c.nextDividendDate ? c.nextDividendDate.toISOString().slice(0, 10) : "—"}
                </TableCell>
                <TableCell className="flex gap-2">
                  <Link href={`/admin/companies/${c.id}/edit`} className="text-sm underline">
                    Edit
                  </Link>
                  <DeleteCompanyButton id={c.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/companies/pending-requests-table.tsx`**

```tsx
"use client";

import { useState } from "react";
import { approveCompanyRequest, rejectCompanyRequest } from "@/app/admin/companies/actions";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "./company-form";
import type { Company, User } from "@prisma/client";

type PendingRequest = Company & { requestedBy: Pick<User, "email"> | null };

export function PendingRequestsTable({ requests }: { requests: PendingRequest[] }) {
  const [approving, setApproving] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {requests.map((r) => (
        <div key={r.id} className="rounded border p-4">
          <p className="text-sm">
            <strong>{r.name}</strong> ({r.ticker}) — requested by {r.requestedBy?.email ?? "unknown"}
          </p>
          {approving === r.id ? (
            <CompanyForm
              initial={{
                name: r.name,
                ticker: r.ticker,
                nonCompliantPct: 0,
                dividendPeriod: "",
                nextDividendDate: undefined,
              }}
              onSubmit={(data) => approveCompanyRequest(r.id, data)}
              submitLabel="Approve"
            />
          ) : (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setApproving(r.id)}>
                Fill details &amp; approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => rejectCompanyRequest(r.id)}>
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/companies/company-form.tsx`**

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companySchema, type CompanyInput } from "@/lib/validation/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CompanyForm({
  initial,
  onSubmit,
  submitLabel = "Save",
}: {
  initial: CompanyInput;
  onSubmit: (data: CompanyInput) => Promise<void>;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    defaultValues: initial,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2 space-y-3">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <Label htmlFor="ticker">Ticker</Label>
        <Input id="ticker" {...register("ticker")} />
        {errors.ticker && <p className="text-sm text-red-600">{errors.ticker.message}</p>}
      </div>
      <div>
        <Label htmlFor="nonCompliantPct">Non-compliant % (0–100)</Label>
        <Input id="nonCompliantPct" type="number" step="0.01" {...register("nonCompliantPct")} />
        {errors.nonCompliantPct && (
          <p className="text-sm text-red-600">{errors.nonCompliantPct.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="dividendPeriod">Dividend period</Label>
        <Input id="dividendPeriod" {...register("dividendPeriod")} placeholder="e.g. May, Quarterly, No dividends" />
      </div>
      <div>
        <Label htmlFor="nextDividendDate">Next dividend date (optional)</Label>
        <Input id="nextDividendDate" type="date" {...register("nextDividendDate")} />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
```

`nonCompliantPct` is entered as 0–100, validated as 0–100 by `companySchema`, and stored as 0–100 in the DB (`Decimal(5,2)`) — the same representation at every layer, so there is no conversion step anywhere in this form or in `actions.ts`. Only `src/lib/calculations.ts`'s callers (Sessions 6 and 8) divide by 100, since `purifiableGains`/`purifiableDividends` take a 0–1 fraction.

- [ ] **Step 6: Write `src/app/admin/companies/new/page.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createCompany } from "../actions";
import { CompanyForm } from "@/components/companies/company-form";

export default function NewCompanyPage() {
  const router = useRouter();
  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Add company</h1>
      <CompanyForm
        initial={{
          name: "",
          ticker: "",
          nonCompliantPct: 0,
          dividendPeriod: "",
          nextDividendDate: undefined,
        }}
        onSubmit={async (data) => {
          await createCompany(data);
          router.push("/admin/companies");
        }}
      />
    </div>
  );
}
```

(This is a Client Component calling a Server Action directly — `requireAuth` still runs server-side inside `createCompany` itself, per the Global Constraints rule; the page doesn't need its own server-side guard call since it renders no sensitive data, only a form, and must NOT import `requireAuth` itself — `@/lib/auth-guard` transitively imports `@/lib/prisma` and `@/lib/auth`, which pull in Prisma/NextAuth server code; importing it into a `"use client"` file risks bundling server-only code into the client, even if the binding itself goes unused. Server Components that render data, like Step 3's page, call `requireAuth` directly — that's the only place it belongs. **This distinction matters for Step 7's `edit-form.tsx` and Session 5 Step 5's `users/new/page.tsx` too, since both are told to mirror this file's pattern — mirror the Server-Action-only import list, not just the JSX shape.**

- [ ] **Step 7: Write `src/app/admin/companies/[id]/edit/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { EditCompanyForm } from "./edit-form";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth({ roles: ["ADMIN"] });
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company || company.deletedAt) notFound();

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Edit {company.name}</h1>
      <EditCompanyForm
        id={company.id}
        initial={{
          name: company.name,
          ticker: company.ticker,
          nonCompliantPct: Number(company.nonCompliantPct),
          dividendPeriod: company.dividendPeriod ?? "",
          // Same fix as Session 7's transaction-edit form: <input type="date">
          // needs a "YYYY-MM-DD" string seed value, not a raw Date object
          // (which renders blank in the picker). companySchema re-coerces
          // this back to a Date on submit via z.coerce.date().
          nextDividendDate: company.nextDividendDate
            ? (company.nextDividendDate.toISOString().slice(0, 10) as unknown as Date)
            : undefined,
        }}
      />
    </div>
  );
}
```

Create a small client wrapper `src/app/admin/companies/[id]/edit/edit-form.tsx` that calls `updateCompany(id, data)` then `router.push("/admin/companies")`, mirroring Step 6's `new/page.tsx` pattern exactly — including its import list (no `requireAuth` in this client component).

- [ ] **Step 7b: Write `src/components/companies/delete-company-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { deleteCompany } from "@/app/admin/companies/actions";
import { Button } from "@/components/ui/button";

export function DeleteCompanyButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await deleteCompany(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete company";
      // Only the specific "live holdings" warning from deleteCompany's
      // pre-check (see actions.ts) is safe to offer a force-retry for — a
      // different failure (network, auth, an unrelated Prisma error)
      // shouldn't be treated the same way, since force:true would just
      // retry into the same unrelated error.
      const isLiveHoldingsWarning = message.includes(
        "hold live transactions against this company"
      );
      if (!isLiveHoldingsWarning) {
        window.alert(message);
        return;
      }
      if (window.confirm(`${message}\n\nDelete anyway?`)) {
        try {
          await deleteCompany(id, true);
        } catch (retryErr) {
          window.alert(retryErr instanceof Error ? retryErr.message : "Failed to delete company");
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={handleClick}>
      Delete
    </Button>
  );
}
```

- [ ] **Step 7c: Write `src/app/admin/companies/import/page.tsx`** (bulk CSV import)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bulkImportCompanies, type BulkImportResult } from "../actions";
import { Button } from "@/components/ui/button";

export default function ImportCompaniesPage() {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Bulk import companies</h1>
      <p className="text-sm text-muted-foreground">
        Paste CSV with header <code>name,ticker,nonCompliantPct,dividendPeriod</code>. Values are
        plain comma-split (no quoted-field support) — company names containing a comma must have
        it removed first. <code>nonCompliantPct</code> is 0–100 (e.g. <code>4.94</code>).
      </p>
      <textarea
        className="h-64 w-full rounded border p-2 font-mono text-sm"
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder={"name,ticker,nonCompliantPct,dividendPeriod\nasml holding n.v.,ASME-GY,0.64,May 26"}
      />
      <div className="flex gap-2">
        <Button
          disabled={pending || !csvText.trim()}
          onClick={async () => {
            setPending(true);
            const r = await bulkImportCompanies(csvText);
            setResult(r);
            setPending(false);
          }}
        >
          {pending ? "Importing…" : "Import"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/admin/companies")}>
          Back to companies
        </Button>
      </div>
      {result && (
        <div className="rounded border p-3 text-sm">
          <p>{result.created} companies created.</p>
          {result.skipped.length > 0 && (
            <>
              <p className="mt-2 font-medium">{result.skipped.length} row(s) skipped:</p>
              <ul className="list-disc pl-5">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    <code>{s.line}</code> — {s.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Verify**

Log in as admin, go to `/admin/companies`, add a company (e.g. `Test Co`, `TST`, `5`, `Quarterly`), confirm it lists with `5.00%` (no `*100` — what you typed is what's stored and shown). Edit it, change to `10`, confirm update, and confirm an `AuditLog` row was written (check via Prisma Studio: `action: "company.update"`, `before`/`after` showing the percentage change). Manually create a `PENDING` company row via Prisma Studio with a `requestedById` set to a user (create a throwaway user row directly in Studio if Session 5 isn't done yet) and confirm it shows under "Pending requests" with approve working; confirm reject actually removes the row from the DB (hard delete) and that the same ticker can be requested again afterward. Paste a few real rows from `trades_template - current.csv` (e.g. `asml holding n.v.,ASME-GY,0.64,09/02/2026`) into `/admin/companies/import` and confirm they're created with the exact percentage values from the sheet — this is the actual replacement for the old CSV-based workflow the app is meant to replace. Create a test company, log a transaction against it as a user (once Session 7 exists), then try to delete that company as admin — confirm it's blocked with a count, and only proceeds after confirming.

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/company.ts src/app/admin/layout.tsx src/app/admin/companies src/components/companies
git commit -m "feat: add admin company management with pending-request approval queue, bulk import, and audit logging"
```

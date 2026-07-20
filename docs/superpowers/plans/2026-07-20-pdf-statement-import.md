# PDF Statement Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload their Trade Republic PDF account statement at `/import-transactions`, review the trades a deterministic parser extracts from it, and confirm them into `Transaction` history.

**Architecture:** A new optional `Company.isin` field lets statement line items (identified by ISIN, not ticker) match existing companies. A pure parser module turns extracted PDF text into structured rows via regex against the known Trade Republic layout. A "parse" Server Action returns candidate rows to the client for review (nothing persisted yet); a "confirm" Server Action re-validates and re-resolves everything server-side before writing `Transaction` + `AuditLog` rows, mirroring the existing `bulkImportTransactions` CSV path.

**Tech Stack:** Next.js 16 App Router (Server Actions), TypeScript, Prisma/PostgreSQL, Zod, Vitest, `pdf-parse`.

## Global Constraints

- Every Server Action calls `requireAuth()` as its first line — no relying on layout/proxy gating (AGENTS.md hard rule).
- Every `Company`/`Transaction` query filters `deletedAt: null` via `activeCompanyWhere()`/`activeTransactionWhere()` from `src/lib/prisma-where.ts` — never hand-write the filter.
- Client and server validation for a given form import the same Zod schema from `src/lib/validation/`.
- Every admin mutation is wrapped in `prisma.$transaction` and creates a corresponding `AuditLog` entry with before/after JSON snapshots.
- Parsing is deterministic (regex/layout rules) only — no PDF content or extracted text is ever sent to an external API.
- The uploaded PDF and its extracted text are never persisted to disk, DB, or object storage — processed in memory for the duration of the request only.
- Money fields are `Decimal` in Postgres/Prisma but plain `number` once past the `calculations.ts`/action boundary.

---

### Task 1: `Company.isin` schema field + migration

**Files:**
- Modify: `prisma/schema.prisma` (`Company` model)
- Create: `prisma/migrations/<timestamp>_add_company_isin/migration.sql`

**Interfaces:**
- Produces: `Company.isin: string | null` on the Prisma client, queryable via `activeCompanyWhere({ isin: ... })`.

- [ ] **Step 1: Add the field to the schema**

Edit `prisma/schema.prisma`, adding `isin` to the `Company` model right after `ticker`:

```prisma
model Company {
  id               String        @id @default(cuid())
  name             String
  // Not @unique here: uniqueness is enforced only among active (non-soft-
  // deleted) rows via a partial unique index defined in migration
  // 20260714140243_company_ticker_partial_unique, since Prisma's @@unique
  // can't express a WHERE clause. This @@index below is for lookup
  // performance only and does not itself enforce uniqueness.
  ticker           String
  // ISIN (International Securities Identification Number). Brokerage
  // statement imports (e.g. the Trade Republic PDF import) identify
  // securities by ISIN, not ticker, so this is how those statement lines
  // get matched to a Company. Optional — only companies a user wants to
  // match via statement upload need one populated. Same partial-unique-
  // index pattern as ticker (see this field's migration) and for the same
  // reason has no @unique/@@unique declared here.
  isin             String?
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
  @@index([status, deletedAt])
  @@index([ticker])
  @@index([isin])
}
```

- [ ] **Step 2: Generate a create-only migration**

Run: `npx prisma migrate dev --name add_company_isin --create-only`
Expected: creates `prisma/migrations/<timestamp>_add_company_isin/migration.sql` containing only:

```sql
-- AlterTable
ALTER TABLE "Company" ADD COLUMN "isin" TEXT;

-- CreateIndex
CREATE INDEX "Company_isin_idx" ON "Company"("isin");
```

- [ ] **Step 3: Hand-add the partial unique index**

Append to the generated `migration.sql` (same file from Step 2):

```sql

-- Enforce ISIN uniqueness only among active (non-soft-deleted) rows,
-- mirroring the ticker partial-unique index pattern (see migration
-- 20260714140243_company_ticker_partial_unique). isin is optional and
-- Postgres unique indexes ignore NULLs, so any number of companies without
-- an ISIN can coexist.
CREATE UNIQUE INDEX "Company_isin_active_key" ON "Company"("isin") WHERE "deletedAt" IS NULL;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev`
Expected: `Company_isin_active_key` and `Company_isin_idx` created, Prisma Client regenerated with `Company.isin: string | null`.

- [ ] **Step 5: Confirm the existing suite still passes**

Run: `npm test`
Expected: all existing tests still pass (the new column is nullable and additive — no existing query shape changes).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "$(cat <<'EOF'
feat: add optional Company.isin field

Brokerage statement imports identify securities by ISIN, not ticker.
Partial unique index mirrors the existing ticker pattern (active rows only).
EOF
)"
```

---

### Task 2: Wire `isin` through company validation, admin forms, and company requests

**Files:**
- Modify: `src/lib/validation/company.ts`
- Modify: `src/lib/validation/company-request.ts`
- Modify: `src/components/companies/company-form.tsx`
- Modify: `src/app/(dashboard)/admin/companies/new/page.tsx`
- Modify: `src/app/(dashboard)/admin/companies/[id]/edit/edit-form.tsx`
- Modify: `src/app/(dashboard)/admin/companies/[id]/edit/page.tsx`
- Modify: `src/app/(dashboard)/admin/companies/actions.ts` (`createCompany`, `updateCompany`, `approveCompanyRequest`)
- Modify: `src/components/companies/pending-requests-table.tsx`
- Create: `src/app/(dashboard)/request-company/request-company-form.tsx`
- Modify: `src/app/(dashboard)/request-company/page.tsx`
- Modify: `src/app/(dashboard)/request-company/actions.ts`

**Interfaces:**
- Produces: `companySchema` and `companyRequestSchema` both accept an optional `isin: string` field, consumed by Task 6/7's matching logic and by Task 8's review-screen "request company" link (`/request-company?name=...&isin=...`).

There are no existing automated tests for `admin/companies/actions.ts` or `request-company/actions.ts` (verified: no test file references `createCompany`, `updateCompany`, `approveCompanyRequest`, or `requestCompany`). This task follows that existing convention — it's mechanical plumbing of one new optional field through already-untested CRUD actions — and is verified via type-checking, linting, the existing suite, and a manual smoke test, not new test files.

- [ ] **Step 1: Add `isin` to both validation schemas**

Edit `src/lib/validation/company.ts`:

```ts
import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(1, "Name is required"),
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  isin: z.string().optional(),
  nonCompliantPct: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : Number(v)),
    z.coerce
      .number()
      .min(0, "Must be 0-100")
      .max(100, "Must be 0-100")
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9,
        "Must have at most 2 decimal places"
      )
  ),
  dividendPeriod: z.string().optional(),
  nextDividendDate: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : new Date(v as string)),
    z.date().optional()
  ),
});

export type CompanyInput = z.infer<typeof companySchema>;
```

Edit `src/lib/validation/company-request.ts`:

```ts
import { z } from "zod";

export const companyRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  isin: z.string().optional(),
});

export type CompanyRequestInput = z.infer<typeof companyRequestSchema>;
```

- [ ] **Step 2: Add the ISIN field to the shared `CompanyForm`**

Edit `src/components/companies/company-form.tsx`. Update `FormValues` and `Props["initial"]`:

```ts
type FormValues = {
  name: string;
  ticker: string;
  isin: string;
  nonCompliantPct: number;
  dividendPeriod: string;
  nextDividendDate: string;
};
```

```ts
type Props = {
  initial?: Partial<{
    name: string;
    ticker: string;
    isin: string;
    nonCompliantPct: number;
    dividendPeriod: string;
    /** Pass a YYYY-MM-DD string for <input type="date">. Dates are also accepted. */
    nextDividendDate: Date | string;
  }>;
  onSubmit: (data: CompanyInput) => Promise<{ error?: unknown } | void>;
  submitLabel?: string;
  disabled?: boolean;
  disabledFields?: ("name" | "ticker")[];
};
```

In the `useForm` call's `defaultValues`, add:

```ts
    defaultValues: {
      name: initial?.name ?? "",
      ticker: initial?.ticker ?? "",
      isin: initial?.isin ?? "",
      nonCompliantPct: initial?.nonCompliantPct ?? 0,
      dividendPeriod: initial?.dividendPeriod ?? "",
      nextDividendDate: initial?.nextDividendDate
        ? toDateStr(initial.nextDividendDate)
        : "",
    },
```

Add the input field in the JSX, right after the ticker field block:

```tsx
      <div className="space-y-2">
        <Label htmlFor="isin">ISIN (optional)</Label>
        <Input id="isin" {...register("isin")} placeholder="e.g. US0378331005" />
        {errors.isin && <p className="text-sm text-destructive">{errors.isin.message}</p>}
      </div>
```

- [ ] **Step 3: Pass `isin` through the create/edit page FormData builders**

Edit `src/app/(dashboard)/admin/companies/new/page.tsx`, in `handleSubmit`:

```ts
  const handleSubmit = async (data: CompanyInput) => {
    const fd = new FormData();
    fd.set('name', data.name);
    fd.set('ticker', data.ticker);
    if (data.isin) fd.set('isin', data.isin);
    fd.set('nonCompliantPct', String(data.nonCompliantPct));
    if (data.dividendPeriod) fd.set('dividendPeriod', data.dividendPeriod);
    if (data.nextDividendDate)
      fd.set('nextDividendDate', data.nextDividendDate.toISOString());

    const result = await createCompany(fd);
    if (result?.error) return result;
    router.push('/admin/companies');
  };
```

Edit `src/app/(dashboard)/admin/companies/[id]/edit/edit-form.tsx` the same way — add `if (data.isin) fd.set('isin', data.isin);` to `handleSubmit`, and add `isin?: string` to the `Props["initial"]` type and pass it through `formInitial`:

```ts
type Props = {
  companyId: string;
  initial: {
    name: string;
    ticker: string;
    isin?: string;
    nonCompliantPct: number;
    dividendPeriod?: string;
    nextDividendDate?: Date;
  };
  nextDividendDateStr?: string;
};
```

```ts
  const formInitial = {
    name: initial.name,
    ticker: initial.ticker,
    isin: initial.isin,
    nonCompliantPct: initial.nonCompliantPct,
    dividendPeriod: initial.dividendPeriod,
    nextDividendDate:
      nextDividendDateStr ??
      initial.nextDividendDate?.toISOString().slice(0, 10),
  };
```

Edit `src/app/(dashboard)/admin/companies/[id]/edit/page.tsx` to pass the DB value through:

```ts
  const initial = {
    name: company.name,
    ticker: company.ticker,
    isin: company.isin ?? undefined,
    nonCompliantPct: Number(company.nonCompliantPct),
    dividendPeriod: company.dividendPeriod ?? undefined,
    nextDividendDate: company.nextDividendDate
      ? new Date(company.nextDividendDate)
      : undefined,
  };
```

- [ ] **Step 4: Wire `isin` through the admin actions**

Edit `src/app/(dashboard)/admin/companies/actions.ts`. In `createCompany`, destructure and use `isin`:

```ts
  const { name, ticker, isin, nonCompliantPct, dividendPeriod, nextDividendDate } = parsed.data;

  let company;
  try {
    company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          name,
          ticker,
          isin: isin ?? undefined,
          nonCompliantPct,
          dividendPeriod: dividendPeriod ?? undefined,
          nextDividendDate: nextDividendDate ?? undefined,
          status: "APPROVED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "company.create",
          targetType: "Company",
          targetId: created.id,
          before: Prisma.DbNull,
          after: {
            name,
            ticker,
            isin: isin ?? null,
            nonCompliantPct: Number(created.nonCompliantPct),
            dividendPeriod: dividendPeriod ?? null,
            nextDividendDate: nextDividendDate ?? null,
          },
        },
      });
      return created;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: { ticker: ["A company with this ticker or ISIN already exists"] } };
    }
    throw e;
  }
```

Apply the same three changes (destructure `isin`, pass `isin: isin ?? undefined` in the update `data`, add `isin` to `before`/`after` audit snapshots, broaden the P2002 message) to `updateCompany` and `approveCompanyRequest`. `deleteCompany`, `rejectCompanyRequest`, and `bulkImportCompanies` are unchanged — `bulkImportCompanies`'s naive comma-split CSV stays ticker-only per the existing "Known simplifications" convention; admins can set `isin` afterward via the edit form.

- [ ] **Step 5: Pass `isin` through the pending-request approval form**

Edit `src/components/companies/pending-requests-table.tsx`, adding `isin: r.isin ?? ""` to the `CompanyForm`'s `initial` prop:

```tsx
            <CompanyForm
              initial={{
                name: r.name,
                ticker: r.ticker,
                isin: r.isin ?? "",
                nonCompliantPct: 0,
                dividendPeriod: "",
                nextDividendDate: undefined,
              }}
              disabledFields={["name", "ticker"]}
              onSubmit={async (data) => {
                const result = await approveCompanyRequest(r.id, data as unknown as FormData);
                if (result?.error) {
                  toast.error(typeof result.error === "string" ? result.error : "Approval failed");
                }
                setApproving(null);
              }}
              submitLabel="Approve"
            />
```

- [ ] **Step 6: Extract `request-company`'s form into its own client component with query-param prefill**

Create `src/app/(dashboard)/request-company/request-company-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  companyRequestSchema,
  type CompanyRequestInput,
} from '@/lib/validation/company-request';
import { requestCompany } from './actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RequestCompanyForm() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyRequestInput>({
    resolver: zodResolver(companyRequestSchema),
    defaultValues: {
      name: searchParams.get('name') ?? '',
      ticker: '',
      isin: searchParams.get('isin') ?? '',
    },
  });

  const submit = async (data: CompanyRequestInput) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await requestCompany(data);
      if (result && typeof result === 'object' && 'error' in result) {
        setStatus({ type: 'error', message: result.error as string });
      } else {
        setStatus({ type: 'success', message: 'Request submitted' });
        reset();
      }
    } catch {
      setStatus({
        type: 'error',
        message: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {status && (
        <div
          className={`rounded-sm border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {status.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Company details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company name</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="e.g. Apple Inc."
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker</Label>
              <Input
                id="ticker"
                {...register('ticker')}
                placeholder="e.g. AAPL"
                style={{ textTransform: 'uppercase' }}
              />
              {errors.ticker && (
                <p className="text-sm text-destructive">
                  {errors.ticker.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="isin">ISIN (optional)</Label>
              <Input id="isin" {...register('isin')} placeholder="e.g. US0378331005" />
              {errors.isin && (
                <p className="text-sm text-destructive">{errors.isin.message}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit request'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
```

Replace `src/app/(dashboard)/request-company/page.tsx` entirely with:

```tsx
import { Suspense } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { RequestCompanyForm } from './request-company-form';

export default function RequestCompanyPage() {
  return (
    <div className="max-w-md space-y-6">
      <PageHeading description="Ask an admin to add a company to the tracker.">
        Request a company
      </PageHeading>
      <Suspense fallback={null}>
        <RequestCompanyForm />
      </Suspense>
    </div>
  );
}
```

(`useSearchParams` requires a Suspense boundary per Next.js App Router — `page.tsx` stays a Server Component wrapper so the prefilled form doesn't force the whole route to opt out of static optimization.)

- [ ] **Step 7: Pass `isin` through `requestCompany`**

Edit `src/app/(dashboard)/request-company/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { companyRequestSchema } from "@/lib/validation/company-request";

export async function requestCompany(input: unknown) {
  const user = await requireAuth();
  const parsed = companyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  try {
    await prisma.company.create({
      data: {
        name: data.name,
        ticker: data.ticker,
        isin: data.isin ?? undefined,
        nonCompliantPct: 0,
        status: "PENDING",
        requestedById: user.id,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A company with this ticker or ISIN already exists" };
    }
    throw e;
  }
  revalidatePath("/admin/companies");
  return { success: true };
}
```

- [ ] **Step 8: Type-check, lint, and run the suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, all existing tests still pass.

- [ ] **Step 9: Manual smoke test**

Run: `npm run dev:next` (against your local Postgres), then in the browser:
1. Log in as an admin, go to `/admin/companies/new`, fill in an ISIN, save — confirm it saved (edit the company again and check the field is populated).
2. Go to `/request-company?name=Test%20Co&isin=US0000000000` — confirm the Name and ISIN fields are prefilled.

Expected: both flows work as described.

- [ ] **Step 10: Commit**

```bash
git add src/lib/validation/company.ts src/lib/validation/company-request.ts \
  src/components/companies/company-form.tsx src/components/companies/pending-requests-table.tsx \
  src/app/"(dashboard)"/admin/companies/new/page.tsx \
  src/app/"(dashboard)"/admin/companies/\[id\]/edit/edit-form.tsx \
  src/app/"(dashboard)"/admin/companies/\[id\]/edit/page.tsx \
  src/app/"(dashboard)"/admin/companies/actions.ts \
  src/app/"(dashboard)"/request-company/request-company-form.tsx \
  src/app/"(dashboard)"/request-company/page.tsx \
  src/app/"(dashboard)"/request-company/actions.ts
git commit -m "$(cat <<'EOF'
feat: wire Company.isin through admin forms and company requests

Admins can set an ISIN when creating/editing/approving a company. The
request-company form accepts an optional ISIN and can be prefilled via
?name=&isin= query params, for the upcoming PDF-import review screen's
"request this company" link.
EOF
)"
```

---

### Task 3: PDF upload validation helper

**Files:**
- Modify: `src/lib/import-limits.ts`
- Modify: `tests/lib/import-limits.test.ts`

**Interfaces:**
- Produces: `checkPdfUpload(buffer: Buffer): string | null`, `MAX_PDF_BYTES: number` — consumed by Task 6's `parsePdfStatement` action.

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/import-limits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  checkImportSize,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_BYTES,
  checkPdfUpload,
  MAX_PDF_BYTES,
} from "@/lib/import-limits";

describe("checkImportSize", () => {
  // ...existing tests unchanged...
});

describe("checkPdfUpload", () => {
  function pdfBuffer(bodyLength = 16): Buffer {
    return Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(bodyLength)]);
  }

  it("returns null for a well-formed, in-limit PDF buffer", () => {
    expect(checkPdfUpload(pdfBuffer())).toBeNull();
  });

  it("rejects a buffer that doesn't start with the PDF magic bytes", () => {
    const buffer = Buffer.from("not a pdf at all");
    const error = checkPdfUpload(buffer);
    expect(error).toContain("does not look like a PDF");
  });

  it("rejects a buffer larger than the size limit", () => {
    const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(MAX_PDF_BYTES)]);
    const error = checkPdfUpload(oversized);
    expect(error).toContain("too large");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/import-limits.test.ts`
Expected: FAIL — `checkPdfUpload` and `MAX_PDF_BYTES` are not exported yet.

- [ ] **Step 3: Implement `checkPdfUpload`**

Add to `src/lib/import-limits.ts`:

```ts
// PDF statement uploads (see docs/superpowers/specs/2026-07-20-pdf-statement-import-design.md).
// Generous for a real multi-page statement, bounded against a pathological
// upload — checked before any parsing work starts.
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Pure guard, checked before any PDF parsing work. Confirms the upload is
 * within the size limit and actually starts with the PDF magic bytes
 * (`%PDF`), rejecting anything else immediately.
 */
export function checkPdfUpload(buffer: Buffer): string | null {
  if (buffer.length > MAX_PDF_BYTES) {
    return `PDF too large: ${(buffer.length / (1024 * 1024)).toFixed(1)}MB exceeds the ${MAX_PDF_BYTES / (1024 * 1024)}MB limit`;
  }
  if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    return "File does not look like a PDF";
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/import-limits.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import-limits.ts tests/lib/import-limits.test.ts
git commit -m "$(cat <<'EOF'
feat: add checkPdfUpload guard for statement uploads

Size- and magic-byte-checks a PDF upload before any parsing work starts,
mirroring checkImportSize's existing CSV-import guard.
EOF
)"
```

---

### Task 4: Trade Republic statement text parser (pure logic)

**Files:**
- Create: `src/lib/pdf-statement-parser.ts`
- Create: `tests/lib/pdf-statement-parser.test.ts`

**Interfaces:**
- Produces: `parseStatementText(text: string): (ParsedTradeRow | UnparsedRow)[]`, types `ParsedTradeRow` (`{ date: Date; type: "BUY" | "SELL"; isin: string; companyName: string; quantity: number; amount: number; pricePerShare: number }`) and `UnparsedRow` (`{ unparsed: true; raw: string }`) — consumed by Task 6's `parsePdfStatement` action.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/pdf-statement-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStatementText, type ParsedTradeRow, type UnparsedRow } from "@/lib/pdf-statement-parser";

function isParsed(row: ParsedTradeRow | UnparsedRow): row is ParsedTradeRow {
  return !("unparsed" in row);
}

describe("parseStatementText", () => {
  it("extracts a BUY row, stitching its wrapped TYPE column back together", () => {
    const text = [
      "TRANSACTIONS",
      "DATE TYPE DESCRIPTION ENTRÉE D'ARGENT SORTIE D'ARGENT SOLDE",
      "06 mai 2025 Virement Card Top up with ****0113 250,00 € 250,00 €",
      "13 mai 2025 Exécution",
      "d'ordre",
      "Buy trade HK0285041858 BYD ELECTRONIC (INTL) CO. LTD., quantity: 50",
      "206,25 € 43,75 €",
    ].join("\n");

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1); // the "Virement" row is dropped, not a trade

    const row = rows[0];
    expect(isParsed(row)).toBe(true);
    if (!isParsed(row)) throw new Error("expected a parsed row");
    expect(row.date.toISOString().slice(0, 10)).toBe("2025-05-13");
    expect(row.type).toBe("BUY");
    expect(row.isin).toBe("HK0285041858");
    expect(row.companyName).toBe("BYD ELECTRONIC (INTL) CO. LTD.");
    expect(row.quantity).toBe(50);
    expect(row.amount).toBeCloseTo(206.25);
    expect(row.pricePerShare).toBeCloseTo(4.125);
  });

  it("extracts a SELL row and parses French thousands-separated amounts", () => {
    const text = [
      "02 juin 2025 Exécution",
      "d'ordre",
      "Sell trade FR0000121014 LVMH MOET HENNESSY, quantity: 3",
      "1 234,56 € 9 876,54 €",
    ].join("\n");

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!isParsed(row)) throw new Error("expected a parsed row");
    expect(row.type).toBe("SELL");
    expect(row.isin).toBe("FR0000121014");
    expect(row.quantity).toBe(3);
    expect(row.amount).toBeCloseTo(1234.56);
    expect(row.pricePerShare).toBeCloseTo(411.52);
  });

  it("flags a trade-execution row with an unrecognized description as unparsed, not dropped", () => {
    const text = [
      "20 juin 2025 Exécution",
      "d'ordre",
      "Dividend payment HK0285041858 BYD ELECTRONIC (INTL) CO. LTD.",
      "12,50 € 500,00 €",
    ].join("\n");

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(isParsed(row)).toBe(false);
    if (isParsed(row)) throw new Error("expected an unparsed row");
    expect(row.unparsed).toBe(true);
    expect(row.raw).toContain("Dividend payment");
  });

  it("drops non-trade rows (e.g. transfers) entirely, without flagging them", () => {
    const text = "06 mai 2025 Virement Card Top up with ****0113 250,00 € 250,00 €";
    expect(parseStatementText(text)).toEqual([]);
  });

  it("flags a trade-execution row as unparsed if it's missing an amount/balance pair", () => {
    const text = [
      "13 mai 2025 Exécution",
      "d'ordre",
      "Buy trade HK0285041858 BYD ELECTRONIC (INTL) CO. LTD., quantity: 50",
      "206,25 €",
    ].join("\n");

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    expect(isParsed(rows[0])).toBe(false);
  });

  it("returns an empty array for text with no date-anchored rows", () => {
    expect(parseStatementText("TRANSACTIONS\nDATE TYPE DESCRIPTION")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/pdf-statement-parser.test.ts`
Expected: FAIL — `src/lib/pdf-statement-parser.ts` doesn't exist yet.

- [ ] **Step 3: Implement the parser**

Create `src/lib/pdf-statement-parser.ts`:

```ts
// Parses Trade Republic's French-locale periodic account statement
// ("SYNTHÈSE DU RELEVÉ DE COMPTE") PDF text into structured trade rows.
// Deterministic regex/layout parsing only — see
// docs/superpowers/specs/2026-07-20-pdf-statement-import-design.md.
//
// Known open item (see spec): the DIVIDEND row description format hasn't
// been confirmed against a real statement, only the "Buy trade"/"Sell
// trade" pattern has. A trade-execution-typed row whose description
// doesn't match that pattern is surfaced as `unparsed` rather than
// silently dropped, so a future DIVIDEND format can be added here once
// confirmed — until then those rows need manual entry.

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
};

const DATE_LINE = new RegExp(
  `^(\\d{1,2}) (${Object.keys(FRENCH_MONTHS).join("|")}) (\\d{4})`
);

// Trade Republic's TYPE column label for a buy/sell order execution.
// Confirmed via a redacted reference statement. Other TYPE values (e.g.
// "Virement" for a transfer) are not trade activity and are dropped.
const TRADE_TYPE_LABEL = "Exécution d'ordre";

const TRADE_DESCRIPTION =
  /(Buy|Sell) trade ([A-Z]{2}[A-Z0-9]{9}[0-9]) (.+?), quantity: (\d+)/;

// French-formatted money: comma decimal, optional space/non-breaking-space
// thousands separators, trailing €.
const MONEY = /(-?[\d\s ]{1,12},\d{2})\s?€/g;

export type ParsedTradeRow = {
  date: Date;
  type: "BUY" | "SELL";
  isin: string;
  companyName: string;
  quantity: number;
  amount: number;
  pricePerShare: number;
};

export type UnparsedRow = {
  unparsed: true;
  raw: string;
};

function parseFrenchDate(day: string, month: string, year: string): Date {
  const monthIndex = FRENCH_MONTHS[month];
  return new Date(Date.UTC(Number(year), monthIndex, Number(day)));
}

function parseFrenchAmount(raw: string): number {
  const cleaned = raw.replace(/[\s ]/g, "").replace(",", ".");
  return Number(cleaned);
}

function parseRow(buffer: string): ParsedTradeRow | UnparsedRow | null {
  const dateMatch = buffer.match(DATE_LINE);
  if (!dateMatch) return null;

  // Not a trade-execution row (e.g. a transfer) — not in scope, not flagged.
  if (!buffer.includes(TRADE_TYPE_LABEL)) return null;

  const date = parseFrenchDate(dateMatch[1], dateMatch[2], dateMatch[3]);

  const descMatch = buffer.match(TRADE_DESCRIPTION);
  if (!descMatch) {
    return { unparsed: true, raw: buffer.trim() };
  }

  const moneyMatches = [...buffer.matchAll(MONEY)];
  // The last money match on a row is always the running balance (SOLDE);
  // the one before it is the actual trade amount, regardless of whether it
  // came from the "money in" or "money out" column (only one of those two
  // is ever populated for a single row).
  if (moneyMatches.length < 2) {
    return { unparsed: true, raw: buffer.trim() };
  }

  const amount = parseFrenchAmount(moneyMatches[moneyMatches.length - 2][1]);
  const quantity = Number(descMatch[4]);

  return {
    date,
    type: descMatch[1] === "Buy" ? "BUY" : "SELL",
    isin: descMatch[2],
    companyName: descMatch[3].trim(),
    quantity,
    amount,
    pricePerShare: amount / quantity,
  };
}

/**
 * Splits extracted PDF text into logical statement rows (a date-anchored
 * line plus any lines that wrapped under it, joined back into one string),
 * then parses each into a trade row, an unparsed-but-trade-shaped row, or
 * drops it if it's not a trade-execution row at all.
 */
export function parseStatementText(text: string): (ParsedTradeRow | UnparsedRow)[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const buffers: string[] = [];
  for (const line of lines) {
    if (DATE_LINE.test(line)) {
      buffers.push(line);
    } else if (buffers.length > 0) {
      buffers[buffers.length - 1] += " " + line;
    }
  }

  const rows: (ParsedTradeRow | UnparsedRow)[] = [];
  for (const buffer of buffers) {
    const row = parseRow(buffer);
    if (row) rows.push(row);
  }
  return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/pdf-statement-parser.test.ts`
Expected: PASS, all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf-statement-parser.ts tests/lib/pdf-statement-parser.test.ts
git commit -m "$(cat <<'EOF'
feat: add Trade Republic statement text parser

Pure deterministic parser: stitches wrapped statement rows back together
by date-anchoring, extracts BUY/SELL trades via regex against the known
"Buy/Sell trade <ISIN> <NAME>, quantity: <N>" description pattern, and
flags (rather than drops) any trade-execution row whose description
doesn't match — e.g. dividends, whose exact format isn't confirmed yet.
EOF
)"
```

---

### Task 5: Company/duplicate matching helpers

**Files:**
- Create: `src/lib/pdf-import-matching.ts`
- Create: `tests/lib/pdf-import-matching.test.ts`

**Interfaces:**
- Consumes: `activeCompanyWhere`/`activeTransactionWhere` from `src/lib/prisma-where.ts`, `prisma` from `src/lib/prisma.ts`.
- Produces: `matchCompanyByIsin(isin: string): Promise<Company | null>`, `hasDuplicateTransaction(params: { userId: string; companyId: string; type: "BUY" | "SELL"; date: Date; shares: number }): Promise<boolean>` — consumed by Task 6 (`parsePdfStatement`) and Task 7 (`confirmPdfImport`).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/pdf-import-matching.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindFirstCompany, mockFindFirstTransaction } = vi.hoisted(() => ({
  mockFindFirstCompany: vi.fn(),
  mockFindFirstTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findFirst: mockFindFirstCompany },
    transaction: { findFirst: mockFindFirstTransaction },
  },
}));

import { matchCompanyByIsin, hasDuplicateTransaction } from "@/lib/pdf-import-matching";

beforeEach(() => {
  mockFindFirstCompany.mockReset();
  mockFindFirstTransaction.mockReset();
});

describe("matchCompanyByIsin", () => {
  it("looks up an active, approved company by ISIN", async () => {
    mockFindFirstCompany.mockResolvedValue({ id: "c1", isin: "HK0285041858" });
    const result = await matchCompanyByIsin("HK0285041858");
    expect(result).toEqual({ id: "c1", isin: "HK0285041858" });
    expect(mockFindFirstCompany).toHaveBeenCalledWith({
      where: { isin: "HK0285041858", status: "APPROVED", deletedAt: null },
    });
  });

  it("returns null when no company matches", async () => {
    mockFindFirstCompany.mockResolvedValue(null);
    const result = await matchCompanyByIsin("XX0000000000");
    expect(result).toBeNull();
  });
});

describe("hasDuplicateTransaction", () => {
  it("returns true when a matching transaction already exists that day", async () => {
    mockFindFirstTransaction.mockResolvedValue({ id: "t1" });
    const result = await hasDuplicateTransaction({
      userId: "u1",
      companyId: "c1",
      type: "BUY",
      date: new Date("2025-05-13"),
      shares: 50,
    });
    expect(result).toBe(true);
  });

  it("returns false when no matching transaction exists", async () => {
    mockFindFirstTransaction.mockResolvedValue(null);
    const result = await hasDuplicateTransaction({
      userId: "u1",
      companyId: "c1",
      type: "BUY",
      date: new Date("2025-05-13"),
      shares: 50,
    });
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/pdf-import-matching.test.ts`
Expected: FAIL — `src/lib/pdf-import-matching.ts` doesn't exist yet.

- [ ] **Step 3: Implement the matching helpers**

Create `src/lib/pdf-import-matching.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { activeCompanyWhere, activeTransactionWhere } from "@/lib/prisma-where";
import type { TransactionType } from "@prisma/client";

export async function matchCompanyByIsin(isin: string) {
  return prisma.company.findFirst({
    where: activeCompanyWhere({ isin, status: "APPROVED" }),
  });
}

/**
 * A row counts as a likely duplicate if the same user already has a
 * transaction for the same company, type, share count, and calendar day —
 * matching what re-uploading an overlapping statement date range would
 * produce.
 */
export async function hasDuplicateTransaction(params: {
  userId: string;
  companyId: string;
  type: TransactionType;
  date: Date;
  shares: number;
}): Promise<boolean> {
  const dayStart = new Date(params.date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(params.date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const existing = await prisma.transaction.findFirst({
    where: activeTransactionWhere({
      userId: params.userId,
      companyId: params.companyId,
      type: params.type,
      date: { gte: dayStart, lte: dayEnd },
      shares: params.shares,
    }),
  });
  return existing !== null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/pdf-import-matching.test.ts`
Expected: PASS, all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf-import-matching.ts tests/lib/pdf-import-matching.test.ts
git commit -m "feat: add ISIN company matching and duplicate-transaction detection"
```

---

### Task 6: `parsePdfStatement` Server Action

**Files:**
- Modify: `package.json` (add `pdf-parse` + `@types/pdf-parse`)
- Modify: `src/app/(dashboard)/import-transactions/actions.ts`
- Create: `tests/app/import-transactions-pdf-actions.test.ts`

**Interfaces:**
- Consumes: `checkPdfUpload` (Task 3), `parseStatementText` (Task 4), `matchCompanyByIsin`/`hasDuplicateTransaction` (Task 5), `requireAuth` from `src/lib/auth-guard.ts`.
- Produces: `parsePdfStatement(formData: FormData): Promise<ParsePdfResult>` where `ParsePdfResult = { rows: PdfReviewRow[] } | { error: string }`, and the `PdfReviewRow` type — both consumed by Task 8's `PdfImportPanel` and by Task 7's `confirmPdfImport`.

```ts
export type PdfReviewRow = {
  id: string;
  unparsed: boolean;
  raw?: string;
  date?: string; // YYYY-MM-DD
  type?: "BUY" | "SELL";
  isin?: string;
  companyName?: string;
  quantity?: number;
  pricePerShare?: number;
  amount?: number;
  matchedCompanyId?: string;
  matchedTicker?: string;
  isDuplicate: boolean;
};
```

- [ ] **Step 1: Install the PDF-to-text dependency**

Run: `npm install pdf-parse && npm install -D @types/pdf-parse`
Expected: `pdf-parse` added to `dependencies`, `@types/pdf-parse` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Write the failing tests**

Create `tests/app/import-transactions-pdf-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));
const { mockPdfParse } = vi.hoisted(() => ({ mockPdfParse: vi.fn() }));
const { mockMatchCompanyByIsin, mockHasDuplicateTransaction } = vi.hoisted(() => ({
  mockMatchCompanyByIsin: vi.fn(),
  mockHasDuplicateTransaction: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mockRequireAuth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("pdf-parse", () => ({ default: mockPdfParse }));
vi.mock("@/lib/pdf-import-matching", () => ({
  matchCompanyByIsin: mockMatchCompanyByIsin,
  hasDuplicateTransaction: mockHasDuplicateTransaction,
}));

import { parsePdfStatement } from "@/app/(dashboard)/import-transactions/actions";

const USER = { id: "user1", email: "user1@example.com", role: "USER" };
const COMPANY = { id: "company1", ticker: "BYD", isin: "HK0285041858" };

const STATEMENT_TEXT = [
  "13 mai 2025 Exécution",
  "d'ordre",
  "Buy trade HK0285041858 BYD ELECTRONIC (INTL) CO. LTD., quantity: 50",
  "206,25 € 43,75 €",
].join("\n");

function pdfFormData(bytes = "%PDF-1.4 fake content"): FormData {
  const fd = new FormData();
  const file = new File([bytes], "statement.pdf", { type: "application/pdf" });
  fd.set("file", file);
  return fd;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue(USER);
  mockPdfParse.mockReset();
  mockMatchCompanyByIsin.mockReset();
  mockHasDuplicateTransaction.mockReset().mockResolvedValue(false);
});

describe("parsePdfStatement", () => {
  it("rejects a non-PDF file before parsing", async () => {
    const res = await parsePdfStatement(pdfFormData("not a pdf"));
    expect(res).toEqual({ error: "File does not look like a PDF" });
    expect(mockPdfParse).not.toHaveBeenCalled();
  });

  it("returns a matched, non-duplicate row for a recognized BUY line", async () => {
    mockPdfParse.mockResolvedValue({ text: STATEMENT_TEXT });
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(false);

    const res = await parsePdfStatement(pdfFormData());
    if (!("rows" in res)) throw new Error("expected rows");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      unparsed: false,
      date: "2025-05-13",
      type: "BUY",
      isin: "HK0285041858",
      quantity: 50,
      matchedCompanyId: "company1",
      matchedTicker: "BYD",
      isDuplicate: false,
    });
  });

  it("flags a row with no matching company, leaving matchedCompanyId unset", async () => {
    mockPdfParse.mockResolvedValue({ text: STATEMENT_TEXT });
    mockMatchCompanyByIsin.mockResolvedValue(null);

    const res = await parsePdfStatement(pdfFormData());
    if (!("rows" in res)) throw new Error("expected rows");
    expect(res.rows[0].matchedCompanyId).toBeUndefined();
  });

  it("flags a matched row as a duplicate", async () => {
    mockPdfParse.mockResolvedValue({ text: STATEMENT_TEXT });
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(true);

    const res = await parsePdfStatement(pdfFormData());
    if (!("rows" in res)) throw new Error("expected rows");
    expect(res.rows[0].isDuplicate).toBe(true);
  });

  it("returns an error when the statement has no recognizable rows", async () => {
    mockPdfParse.mockResolvedValue({ text: "nothing to see here" });
    const res = await parsePdfStatement(pdfFormData());
    expect(res).toEqual({ error: "No transactions found in this statement" });
  });

  it("returns an error when the PDF can't be read", async () => {
    mockPdfParse.mockRejectedValue(new Error("bad PDF"));
    const res = await parsePdfStatement(pdfFormData());
    expect(res).toEqual({
      error: "Could not read PDF — the file may be corrupted or password-protected",
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/app/import-transactions-pdf-actions.test.ts`
Expected: FAIL — `parsePdfStatement` is not exported from the actions file yet.

- [ ] **Step 4: Implement `parsePdfStatement`**

Add to `src/app/(dashboard)/import-transactions/actions.ts` (alongside the existing `bulkImportTransactions`):

```ts
import pdfParse from "pdf-parse";
import { checkPdfUpload } from "@/lib/import-limits";
import { parseStatementText } from "@/lib/pdf-statement-parser";
import { matchCompanyByIsin, hasDuplicateTransaction } from "@/lib/pdf-import-matching";

export type PdfReviewRow = {
  id: string;
  unparsed: boolean;
  raw?: string;
  date?: string;
  type?: "BUY" | "SELL";
  isin?: string;
  companyName?: string;
  quantity?: number;
  pricePerShare?: number;
  amount?: number;
  matchedCompanyId?: string;
  matchedTicker?: string;
  isDuplicate: boolean;
};

export type ParsePdfResult = { rows: PdfReviewRow[] } | { error: string };

export async function parsePdfStatement(formData: FormData): Promise<ParsePdfResult> {
  const user = await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file uploaded" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sizeError = checkPdfUpload(buffer);
  if (sizeError) return { error: sizeError };

  let text: string;
  try {
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } catch {
    return { error: "Could not read PDF — the file may be corrupted or password-protected" };
  }

  const parsedRows = parseStatementText(text);
  if (parsedRows.length === 0) {
    return { error: "No transactions found in this statement" };
  }

  const rows: PdfReviewRow[] = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if ("unparsed" in row) {
      rows.push({ id: `row-${i}`, unparsed: true, raw: row.raw, isDuplicate: false });
      continue;
    }

    const company = await matchCompanyByIsin(row.isin);
    const isDuplicate = company
      ? await hasDuplicateTransaction({
          userId: user.id,
          companyId: company.id,
          type: row.type,
          date: row.date,
          shares: row.quantity,
        })
      : false;

    rows.push({
      id: `row-${i}`,
      unparsed: false,
      date: row.date.toISOString().slice(0, 10),
      type: row.type,
      isin: row.isin,
      companyName: row.companyName,
      quantity: row.quantity,
      pricePerShare: row.pricePerShare,
      amount: row.amount,
      matchedCompanyId: company?.id,
      matchedTicker: company?.ticker,
      isDuplicate,
    });
  }

  return { rows };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/app/import-transactions-pdf-actions.test.ts`
Expected: PASS, all 6 cases green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/"(dashboard)"/import-transactions/actions.ts \
  tests/app/import-transactions-pdf-actions.test.ts
git commit -m "$(cat <<'EOF'
feat: add parsePdfStatement Server Action

Validates the upload, extracts text via pdf-parse, runs it through the
Trade Republic parser, and annotates each row with its company match and
duplicate status for the review screen. Nothing is written to the
database yet, and neither the PDF nor its extracted text is persisted.
EOF
)"
```

---

### Task 7: `confirmPdfImport` Server Action

**Files:**
- Modify: `src/app/(dashboard)/import-transactions/actions.ts`
- Modify: `tests/app/import-transactions-pdf-actions.test.ts`

**Interfaces:**
- Consumes: `transactionSchema` from `src/lib/validation/transaction.ts`, `matchCompanyByIsin`/`hasDuplicateTransaction` (Task 5), the existing `ImportResult` type (already defined above `bulkImportTransactions` in this file).
- Produces: `confirmPdfImport(rows: ConfirmPdfRow[]): Promise<ImportResult>` where `ConfirmPdfRow = { date: string; type: "BUY" | "SELL"; isin: string; quantity: number; pricePerShare: number }` — consumed by Task 8's `PdfImportPanel`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/app/import-transactions-pdf-actions.test.ts`. Extend the existing mock blocks at the top of the file:

```ts
const { mockCreate, mockAuditCreate, mockTransaction } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));
```

(Add this `vi.mock("@/lib/prisma", ...)` block alongside the other `vi.mock` calls already at the top of the file — there isn't one yet in this file since `parsePdfStatement`'s tests only needed `pdf-import-matching` mocked.)

Update the `beforeEach` block to also reset the new mocks:

```ts
beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue(USER);
  mockPdfParse.mockReset();
  mockMatchCompanyByIsin.mockReset();
  mockHasDuplicateTransaction.mockReset().mockResolvedValue(false);
  mockCreate.mockReset().mockResolvedValue({ id: "new-txn" });
  mockAuditCreate.mockReset();
  mockTransaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      transaction: { create: mockCreate },
      auditLog: { create: mockAuditCreate },
    })
  );
});
```

Update the import line to also pull in `confirmPdfImport`:

```ts
import { parsePdfStatement, confirmPdfImport } from "@/app/(dashboard)/import-transactions/actions";
```

Add a new `describe` block:

```ts
describe("confirmPdfImport", () => {
  it("creates a transaction and audit log for a valid matched row", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(false);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "HK0285041858", quantity: 50, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(1);
    expect(res.skipped).toHaveLength(0);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("skips and does not create a row with no matching company", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(null);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "XX0000000000", quantity: 50, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips and does not create a row flagged as a duplicate", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(true);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "HK0285041858", quantity: 50, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(0);
    expect(res.skipped[0].reason).toContain("duplicate");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips a row that fails schema validation (e.g. non-positive quantity)", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "HK0285041858", quantity: 0, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/app/import-transactions-pdf-actions.test.ts`
Expected: the `parsePdfStatement` cases still pass; the new `confirmPdfImport` cases FAIL — not exported yet.

- [ ] **Step 3: Implement `confirmPdfImport`**

Add to `src/app/(dashboard)/import-transactions/actions.ts`, after `parsePdfStatement`:

```ts
export type ConfirmPdfRow = {
  date: string;
  type: "BUY" | "SELL";
  isin: string;
  quantity: number;
  pricePerShare: number;
};

export async function confirmPdfImport(rows: ConfirmPdfRow[]): Promise<ImportResult> {
  const user = await requireAuth();

  const skipped: { line: string; reason: string }[] = [];
  let created = 0;

  for (const row of rows) {
    const label = `${row.date} ${row.type} ${row.isin} x${row.quantity}`;

    // Re-validate through the same schema the manual form and CSV import
    // use — the client's numbers are a proposal, not the source of truth.
    const parsed = transactionSchema.safeParse({
      type: row.type,
      date: row.date,
      shares: row.quantity,
      pricePerShare: row.pricePerShare,
    });
    if (!parsed.success) {
      skipped.push({ line: label, reason: parsed.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }
    const { type, date, shares, pricePerShare } = parsed.data;

    // Re-resolve the company server-side by ISIN — never trust a
    // client-supplied companyId directly.
    const company = await matchCompanyByIsin(row.isin);
    if (!company) {
      skipped.push({ line: label, reason: `No approved company found for ISIN ${row.isin}` });
      continue;
    }

    if (
      await hasDuplicateTransaction({
        userId: user.id,
        companyId: company.id,
        type,
        date,
        shares: row.quantity,
      })
    ) {
      skipped.push({ line: label, reason: "Possible duplicate — already imported" });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          userId: user.id,
          companyId: company.id,
          type,
          date,
          shares,
          pricePerShare,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "transaction.pdfImport",
          targetType: "Transaction",
          targetId: txn.id,
          before: Prisma.DbNull,
          after: {
            companyTicker: company.ticker,
            type,
            date: date.toISOString(),
            shares: shares ?? null,
            pricePerShare: pricePerShare ?? null,
          },
        },
      });
    });

    created++;
  }

  revalidatePath("/overview");
  return { created, skipped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/import-transactions-pdf-actions.test.ts`
Expected: PASS, all 10 cases (6 from Task 6 + 4 new) green.

- [ ] **Step 5: Commit**

```bash
git add src/app/"(dashboard)"/import-transactions/actions.ts tests/app/import-transactions-pdf-actions.test.ts
git commit -m "$(cat <<'EOF'
feat: add confirmPdfImport Server Action

Re-validates every reviewed row through transactionSchema, re-resolves
the company server-side by ISIN, and re-checks for duplicates before
writing — the client's edited rows are a proposal, never trusted as
final. Each accepted row gets a Transaction + AuditLog entry, matching
bulkImportTransactions's existing pattern.
EOF
)"
```

---

### Task 8: PDF review UI and "Upload PDF" tab

**Files:**
- Create: `src/app/(dashboard)/import-transactions/pdf-import-panel.tsx`
- Modify: `src/app/(dashboard)/import-transactions/page.tsx`

**Interfaces:**
- Consumes: `parsePdfStatement`, `confirmPdfImport`, `PdfReviewRow`, `ConfirmPdfRow`, `ImportResult` (all from Task 6/7's `./actions`).

There's no existing precedent for component-level tests in this codebase (only `src/lib/` and Server Action logic are unit-tested). This task is verified via type-checking, linting, and a manual browser smoke test, matching that convention.

- [ ] **Step 1: Create the review panel**

Create `src/app/(dashboard)/import-transactions/pdf-import-panel.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  parsePdfStatement,
  confirmPdfImport,
  type PdfReviewRow,
  type ImportResult,
} from './actions';

type EditableRow = PdfReviewRow & { checked: boolean };

export function PdfImportPanel() {
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setParseError(null);
    setResult(null);
    const formData = new FormData();
    formData.set('file', file);
    startTransition(async () => {
      const res = await parsePdfStatement(formData);
      if ('error' in res) {
        setParseError(res.error);
        setRows(null);
        return;
      }
      setRows(
        res.rows.map((r) => ({
          ...r,
          checked: !r.unparsed && !r.isDuplicate && !!r.matchedCompanyId,
        }))
      );
    });
  };

  const updateRow = (id: string, patch: Partial<EditableRow>) => {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev));
  };

  const handleConfirm = () => {
    if (!rows) return;
    const toImport = rows.filter(
      (r) => r.checked && !r.unparsed && r.date && r.type && r.isin
    );
    startTransition(async () => {
      const res = await confirmPdfImport(
        toImport.map((r) => ({
          date: r.date!,
          type: r.type!,
          isin: r.isin!,
          quantity: r.quantity!,
          pricePerShare: r.pricePerShare!,
        }))
      );
      setResult(res);
      setRows(null);
    });
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="application/pdf"
        disabled={isPending}
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />

      {parseError && <p className="text-sm text-destructive">{parseError}</p>}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th></th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Company</th>
                  <th>Qty</th>
                  <th>Price/share</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td>
                      <input
                        type="checkbox"
                        checked={r.checked}
                        onChange={(e) => updateRow(r.id, { checked: e.target.checked })}
                      />
                    </td>
                    {r.unparsed ? (
                      <td colSpan={5} className="text-muted-foreground">
                        Couldn&apos;t parse: <code className="text-xs">{r.raw}</code>
                      </td>
                    ) : (
                      <>
                        <td>
                          <input
                            type="date"
                            value={r.date}
                            onChange={(e) => updateRow(r.id, { date: e.target.value })}
                          />
                        </td>
                        <td>{r.type}</td>
                        <td>
                          {r.matchedTicker ?? (
                            <a
                              className="text-primary underline"
                              href={`/request-company?name=${encodeURIComponent(r.companyName ?? '')}&isin=${encodeURIComponent(r.isin ?? '')}`}
                            >
                              {r.companyName} — request company
                            </a>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            value={r.quantity}
                            onChange={(e) => updateRow(r.id, { quantity: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={r.pricePerShare}
                            onChange={(e) =>
                              updateRow(r.id, { pricePerShare: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {r.isDuplicate
                            ? 'Possible duplicate'
                            : r.matchedTicker
                              ? 'Matched'
                              : 'No matching company'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Importing…' : 'Import selected'}
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-sm">
            Created: <span className="font-semibold text-primary">{result.created}</span>
          </p>
          {result.skipped.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  <code className="text-xs bg-muted px-1 rounded">{s.line}</code> — {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the "Upload PDF" tab to the import page**

Replace `src/app/(dashboard)/import-transactions/page.tsx` entirely with:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeading } from '@/components/layout/page-heading';
import { bulkImportTransactions, type ImportResult } from './actions';
import { PdfImportPanel } from './pdf-import-panel';

export default function ImportTransactionsPage() {
  const [tab, setTab] = useState<'csv' | 'pdf'>('csv');
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleImport = () => {
    startTransition(async () => {
      const res = await bulkImportTransactions(csvText);
      setResult(res);
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeading>Import transactions</PageHeading>

      <div className="flex gap-2">
        <Button variant={tab === 'csv' ? 'default' : 'outline'} onClick={() => setTab('csv')}>
          Paste CSV
        </Button>
        <Button variant={tab === 'pdf' ? 'default' : 'outline'} onClick={() => setTab('pdf')}>
          Upload PDF
        </Button>
      </div>

      {tab === 'csv' && (
        <Card>
          <CardHeader>
            <CardTitle>Paste CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Format: <code>date,ticker,type,shares,pricePerShare,amount</code>{' '}
              (header row required). For DIVIDEND types, set amount; for BUY/SELL,
              set shares and pricePerShare.
            </p>
            <textarea
              className="w-full h-48 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder={`date,ticker,type,shares,pricePerShare,amount\n2024-01-15,AAPL,BUY,10,150.50,\n2024-03-20,MSFT,DIVIDEND,,,25.00`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <Button onClick={handleImport} disabled={isPending || !csvText.trim()}>
              {isPending ? 'Importing…' : 'Import'}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'pdf' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Trade Republic statement</CardTitle>
          </CardHeader>
          <CardContent>
            <PdfImportPanel />
          </CardContent>
        </Card>
      )}

      {tab === 'csv' && result && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.error ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <>
                <p className="text-sm">
                  Created:{' '}
                  <span className="font-semibold text-primary">{result.created}</span>
                </p>
                {result.skipped.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">
                      Skipped ({result.skipped.length}):
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
                      {result.skipped.map((s, i) => (
                        <li key={i}>
                          <code className="text-xs bg-muted px-1 rounded">{s.line}</code>
                          {' — '}
                          {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev:next` (against your local Postgres with an `APPROVED` company whose `isin` you've set via `/admin/companies/[id]/edit`), then in the browser:
1. Go to `/import-transactions`, click "Upload PDF".
2. Upload a Trade Republic statement PDF (or, if you don't have a real one handy, any PDF — confirm it fails gracefully with "No transactions found in this statement" rather than crashing).
3. If using a real statement: confirm the review table shows extracted rows, a matched company shows its ticker, an unmatched ISIN shows the "request company" link (and that clicking it prefills `/request-company`), editing a field updates the row, and "Import selected" creates transactions and reports the result.

Expected: no crashes; error and success paths both render sensibly.

- [ ] **Step 5: Commit**

```bash
git add src/app/"(dashboard)"/import-transactions/pdf-import-panel.tsx \
  src/app/"(dashboard)"/import-transactions/page.tsx
git commit -m "$(cat <<'EOF'
feat: add PDF statement upload UI to import-transactions

New "Upload PDF" tab alongside the existing "Paste CSV" tab. Parsed rows
land in an editable review table — matched/unmatched/duplicate/unparsed
status per row, "request company" shortcut for unmatched ISINs — nothing
is imported until the user confirms.
EOF
)"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, including the new `pdf-statement-parser`, `pdf-import-matching`, and `import-transactions-pdf-actions` suites.

- [ ] **Step 2: Lint and type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully. (If this fails for reasons unrelated to this feature — e.g. missing `DATABASE_URL` in your shell — that's a pre-existing environment concern, not something introduced by this plan; resolve or note it separately.)

- [ ] **Step 4: Re-verify against the spec**

Re-read `docs/superpowers/specs/2026-07-20-pdf-statement-import-design.md` section by section and confirm each is implemented:
- Data model change (Task 1)
- Upload & parsing pipeline (Tasks 3, 4, 6)
- Review screen & confirm/import, including re-validation and duplicate/company re-resolution server-side (Tasks 7, 8)
- Error handling & edge cases: non-PDF, corrupted/encrypted PDF, zero-row statement, partial success, size cap, `requireAuth()` on both actions (Tasks 6, 7)
- Testing coverage for the new parser, matching, and action modules (Tasks 4, 5, 6, 7)

Expected: no gaps. The DIVIDEND and savings-plan description formats remain the one explicitly-acknowledged open item from the spec — confirm it's still documented in `pdf-statement-parser.ts`'s header comment (Task 4, Step 3) rather than silently missing.

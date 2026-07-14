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

## Session 9: CSV Export, Docs, Prod Readiness

**Context recap:** Final polish session. Adds the CSV export improvement (round-trips data back out, since the source of truth started as a CSV), writes the app's own `AGENTS.md`/`CLAUDE.md` (documenting the hard rules from Global Constraints for future contributors), a `.env.example` check, README, and the production Dockerfile/compose files — not wired into Caddy yet (per the "local only for now" decision), but ready for that step whenever the user chooses to expose it.

**Revision note:** this session was revised after an early plan review (`analysis.md` items 2a/2b/4b/5c) — the biggest change is that `toCsvField`'s formula-injection "mitigation" didn't actually work (double-quoting is a CSV escaping mechanism, stripped before the value reaches a spreadsheet's formula interpreter; it does nothing to stop `=SUM(...)`-style content from being evaluated as a formula once opened). It's replaced with the real OWASP-recommended fix (a leading apostrophe on values starting with `=+-@`/tab/CR), and the test now actually asserts that property instead of just asserting the value got quoted. Self-service password change was also added to the `/settings` page Session 6 built, since Session 5's admin-side reset was the only password-change path before this. A global `not-found.tsx` and `error.tsx` page were added — the plan previously had no custom error/404 pages anywhere, defaulting to Next.js's bare built-in fallback (noted during a fifth independent review pass).

**Prerequisites:** All prior sessions complete.

**Files to create:**
- `/home/adil/projects/trades/src/lib/export-utils.ts`
- `/home/adil/projects/trades/src/app/api/export/route.ts`
- `/home/adil/projects/trades/src/app/not-found.tsx`
- `/home/adil/projects/trades/src/app/error.tsx`
- `/home/adil/projects/trades/AGENTS.md`
- `/home/adil/projects/trades/CLAUDE.md`
- `/home/adil/projects/trades/README.md`
- `/home/adil/projects/trades/Dockerfile`
- `/home/adil/projects/trades/docker-compose.yml`
- `/home/adil/projects/trades/scripts/docker-entrypoint.sh`
- `/home/adil/projects/trades/src/lib/validation/settings.ts` (change-password schema)

- [ ] **Step 1: Write `src/lib/export-utils.ts`**

```typescript
/**
 * Escapes a field for CSV and neutralizes formula injection.
 *
 * These are two DIFFERENT mechanisms, easy to conflate:
 * - CSV escaping (wrap in quotes, double internal quotes) protects the
 *   *file's row/column structure* from a value containing a comma, quote,
 *   or newline. It is stripped by the CSV parser before the value ever
 *   reaches a spreadsheet's cell-content interpreter.
 * - Formula-injection neutralization protects the *cell content itself*
 *   from being evaluated as a formula once opened in Excel/Sheets/etc. A
 *   value like `=SUM(A1)` is still a live formula whether or not it's
 *   CSV-quoted — quoting alone does NOT prevent this (an earlier version of
 *   this function claimed it did; it didn't, see analysis.md 2a). The real,
 *   OWASP-recommended fix is prefixing the *content* with a literal
 *   apostrophe before a leading =, +, -, @, tab, or CR — spreadsheet apps
 *   treat a leading apostrophe as a "force text" marker that survives CSV
 *   parsing and disables formula evaluation for that cell.
 *
 * Exploitability this closes: Company.name can come from an unsanitized
 * user-submitted company request (Session 8's requestCompany) and flows
 * directly into every user's CSV export via t.company.name below.
 */
export function toCsvField(value: string | number | null): string {
  if (value === null) return "";
  let str = String(value);

  // Formula-injection guard: applied to the CONTENT first, before CSV escaping.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  const needsEscaping = /[",\n]/.test(str);
  if (!needsEscaping) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(toCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(toCsvField).join(","));
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Write `tests/lib/export-utils.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { toCsv, toCsvField } from "@/lib/export-utils";

describe("toCsvField", () => {
  it("passes through plain values", () => {
    expect(toCsvField("hello")).toBe("hello");
  });
  it("quotes values containing commas", () => {
    expect(toCsvField("a,b")).toBe('"a,b"');
  });
  it("prefixes a leading apostrophe on formula-triggering characters, which is the actual mitigation", () => {
    // The property that matters is the leading apostrophe surviving into
    // the cell content — not just that the field got CSV-quoted (that was
    // the bug: quoting alone doesn't stop formula evaluation).
    expect(toCsvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(toCsvField("+1+1")).toBe("'+1+1");
    expect(toCsvField("-1")).toBe("'-1");
    expect(toCsvField("@evil")).toBe("'@evil");
  });
  it("still CSV-escapes a formula-prefixed value that also contains a comma", () => {
    expect(toCsvField("=SUM(A1),B1")).toBe('"\'=SUM(A1),B1"');
  });
});

describe("toCsv", () => {
  it("joins headers and rows", () => {
    expect(toCsv(["a", "b"], [[1, 2], [3, 4]])).toBe("a,b\n1,2\n3,4");
  });
});
```

- [ ] **Step 3: Run and confirm the new tests pass**

```bash
npx vitest run tests/lib/export-utils.test.ts
```

- [ ] **Step 4: Write `src/app/api/export/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/export-utils";

export async function GET() {
  const result = await requireAuthApi();
  if ("error" in result) return result.error;

  const transactions = await prisma.transaction.findMany({
    where: { userId: result.id, deletedAt: null },
    include: { company: { select: { name: true, ticker: true } } },
    orderBy: { date: "asc" },
  });

  const csv = toCsv(
    ["Date", "Company", "Ticker", "Type", "Shares", "Price/Share", "Amount", "Purified"],
    transactions.map((t) => [
      t.date.toISOString().slice(0, 10),
      t.company.name,
      t.company.ticker,
      t.type,
      t.shares?.toString() ?? "",
      t.pricePerShare?.toString() ?? "",
      t.amount?.toString() ?? "",
      t.purifiedAt ? "yes" : "no",
    ])
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="transactions.csv"',
    },
  });
}
```

- [ ] **Step 5: Extend the settings page with CSV export and self-service password change**

`src/app/(dashboard)/settings/page.tsx` already exists from Session 6 (built there specifically so the sidebar link never dead-ends). Add the export link and a password-change form to it — do not recreate the file.

First, `src/lib/validation/settings.ts`:

```typescript
import { z } from "zod";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

Then add `changePassword` to a new `src/app/(dashboard)/settings/actions.ts`:

```typescript
"use server";

import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validation/settings";

export async function changePassword(input: unknown) {
  const user = await requireAuth();
  const data = changePasswordSchema.parse(input);

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const valid = await bcrypt.compare(data.currentPassword, dbUser.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(data.newPassword, 12);
  // Bump tokenVersion so this device's own current session is also forced
  // to re-authenticate — consistent with how admin-initiated resets behave
  // (Session 5), and closes the loop on tokenVersion actually meaning
  // something (Session 2's proxy.ts enforces it).
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
}
```

Then update the page itself:

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { ChangePasswordForm } from "./change-password-form";

export default async function SettingsPage() {
  await requireAuth();
  const { transactionFee } = await getSettings();

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Current transaction fee (used in breakeven calculations): {transactionFee.toFixed(2)}.
        This is set globally by an admin.
      </p>
      <a href="/api/export" className="text-sm underline">
        Export my transactions (CSV)
      </a>
      <ChangePasswordForm />
    </div>
  );
}
```

And `src/app/(dashboard)/settings/change-password-form.tsx` — a small `react-hook-form` + `zodResolver(changePasswordSchema)` client component calling `changePassword`, following the same shape as every other form in this plan (Session 4's `CompanyForm` is the template), showing a success/error message inline since a redirect after a settings change would be jarring UX.

- [ ] **Step 5b: Write global error and not-found pages**

The plan builds individual route segments but never adds root-level error or 404 pages. Next.js App Router's default fallback is a bare "An error occurred" / "404" page — adding real ones is a small polish step that fits naturally in this session alongside the rest of the docs/readiness work.

`src/app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link href="/overview" className="text-sm underline">
        Go to overview
      </Link>
    </div>
  );
}
```

`src/app/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">An unexpected error occurred.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

These two files are already included in Step 13's `git add` command, which lists them explicitly alongside the rest of this session's files.

- [ ] **Step 6: Write `AGENTS.md`**

```markdown
# AGENTS.md

Conventions for this app (mirrors ~/laraib/projects/hisab, cookbook, bake_em_up).

## Hard rules

- Every Server Action and API route handler calls `requireAuth()` /
  `requireAuthApi()` as its first line, even on routes proxy.ts also
  gates. Two sibling-app incidents were caused by skipping this — do not
  rely on proxy/layout checks alone.
- `Company` and `Transaction` are soft-deleted via `deletedAt`. Every
  query must filter `deletedAt: null` unless intentionally listing
  deleted history.
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

## Testing

Vitest, `tests/` mirrors `src/`. `src/lib/calculations.ts` is the most
test-critical file in the app — any change to its formulas needs a
corresponding test case, including re-verifying against the worked
example in `averaging_down.md`.

## Known simplifications (documented, not bugs)

- `src/lib/settings.ts`'s `getSettings()` cache is a plain module-level
  variable — not shared across processes. Fine for the current
  single-container deployment; would need a shared cache (or no caching at
  all — it's a single-row lookup) if ever scaled to multiple instances.
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
```

- [ ] **Step 7: Write `CLAUDE.md`**

```markdown
@AGENTS.md
```

- [ ] **Step 8: Write `README.md`** with setup steps: clone, `cp .env.example .env` (fill in `AUTH_SECRET` via `npx auth secret`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`), `npm run dev` (Docker dev stack), `npm run db:seed`, visit `localhost:3000/login`.

- [ ] **Step 9: Write prod `Dockerfile`** (multi-stage, Next standalone output, non-root user)

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

Add `output: "standalone"` to `next.config.ts` for this to work.

- [ ] **Step 10: Write `scripts/docker-entrypoint.sh`**

```bash
#!/bin/sh
set -e

: "${AUTH_SECRET:?AUTH_SECRET must be set}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "Running database migrations..."
for i in 1 2 3 4 5; do
  npx prisma migrate deploy && break
  echo "Migration attempt $i failed, retrying in 5s..."
  sleep 5
done

exec "$@"
```

- [ ] **Step 11: Write prod `docker-compose.yml`** (no published app port — joins external `caddy_net` per `~/laraib/projects/CADDY-DEPLOYMENT.md`, not activated until the user decides to expose this app)

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: trades
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
      POSTGRES_DB: trades
    volumes:
      - trades_pg_data:/var/lib/postgresql/data

  app:
    build: .
    environment:
      DATABASE_URL: postgresql://trades:${POSTGRES_PASSWORD:?}@db:5432/trades
      AUTH_SECRET: ${AUTH_SECRET:?}
      AUTH_URL: ${AUTH_URL:?}
      AUTH_TRUST_HOST: "true"
    depends_on:
      - db
    networks:
      - default
      - caddy_net

networks:
  caddy_net:
    external: true

volumes:
  trades_pg_data:
```

This file is written but **not activated** — `caddy_net` won't exist unless the user has already run the Caddy setup from the sibling apps. Activating this (creating the network, adding a Caddyfile domain block) is a deliberate follow-up step, not part of this plan, since the design decision was "local only for now."

- [ ] **Step 12: Verify**

```bash
npx vitest run
npm run lint
npx tsc --noEmit
```

Expected: all pass. Then full manual end-to-end pass per the original plan's Verification section: seed admin → create company → create user → log in as user → request company → admin approves → user adds BUY/SELL/DIVIDEND → dashboard shows correct numbers → mark purified → CSV export downloads and contains the right rows. Additionally: create a company with a name starting with `=` (e.g. `=cmd|'/c calc'!A1`), add a transaction, export CSV, and open the raw file in a text editor to confirm the field reads `'=cmd|'/c calc'!A1` (leading apostrophe present) — this is the actual proof the formula-injection fix works, not just that the CSV round-trips.

Since the source `trades_template - current.csv` has no fully clean "gold" row to validate a migration against (row 81, `xylem inc.`, contains `#VALUE!` Excel error artifacts — see `analysis.md` 5c), manually cross-check the bulk-imported `nonCompliantPct` for a handful of *other* rows (e.g. `asml holding n.v.` → `0.64`, `fielmann group ag` → `0.05`) against what `/admin/companies` displays after import, rather than trusting the import succeeded just because it reported a row count.

- [ ] **Step 13: Commit**

```bash
git add src/lib/export-utils.ts src/app/api/export src/app/not-found.tsx src/app/error.tsx tests/lib/export-utils.test.ts src/lib/validation/settings.ts "src/app/(dashboard)/settings" AGENTS.md CLAUDE.md README.md Dockerfile docker-compose.yml scripts/docker-entrypoint.sh next.config.ts
git commit -m "feat: add CSV export with real formula-injection protection, self-service password change, prod Docker setup, and project documentation"
```

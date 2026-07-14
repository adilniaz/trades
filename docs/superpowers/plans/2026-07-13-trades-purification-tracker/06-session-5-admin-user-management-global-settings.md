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

## Session 5: Admin — User Management & Global Settings

**Context recap:** Admin needs to create user accounts directly (no public signup, per Global Constraints) and edit the single global `transactionFee` setting used by the break-even calculation (Session 3). This follows the exact CRUD pattern established in Session 4.

**Revision note:** this session was revised after an early plan review (`analysis.md` items 2b/2e/3e/3f/4c/4d):
- Admin can now reset a user's password (there was previously no path to change a password anywhere in the app).
- `setUserActive` and `updateTransactionFee` now write `AuditLog` rows, and a new admin audit log view page lets admin see the history.
- Password resets bump `tokenVersion`, which Session 2's `proxy.ts` now actually enforces (forces re-login on the next request).
- Added `/admin/reports`, an aggregate view summing purification totals across all users.
- `getSettings()`'s cache limitation is now called out explicitly in-code, not just implied.
- The comment claiming this pattern "matches `bake_em_up`'s `Setting` model usage" was removed — that app isn't in this repo, so the claim was unverifiable by a fresh session; the pattern is explained standalone instead.

**Prerequisites:** Sessions 1–2 complete. Independent of Session 4 (different resource) but expected to run after it so the established pattern is fresh.

**Files to create:**
- `/home/adil/projects/trades/src/lib/validation/user.ts`
- `/home/adil/projects/trades/src/lib/settings.ts`
- `/home/adil/projects/trades/src/app/admin/users/page.tsx`
- `/home/adil/projects/trades/src/app/admin/users/actions.ts`
- `/home/adil/projects/trades/src/app/admin/users/new/page.tsx`
- `/home/adil/projects/trades/src/app/admin/settings/page.tsx`
- `/home/adil/projects/trades/src/app/admin/settings/actions.ts`
- `/home/adil/projects/trades/src/app/admin/audit-log/page.tsx`
- `/home/adil/projects/trades/src/app/admin/reports/page.tsx`

- [ ] **Step 1: Write `src/lib/validation/user.ts`**

```typescript
import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "USER"]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

- [ ] **Step 2: Write `src/lib/settings.ts`** (module-level cached read)

```typescript
import { prisma } from "@/lib/prisma";

let cache: { transactionFee: number; displayCurrency: string } | null = null;
let cachedAt = 0;
const TTL_MS = 60_000;

// Caution: this cache is a plain module-level variable, so it is NOT shared
// across processes/containers. If this app is ever deployed with more than
// one app instance, different instances can serve a stale transactionFee
// for up to TTL_MS after an admin changes it, with no cross-instance
// invalidation. Acceptable for the current single-container deployment
// target (see analysis.md 4c) — if that changes, replace this with a
// shared cache (Redis) or drop caching entirely (a single-row lookup on a
// tiny table doesn't really need it).
export async function getSettings(): Promise<{
  transactionFee: number;
  displayCurrency: string;
}> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;

  const [feeRow, currencyRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "transactionFee" } }),
    prisma.setting.findUnique({ where: { key: "displayCurrency" } }),
  ]);
  cache = {
    transactionFee: feeRow ? Number(feeRow.value) : 0,
    displayCurrency: currencyRow?.value ?? "USD",
  };
  cachedAt = Date.now();
  return cache;
}

export async function setTransactionFee(fee: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "transactionFee" },
    update: { value: String(fee) },
    create: { key: "transactionFee", value: String(fee) },
  });
  cache = null; // invalidate
}
```

- [ ] **Step 3: Write `src/app/admin/users/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { createUserSchema, resetPasswordSchema } from "@/lib/validation/user";
import { Prisma } from "@prisma/client";

// Same Prisma.DbNull requirement as Session 4's actions.ts — a bare `null`
// in a Json?-typed field fails tsc/throws at runtime; Prisma.DbNull is the
// correct "no value" sentinel.

export async function createUser(input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const data = createUserSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { email: data.email, role: data.role, passwordHash },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "user.create",
      targetType: "User",
      targetId: user.id,
      before: Prisma.DbNull,
      after: { email: data.email, role: data.role },
    },
  });
  revalidatePath("/admin/users");
}

export async function setUserActive(id: string, active: boolean) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const before = await prisma.user.findUnique({ where: { id }, select: { active: true } });
  // tokenVersion bump is now load-bearing, not just forward-compatible: it's
  // what forces an already-logged-in session to be rejected on its next
  // request (src/proxy.ts, Session 2), rather than staying valid until the
  // JWT's 24h natural expiry.
  await prisma.user.update({ where: { id }, data: { active, tokenVersion: { increment: 1 } } });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: active ? "user.activate" : "user.deactivate",
      targetType: "User",
      targetId: id,
      before: { active: before?.active ?? null },
      after: { active },
    },
  });
  revalidatePath("/admin/users");
}

export async function resetUserPassword(id: string, input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const data = resetPasswordSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  // Bump tokenVersion here too — a password reset should invalidate any
  // session issued under the old password, not just future login attempts
  // (see analysis.md 2b/2e; this was the missing piece that made the
  // fetched-but-unused tokenVersion field dead weight before).
  await prisma.user.update({
    where: { id },
    data: { passwordHash, tokenVersion: { increment: 1 }, ...resetLockoutStateForAdminReset() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "user.resetPassword",
      targetType: "User",
      targetId: id,
      before: Prisma.DbNull,
      after: Prisma.DbNull, // never store password hashes or plaintext in the audit log
    },
  });
  revalidatePath("/admin/users");
}

// Also clears any lockout, so a reset password isn't immediately unusable
// if the account happened to be locked out at reset time.
function resetLockoutStateForAdminReset() {
  return { failedAttempts: 0, lockedUntil: null };
}
```

- [ ] **Step 4: Write `src/app/admin/users/page.tsx`**

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserRowActions } from "./user-row-actions";

export default async function AdminUsersPage() {
  await requireAuth({ roles: ["ADMIN"] });
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Users</h1>
        <Button asChild>
          <Link href="/admin/users/new">Add user</Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.active ? "Yes" : "No"}</TableCell>
              <TableCell>
                <UserRowActions id={u.id} active={u.active} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

Create `src/app/admin/users/user-row-actions.tsx` as a small client component with a "Deactivate"/"Activate" button calling `setUserActive(id, !active)`, plus a "Reset password" button that prompts for a new password (a simple `window.prompt` is acceptable at this scale, same reasoning as Session 8's `window.confirm` for mark-as-purified) and calls `resetUserPassword(id, { password })`, showing a success message. Admin is responsible for relaying the new password to the user out of band (email, in person) — there is no in-app notification mechanism.

- [ ] **Step 5: Write `src/app/admin/users/new/page.tsx`**

Client component form for `email`/`password`/`role` (a `<select>` for role, defaulting to `USER`) calling `createUser`, then `router.push("/admin/users")` — same shape as Session 4 Step 6's `CompanyForm`/`new/page.tsx` pair. Use `createUserSchema` with `zodResolver`.

- [ ] **Step 6: Write `src/app/admin/settings/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { getSettings, setTransactionFee } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const feeSchema = z.object({ transactionFee: z.coerce.number().min(0) });

export async function updateTransactionFee(input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const { transactionFee } = feeSchema.parse(input);
  const before = await getSettings();
  await setTransactionFee(transactionFee);
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "setting.transactionFee",
      targetType: "Setting",
      targetId: "transactionFee",
      before: { transactionFee: before.transactionFee },
      after: { transactionFee },
    },
  });
  revalidatePath("/admin/settings");
}
```

- [ ] **Step 7: Write `src/app/admin/settings/page.tsx`**

Server Component that calls `requireAuth({ roles: ["ADMIN"] })` and `getSettings()`, rendering a single-field form (client subcomponent) pre-filled with the current `transactionFee`, submitting to `updateTransactionFee`.

- [ ] **Step 7b: Write `src/app/admin/audit-log/page.tsx`**

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AuditLogPage() {
  await requireAuth({ roles: ["ADMIN"] });

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { email: true } } },
  });

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Audit log</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Admin</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{e.createdAt.toISOString()}</TableCell>
              <TableCell>{e.actor.email}</TableCell>
              <TableCell>{e.action}</TableCell>
              <TableCell>
                {e.targetType}:{e.targetId}
              </TableCell>
              <TableCell className="max-w-xs truncate font-mono text-xs">
                {e.before ? JSON.stringify(e.before) : "—"}
              </TableCell>
              <TableCell className="max-w-xs truncate font-mono text-xs">
                {e.after ? JSON.stringify(e.after) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 7c: Write `src/app/admin/reports/page.tsx`** (aggregate purification totals across all users)

```tsx
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { purifiableGains, purifiableDividends, type Txn } from "@/lib/calculations";

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

export default async function AdminReportsPage() {
  await requireAuth({ roles: ["ADMIN"] });
  const { displayCurrency } = await getSettings();

  const companies = await prisma.company.findMany({
    where: { status: "APPROVED", deletedAt: null },
    include: { transactions: { where: { deletedAt: null } } },
  });

  // Group by user so admin can see per-user totals, not just one grand total.
  const byUser = new Map<string, { gainsToPurify: number; dividendsToPurify: number }>();

  for (const c of companies) {
    const pct = Number(c.nonCompliantPct) / 100;
    const byUserTxns = new Map<string, Txn[]>();
    for (const t of c.transactions) {
      const list = byUserTxns.get(t.userId) ?? [];
      list.push(toTxn(t));
      byUserTxns.set(t.userId, list);
    }
    for (const [userId, txns] of byUserTxns) {
      const acc = byUser.get(userId) ?? { gainsToPurify: 0, dividendsToPurify: 0 };
      acc.gainsToPurify += purifiableGains(txns, pct);
      acc.dividendsToPurify += purifiableDividends(txns, pct);
      byUser.set(userId, acc);
    }
  }

  const userIds = [...byUser.keys()];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const grandTotal = [...byUser.values()].reduce(
    (acc, v) => ({
      gainsToPurify: acc.gainsToPurify + v.gainsToPurify,
      dividendsToPurify: acc.dividendsToPurify + v.dividendsToPurify,
    }),
    { gainsToPurify: 0, dividendsToPurify: 0 }
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Purification totals across all users</h1>
      <div className="flex gap-6 text-sm">
        <div className="rounded border p-3">
          <div className="text-muted-foreground">Grand total gains to purify</div>
          <div className="text-lg font-semibold">
            {grandTotal.gainsToPurify.toFixed(2)} {displayCurrency}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-muted-foreground">Grand total dividends to purify</div>
          <div className="text-lg font-semibold">
            {grandTotal.dividendsToPurify.toFixed(2)} {displayCurrency}
          </div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>User</th>
            <th>Gains to purify</th>
            <th>Dividends to purify</th>
          </tr>
        </thead>
        <tbody>
          {[...byUser.entries()].map(([userId, v]) => (
            <tr key={userId}>
              <td>{emailById.get(userId) ?? userId}</td>
              <td>{v.gainsToPurify.toFixed(2)} {displayCurrency}</td>
              <td>{v.dividendsToPurify.toFixed(2)} {displayCurrency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Add `/admin/reports` and `/admin/audit-log` links to `Sidebar`'s admin section when Session 6 builds it (note left here since Session 6 depends on this session's routes existing).

- [ ] **Step 8: Verify**

As admin: create a new user (`USER` role), confirm it appears in the list and can log in. Deactivate it, confirm that account can no longer log in (blocked in `authorize()` via `!user.active`) and — with `tokenVersion` enforcement now wired in Session 2's `proxy.ts` — that an already-logged-in session for that user is rejected on its very next navigation, not just on the next login attempt. Reset a test user's password via the admin UI, confirm the old password no longer works and the new one does, and confirm their existing session (if any) is forced to re-login. Edit the transaction fee to `2`, confirm `getSettings()` reflects it (add a temporary `console.log` or check via Prisma Studio) after the 60s cache window or a server restart. Check `/admin/audit-log` shows entries for the deactivation, password reset, and fee change. Once Sessions 6–8 exist and some users have transactions, check `/admin/reports` sums match the sum of each user's own `/overview` figures.

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/user.ts src/lib/settings.ts src/app/admin/users src/app/admin/settings src/app/admin/audit-log src/app/admin/reports
git commit -m "feat: add admin user management, password reset, audit log, and cross-user reports"
```

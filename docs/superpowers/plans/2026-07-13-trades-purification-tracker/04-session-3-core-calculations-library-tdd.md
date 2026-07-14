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

## Session 3: Core Calculations Library (TDD)

**Context recap:** This is the highest-value, highest-risk piece of business logic in the app and has no UI dependency, so it's built test-first and in isolation. It implements the position/cost-basis/purification/break-even math described in the plan's Context section, including the break-even formula from `/home/adil/projects/trades/averaging_down.md`. Every later session that shows numbers to a user (dashboard, per-company page) imports from this module — get the signatures right here.

**Prerequisites:** Session 0 complete (Vitest installed). Independent of Sessions 1–2 — can be built in parallel with them if running multiple sessions concurrently, since it has no DB or auth dependency.

**Revision note:** this session was revised after an early plan review (see `analysis.md` items 1a/1d) — `breakeven()` now counts the anticipated future sale of the remaining position (matching `averaging_down.md`'s `2k+2`, fixing a fee-count bug that made every test off by one fee), and `Txn` gained a `date` field so `realizedGains`/`purifiableGains` sort internally instead of relying on callers to pre-sort (the old unenforced "callers must pre-sort" contract was already violated by Session 7's code). A `dividendsTotal` test for returns-0-when-no-dividends was added to round out coverage of that function — it was the only exported function in the module with fewer than two test cases.

**Interfaces produced (used by Sessions 6–8):**
```typescript
type Txn = {
  type: "BUY" | "SELL" | "DIVIDEND";
  date: Date;
  shares: number | null;
  pricePerShare: number | null;
  amount: number | null;
  purifiedAt: Date | null;
};

function position(txns: Txn[]): number;
function avgCost(txns: Txn[]): number | null; // null if no shares ever bought
function realizedGains(txns: Txn[]): number;
function dividendsTotal(txns: Txn[]): number;
function purifiableGains(txns: Txn[], nonCompliantPct: number): number; // unpurified only
function purifiableDividends(txns: Txn[], nonCompliantPct: number): number; // unpurified only
function breakeven(txns: Txn[], feePerTransaction: number): number | null; // null if position(txns) === 0
```

**Files to create:**
- `/home/adil/projects/trades/src/lib/calculations.ts`
- `/home/adil/projects/trades/tests/lib/calculations.test.ts`
- `/home/adil/projects/trades/vitest.config.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 2: Write the failing tests — `tests/lib/calculations.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  position,
  avgCost,
  realizedGains,
  dividendsTotal,
  purifiableGains,
  purifiableDividends,
  breakeven,
  type Txn,
} from "@/lib/calculations";

let seq = 0;
function nextDate(): Date {
  seq += 1;
  return new Date(2026, 0, seq); // 2026-01-01, 2026-01-02, ... — one per call
}

function buy(shares: number, price: number, purifiedAt: Date | null = null, date = nextDate()): Txn {
  return { type: "BUY", date, shares, pricePerShare: price, amount: null, purifiedAt };
}
function sell(shares: number, price: number, purifiedAt: Date | null = null, date = nextDate()): Txn {
  return { type: "SELL", date, shares, pricePerShare: price, amount: null, purifiedAt };
}
function dividend(amount: number, purifiedAt: Date | null = null, date = nextDate()): Txn {
  return { type: "DIVIDEND", date, shares: null, pricePerShare: null, amount, purifiedAt };
}

describe("position", () => {
  it("sums buys minus sells", () => {
    expect(position([buy(10, 5), sell(4, 6)])).toBe(6);
  });
  it("ignores dividends", () => {
    expect(position([buy(10, 5), dividend(2)])).toBe(10);
  });
  it("is 0 for no transactions", () => {
    expect(position([])).toBe(0);
  });
});

describe("avgCost", () => {
  it("is the weighted average of buy prices", () => {
    // 10 @ 5 + 10 @ 7 => (50+70)/20 = 6
    expect(avgCost([buy(10, 5), buy(10, 7)])).toBe(6);
  });
  it("is unaffected by sells", () => {
    expect(avgCost([buy(10, 5), sell(4, 9)])).toBe(5);
  });
  it("is null with no buys", () => {
    expect(avgCost([])).toBeNull();
  });
});

describe("realizedGains", () => {
  it("computes gain using avg cost basis at time of each sale", () => {
    // buy 10@5 (avg=5), sell 4@8 => gain 4*(8-5)=12
    expect(realizedGains([buy(10, 5), sell(4, 8)])).toBe(12);
  });
  it("uses the running average across multiple buy lots before a sale", () => {
    // buy 10@5, buy 10@7 (avg=6), sell 5@10 => gain 5*(10-6)=20
    expect(realizedGains([buy(10, 5), buy(10, 7), sell(5, 10)])).toBe(20);
  });
  it("is 0 with no sells", () => {
    expect(realizedGains([buy(10, 5)])).toBe(0);
  });
  it("can be negative (a loss)", () => {
    expect(realizedGains([buy(10, 10), sell(5, 8)])).toBe(-10);
  });
  it("sorts internally by date, so callers don't have to pre-sort", () => {
    // Session 7's history page queries date desc; this proves that's safe.
    const d1 = new Date("2026-01-01");
    const d2 = new Date("2026-01-02");
    const b = buy(10, 5, null, d1);
    const s = sell(4, 8, null, d2);
    // passed in reverse-chronological order — result must still be date-order-correct
    expect(realizedGains([s, b])).toBe(12);
  });
});

describe("dividendsTotal / purifiableDividends", () => {
  it("sums all dividend amounts", () => {
    expect(dividendsTotal([dividend(10), dividend(5)])).toBe(15);
  });
  it("returns 0 when there are no dividend transactions", () => {
    expect(dividendsTotal([buy(10, 5), sell(5, 8)])).toBe(0);
  });
  it("purifiableDividends applies nonCompliantPct only to unpurified dividends", () => {
    const txns = [dividend(10, null), dividend(20, new Date("2026-01-01"))];
    // only the unpurified 10 counts; 10 * 0.5 = 5
    expect(purifiableDividends(txns, 0.5)).toBe(5);
  });
});

describe("purifiableGains", () => {
  it("applies nonCompliantPct to realized gains from unpurified sells only", () => {
    const txns = [
      buy(10, 5),
      sell(4, 8, null), // gain 12, unpurified
      buy(10, 5),
      sell(4, 8, new Date("2026-01-01")), // gain 12, already purified
    ];
    // realized gains total would be 24, but only the unpurified sale's 12 counts
    expect(purifiableGains(txns, 0.5)).toBe(6);
  });
});

describe("breakeven", () => {
  it("matches the averaging_down.md worked pattern for a single side-tranche", () => {
    // Original: buy n0=10 @ P0=100.
    // Tranche 1: buy n1=5 @ P1=80, sell n1=5 @ S1=90 (profit 5*10=50).
    // Fee = 1 credit/txn. The doc's k=1 case counts 2k+2=4 transactions:
    // (k+1)=2 buys + k=1 side-sell + 1 anticipated final sell of the
    // remaining n0. breakeven() adds that +1 for the not-yet-executed final
    // sale itself — it's what makes this a *breakeven* price, not just a
    // cost-recovery-so-far figure.
    const txns: Txn[] = [
      buy(10, 100), // original position, still held
      buy(5, 80),
      sell(5, 90),
    ];
    // General formula: (totalBuyCost + fee*(count+1) - totalSellProceeds) / sharesHeld
    // totalBuyCost = 10*100 + 5*80 = 1400
    // totalSellProceeds = 5*90 = 450
    // count = 3 txns in the array + 1 anticipated final sale = 4
    // fee = 1 => (1400 + 4*1 - 450) / 10 = 95.4 — matches averaging_down.md exactly
    expect(breakeven(txns, 1)).toBeCloseTo(95.4, 5);
  });

  it("reduces to P0 + fee*2/n0 when there are no side trades (k=0 case from the doc)", () => {
    const txns: Txn[] = [buy(10, 100)];
    // 1 txn in the array + 1 anticipated final sale = 2 = the doc's 2k+2 with k=0
    // (1000 + 2*1 - 0) / 10 = 100.2, which is exactly P0 + fee*2/n0 = 100 + 2*1/10
    expect(breakeven(txns, 1)).toBeCloseTo(100.2, 5);
  });

  it("returns null when the position is fully closed", () => {
    const txns: Txn[] = [buy(10, 100), sell(10, 110)];
    expect(breakeven(txns, 1)).toBeNull();
  });

  it("a losing side trade pushes breakeven higher", () => {
    const txns: Txn[] = [
      buy(10, 100),
      buy(5, 80),
      sell(5, 70), // loss of 5*(70-80) = -50
    ];
    // totalBuyCost = 1000+400=1400, proceeds=350, count=3+1(anticipated)=4
    // (1400 + 4 - 350)/10 = 105.4 — matches averaging_down.md exactly
    expect(breakeven(txns, 1)).toBeCloseTo(105.4, 5);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/lib/calculations.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/calculations'`.

- [ ] **Step 4: Write `src/lib/calculations.ts`**

```typescript
export type Txn = {
  type: "BUY" | "SELL" | "DIVIDEND";
  date: Date;
  shares: number | null;
  pricePerShare: number | null;
  amount: number | null;
  purifiedAt: Date | null;
};

function sortByDate(txns: Txn[]): Txn[] {
  return [...txns].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function position(txns: Txn[]): number {
  return txns.reduce((total, t) => {
    if (t.type === "BUY") return total + (t.shares ?? 0);
    if (t.type === "SELL") return total - (t.shares ?? 0);
    return total;
  }, 0);
}

export function avgCost(txns: Txn[]): number | null {
  let shares = 0;
  let cost = 0;
  for (const t of txns) {
    if (t.type === "BUY") {
      shares += t.shares ?? 0;
      cost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
    }
  }
  if (shares === 0) return null;
  return cost / shares;
}

/**
 * Sorts transactions by date ascending internally, tracks a running average
 * cost basis, and sums (sellPrice - avgCostAtSale) * sharesSold for every
 * SELL. Callers do not need to pre-sort — this used to be an unenforced
 * caller contract (see analysis.md 1d) that Session 7's desc-ordered query
 * already violated; sorting here removes the footgun entirely.
 */
export function realizedGains(txns: Txn[]): number {
  let shares = 0;
  let cost = 0;
  let gains = 0;

  for (const t of sortByDate(txns)) {
    if (t.type === "BUY") {
      shares += t.shares ?? 0;
      cost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
    } else if (t.type === "SELL") {
      const runningAvg = shares === 0 ? 0 : cost / shares;
      const sold = t.shares ?? 0;
      gains += sold * ((t.pricePerShare ?? 0) - runningAvg);
      cost -= sold * runningAvg;
      shares -= sold;
    }
  }

  return gains;
}

export function dividendsTotal(txns: Txn[]): number {
  return txns
    .filter((t) => t.type === "DIVIDEND")
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);
}

/**
 * Sorts internally by date ascending — same rationale as realizedGains above.
 */
export function purifiableGains(txns: Txn[], nonCompliantPct: number): number {
  let shares = 0;
  let cost = 0;
  let purifiable = 0;

  for (const t of sortByDate(txns)) {
    if (t.type === "BUY") {
      shares += t.shares ?? 0;
      cost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
    } else if (t.type === "SELL") {
      const runningAvg = shares === 0 ? 0 : cost / shares;
      const sold = t.shares ?? 0;
      const gain = sold * ((t.pricePerShare ?? 0) - runningAvg);
      if (!t.purifiedAt) purifiable += gain * nonCompliantPct;
      cost -= sold * runningAvg;
      shares -= sold;
    }
  }

  return purifiable;
}

export function purifiableDividends(txns: Txn[], nonCompliantPct: number): number {
  return txns
    .filter((t) => t.type === "DIVIDEND" && !t.purifiedAt)
    .reduce((sum, t) => sum + (t.amount ?? 0) * nonCompliantPct, 0);
}

/**
 * Breakeven price for currently-held shares: the sale price at which selling
 * the remaining position recovers all cash spent (buys + fees) net of cash
 * already received from sells (net of their fees), across the full history
 * passed in, PLUS the fee for the anticipated future sale of the remaining
 * position itself. See /home/adil/projects/trades/averaging_down.md for the
 * derivation this generalizes — the doc's transaction count is `2k+2`:
 * (k+1) buys + k side-sells + 1 not-yet-executed final sell of n0. The `+1`
 * below is that final sell; omitting it (an earlier version of this function
 * did) undercounts every breakeven price by exactly one fee/sharesHeld.
 */
export function breakeven(txns: Txn[], feePerTransaction: number): number | null {
  const sharesHeld = position(txns);
  if (sharesHeld === 0) return null;

  let totalBuyCost = 0;
  let totalSellProceeds = 0;
  let transactionCount = 0;

  for (const t of txns) {
    if (t.type === "BUY") {
      totalBuyCost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
      transactionCount += 1;
    } else if (t.type === "SELL") {
      totalSellProceeds += (t.shares ?? 0) * (t.pricePerShare ?? 0);
      transactionCount += 1;
    }
  }

  const totalTransactionCount = transactionCount + 1; // + the anticipated final sale

  return (
    (totalBuyCost + feePerTransaction * totalTransactionCount - totalSellProceeds) / sharesHeld
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/calculations.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calculations.ts tests/lib/calculations.test.ts vitest.config.ts
git commit -m "feat: add position/cost-basis/purification/breakeven calculations with tests"
```

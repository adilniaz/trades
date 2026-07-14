import { describe, it, expect } from "vitest";
import { computeHoldings } from "@/lib/holdings";

type TxnInput = {
  type: "BUY" | "SELL" | "DIVIDEND";
  date?: Date;
  shares?: number | null;
  pricePerShare?: number | null;
  amount?: number | null;
  purifiedAt?: Date | null;
};

function company(overrides: {
  id?: string;
  name?: string;
  ticker?: string;
  nonCompliantPct?: number;
  transactions?: TxnInput[];
}) {
  return {
    id: overrides.id ?? "c1",
    name: overrides.name ?? "Test Co",
    ticker: overrides.ticker ?? "TST",
    nonCompliantPct: overrides.nonCompliantPct ?? 0,
    transactions: (overrides.transactions ?? []).map((t, i) => ({
      type: t.type,
      date: t.date ?? new Date(2026, 0, i + 1),
      shares: t.shares ?? null,
      pricePerShare: t.pricePerShare ?? null,
      amount: t.amount ?? null,
      purifiedAt: t.purifiedAt ?? null,
    })),
  };
}

describe("computeHoldings", () => {
  it("skips companies with no live transactions", () => {
    const result = computeHoldings([company({ transactions: [] })], { transactionFee: 0 });
    expect(result).toEqual([]);
  });

  it("computes the same figures overview/export previously built inline, for a simple buy+sell", () => {
    const companies = [
      company({
        id: "c1",
        name: "Acme Corp",
        ticker: "ACME",
        // stored 0-100 scale — computeHoldings must divide by 100 before
        // calling calculations.ts (which asserts a 0-1 input).
        nonCompliantPct: 10,
        transactions: [
          { type: "BUY", shares: 10, pricePerShare: 5 },
          { type: "SELL", shares: 4, pricePerShare: 8 },
        ],
      }),
    ];

    const [row] = computeHoldings(companies, { transactionFee: 1 });

    expect(row.companyId).toBe("c1");
    expect(row.name).toBe("Acme Corp");
    expect(row.ticker).toBe("ACME");
    expect(row.sharesHeld).toBe(6); // 10 - 4
    expect(row.avgCost).toBe(5);
    expect(row.realizedGains).toBe(12); // 4 * (8 - 5)
    expect(row.gainsToPurify).toBeCloseTo(1.2); // 12 * 0.10, sale not purified
    expect(row.dividendsToPurify).toBe(0);
    expect(row.breakeven).not.toBeNull();
  });

  it("converts nonCompliantPct from the stored 0-100 scale before the purification split", () => {
    const companies = [
      company({
        nonCompliantPct: 100,
        transactions: [
          { type: "BUY", shares: 10, pricePerShare: 5 },
          { type: "SELL", shares: 10, pricePerShare: 8 },
        ],
      }),
    ];
    const [row] = computeHoldings(companies, { transactionFee: 0 });
    expect(row.gainsToPurify).toBeCloseTo(row.realizedGains);
  });

  it("passes settings.transactionFee through to the breakeven calculation", () => {
    const companies = [
      company({ transactions: [{ type: "BUY", shares: 10, pricePerShare: 5 }] }),
    ];
    const cheap = computeHoldings(companies, { transactionFee: 0 })[0].breakeven!;
    const expensive = computeHoldings(companies, { transactionFee: 100 })[0].breakeven!;
    expect(expensive).toBeGreaterThan(cheap);
  });

  it("preserves company order and drops only the empty ones", () => {
    const companies = [
      company({ id: "c1", ticker: "AAA", transactions: [{ type: "BUY", shares: 1, pricePerShare: 1 }] }),
      company({ id: "c2", ticker: "BBB", transactions: [] }),
      company({ id: "c3", ticker: "CCC", transactions: [{ type: "BUY", shares: 1, pricePerShare: 1 }] }),
    ];
    const result = computeHoldings(companies, { transactionFee: 0 });
    expect(result.map((r) => r.ticker)).toEqual(["AAA", "CCC"]);
  });

  it("counts dividends toward dividendsToPurify at the company's non-compliant rate", () => {
    const companies = [
      company({
        nonCompliantPct: 50,
        transactions: [
          { type: "BUY", shares: 10, pricePerShare: 5 },
          { type: "DIVIDEND", amount: 20 },
        ],
      }),
    ];
    const [row] = computeHoldings(companies, { transactionFee: 0 });
    expect(row.dividendsToPurify).toBe(10); // 20 * 0.5
  });
});

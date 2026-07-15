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
  return new Date(2026, 0, seq); // 2026-01-01, 2026-01-02, ...
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
    expect(realizedGains([buy(10, 5), sell(4, 8)])).toBe(12);
  });
  it("uses the running average across multiple buy lots before a sale", () => {
    expect(realizedGains([buy(10, 5), buy(10, 7), sell(5, 10)])).toBe(20);
  });
  it("is 0 with no sells", () => {
    expect(realizedGains([buy(10, 5)])).toBe(0);
  });
  it("can be negative (a loss)", () => {
    expect(realizedGains([buy(10, 10), sell(5, 8)])).toBe(-10);
  });
  it("sorts internally by date, so callers don't have to pre-sort", () => {
    const d1 = new Date("2026-01-01");
    const d2 = new Date("2026-01-02");
    const b = buy(10, 5, null, d1);
    const s = sell(4, 8, null, d2);
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
    expect(purifiableDividends(txns, 0.5)).toBe(5);
  });
});

describe("purifiableGains", () => {
  it("applies nonCompliantPct to realized gains from unpurified sells only", () => {
    const txns = [
      buy(10, 5),
      sell(4, 8, null),
      buy(10, 5),
      sell(4, 8, new Date("2026-01-01")),
    ];
    expect(purifiableGains(txns, 0.5)).toBe(6);
  });

  it("returns 0 when all sells are already purified", () => {
    const txns = [
      buy(10, 5),
      sell(4, 8, new Date("2026-01-01")),
    ];
    expect(purifiableGains(txns, 0.5)).toBe(0);
  });

  it("handles 0% nonCompliantPct (nothing to purify)", () => {
    const txns = [buy(10, 5), sell(4, 8, null)];
    expect(purifiableGains(txns, 0)).toBe(0);
  });

  it("handles 100% nonCompliantPct (entire gain is purifiable)", () => {
    const txns = [buy(10, 5), sell(4, 8, null)];
    expect(purifiableGains(txns, 1)).toBe(12);
  });

  it("floors each sale's contribution at zero, so a loss never offsets gains from other sales", () => {
    const txns = [
      buy(10, 10),
      sell(5, 8, null), // loss: -10
      buy(10, 10),
      sell(5, 15, null), // gain: 25
    ];
    // Old (netting) behavior would give (-10 + 25) * 0.5 = 7.5.
    // Floored behavior: (0 + 25) * 0.5 = 12.5.
    expect(purifiableGains(txns, 0.5)).toBe(12.5);
    // realizedGains is unaffected — still nets the loss against the gain.
    expect(realizedGains(txns)).toBe(15);
  });
});

describe("breakeven", () => {
  it("matches the averaging_down.md worked pattern for a single side-tranche", () => {
    const txns: Txn[] = [
      buy(10, 100),
      buy(5, 80),
      sell(5, 90),
    ];
    // totalBuyCost = 10*100 + 5*80 = 1400
    // totalSellProceeds = 5*90 = 450
    // count = 3 txns + 1 anticipated final sale = 4
    // fee = 1 => (1400 + 4*1 - 450) / 10 = 95.4
    expect(breakeven(txns, 1)).toBeCloseTo(95.4, 5);
  });

  it("reduces to P0 + fee*2/n0 when there are no side trades (k=0 case)", () => {
    const txns: Txn[] = [buy(10, 100)];
    // (1000 + 2*1 - 0) / 10 = 100.2
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
      sell(5, 70),
    ];
    // totalBuyCost = 1000+400=1400, proceeds=350, count=3+1=4
    // (1400 + 4 - 350)/10 = 105.4
    expect(breakeven(txns, 1)).toBeCloseTo(105.4, 5);
  });
});

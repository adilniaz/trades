import { describe, it, expect } from "vitest";
import { toTxn } from "@/lib/to-txn";

describe("toTxn", () => {
  it("converts Decimal-like values to numbers", () => {
    // Stand-ins for Prisma Decimal (no live DB in a unit test) — Decimal
    // coerces via Number(), same as these plain string/number values.
    const result = toTxn({
      type: "BUY",
      date: new Date("2026-01-01"),
      shares: "10.5",
      pricePerShare: "42.25",
      amount: null,
      purifiedAt: null,
    });
    expect(result.shares).toBe(10.5);
    expect(result.pricePerShare).toBe(42.25);
  });

  it("passes null through unchanged instead of coercing to 0", () => {
    const result = toTxn({
      type: "DIVIDEND",
      date: new Date("2026-01-01"),
      shares: null,
      pricePerShare: null,
      amount: "15.75",
      purifiedAt: null,
    });
    expect(result.shares).toBeNull();
    expect(result.pricePerShare).toBeNull();
    expect(result.amount).toBe(15.75);
  });

  it("passes type, date, and purifiedAt through unchanged", () => {
    const date = new Date("2026-03-14");
    const purifiedAt = new Date("2026-04-01");
    const result = toTxn({
      type: "SELL",
      date,
      shares: 5,
      pricePerShare: 10,
      amount: null,
      purifiedAt,
    });
    expect(result.type).toBe("SELL");
    expect(result.date).toBe(date);
    expect(result.purifiedAt).toBe(purifiedAt);
  });
});

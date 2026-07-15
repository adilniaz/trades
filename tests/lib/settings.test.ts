import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany, mockUpsert } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: { findMany: mockFindMany, upsert: mockUpsert },
  },
}));

describe("settings", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFindMany.mockReset();
    mockUpsert.mockReset();
  });

  it("parses transactionFee and displayCurrency from Setting rows", async () => {
    mockFindMany.mockResolvedValue([
      { key: "transactionFee", value: "2.5" },
      { key: "displayCurrency", value: "GBP" },
    ]);
    const { getSettings } = await import("@/lib/settings");
    const settings = await getSettings();
    expect(settings.transactionFee).toBe(2.5);
    expect(settings.displayCurrency).toBe("GBP");
  });

  it("defaults transactionFee to 0 and displayCurrency to USD when rows are missing", async () => {
    mockFindMany.mockResolvedValue([]);
    const { getSettings } = await import("@/lib/settings");
    const settings = await getSettings();
    expect(settings.transactionFee).toBe(0);
    expect(settings.displayCurrency).toBe("USD");
  });

  it("setTransactionFee invalidates the cache so the next read picks up the new value", async () => {
    mockFindMany.mockResolvedValueOnce([{ key: "transactionFee", value: "1" }]);
    mockUpsert.mockResolvedValue(undefined);
    const { getSettings, setTransactionFee } = await import("@/lib/settings");

    const before = await getSettings();
    expect(before.transactionFee).toBe(1);

    mockFindMany.mockResolvedValueOnce([{ key: "transactionFee", value: "9" }]);
    await setTransactionFee(9);

    const after = await getSettings();
    expect(after.transactionFee).toBe(9);
  });
});

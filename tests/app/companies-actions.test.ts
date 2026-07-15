import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));
const { mockFindMany, mockFindUnique, mockCreate, mockUpdateMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mockRequireAuth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: mockFindMany,
      create: mockCreate,
      updateMany: mockUpdateMany,
    },
    company: {
      findUnique: mockFindUnique,
    },
  },
}));

import { addTransaction, updateTransaction } from "@/app/(dashboard)/companies/[id]/actions";

const USER = { id: "user1", email: "user1@example.com", role: "USER" };
const COMPANY = { id: "company1", deletedAt: null, status: "APPROVED" };

function existingBuy(shares: number, price: number) {
  return {
    id: "existing-buy",
    type: "BUY",
    date: new Date("2026-01-01"),
    shares,
    pricePerShare: price,
    amount: null,
    purifiedAt: null,
  };
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue(USER);
  mockFindMany.mockReset();
  mockFindUnique.mockReset().mockResolvedValue(COMPANY);
  mockCreate.mockReset().mockResolvedValue({ id: "new-txn" });
  mockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("addTransaction", () => {
  it("rejects a SELL that exceeds current holdings and never creates the row", async () => {
    mockFindMany.mockResolvedValue([existingBuy(10, 5)]); // position = 10
    const result = await addTransaction("company1", {
      type: "SELL",
      date: new Date("2026-02-01"),
      shares: 15,
      pricePerShare: 8,
    });
    expect(result).toEqual({
      error: { shares: ["Cannot sell 15 shares — only 10 currently held"] },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts a SELL within current holdings", async () => {
    mockFindMany.mockResolvedValue([existingBuy(10, 5)]); // position = 10
    const result = await addTransaction("company1", {
      type: "SELL",
      date: new Date("2026-02-01"),
      shares: 10,
      pricePerShare: 8,
    });
    expect(result).toEqual({ success: true });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("does not check position for a BUY", async () => {
    const result = await addTransaction("company1", {
      type: "BUY",
      date: new Date("2026-02-01"),
      shares: 5,
      pricePerShare: 10,
    });
    expect(result).toEqual({ success: true });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("updateTransaction", () => {
  it("excludes the transaction being edited from the position check, so raising its shares within the other holdings succeeds", async () => {
    // Position excluding the transaction being edited (a 10-share BUY from
    // some other transaction) is 10. Editing this SELL up to 9 shares must
    // succeed — it must NOT be checked against a position total that still
    // includes this same SELL's own prior shares.
    mockFindMany.mockImplementation(async ({ where }: { where: { id?: { not?: string } } }) => {
      expect(where.id).toEqual({ not: "sell-1" });
      return [existingBuy(10, 5)];
    });
    const result = await updateTransaction("sell-1", "company1", {
      type: "SELL",
      date: new Date("2026-02-01"),
      shares: 9,
      pricePerShare: 8,
    });
    expect(result).toEqual({ success: true });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects an edit that would make the SELL exceed position, even excluding itself", async () => {
    mockFindMany.mockResolvedValue([existingBuy(5, 5)]); // position excluding self = 5
    const result = await updateTransaction("sell-1", "company1", {
      type: "SELL",
      date: new Date("2026-02-01"),
      shares: 20,
      pricePerShare: 8,
    });
    expect(result).toEqual({
      error: { shares: ["Cannot sell 20 shares — only 5 currently held"] },
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

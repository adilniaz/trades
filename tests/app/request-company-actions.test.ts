import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mockRequireAuth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      create: mockCreate,
    },
  },
}));

import { requestCompany } from "@/app/(dashboard)/request-company/actions";

const USER = { id: "user1", email: "user1@example.com", role: "USER" };

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue(USER);
  mockCreate.mockReset().mockResolvedValue({ id: "new-company" });
});

describe("requestCompany", () => {
  it("stores a blank isin as undefined rather than an empty string", async () => {
    const result = await requestCompany({
      name: "First Co",
      ticker: "FST",
      isin: "",
    });
    expect(result).toEqual({ success: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isin: undefined }),
      })
    );
  });

  it("allows a second, unrelated blank-isin request to succeed (no false unique collision)", async () => {
    // Simulate the real Postgres partial unique index semantics: it only
    // rejects duplicates on a genuine, non-null isin value. Since a blank
    // isin is normalized to undefined before reaching here, two blank-isin
    // requests never collide.
    mockCreate.mockImplementation(async ({ data }: { data: { isin?: string } }) => {
      if (data.isin) {
        throw new Error("unique violation on real isin");
      }
      return { id: "created" };
    });

    const first = await requestCompany({ name: "First Co", ticker: "FST", isin: "" });
    const second = await requestCompany({ name: "Second Co", ticker: "SND", isin: "  " });

    expect(first).toEqual({ success: true });
    expect(second).toEqual({ success: true });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

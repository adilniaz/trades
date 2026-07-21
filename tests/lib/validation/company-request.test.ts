import { describe, it, expect } from "vitest";
import { companyRequestSchema } from "@/lib/validation/company-request";

describe("companyRequestSchema", () => {
  it("normalizes a blank-string isin to undefined", () => {
    const result = companyRequestSchema.safeParse({
      name: "Apple Inc",
      ticker: "AAPL",
      isin: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isin).toBeUndefined();
    }
  });

  it("normalizes a whitespace-only isin to undefined", () => {
    const result = companyRequestSchema.safeParse({
      name: "Apple Inc",
      ticker: "AAPL",
      isin: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isin).toBeUndefined();
    }
  });

  it("passes through a real isin unchanged", () => {
    const result = companyRequestSchema.safeParse({
      name: "Apple Inc",
      ticker: "AAPL",
      isin: "US0378331005",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isin).toBe("US0378331005");
    }
  });

  it("treats an omitted isin as undefined", () => {
    const result = companyRequestSchema.safeParse({
      name: "Apple Inc",
      ticker: "AAPL",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isin).toBeUndefined();
    }
  });
});

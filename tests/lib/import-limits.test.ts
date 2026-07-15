import { describe, it, expect } from "vitest";
import { checkImportSize, MAX_IMPORT_ROWS, MAX_IMPORT_BYTES } from "@/lib/import-limits";

describe("checkImportSize", () => {
  it("returns null when under both limits", () => {
    expect(checkImportSize("a,b,c\n", 10)).toBeNull();
  });

  it("returns an error when the row count exceeds the limit", () => {
    const error = checkImportSize("short text", MAX_IMPORT_ROWS + 1);
    expect(error).not.toBeNull();
    expect(error).toContain("Too many rows");
  });

  it("returns an error when the byte size exceeds the limit", () => {
    const oversized = "a".repeat(MAX_IMPORT_BYTES + 1);
    const error = checkImportSize(oversized, 1);
    expect(error).not.toBeNull();
    expect(error).toContain("too large");
  });

  it("reports the byte-size error first when both limits are exceeded", () => {
    const oversized = "a".repeat(MAX_IMPORT_BYTES + 1);
    const error = checkImportSize(oversized, MAX_IMPORT_ROWS + 1);
    expect(error).toContain("too large");
  });
});

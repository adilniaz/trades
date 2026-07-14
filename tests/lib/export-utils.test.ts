import { describe, it, expect } from "vitest";
import { toCsv, toCsvField } from "@/lib/export-utils";

describe("toCsvField", () => {
  it("passes through plain values", () => {
    expect(toCsvField("hello")).toBe("hello");
  });
  it("quotes values containing commas", () => {
    expect(toCsvField("a,b")).toBe('"a,b"');
  });
  it("escapes embedded double quotes", () => {
    expect(toCsvField('a"b')).toBe('"a""b"');
  });
  it("prefixes tab character with apostrophe", () => {
    expect(toCsvField("\tfoo")).toBe("'\tfoo");
  });
  it("returns empty string for null", () => {
    expect(toCsvField(null)).toBe("");
  });
  it("prefixes a leading apostrophe on formula-triggering characters, which is the actual mitigation", () => {
    // The property that matters is the leading apostrophe surviving into
    // the cell content — not just that the field got CSV-quoted (that was
    // the bug: quoting alone doesn't stop formula evaluation).
    expect(toCsvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(toCsvField("+1+1")).toBe("'+1+1");
    expect(toCsvField("-1")).toBe("'-1");
    expect(toCsvField("@evil")).toBe("'@evil");
  });
  it("still CSV-escapes a formula-prefixed value that also contains a comma", () => {
    expect(toCsvField("=SUM(A1),B1")).toBe('"\'=SUM(A1),B1"');
  });
  it("prefixes apostrophe when formula chars have leading whitespace", () => {
    // Spreadsheets ignore leading whitespace before evaluating formulas.
    // The apostrophe at position 0 must still neutralize the formula.
    expect(toCsvField(" =1+1")).toBe("' =1+1");
    expect(toCsvField("  =SUM(A1)")).toBe("'  =SUM(A1)");
  });
});

describe("toCsv", () => {
  it("joins headers and rows", () => {
    expect(toCsv(["a", "b"], [[1, 2], [3, 4]])).toBe("a,b\n1,2\n3,4");
  });
});

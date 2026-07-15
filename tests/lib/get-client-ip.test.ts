import { describe, it, expect } from "vitest";
import { extractClientIp } from "@/lib/get-client-ip";

describe("extractClientIp", () => {
  it("returns 'unknown' when the header is absent", () => {
    expect(extractClientIp(null)).toBe("unknown");
    expect(extractClientIp(undefined)).toBe("unknown");
  });

  it("returns 'unknown' when the header is an empty string", () => {
    expect(extractClientIp("")).toBe("unknown");
  });

  it("passes through a single IP unchanged", () => {
    expect(extractClientIp("203.0.113.7")).toBe("203.0.113.7");
  });

  it("picks the LAST entry for a multi-hop header, not the first", () => {
    // Client-supplied value first, trusted proxy's appended value last.
    expect(extractClientIp("203.0.113.7, 10.0.0.5")).toBe("10.0.0.5");
  });

  it("trims whitespace around the selected entry", () => {
    expect(extractClientIp("203.0.113.7,  10.0.0.5  ")).toBe("10.0.0.5");
  });
});

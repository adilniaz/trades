import { describe, it, expect, vi, afterEach } from "vitest";
import { isIpThrottled, recordFailedAttempt } from "@/lib/ip-rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("isIpThrottled", () => {
  it("is false for an IP with no recorded attempts", () => {
    expect(isIpThrottled("203.0.113.1")).toBe(false);
  });

  it("stays false below the threshold", () => {
    const ip = "203.0.113.2";
    for (let i = 0; i < 19; i++) recordFailedAttempt(ip);
    expect(isIpThrottled(ip)).toBe(false);
  });

  it("becomes true once the threshold is reached", () => {
    const ip = "203.0.113.3";
    for (let i = 0; i < 20; i++) recordFailedAttempt(ip);
    expect(isIpThrottled(ip)).toBe(true);
  });

  it("resets once the window expires", () => {
    vi.useFakeTimers();
    const ip = "203.0.113.4";
    for (let i = 0; i < 20; i++) recordFailedAttempt(ip);
    expect(isIpThrottled(ip)).toBe(true);

    vi.advanceTimersByTime(16 * 60_000);
    expect(isIpThrottled(ip)).toBe(false);
  });

  it("tracks each IP independently", () => {
    const busy = "203.0.113.5";
    const clean = "203.0.113.6";
    for (let i = 0; i < 20; i++) recordFailedAttempt(busy);
    expect(isIpThrottled(busy)).toBe(true);
    expect(isIpThrottled(clean)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { isLockedOut, nextLockoutState, resetLockoutState } from "@/lib/rate-limit";

describe("isLockedOut", () => {
  it("is false when lockedUntil is null", () => {
    expect(isLockedOut(null)).toBe(false);
  });
  it("is true when lockedUntil is in the future", () => {
    expect(isLockedOut(new Date(Date.now() + 60_000))).toBe(true);
  });
  it("is false when lockedUntil is in the past", () => {
    expect(isLockedOut(new Date(Date.now() - 60_000))).toBe(false);
  });
});

describe("nextLockoutState", () => {
  it("increments failedAttempts without locking below the threshold", () => {
    expect(nextLockoutState(0)).toEqual({ failedAttempts: 1, lockedUntil: null });
    expect(nextLockoutState(3)).toEqual({ failedAttempts: 4, lockedUntil: null });
  });
  it("locks out and resets the counter at the threshold (5th failure)", () => {
    const result = nextLockoutState(4);
    expect(result.failedAttempts).toBe(0);
    expect(result.lockedUntil).not.toBeNull();
    expect(result.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("resetLockoutState", () => {
  it("is a zeroed, unlocked state", () => {
    expect(resetLockoutState).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});

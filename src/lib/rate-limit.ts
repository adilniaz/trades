const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function isLockedOut(lockedUntil: Date | null): boolean {
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

export function nextLockoutState(failedAttempts: number): {
  failedAttempts: number;
  lockedUntil: Date | null;
} {
  const failed = failedAttempts + 1;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts: 0,
      lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
    };
  }
  return { failedAttempts: failed, lockedUntil: null };
}

export const resetLockoutState = { failedAttempts: 0, lockedUntil: null as Date | null };

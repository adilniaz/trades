// CAUTION: In-memory, per-process state — same pattern already accepted in
// src/lib/settings.ts's module-level cache. In a multi-instance deployment,
// each instance has its own independent counter, so the effective per-IP
// limit multiplies by instance count. Fine for the current single-container
// deployment; would need a shared store (Redis, a DB table) to hold at
// multiple instances.
//
// This is deliberately a coarser, IP-keyed backstop alongside the existing
// per-account lockout in rate-limit.ts — it exists to bound credential
// stuffing across many different accounts from one source, not to replace
// the tighter per-account threshold.

const MAX_ATTEMPTS_PER_WINDOW = 20;
const WINDOW_MS = 15 * 60_000;

const attempts = new Map<string, { count: number; windowStart: number }>();

function isExpired(entry: { windowStart: number }): boolean {
  return Date.now() - entry.windowStart > WINDOW_MS;
}

export function isIpThrottled(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (isExpired(entry)) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS_PER_WINDOW;
}

export function recordFailedAttempt(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || isExpired(entry)) {
    attempts.set(ip, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

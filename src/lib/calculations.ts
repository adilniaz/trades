export type Txn = {
  type: "BUY" | "SELL" | "DIVIDEND";
  date: Date;
  shares: number | null;
  pricePerShare: number | null;
  amount: number | null;
  purifiedAt: Date | null;
};

function sortByDate(txns: Txn[]): Txn[] {
  return [...txns].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function assertNonCompliantPct(pct: number): void {
  if (!isFinite(pct) || pct < 0 || pct > 1) {
    throw new Error(
      `nonCompliantPct must be between 0 and 1, got ${pct}. ` +
      `Callers must divide the stored DB value (0-100) by 100 before passing.`
    );
  }
}

export function position(txns: Txn[]): number {
  return txns.reduce((total, t) => {
    if (t.type === "BUY") return total + (t.shares ?? 0);
    if (t.type === "SELL") return total - (t.shares ?? 0);
    return total;
  }, 0);
}

export function avgCost(txns: Txn[]): number | null {
  let shares = 0;
  let cost = 0;
  for (const t of txns) {
    if (t.type === "BUY") {
      shares += t.shares ?? 0;
      cost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
    }
  }
  if (shares === 0) return null;
  const avg = cost / shares;
  if (!isFinite(avg)) return null;
  return avg;
}

export function realizedGains(txns: Txn[]): number {
  let shares = 0;
  let cost = 0;
  let gains = 0;

  for (const t of sortByDate(txns)) {
    if (t.type === "BUY") {
      shares += t.shares ?? 0;
      cost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
    } else if (t.type === "SELL") {
      const runningAvg = shares === 0 ? 0 : cost / shares;
      const sold = t.shares ?? 0;
      gains += sold * ((t.pricePerShare ?? 0) - runningAvg);
      cost -= sold * runningAvg;
      // Round to 6 decimal places to prevent floating-point error accumulation
      // across many buy/sell cycles (matches Decimal(18,6) DB precision).
      cost = Math.round(cost * 1e6) / 1e6;
      shares -= sold;
    }
  }

  return gains;
}

export function dividendsTotal(txns: Txn[]): number {
  return txns
    .filter((t) => t.type === "DIVIDEND")
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);
}

export function purifiableGains(txns: Txn[], nonCompliantPct: number): number {
  assertNonCompliantPct(nonCompliantPct);
  let shares = 0;
  let cost = 0;
  let purifiable = 0;

  for (const t of sortByDate(txns)) {
    if (t.type === "BUY") {
      shares += t.shares ?? 0;
      cost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
    } else if (t.type === "SELL") {
      const runningAvg = shares === 0 ? 0 : cost / shares;
      const sold = t.shares ?? 0;
      const gain = sold * ((t.pricePerShare ?? 0) - runningAvg);
      if (!t.purifiedAt) purifiable += gain * nonCompliantPct;
      cost -= sold * runningAvg;
      // Round to 6 decimal places to prevent floating-point error accumulation
      // across many buy/sell cycles (matches Decimal(18,6) DB precision).
      cost = Math.round(cost * 1e6) / 1e6;
      shares -= sold;
    }
  }

  return purifiable;
}

export function purifiableDividends(txns: Txn[], nonCompliantPct: number): number {
  assertNonCompliantPct(nonCompliantPct);
  return txns
    .filter((t) => t.type === "DIVIDEND" && !t.purifiedAt)
    .reduce((sum, t) => sum + (t.amount ?? 0) * nonCompliantPct, 0);
}

export function breakeven(txns: Txn[], feePerTransaction: number): number | null {
  const sharesHeld = position(txns);
  if (sharesHeld <= 0) return null;
  if (!isFinite(feePerTransaction)) return null;

  let totalBuyCost = 0;
  let totalSellProceeds = 0;
  let transactionCount = 0;

  for (const t of txns) {
    if (t.type === "BUY") {
      totalBuyCost += (t.shares ?? 0) * (t.pricePerShare ?? 0);
      // Only count transactions that actually moved shares — a zero-share
      // "phantom" transaction shouldn't inflate the fee count.
      if ((t.shares ?? 0) > 0) transactionCount += 1;
    } else if (t.type === "SELL") {
      totalSellProceeds += (t.shares ?? 0) * (t.pricePerShare ?? 0);
      if ((t.shares ?? 0) > 0) transactionCount += 1;
    }
  }

  const totalTransactionCount = transactionCount + 1; // + the anticipated final sale

  const raw = (totalBuyCost + feePerTransaction * totalTransactionCount - totalSellProceeds) / sharesHeld;
  // A negative breakeven for a long position means the user has already
  // extracted more cash than invested — the position is already profitable.
  return raw < 0 ? 0 : raw;
}

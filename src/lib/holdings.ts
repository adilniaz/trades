import {
  position,
  avgCost,
  realizedGains,
  purifiableGains,
  purifiableDividends,
  breakeven,
} from "@/lib/calculations";
import { toTxn } from "@/lib/to-txn";

export type Holding = {
  companyId: string;
  name: string;
  ticker: string;
  sharesHeld: number;
  avgCost: number | null;
  realizedGains: number;
  breakeven: number | null;
  gainsToPurify: number;
  dividendsToPurify: number;
};

type CompanyWithTransactions = {
  id: string;
  name: string;
  ticker: string;
  nonCompliantPct: unknown; // Prisma Decimal
  transactions: Array<{
    type: string;
    date: Date;
    shares: unknown;
    pricePerShare: unknown;
    amount: unknown;
    purifiedAt: Date | null;
  }>;
};

// Shared by overview/page.tsx and api/export/holdings/route.ts — both build
// this exact per-company breakdown from the same query shape (approved,
// non-deleted companies with the current user's non-deleted transactions).
// Companies with no live transactions are skipped, matching both callers'
// prior inline behavior.
export function computeHoldings(
  companies: CompanyWithTransactions[],
  settings: { transactionFee: number }
): Holding[] {
  const rows: Holding[] = [];

  for (const c of companies) {
    if (c.transactions.length === 0) continue;

    const txns = c.transactions.map(toTxn);
    const nonCompliantPct = Number(c.nonCompliantPct) / 100;

    rows.push({
      companyId: c.id,
      name: c.name,
      ticker: c.ticker,
      sharesHeld: position(txns),
      avgCost: avgCost(txns),
      realizedGains: realizedGains(txns),
      breakeven: breakeven(txns, settings.transactionFee),
      gainsToPurify: purifiableGains(txns, nonCompliantPct),
      dividendsToPurify: purifiableDividends(txns, nonCompliantPct),
    });
  }

  return rows;
}

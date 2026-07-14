import { requireAuth } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import {
  position,
  avgCost,
  realizedGains,
  purifiableGains,
  purifiableDividends,
  breakeven,
} from "@/lib/calculations";
import { toTxn } from "@/lib/to-txn";
import { HoldingsTable, type HoldingRow } from "@/components/holdings/holdings-table";

export default async function OverviewPage() {
  const user = await requireAuth();
  const settings = await getSettings();

  const companies = await prisma.company.findMany({
    where: { status: "APPROVED", deletedAt: null },
    include: {
      transactions: {
        where: { userId: user.id, deletedAt: null },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: HoldingRow[] = [];

  for (const c of companies) {
    if (c.transactions.length === 0) continue;

    const txns = c.transactions.map(toTxn);
    const nonCompliantPct = Number(c.nonCompliantPct) / 100;

    const sharesHeld = position(txns);
    const ac = avgCost(txns);
    const gains = realizedGains(txns);
    const purGains = purifiableGains(txns, nonCompliantPct);
    const purDivs = purifiableDividends(txns, nonCompliantPct);
    const be = breakeven(txns, settings.transactionFee);

    rows.push({
      companyId: c.id,
      name: c.name,
      ticker: c.ticker,
      sharesHeld,
      avgCost: ac,
      realizedGains: gains,
      breakeven: be,
      gainsToPurify: purGains,
      dividendsToPurify: purDivs,
    });
  }

  const totalGainsToPurify = rows.reduce((sum, r) => sum + r.gainsToPurify, 0);
  const totalDividendsToPurify = rows.reduce((sum, r) => sum + r.dividendsToPurify, 0);
  const currency = settings.displayCurrency;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Overview</h1>

      <div className="flex gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total gains to purify</div>
          <div className="text-2xl font-semibold">
            {totalGainsToPurify.toFixed(2)} {currency}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total dividends to purify</div>
          <div className="text-2xl font-semibold">
            {totalDividendsToPurify.toFixed(2)} {currency}
          </div>
        </div>
      </div>

      <HoldingsTable rows={rows} />
    </div>
  );
}

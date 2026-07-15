import { requireAuth } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { computeHoldings } from "@/lib/holdings";
import { activeCompanyWhere, activeTransactionWhere } from "@/lib/prisma-where";
import { HoldingsTable } from "@/components/holdings/holdings-table";
import { PurificationChart } from "@/components/holdings/purification-chart";

export default async function OverviewPage() {
  const user = await requireAuth();
  const settings = await getSettings();

  const companies = await prisma.company.findMany({
    where: activeCompanyWhere({ status: "APPROVED" as const }),
    include: {
      transactions: {
        where: activeTransactionWhere({ userId: user.id }),
        orderBy: { date: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = computeHoldings(companies, settings);

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

      <PurificationChart rows={rows} />

      <HoldingsTable rows={rows} />
    </div>
  );
}

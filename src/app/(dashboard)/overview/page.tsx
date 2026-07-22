import { requireAuth } from '@/lib/auth-guard';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { computeHoldings } from '@/lib/holdings';
import { activeCompanyWhere, activeTransactionWhere } from '@/lib/prisma-where';
import { HoldingsTable } from '@/components/holdings/holdings-table';
import { PurificationChart } from '@/components/holdings/purification-chart';
import { PageHeading } from '@/components/layout/page-heading';
import { PurityBar } from '@/components/ui/purity-bar';
import { Card, CardContent } from '@/components/ui/card';

export default async function OverviewPage() {
  const user = await requireAuth({ roles: ['USER'] });
  const settings = await getSettings();

  const companies = await prisma.company.findMany({
    where: activeCompanyWhere({ status: 'APPROVED' as const }),
    include: {
      transactions: {
        where: activeTransactionWhere({ userId: user.id }),
        orderBy: { date: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows = computeHoldings(companies, settings);

  const totalGainsToPurify = rows.reduce((sum, r) => sum + r.gainsToPurify, 0);
  const totalDividendsToPurify = rows.reduce(
    (sum, r) => sum + r.dividendsToPurify,
    0,
  );
  const totalRealizedGains = rows.reduce((sum, r) => sum + r.realizedGains, 0);
  const currency = settings.displayCurrency;

  const purifyPct =
    totalRealizedGains > 0
      ? (totalGainsToPurify / totalRealizedGains) * 100
      : 0;
  const compliantPct = 100 - purifyPct;

  return (
    <div className="space-y-6">
      <PageHeading description="Your holdings and the portion of gains and dividends still waiting to be purified.">
        Overview
      </PageHeading>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Total gains to purify
            </div>
            <div className="font-heading text-2xl font-semibold tabular-nums">
              {totalGainsToPurify.toFixed(2)}{' '}
              <span className="text-base font-normal text-muted-foreground">
                {currency}
              </span>
            </div>
            {totalRealizedGains > 0 && (
              <PurityBar
                compliantPct={compliantPct}
                purifyPct={purifyPct}
                size="hero"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Total dividends to purify
            </div>
            <div className="font-heading text-2xl font-semibold tabular-nums">
              {totalDividendsToPurify.toFixed(2)}{' '}
              <span className="text-base font-normal text-muted-foreground">
                {currency}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <PurificationChart rows={rows} />

      <HoldingsTable rows={rows} />
    </div>
  );
}

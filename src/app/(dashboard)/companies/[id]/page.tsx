import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import {
  purifiableGains,
  purifiableDividends,
  avgCost,
  breakeven,
} from '@/lib/calculations';
import { getSettings } from '@/lib/settings';
import { toTxn } from '@/lib/to-txn';
import { activeTransactionWhere } from '@/lib/prisma-where';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { TransactionTable } from '@/components/transactions/transaction-table';
import { MarkPurifiedButton } from '@/components/transactions/mark-purified-button';
import { BreakevenGauge } from '@/components/holdings/breakeven-gauge';
import { PageHeading } from '@/components/layout/page-heading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;
  const settings = await getSettings();

  const company = await prisma.company.findUnique({
    where: { id },
  });

  if (!company || company.deletedAt || company.status !== 'APPROVED') {
    notFound();
  }

  const transactions = await prisma.transaction.findMany({
    where: activeTransactionWhere({ companyId: id, userId: user.id }),
    orderBy: { date: 'asc' },
  });

  const txns = transactions.map(toTxn);
  const nonCompliantPct = Number(company.nonCompliantPct) / 100;
  const gainsToPurify = purifiableGains(txns, nonCompliantPct);
  const dividendsToPurify = purifiableDividends(txns, nonCompliantPct);
  const cost = avgCost(txns);
  const breakevenPrice = breakeven(txns, settings.transactionFee);
  const currency = settings.displayCurrency;

  // For the table, show in descending order
  const tableTxns = [...transactions].reverse();

  return (
    <div className="space-y-6">
      <PageHeading description={company.ticker}>{company.name}</PageHeading>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <span>
                Unpurified gains{' '}
                <span className="font-mono tabular-nums">
                  {gainsToPurify.toFixed(2)}
                </span>
              </span>
              <span>
                Unpurified dividends{' '}
                <span className="font-mono tabular-nums">
                  {dividendsToPurify.toFixed(2)}
                </span>
              </span>
            </div>
            <MarkPurifiedButton
              companyId={id}
              total={gainsToPurify + dividendsToPurify}
            />
          </div>
          {cost !== null && breakevenPrice !== null && (
            <BreakevenGauge
              avgCost={cost}
              breakeven={breakevenPrice}
              currency={currency}
              className="max-w-md"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionForm companyId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionTable
            companyId={id}
            transactions={tableTxns.map((t) => ({
              id: t.id,
              type: t.type,
              date: t.date,
              shares: t.shares === null ? null : Number(t.shares),
              pricePerShare:
                t.pricePerShare === null ? null : Number(t.pricePerShare),
              amount: t.amount === null ? null : Number(t.amount),
              purifiedAt: t.purifiedAt,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

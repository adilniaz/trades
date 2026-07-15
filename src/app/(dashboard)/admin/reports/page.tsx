import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import {
  position,
  purifiableGains,
  purifiableDividends,
  type Txn,
} from '@/lib/calculations';
import { toTxn } from '@/lib/to-txn';
import { activeCompanyWhere, activeTransactionWhere } from '@/lib/prisma-where';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeading } from '@/components/layout/page-heading';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CompanyRow = {
  ticker: string;
  nonCompliantPct: number;
  shares: number;
  purifiableGains: number;
  purifiableDividends: number;
};

type UserBlock = {
  email: string;
  rows: CompanyRow[];
  userGains: number;
  userDividends: number;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminReportsPage() {
  await requireAuth({ roles: ['ADMIN'] });
  const settings = await getSettings();

  const companies = await prisma.company.findMany({
    where: activeCompanyWhere({ status: 'APPROVED' as const }),
    include: {
      transactions: {
        where: activeTransactionWhere(),
        include: { user: { select: { id: true, email: true } } },
        orderBy: { date: 'asc' },
      },
    },
    // Safety cap: this is the one query in the app that grows with total
    // transaction volume across every user, not just one. 500 is well above
    // current scale; if the company count ever approaches it, replace this
    // with real pagination rather than raising the cap.
    take: 500,
  });

  // Group transactions by user id, then by company.
  const userMap = new Map<
    string,
    {
      email: string;
      companies: Map<
        string,
        { ticker: string; nonCompliantPct: number; txns: Txn[] }
      >;
    }
  >();

  for (const company of companies) {
    const nonCompliantPct = Number(company.nonCompliantPct) / 100;

    for (const t of company.transactions) {
      const uid = t.user.id;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          email: t.user.email,
          companies: new Map(),
        });
      }
      const userEntry = userMap.get(uid)!;
      if (!userEntry.companies.has(company.id)) {
        userEntry.companies.set(company.id, {
          ticker: company.ticker,
          nonCompliantPct,
          txns: [],
        });
      }
      userEntry.companies.get(company.id)!.txns.push(toTxn(t));
    }
  }

  // Build pre-computed blocks for rendering so we avoid side-effects in JSX.
  const userBlocks: UserBlock[] = [];
  let grandGains = 0;
  let grandDividends = 0;

  for (const [, { email, companies }] of userMap) {
    const rows: CompanyRow[] = [];
    let userGains = 0;
    let userDividends = 0;

    for (const [, { ticker, nonCompliantPct, txns }] of companies) {
      const gains = purifiableGains(txns, nonCompliantPct);
      const dividends = purifiableDividends(txns, nonCompliantPct);
      rows.push({
        ticker,
        nonCompliantPct,
        shares: position(txns),
        purifiableGains: gains,
        purifiableDividends: dividends,
      });
      userGains += gains;
      userDividends += dividends;
    }

    userBlocks.push({ email, rows, userGains, userDividends });
    grandGains += userGains;
    grandDividends += userDividends;
  }

  return (
    <div className="space-y-8">
      <PageHeading>Cross-user reports</PageHeading>

      {userBlocks.map(({ email, rows, userGains, userDividends }, idx) => (
        <Card key={idx}>
          <CardHeader>
            <CardTitle>{email}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Position</TableHead>
                  <TableHead className="text-right">Non-compliant %</TableHead>
                  <TableHead className="text-right">Purifiable gains</TableHead>
                  <TableHead className="text-right">
                    Purifiable dividends
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rIdx) => (
                  <TableRow key={rIdx}>
                    <TableCell className="font-medium">{row.ticker}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.shares}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {(row.nonCompliantPct * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.purifiableGains.toFixed(2)}{' '}
                      {settings.displayCurrency}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.purifiableDividends.toFixed(2)}{' '}
                      {settings.displayCurrency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <p className="mt-3 text-sm font-medium">
              User totals:{' '}
              <span className="font-mono tabular-nums">
                {userGains.toFixed(2)} {settings.displayCurrency}
              </span>{' '}
              gains &middot;{' '}
              <span className="font-mono tabular-nums">
                {userDividends.toFixed(2)} {settings.displayCurrency}
              </span>{' '}
              dividends
            </p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="text-right">
          <div className="text-sm text-muted-foreground">Grand totals</div>
          <div className="font-heading text-lg font-semibold tabular-nums">
            {grandGains.toFixed(2)} {settings.displayCurrency} gains &middot;{' '}
            {grandDividends.toFixed(2)} {settings.displayCurrency} dividends
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

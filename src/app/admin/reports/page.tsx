import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  position,
  purifiableGains,
  purifiableDividends,
  type Txn,
} from "@/lib/calculations";
import { toTxn } from "@/lib/to-txn";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
  await requireAuth({ roles: ["ADMIN"] });
  const settings = await getSettings();

  const companies = await prisma.company.findMany({
    where: { status: "APPROVED", deletedAt: null },
    include: {
      transactions: {
        where: { deletedAt: null },
        include: { user: { select: { id: true, email: true } } },
        orderBy: { date: "asc" },
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
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Cross-User Reports</h1>

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
                  <TableHead>Position</TableHead>
                  <TableHead>Non-compliant %</TableHead>
                  <TableHead>Purifiable Gains</TableHead>
                  <TableHead>Purifiable Dividends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rIdx) => (
                  <TableRow key={rIdx}>
                    <TableCell className="font-medium">{row.ticker}</TableCell>
                    <TableCell>{row.shares}</TableCell>
                    <TableCell>
                      {(row.nonCompliantPct * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      {row.purifiableGains.toFixed(2)} {settings.displayCurrency}
                    </TableCell>
                    <TableCell>
                      {row.purifiableDividends.toFixed(2)}{" "}
                      {settings.displayCurrency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <p className="mt-3 text-sm font-medium">
              User totals: {userGains.toFixed(2)} {settings.displayCurrency}{" "}
              gains &middot; {userDividends.toFixed(2)}{" "}
              {settings.displayCurrency} dividends
            </p>
          </CardContent>
        </Card>
      ))}

      <div className="rounded-lg border p-4 text-right text-lg font-semibold">
        Grand totals: {grandGains.toFixed(2)} {settings.displayCurrency} gains
        &middot; {grandDividends.toFixed(2)} {settings.displayCurrency}{" "}
        dividends
      </div>
    </div>
  );
}

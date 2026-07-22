import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { toCsv } from '@/lib/export-utils';
import { computeHoldings } from '@/lib/holdings';
import { activeCompanyWhere, activeTransactionWhere } from '@/lib/prisma-where';

export async function GET() {
  const result = await requireAuthApi({ roles: ['USER'] });
  if ('error' in result) return result.error;

  const settings = await getSettings();

  const companies = await prisma.company.findMany({
    where: activeCompanyWhere({ status: 'APPROVED' as const }),
    include: {
      transactions: {
        where: activeTransactionWhere({ userId: result.id }),
        orderBy: { date: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  const holdings = computeHoldings(companies, settings);
  const rows: (string | number | null)[][] = holdings.map((h) => [
    h.name,
    h.ticker,
    h.sharesHeld,
    h.avgCost,
    h.breakeven,
    h.realizedGains,
    h.gainsToPurify,
    h.dividendsToPurify,
  ]);

  const csv = toCsv(
    [
      'Company',
      'Ticker',
      'Shares Held',
      'Avg Cost',
      'Breakeven',
      'Realized Gains',
      'Gains to Purify',
      'Dividends to Purify',
    ],
    rows.map((row) =>
      row.map((v) => (typeof v === 'number' ? v.toFixed(4) : (v ?? ''))),
    ),
  );

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="holdings.csv"',
    },
  });
}

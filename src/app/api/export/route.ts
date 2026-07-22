import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { toCsv } from '@/lib/export-utils';
import { activeTransactionWhere } from '@/lib/prisma-where';

export async function GET() {
  const result = await requireAuthApi({ roles: ['USER'] });
  if ('error' in result) return result.error;

  const transactions = await prisma.transaction.findMany({
    where: activeTransactionWhere({ userId: result.id }),
    include: { company: { select: { name: true, ticker: true } } },
    orderBy: { date: 'asc' },
  });

  const csv = toCsv(
    [
      'Date',
      'Company',
      'Ticker',
      'Type',
      'Shares',
      'Price/Share',
      'Amount',
      'Purified',
    ],
    transactions.map((t) => [
      t.date.toISOString().slice(0, 10),
      t.company.name,
      t.company.ticker,
      t.type,
      t.shares?.toString() ?? '',
      t.pricePerShare?.toString() ?? '',
      t.amount?.toString() ?? '',
      t.purifiedAt ? 'yes' : 'no',
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="transactions.csv"',
    },
  });
}

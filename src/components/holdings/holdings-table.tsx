'use client';

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PurityBar } from '@/components/ui/purity-bar';

export type HoldingRow = {
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

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No transactions yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead className="text-right">Shares held</TableHead>
          <TableHead className="text-right">Avg cost</TableHead>
          <TableHead className="text-right">Breakeven</TableHead>
          <TableHead className="text-right">Realized gains</TableHead>
          <TableHead className="w-28">Purity</TableHead>
          <TableHead className="text-right">Gains to purify</TableHead>
          <TableHead className="text-right">Dividends to purify</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const purifyPct =
            row.realizedGains > 0
              ? (row.gainsToPurify / row.realizedGains) * 100
              : 0;
          const compliantPct = 100 - purifyPct;

          return (
            <TableRow key={row.companyId}>
              <TableCell>
                <Link
                  href={`/companies/${row.companyId}`}
                  className="hover:underline"
                >
                  {row.name} ({row.ticker})
                </Link>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.sharesHeld}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.avgCost !== null ? row.avgCost.toFixed(4) : '—'}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.breakeven !== null ? row.breakeven.toFixed(4) : '—'}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.realizedGains.toFixed(2)}
              </TableCell>
              <TableCell>
                {row.realizedGains > 0 ? (
                  <PurityBar
                    compliantPct={compliantPct}
                    purifyPct={purifyPct}
                    size="sm"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.gainsToPurify.toFixed(2)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.dividendsToPurify.toFixed(2)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
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
          <TableHead className="text-right">Gains to purify</TableHead>
          <TableHead className="text-right">Dividends to purify</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.companyId}>
            <TableCell>
              <Link href={`/companies/${row.companyId}`} className="hover:underline">
                {row.name} ({row.ticker})
              </Link>
            </TableCell>
            <TableCell className="text-right">{row.sharesHeld}</TableCell>
            <TableCell className="text-right">
              {row.avgCost !== null ? row.avgCost.toFixed(4) : "—"}
            </TableCell>
            <TableCell className="text-right">
              {row.breakeven !== null ? row.breakeven.toFixed(4) : "—"}
            </TableCell>
            <TableCell className="text-right">{row.realizedGains.toFixed(2)}</TableCell>
            <TableCell className="text-right">{row.gainsToPurify.toFixed(2)}</TableCell>
            <TableCell className="text-right">{row.dividendsToPurify.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

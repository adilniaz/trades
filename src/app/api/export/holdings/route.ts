import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { toCsv } from "@/lib/export-utils";
import { toTxn } from "@/lib/to-txn";
import {
  position,
  avgCost,
  realizedGains,
  purifiableGains,
  purifiableDividends,
  breakeven,
} from "@/lib/calculations";

export async function GET() {
  const result = await requireAuthApi();
  if ("error" in result) return result.error;

  const settings = await getSettings();

  const companies = await prisma.company.findMany({
    where: { status: "APPROVED", deletedAt: null },
    include: {
      transactions: {
        where: { userId: result.id, deletedAt: null },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: (string | number | null)[][] = [];

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

    rows.push([
      c.name,
      c.ticker,
      sharesHeld,
      ac,
      be,
      gains,
      purGains,
      purDivs,
    ]);
  }

  const csv = toCsv(
    ["Company", "Ticker", "Shares Held", "Avg Cost", "Breakeven", "Realized Gains", "Gains to Purify", "Dividends to Purify"],
    rows.map((row) => row.map((v) => (typeof v === "number" ? v.toFixed(4) : v ?? "")))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="holdings.csv"',
    },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { transactionSchema } from "@/lib/validation/transaction";
import { checkImportSize } from "@/lib/import-limits";
import { activeCompanyWhere } from "@/lib/prisma-where";

export type ImportResult = {
  created: number;
  skipped: { line: string; reason: string }[];
  error?: string;
};

export async function bulkImportTransactions(
  csvText: string
): Promise<ImportResult> {
  const user = await requireAuth();

  const lines = csvText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { created: 0, skipped: [] };
  }

  // Check header
  const header = lines[0].toLowerCase();
  if (!header.includes("date") || !header.includes("ticker") || !header.includes("type")) {
    return { created: 0, skipped: [{ line: lines[0], reason: "Invalid header" }] };
  }

  const sizeError = checkImportSize(csvText, lines.length - 1);
  if (sizeError) return { created: 0, skipped: [], error: sizeError };

  const skipped: { line: string; reason: string }[] = [];
  let created = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 4) {
      skipped.push({ line, reason: `Expected at least 4 columns (date,ticker,type,shares,pricePerShare,amount), got ${parts.length}` });
      continue;
    }

    const [dateStr, ticker, type, sharesStr, priceStr, amountStr] = parts;

    // Route through the same schema addTransaction/updateTransaction use, so
    // a CSV row can't pass with data the form would reject.
    const parsed = transactionSchema.safeParse({
      type: type.toUpperCase(),
      date: dateStr,
      shares: sharesStr || undefined,
      pricePerShare: priceStr || undefined,
      amount: amountStr || undefined,
    });
    if (!parsed.success) {
      skipped.push({ line, reason: parsed.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }
    const { type: txnType, date, shares, pricePerShare, amount } = parsed.data;

    const company = await prisma.company.findFirst({
      where: activeCompanyWhere({ ticker: ticker.toUpperCase() }),
    });

    if (!company || company.status !== "APPROVED") {
      skipped.push({ line, reason: `Company not found or not approved: ${ticker}` });
      continue;
    }

    // Create + audit log are atomic per row, so a crash never leaves a
    // transaction without its audit entry — rows still commit one at a
    // time, matching the existing partial-import behavior for CSV files.
    await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          userId: user.id,
          companyId: company.id,
          type: txnType,
          date,
          shares: txnType === "DIVIDEND" ? undefined : shares,
          pricePerShare: txnType === "DIVIDEND" ? undefined : pricePerShare,
          amount: txnType === "DIVIDEND" ? amount : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "transaction.bulkImport",
          targetType: "Transaction",
          targetId: txn.id,
          before: Prisma.DbNull,
          after: {
            companyTicker: company.ticker,
            type: txnType,
            date: date.toISOString(),
            shares: shares ?? null,
            pricePerShare: pricePerShare ?? null,
            amount: amount ?? null,
          },
        },
      });
    });

    created++;
  }

  revalidatePath("/overview");
  return { created, skipped };
}

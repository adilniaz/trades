"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import pdfParse from "pdf-parse";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { transactionSchema } from "@/lib/validation/transaction";
import { checkImportSize, checkPdfUpload } from "@/lib/import-limits";
import { activeCompanyWhere } from "@/lib/prisma-where";
import { parseStatementText } from "@/lib/pdf-statement-parser";
import { matchCompanyByIsin, hasDuplicateTransaction } from "@/lib/pdf-import-matching";

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

export type PdfReviewRow = {
  id: string;
  unparsed: boolean;
  raw?: string;
  date?: string;
  type?: "BUY" | "SELL";
  isin?: string;
  companyName?: string;
  quantity?: number;
  pricePerShare?: number;
  amount?: number;
  matchedCompanyId?: string;
  matchedTicker?: string;
  isDuplicate: boolean;
};

export type ParsePdfResult = { rows: PdfReviewRow[] } | { error: string };

export async function parsePdfStatement(formData: FormData): Promise<ParsePdfResult> {
  const user = await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file uploaded" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sizeError = checkPdfUpload(buffer);
  if (sizeError) return { error: sizeError };

  let text: string;
  try {
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } catch {
    return { error: "Could not read PDF — the file may be corrupted or password-protected" };
  }

  const parsedRows = parseStatementText(text);
  if (parsedRows.length === 0) {
    return { error: "No transactions found in this statement" };
  }

  const rows: PdfReviewRow[] = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if ("unparsed" in row) {
      rows.push({ id: `row-${i}`, unparsed: true, raw: row.raw, isDuplicate: false });
      continue;
    }

    const company = await matchCompanyByIsin(row.isin);
    const isDuplicate = company
      ? await hasDuplicateTransaction({
          userId: user.id,
          companyId: company.id,
          type: row.type,
          date: row.date,
          shares: row.quantity,
        })
      : false;

    rows.push({
      id: `row-${i}`,
      unparsed: false,
      date: row.date.toISOString().slice(0, 10),
      type: row.type,
      isin: row.isin,
      companyName: row.companyName,
      quantity: row.quantity,
      pricePerShare: row.pricePerShare,
      amount: row.amount,
      matchedCompanyId: company?.id,
      matchedTicker: company?.ticker,
      isDuplicate,
    });
  }

  return { rows };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";

export type ImportResult = {
  created: number;
  skipped: { line: string; reason: string }[];
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

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      skipped.push({ line, reason: "Invalid date" });
      continue;
    }

    if (!["BUY", "SELL", "DIVIDEND"].includes(type.toUpperCase())) {
      skipped.push({ line, reason: `Invalid type: ${type}. Must be BUY, SELL, or DIVIDEND` });
      continue;
    }

    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
    });

    if (!company || company.deletedAt || company.status !== "APPROVED") {
      skipped.push({ line, reason: `Company not found or not approved: ${ticker}` });
      continue;
    }

    const txnType = type.toUpperCase() as "BUY" | "SELL" | "DIVIDEND";

    if (txnType === "DIVIDEND") {
      const amount = amountStr ? Number(amountStr) : 0;
      if (isNaN(amount) || amount <= 0) {
        skipped.push({ line, reason: "Invalid amount for DIVIDEND" });
        continue;
      }

      await prisma.transaction.create({
        data: {
          userId: user.id,
          companyId: company.id,
          type: txnType,
          date,
          amount,
        },
      });
    } else {
      const shares = sharesStr ? Number(sharesStr) : 0;
      const price = priceStr ? Number(priceStr) : 0;

      if (isNaN(shares) || shares <= 0) {
        skipped.push({ line, reason: "Invalid shares" });
        continue;
      }
      if (isNaN(price) || price <= 0) {
        skipped.push({ line, reason: "Invalid price per share" });
        continue;
      }

      await prisma.transaction.create({
        data: {
          userId: user.id,
          companyId: company.id,
          type: txnType,
          date,
          shares,
          pricePerShare: price,
        },
      });
    }

    created++;
  }

  revalidatePath("/overview");
  return { created, skipped };
}

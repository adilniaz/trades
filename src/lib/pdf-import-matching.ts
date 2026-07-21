import { prisma } from "@/lib/prisma";
import { activeCompanyWhere, activeTransactionWhere } from "@/lib/prisma-where";
import type { TransactionType } from "@prisma/client";

export async function matchCompanyByIsin(isin: string) {
  return prisma.company.findFirst({
    where: activeCompanyWhere({ isin, status: "APPROVED" }),
  });
}

/**
 * A row counts as a likely duplicate if the same user already has a
 * transaction for the same company, type, share count, and calendar day —
 * matching what re-uploading an overlapping statement date range would
 * produce.
 */
export async function hasDuplicateTransaction(params: {
  userId: string;
  companyId: string;
  type: TransactionType;
  date: Date;
  shares: number;
}): Promise<boolean> {
  const dayStart = new Date(params.date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(params.date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const existing = await prisma.transaction.findFirst({
    where: activeTransactionWhere({
      userId: params.userId,
      companyId: params.companyId,
      type: params.type,
      date: { gte: dayStart, lte: dayEnd },
      shares: params.shares,
    }),
  });
  return existing !== null;
}

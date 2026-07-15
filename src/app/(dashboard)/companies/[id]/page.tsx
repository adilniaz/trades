import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  purifiableGains,
  purifiableDividends,
} from "@/lib/calculations";
import { toTxn } from "@/lib/to-txn";
import { activeTransactionWhere } from "@/lib/prisma-where";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { MarkPurifiedButton } from "@/components/transactions/mark-purified-button";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
  });

  if (!company || company.deletedAt || company.status !== "APPROVED") {
    notFound();
  }

  const transactions = await prisma.transaction.findMany({
    where: activeTransactionWhere({ companyId: id, userId: user.id }),
    orderBy: { date: "asc" },
  });

  const txns = transactions.map(toTxn);
  const nonCompliantPct = Number(company.nonCompliantPct) / 100;
  const gainsToPurify = purifiableGains(txns, nonCompliantPct);
  const dividendsToPurify = purifiableDividends(txns, nonCompliantPct);

  // For the table, show in descending order
  const tableTxns = [...transactions].reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">
        {company.name} ({company.ticker})
      </h1>

      <div className="flex items-center gap-4 rounded border p-3 text-sm">
        <span>Unpurified gains: {gainsToPurify.toFixed(2)}</span>
        <span>Unpurified dividends: {dividendsToPurify.toFixed(2)}</span>
        <MarkPurifiedButton
          companyId={id}
          total={gainsToPurify + dividendsToPurify}
        />
      </div>

      <section>
        <h2 className="mb-4 text-base font-medium">Add Transaction</h2>
        <TransactionForm companyId={id} />
      </section>

      <section>
        <h2 className="mb-4 text-base font-medium">Transaction History</h2>
        <TransactionTable
          companyId={id}
          transactions={tableTxns.map((t) => ({
            id: t.id,
            type: t.type,
            date: t.date,
            shares: t.shares === null ? null : Number(t.shares),
            pricePerShare:
              t.pricePerShare === null ? null : Number(t.pricePerShare),
            amount: t.amount === null ? null : Number(t.amount),
            purifiedAt: t.purifiedAt,
          }))}
        />
      </section>
    </div>
  );
}

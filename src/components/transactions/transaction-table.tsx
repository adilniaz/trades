'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  TransactionForm,
  type Transaction,
} from '@/components/transactions/transaction-form';
import { deleteTransaction } from '@/app/(dashboard)/companies/[id]/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Display a date using UTC getters so users in negative-UTC time zones see
 * the date exactly as they typed it — avoids the off-by-one-day bug that
 * occurs when `new Date("YYYY-MM-DD")` is converted to local time.
 */
function formatUtcDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  companyId: string;
  transactions: Transaction[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionTable({ companyId, transactions }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleEditDone = () => {
    setEditingId(null);
    router.refresh();
  };

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No transactions yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">Price / Share</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Purified</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((txn) => {
            if (editingId === txn.id) {
              return (
                <TableRow key={txn.id}>
                  <TableCell colSpan={7}>
                    <TransactionForm
                      companyId={companyId}
                      editing={txn}
                      onDone={handleEditDone}
                    />
                  </TableCell>
                </TableRow>
              );
            }

            return (
              <TableRow key={txn.id}>
                <TableCell className="font-mono tabular-nums">
                  {formatUtcDate(txn.date)}
                </TableCell>
                <TableCell>{txn.type}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {txn.shares !== null ? txn.shares : '—'}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {txn.pricePerShare !== null ? txn.pricePerShare : '—'}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {txn.amount !== null ? txn.amount : '—'}
                </TableCell>
                <TableCell>{txn.purifiedAt ? 'Yes' : 'No'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setEditingId(txn.id)}
                    >
                      Edit
                    </Button>
                    <ConfirmationDialog
                      title="Delete this transaction?"
                      description="This cannot be undone."
                      confirmLabel="Delete"
                      variant="destructive"
                      onConfirm={() =>
                        new Promise<void>((resolve) => {
                          startTransition(async () => {
                            const result = await deleteTransaction(
                              txn.id,
                              companyId,
                            );
                            if (result.error) toast.error(String(result.error));
                            else toast.success('Transaction deleted');
                            router.refresh();
                            resolve();
                          });
                        })
                      }
                    >
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={isPending}
                      >
                        Delete
                      </Button>
                    </ConfirmationDialog>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

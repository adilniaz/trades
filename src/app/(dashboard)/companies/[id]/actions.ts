'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { position } from '@/lib/calculations';
import { toTxn } from '@/lib/to-txn';
import { activeTransactionWhere } from '@/lib/prisma-where';
import {
  transactionSchema,
  type TransactionInput,
} from '@/lib/validation/transaction';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTransactionFields(data: TransactionInput) {
  if (data.type === 'DIVIDEND') {
    return { ...data, shares: undefined, pricePerShare: undefined };
  }
  return { ...data, amount: undefined };
}

// Current share count for this user/company, optionally excluding one
// transaction (used when editing an existing SELL, so it isn't checked
// against a position total that still includes its own prior shares).
async function getLivePosition(
  companyId: string,
  userId: string,
  excludeTransactionId?: string,
): Promise<number> {
  const rows = await prisma.transaction.findMany({
    where: activeTransactionWhere({
      companyId,
      userId,
      ...(excludeTransactionId ? { id: { not: excludeTransactionId } } : {}),
    }),
  });
  return position(rows.map(toTxn));
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export async function addTransaction(
  companyId: string,
  input: TransactionInput,
) {
  const user = await requireAuth({ roles: ['USER'] });

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Guard: company must exist, be APPROVED, and not deleted
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!company || company.deletedAt || company.status !== 'APPROVED') {
    return { error: 'Company not found or not available' };
  }

  const normalized = normalizeTransactionFields(parsed.data);

  if (normalized.type === 'SELL') {
    const currentPosition = await getLivePosition(companyId, user.id);
    if ((normalized.shares ?? 0) > currentPosition) {
      return {
        error: {
          shares: [
            `Cannot sell ${normalized.shares} shares — only ${currentPosition} currently held`,
          ],
        },
      };
    }
  }

  await prisma.transaction.create({
    data: {
      userId: user.id,
      companyId,
      type: normalized.type as 'BUY' | 'SELL' | 'DIVIDEND',
      date: normalized.date,
      shares: normalized.shares,
      pricePerShare: normalized.pricePerShare,
      amount: normalized.amount,
    },
  });

  revalidatePath(`/companies/${companyId}`);
  revalidatePath('/overview');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateTransaction(
  id: string,
  companyId: string,
  input: TransactionInput,
) {
  const user = await requireAuth({ roles: ['USER'] });

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const normalized = normalizeTransactionFields(parsed.data);

  if (normalized.type === 'SELL') {
    const currentPosition = await getLivePosition(companyId, user.id, id);
    if ((normalized.shares ?? 0) > currentPosition) {
      return {
        error: {
          shares: [
            `Cannot sell ${normalized.shares} shares — only ${currentPosition} currently held`,
          ],
        },
      };
    }
  }

  const result = await prisma.transaction.updateMany({
    where: activeTransactionWhere({ id, userId: user.id }),
    data: {
      type: normalized.type as 'BUY' | 'SELL' | 'DIVIDEND',
      date: normalized.date,
      shares: normalized.shares,
      pricePerShare: normalized.pricePerShare,
      amount: normalized.amount,
    },
  });

  if (result.count === 0) {
    return { error: 'Transaction not found' };
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath('/overview');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete (soft-delete)
// ---------------------------------------------------------------------------

export async function deleteTransaction(id: string, companyId: string) {
  const user = await requireAuth({ roles: ['USER'] });

  const result = await prisma.transaction.updateMany({
    where: activeTransactionWhere({ id, userId: user.id }),
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) {
    return { error: 'Transaction not found' };
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath('/overview');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mark as purified
// ---------------------------------------------------------------------------

export async function markPurified(companyId: string) {
  const user = await requireAuth({ roles: ['USER'] });
  await prisma.transaction.updateMany({
    where: activeTransactionWhere({
      companyId,
      userId: user.id,
      purifiedAt: null,
    }),
    data: { purifiedAt: new Date() },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath('/overview');
}

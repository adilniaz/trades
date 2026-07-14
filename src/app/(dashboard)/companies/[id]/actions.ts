"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import {
  transactionSchema,
  type TransactionInput,
} from "@/lib/validation/transaction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTransactionFields(data: TransactionInput) {
  if (data.type === "DIVIDEND") {
    return { ...data, shares: undefined, pricePerShare: undefined };
  }
  return { ...data, amount: undefined };
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export async function addTransaction(
  companyId: string,
  input: TransactionInput
) {
  const user = await requireAuth();

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Guard: company must exist, be APPROVED, and not deleted
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!company || company.deletedAt || company.status !== "APPROVED") {
    return { error: "Company not found or not available" };
  }

  const normalized = normalizeTransactionFields(parsed.data);

  await prisma.transaction.create({
    data: {
      userId: user.id,
      companyId,
      type: normalized.type as "BUY" | "SELL" | "DIVIDEND",
      date: normalized.date,
      shares: normalized.shares,
      pricePerShare: normalized.pricePerShare,
      amount: normalized.amount,
    },
  });

  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateTransaction(
  id: string,
  companyId: string,
  input: TransactionInput
) {
  const user = await requireAuth();

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const normalized = normalizeTransactionFields(parsed.data);

  const result = await prisma.transaction.updateMany({
    where: { id, userId: user.id, deletedAt: null },
    data: {
      type: normalized.type as "BUY" | "SELL" | "DIVIDEND",
      date: normalized.date,
      shares: normalized.shares,
      pricePerShare: normalized.pricePerShare,
      amount: normalized.amount,
    },
  });

  if (result.count === 0) {
    return { error: "Transaction not found" };
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete (soft-delete)
// ---------------------------------------------------------------------------

export async function deleteTransaction(id: string, companyId: string) {
  const user = await requireAuth();

  const result = await prisma.transaction.updateMany({
    where: { id, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) {
    return { error: "Transaction not found" };
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mark as purified
// ---------------------------------------------------------------------------

export async function markPurified(companyId: string) {
  const user = await requireAuth();
  await prisma.transaction.updateMany({
    where: { companyId, userId: user.id, deletedAt: null, purifiedAt: null },
    data: { purifiedAt: new Date() },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/overview");
}

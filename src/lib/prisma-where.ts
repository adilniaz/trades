import type { Prisma } from "@prisma/client";

// Centralizes the `deletedAt: null` filter every Company/Transaction query
// must apply (per AGENTS.md's soft-delete hard rule) behind one reviewable
// helper, instead of it being hand-typed at each call site. Purely additive
// merge — does not change the shape of any `where` clause it's used in.
export function activeCompanyWhere<T extends Prisma.CompanyWhereInput>(
  extra?: T
): T & { deletedAt: null } {
  return { ...(extra as T), deletedAt: null };
}

export function activeTransactionWhere<T extends Prisma.TransactionWhereInput>(
  extra?: T
): T & { deletedAt: null } {
  return { ...(extra as T), deletedAt: null };
}

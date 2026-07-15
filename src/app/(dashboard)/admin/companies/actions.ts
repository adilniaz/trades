"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { companySchema } from "@/lib/validation/company";
import { checkImportSize } from "@/lib/import-limits";
import { activeCompanyWhere, activeTransactionWhere } from "@/lib/prisma-where";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCompany(formData: FormData) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const raw = Object.fromEntries(formData.entries());
  // Convert empty nextDividendDate string to undefined so zod coerce doesn't
  // turn it into an invalid date.
  if (raw.nextDividendDate === "" || raw.nextDividendDate === undefined) {
    delete raw.nextDividendDate;
  }
  if (raw.dividendPeriod === "") raw.dividendPeriod = undefined as unknown as string;

  const parsed = companySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, ticker, nonCompliantPct, dividendPeriod, nextDividendDate } = parsed.data;

  let company;
  try {
    company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          name,
          ticker,
          nonCompliantPct,
          dividendPeriod: dividendPeriod ?? undefined,
          nextDividendDate: nextDividendDate ?? undefined,
          status: "APPROVED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "company.create",
          targetType: "Company",
          targetId: created.id,
          before: Prisma.DbNull,
          after: {
            name,
            ticker,
            nonCompliantPct: Number(created.nonCompliantPct),
            dividendPeriod: dividendPeriod ?? null,
            nextDividendDate: nextDividendDate ?? null,
          },
        },
      });
      return created;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: { ticker: ["A company with this ticker already exists"] } };
    }
    throw e;
  }

  revalidatePath("/admin/companies");
  return { success: true, id: company.id };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCompany(companyId: string, formData: FormData) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const existing = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!existing || existing.deletedAt) {
    return { error: "Company not found" };
  }

  const raw = Object.fromEntries(formData.entries());
  if (raw.nextDividendDate === "" || raw.nextDividendDate === undefined) {
    delete raw.nextDividendDate;
  }
  if (raw.dividendPeriod === "") raw.dividendPeriod = undefined as unknown as string;

  const parsed = companySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, ticker, nonCompliantPct, dividendPeriod, nextDividendDate } = parsed.data;

  const before = {
    name: existing.name,
    ticker: existing.ticker,
    nonCompliantPct: Number(existing.nonCompliantPct),
    dividendPeriod: existing.dividendPeriod,
    nextDividendDate: existing.nextDividendDate,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: activeCompanyWhere({ id: companyId }),
        data: {
          name,
          ticker,
          nonCompliantPct,
          dividendPeriod: dividendPeriod ?? undefined,
          nextDividendDate: nextDividendDate ?? undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "company.update",
          targetType: "Company",
          targetId: updated.id,
          before,
          after: {
            name,
            ticker,
            nonCompliantPct: Number(updated.nonCompliantPct),
            dividendPeriod: dividendPeriod ?? null,
            nextDividendDate: nextDividendDate ?? null,
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { error: "Company not found" };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: { ticker: ["A company with this ticker already exists"] } };
    }
    throw e;
  }

  revalidatePath("/admin/companies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete (soft-delete with live-holdings protection)
// ---------------------------------------------------------------------------

export async function deleteCompany(companyId: string, force = false) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      transactions: {
        where: activeTransactionWhere(),
      },
    },
  });
  if (!company || company.deletedAt) {
    return { error: "Company not found" };
  }

  // Compute total live shares using a simple sum
  const liveShares = company.transactions.reduce((sum, t) => {
    const s = Number(t.shares ?? 0);
    if (t.type === "BUY") return sum + s;
    if (t.type === "SELL") return sum - s;
    return sum;
  }, 0);

  // If there are live positions, inform the caller
  if (!force && liveShares > 0) {
    return { error: "HOLD_LIVE_TRANSACTIONS", count: company.transactions.length };
  }

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: activeCompanyWhere({ id: companyId }),
      data: { deletedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "company.delete",
        targetType: "Company",
        targetId: companyId,
        before: { name: company.name, ticker: company.ticker },
        after: Prisma.DbNull,
      },
    });
  });

  revalidatePath("/admin/companies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Approve a pending company request (promote PENDING → APPROVED)
// ---------------------------------------------------------------------------

export async function approveCompanyRequest(requestId: string, formData: FormData) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const pending = await prisma.company.findUnique({
    where: { id: requestId },
  });
  if (!pending || pending.status !== "PENDING" || pending.deletedAt) {
    return { error: "Pending request not found" };
  }

  const raw = Object.fromEntries(formData.entries());
  if (raw.nextDividendDate === "" || raw.nextDividendDate === undefined) {
    delete raw.nextDividendDate;
  }
  if (raw.dividendPeriod === "") raw.dividendPeriod = undefined as unknown as string;

  const parsed = companySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, ticker, nonCompliantPct, dividendPeriod, nextDividendDate } = parsed.data;

  const before = {
    name: pending.name,
    ticker: pending.ticker,
    nonCompliantPct: Number(pending.nonCompliantPct),
    dividendPeriod: pending.dividendPeriod,
    nextDividendDate: pending.nextDividendDate,
    status: pending.status,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: activeCompanyWhere({ id: requestId, status: "PENDING" }),
        data: {
          name,
          ticker,
          nonCompliantPct,
          dividendPeriod: dividendPeriod ?? undefined,
          nextDividendDate: nextDividendDate ?? undefined,
          status: "APPROVED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "company.approve",
          targetType: "Company",
          targetId: updated.id,
          before,
          after: {
            name,
            ticker,
            nonCompliantPct: Number(updated.nonCompliantPct),
            dividendPeriod: dividendPeriod ?? null,
            nextDividendDate: nextDividendDate ?? null,
            status: "APPROVED",
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { error: "Pending request not found" };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: { ticker: ["A company with this ticker already exists"] } };
    }
    throw e;
  }

  revalidatePath("/admin/companies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reject a pending company request (hard-delete — documented exception)
// ---------------------------------------------------------------------------

export async function rejectCompanyRequest(requestId: string) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const pending = await prisma.company.findFirst({
    where: activeCompanyWhere({ id: requestId, status: "PENDING" }),
  });
  if (!pending) return { error: "Company request not found or already processed" };

  // Capture data for the audit log BEFORE deleting (needed after the row is gone).
  const beforeData = { name: pending.name, ticker: pending.ticker, status: "PENDING" };

  // Hard delete, not soft delete — documented exception in Global Constraints.
  // Delete and audit log are wrapped together so a failure on either side
  // rolls back both, rather than relying on operation ordering.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.company.delete({ where: { id: requestId } });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "company.reject",
          targetType: "Company",
          targetId: requestId,
          before: beforeData,
          after: Prisma.DbNull,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { error: "Company request not found or already processed" };
    }
    throw e;
  }

  revalidatePath("/admin/companies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk import (naive comma-split CSV — no quoted-field handling)
// ---------------------------------------------------------------------------

type ImportResult = {
  created: number;
  skipped: { row: number; reason: string }[];
  error?: string;
};

export async function bulkImportCompanies(csvText: string): Promise<ImportResult> {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const result: ImportResult = { created: 0, skipped: [] };
  const lines = csvText.split("\n").filter((l) => l.trim().length > 0);
  // Skip header row if present (assume first row with "Name" or "name" is header)
  const hasHeader = lines.length > 0 &&
    /^name[,\s]|^"name"|^,?name/i.test(lines[0].trim());
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const sizeError = checkImportSize(csvText, dataLines.length);
  if (sizeError) return { created: 0, skipped: [], error: sizeError };

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = hasHeader ? i + 2 : i + 1;
    const parts = dataLines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) {
      result.skipped.push({ row: rowNum, reason: "Not enough columns" });
      continue;
    }

    // Route through the same schema the "Add company" form uses, so a CSV
    // row can't pass with data the form would reject (or vice versa).
    const parsed = companySchema.safeParse({
      name: parts[0],
      ticker: parts[1],
      nonCompliantPct: parts[2],
    });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Invalid row";
      result.skipped.push({ row: rowNum, reason: firstIssue });
      continue;
    }
    const { name, ticker, nonCompliantPct } = parsed.data;

    // Check for duplicate ticker among active companies only. A soft-deleted
    // company's ticker is free to reuse — uniqueness is enforced by a
    // partial unique index (WHERE "deletedAt" IS NULL, see schema.prisma),
    // so no mangling/recycling workaround is needed here.
    const existing = await prisma.company.findFirst({
      where: activeCompanyWhere({ ticker }),
    });
    if (existing) {
      result.skipped.push({ row: rowNum, reason: `Ticker ${ticker} already exists` });
      continue;
    }

    // Each row's create + audit log is atomic, so a crash never leaves a
    // company without its audit entry — but rows are still committed one at
    // a time (not one big transaction), preserving today's partial-import
    // behavior where earlier rows in the file survive a later row's failure.
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          ticker,
          nonCompliantPct,
          status: "APPROVED",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "company.bulkImport",
          targetType: "Company",
          targetId: company.id,
          before: Prisma.DbNull,
          after: {
            name,
            ticker,
            nonCompliantPct: Number(company.nonCompliantPct),
          },
        },
      });
    });

    result.created++;
  }

  revalidatePath("/admin/companies");
  return result;
}

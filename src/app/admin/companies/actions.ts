"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { companySchema } from "@/lib/validation/company";

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
    company = await prisma.company.create({
      data: {
        name,
        ticker,
        nonCompliantPct,
        dividendPeriod: dividendPeriod ?? undefined,
        nextDividendDate: nextDividendDate ?? undefined,
        status: "APPROVED",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: { ticker: ["A company with this ticker already exists"] } };
    }
    throw e;
  }

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.create",
      targetType: "Company",
      targetId: company.id,
      before: Prisma.DbNull,
      after: {
        name,
        ticker,
        nonCompliantPct: Number(company.nonCompliantPct),
        dividendPeriod: dividendPeriod ?? null,
        nextDividendDate: nextDividendDate ?? null,
      },
    },
  });

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

  let company;
  try {
    company = await prisma.company.update({
      where: { id: companyId, deletedAt: null },
      data: {
        name,
        ticker,
        nonCompliantPct,
        dividendPeriod: dividendPeriod ?? undefined,
        nextDividendDate: nextDividendDate ?? undefined,
      },
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

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.update",
      targetType: "Company",
      targetId: company.id,
      before,
      after: {
        name,
        ticker,
        nonCompliantPct: Number(company.nonCompliantPct),
        dividendPeriod: dividendPeriod ?? null,
        nextDividendDate: nextDividendDate ?? null,
      },
    },
  });

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
        where: { deletedAt: null },
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

  await prisma.company.update({
    where: { id: companyId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.delete",
      targetType: "Company",
      targetId: companyId,
      before: { name: company.name, ticker: company.ticker },
      after: Prisma.DbNull,
    },
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

  let company;
  try {
    company = await prisma.company.update({
      where: { id: requestId, status: "PENDING", deletedAt: null },
      data: {
        name,
        ticker,
        nonCompliantPct,
        dividendPeriod: dividendPeriod ?? undefined,
        nextDividendDate: nextDividendDate ?? undefined,
        status: "APPROVED",
      },
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

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.approve",
      targetType: "Company",
      targetId: company.id,
      before,
      after: {
        name,
        ticker,
        nonCompliantPct: Number(company.nonCompliantPct),
        dividendPeriod: dividendPeriod ?? null,
        nextDividendDate: nextDividendDate ?? null,
        status: "APPROVED",
      },
    },
  });

  revalidatePath("/admin/companies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reject a pending company request (hard-delete — documented exception)
// ---------------------------------------------------------------------------

export async function rejectCompanyRequest(requestId: string) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const pending = await prisma.company.findFirst({
    where: { id: requestId, status: "PENDING", deletedAt: null },
  });
  if (!pending) return { error: "Company request not found or already processed" };

  // Capture data for the audit log BEFORE deleting (needed after the row is gone).
  const beforeData = { name: pending.name, ticker: pending.ticker, status: "PENDING" };

  // Hard delete, not soft delete — documented exception in Global Constraints.
  try {
    await prisma.company.delete({ where: { id: requestId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { error: "Company request not found or already processed" };
    }
    throw e;
  }

  // Write audit log AFTER the delete succeeds, so we never log an action
  // that didn't actually complete (the old ordering logged first, creating
  // an orphaned audit entry if the delete threw).
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "company.reject",
      targetType: "Company",
      targetId: requestId,
      before: beforeData,
      after: Prisma.DbNull,
    },
  });

  revalidatePath("/admin/companies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk import (naive comma-split CSV — no quoted-field handling)
// ---------------------------------------------------------------------------

type ImportResult = {
  created: number;
  skipped: { row: number; reason: string }[];
};

export async function bulkImportCompanies(csvText: string): Promise<ImportResult> {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const result: ImportResult = { created: 0, skipped: [] };
  const lines = csvText.split("\n").filter((l) => l.trim().length > 0);
  // Skip header row if present (assume first row with "Name" or "name" is header)
  const hasHeader = lines.length > 0 &&
    /^name[,\s]|^"name"|^,?name/i.test(lines[0].trim());
  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = hasHeader ? i + 2 : i + 1;
    const parts = dataLines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) {
      result.skipped.push({ row: rowNum, reason: "Not enough columns" });
      continue;
    }

    const name = parts[0];
    const ticker = parts[1].toUpperCase();
    const pctRaw = parts[2];

    if (!name || !ticker) {
      result.skipped.push({ row: rowNum, reason: "Missing name or ticker" });
      continue;
    }

    // Check for duplicate ticker — the @unique constraint covers ALL rows,
    // not just active ones. A soft-deleted company still occupies the ticker.
    const existing = await prisma.company.findUnique({
      where: { ticker },
    });
    if (existing) {
      // Check both non-deleted and soft-deleted — the ticker @unique constraint
      // covers ALL rows, not just active ones. A soft-deleted company still
      // occupies the ticker, so creating a new one with the same ticker would
      // crash with a unique constraint violation. We can "recycle" the ticker
      // by clearing it from the soft-deleted row first.
      if (existing.deletedAt === null) {
        result.skipped.push({ row: rowNum, reason: `Ticker ${ticker} already exists` });
        continue;
      }
      // Soft-deleted: free the ticker by appending a deletion suffix, so the
      // new import can claim it without a constraint violation.
      await prisma.company.update({
        where: { id: existing.id },
        data: { ticker: `${ticker}_DELETED_${existing.id.slice(0, 8)}` },
      });
    }

    let nonCompliantPct = 0;
    if (pctRaw) {
      const n = parseFloat(pctRaw);
      if (isNaN(n) || n < 0 || n > 100) {
        result.skipped.push({
          row: rowNum,
          reason: `Invalid nonCompliantPct "${pctRaw}"`,
        });
        continue;
      }
      nonCompliantPct = n;
    }

    const company = await prisma.company.create({
      data: {
        name,
        ticker,
        nonCompliantPct,
        status: "APPROVED",
      },
    });

    await prisma.auditLog.create({
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

    result.created++;
  }

  revalidatePath("/admin/companies");
  return result;
}

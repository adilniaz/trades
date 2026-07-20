-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isin" TEXT;

-- CreateIndex
CREATE INDEX "Company_isin_idx" ON "Company"("isin");

-- Enforce ISIN uniqueness only among active (non-soft-deleted) rows,
-- mirroring the ticker partial-unique index pattern (see migration
-- 20260714140243_company_ticker_partial_unique). isin is optional and
-- Postgres unique indexes ignore NULLs, so any number of companies without
-- an ISIN can coexist.
CREATE UNIQUE INDEX "Company_isin_active_key" ON "Company"("isin") WHERE "deletedAt" IS NULL;

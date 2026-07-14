-- DropIndex
DROP INDEX "Company_ticker_key";

-- CreateIndex
CREATE INDEX "Company_ticker_idx" ON "Company"("ticker");

-- Enforce ticker uniqueness only among active (non-soft-deleted) rows, so a
-- soft-deleted company no longer permanently occupies its ticker. Prisma's
-- @@unique can't express a WHERE clause, so this partial unique index is
-- hand-written and has no corresponding schema.prisma @unique/@@unique
-- declaration (see the comment on Company.ticker in schema.prisma).
CREATE UNIQUE INDEX "Company_ticker_active_key" ON "Company"("ticker") WHERE "deletedAt" IS NULL;

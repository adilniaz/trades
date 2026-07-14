-- DropIndex
DROP INDEX "Transaction_userId_companyId_idx";

-- CreateIndex
CREATE INDEX "Company_status_deletedAt_idx" ON "Company"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_companyId_deletedAt_idx" ON "Transaction"("userId", "companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_deletedAt_idx" ON "Transaction"("userId", "deletedAt");

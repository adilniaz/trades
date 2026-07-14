-- CreateIndex
CREATE INDEX "Transaction_companyId_deletedAt_idx" ON "Transaction"("companyId", "deletedAt");

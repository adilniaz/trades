-- Remove REJECTED from CompanyStatus enum — never assigned to any row
-- (rejected company requests are hard-deleted, not status-changed)
ALTER TABLE "Company" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "CompanyStatus" RENAME TO "CompanyStatus_old";
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'APPROVED');
ALTER TABLE "Company" ALTER COLUMN "status" TYPE "CompanyStatus" USING ("status"::text::"CompanyStatus");
ALTER TABLE "Company" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
DROP TYPE "CompanyStatus_old";

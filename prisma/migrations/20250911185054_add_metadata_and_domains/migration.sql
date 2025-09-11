-- AlterTable
ALTER TABLE "Application" ADD COLUMN "description" TEXT;
ALTER TABLE "Application" ADD COLUMN "owner" TEXT;
ALTER TABLE "Application" ADD COLUMN "repoUrl" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "domains" TEXT;

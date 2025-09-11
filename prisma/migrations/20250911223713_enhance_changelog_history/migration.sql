-- AlterTable
ALTER TABLE "ChangeLog" ADD COLUMN "actionTaken" TEXT;
ALTER TABLE "ChangeLog" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "ChangeLog" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "ChangeLog" ADD COLUMN "approvedFields" TEXT;
ALTER TABLE "ChangeLog" ADD COLUMN "finalTargetCompanyId" TEXT;
ALTER TABLE "ChangeLog" ADD COLUMN "finalTargetCompanyName" TEXT;

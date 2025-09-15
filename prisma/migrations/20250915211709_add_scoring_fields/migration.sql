-- AlterTable
ALTER TABLE "Application" ADD COLUMN "apiSecurityIntegrationLevel" INTEGER;
ALTER TABLE "Application" ADD COLUMN "apiSecurityNA" BOOLEAN DEFAULT false;
ALTER TABLE "Application" ADD COLUMN "apiSecurityTool" TEXT;
ALTER TABLE "Application" ADD COLUMN "appFirewallIntegrationLevel" INTEGER;
ALTER TABLE "Application" ADD COLUMN "appFirewallTool" TEXT;
ALTER TABLE "Application" ADD COLUMN "dastIntegrationLevel" INTEGER;
ALTER TABLE "Application" ADD COLUMN "dastTool" TEXT;
ALTER TABLE "Application" ADD COLUMN "metadataLastReviewed" DATETIME;
ALTER TABLE "Application" ADD COLUMN "sastIntegrationLevel" INTEGER;
ALTER TABLE "Application" ADD COLUMN "sastTool" TEXT;

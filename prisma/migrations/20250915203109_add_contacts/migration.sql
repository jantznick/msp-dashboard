/*
  Warnings:

  - You are about to drop the `_ApplicationToContact` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `createdAt` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Contact` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "_ApplicationToContact_B_index";

-- DropIndex
DROP INDEX "_ApplicationToContact_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_ApplicationToContact";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT,
    "repoUrl" TEXT,
    "language" TEXT,
    "framework" TEXT,
    "serverEnvironment" TEXT,
    "facing" TEXT,
    "deploymentType" TEXT,
    "authProfiles" TEXT,
    "dataTypes" TEXT,
    CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("authProfiles", "companyId", "dataTypes", "deploymentType", "description", "facing", "framework", "id", "language", "name", "owner", "repoUrl", "serverEnvironment") SELECT "authProfiles", "companyId", "dataTypes", "deploymentType", "description", "facing", "framework", "id", "language", "name", "owner", "repoUrl", "serverEnvironment" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domains" TEXT,
    "engManager" TEXT,
    "language" TEXT,
    "framework" TEXT,
    "serverEnvironment" TEXT,
    "facing" TEXT,
    "deploymentType" TEXT,
    "authProfiles" TEXT,
    "dataTypes" TEXT
);
INSERT INTO "new_Company" ("authProfiles", "dataTypes", "deploymentType", "domains", "engManager", "facing", "framework", "id", "language", "name", "serverEnvironment") SELECT "authProfiles", "dataTypes", "deploymentType", "domains", "engManager", "facing", "framework", "id", "language", "name", "serverEnvironment" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");
CREATE TABLE "new_Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "companyId" TEXT,
    "applicationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contact" ("companyId", "createdAt", "email", "id", "name", "title") SELECT "companyId", "createdAt", "email", "id", "name", "title" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

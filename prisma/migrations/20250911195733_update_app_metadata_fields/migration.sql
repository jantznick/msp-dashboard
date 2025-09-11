/*
  Warnings:

  - You are about to drop the column `deploymentEnvironment` on the `Application` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT,
    "repoUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "language" TEXT,
    "framework" TEXT,
    "serverEnvironment" TEXT,
    "facing" TEXT,
    "deploymentType" TEXT,
    "authProfiles" TEXT,
    "dataTypes" TEXT,
    CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("companyId", "description", "framework", "id", "language", "name", "owner", "repoUrl") SELECT "companyId", "description", "framework", "id", "language", "name", "owner", "repoUrl" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

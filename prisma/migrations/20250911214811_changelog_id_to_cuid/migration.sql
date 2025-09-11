/*
  Warnings:

  - The primary key for the `ChangeLog` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChangeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userEmail" TEXT NOT NULL,
    "companyName" TEXT,
    "targetCompanyId" TEXT,
    "proposedCompanyName" TEXT,
    "changeDetails" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING'
);
INSERT INTO "new_ChangeLog" ("changeDetails", "companyName", "createdAt", "id", "proposedCompanyName", "status", "targetCompanyId", "userEmail") SELECT "changeDetails", "companyName", "createdAt", "id", "proposedCompanyName", "status", "targetCompanyId", "userEmail" FROM "ChangeLog";
DROP TABLE "ChangeLog";
ALTER TABLE "new_ChangeLog" RENAME TO "ChangeLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

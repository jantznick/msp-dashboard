-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChangeLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userEmail" TEXT NOT NULL,
    "companyName" TEXT,
    "targetCompanyId" TEXT,
    "proposedCompanyName" TEXT,
    "changeDetails" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING'
);
INSERT INTO "new_ChangeLog" ("changeDetails", "companyName", "createdAt", "id", "userEmail") SELECT "changeDetails", "companyName", "createdAt", "id", "userEmail" FROM "ChangeLog";
DROP TABLE "ChangeLog";
ALTER TABLE "new_ChangeLog" RENAME TO "ChangeLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

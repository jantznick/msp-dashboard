-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "users" TEXT,
    "notes" TEXT,
    "adminNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "userId" INTEGER,
    CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("adminNotes", "companyName", "contactPerson", "email", "id", "notes", "product", "requestType", "timestamp", "userId", "users") SELECT "adminNotes", "companyName", "contactPerson", "email", "id", "notes", "product", "requestType", "timestamp", "userId", "users" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

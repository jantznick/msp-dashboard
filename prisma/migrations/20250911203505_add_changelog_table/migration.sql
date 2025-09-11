-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userEmail" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "changeDetails" TEXT NOT NULL
);

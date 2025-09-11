/*
  Warnings:

  - The primary key for the `Application` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Company` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `product` on the `Request` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `Request` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `ScriptJob` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ScriptJob` table. All the data in the column will be lost.
  - You are about to drop the column `logFile` on the `ScriptJob` table. All the data in the column will be lost.
  - You are about to drop the column `scriptName` on the `ScriptJob` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - Added the required column `products` to the `Request` table without a default value. This is not possible if the table is not empty.
  - Added the required column `output` to the `ScriptJob` table without a default value. This is not possible if the table is not empty.

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
    CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("companyId", "description", "id", "name", "owner", "repoUrl") SELECT "companyId", "description", "id", "name", "owner", "repoUrl" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domains" TEXT
);
INSERT INTO "new_Company" ("domains", "id", "name") SELECT "domains", "id", "name" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");
CREATE TABLE "new_Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "products" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "users" TEXT,
    "notes" TEXT,
    "adminNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "applicationId" TEXT,
    CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("adminNotes", "applicationId", "id", "notes", "requestType", "status", "userId", "users") SELECT "adminNotes", "applicationId", "id", "notes", "requestType", "status", "userId", "users" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE TABLE "new_ScriptJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "ScriptJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScriptJob" ("id", "requestId", "status") SELECT "id", "requestId", "status" FROM "ScriptJob";
DROP TABLE "ScriptJob";
ALTER TABLE "new_ScriptJob" RENAME TO "ScriptJob";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "companyId" TEXT,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("companyId", "email", "id", "password") SELECT "companyId", "email", "id", "password" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

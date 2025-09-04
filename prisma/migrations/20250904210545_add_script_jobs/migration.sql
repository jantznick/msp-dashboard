-- CreateTable
CREATE TABLE "ScriptJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "scriptName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "logFile" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    CONSTRAINT "ScriptJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ScriptJob_requestId_key" ON "ScriptJob"("requestId");

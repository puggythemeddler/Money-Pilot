/*
  Warnings:

  - You are about to alter the column `openingBalanceMinor` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amountMinor` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amountMinor` on the `transfers` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "period" TEXT NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "debts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LOAN',
    "institution" TEXT,
    "principalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "interestRate" TEXT,
    "minimumPaymentMinor" BIGINT,
    "dueDay" INTEGER,
    "categoryId" TEXT,
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "debts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "debts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "dueDay" INTEGER NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bills_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BANK',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "openingBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("archivedAt", "createdAt", "currency", "id", "name", "openingBalanceMinor", "type", "updatedAt", "userId") SELECT "archivedAt", "createdAt", "currency", "id", "name", "openingBalanceMinor", "type", "updatedAt", "userId" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
CREATE INDEX "accounts_userId_archivedAt_idx" ON "accounts"("userId", "archivedAt");
CREATE UNIQUE INDEX "accounts_userId_name_key" ON "accounts"("userId", "name");
CREATE TABLE "new_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "description" TEXT,
    "merchant" TEXT,
    "notes" TEXT,
    "transactionDate" DATETIME NOT NULL,
    "transferId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_transactions" ("accountId", "amountMinor", "categoryId", "createdAt", "currency", "deletedAt", "description", "id", "kind", "merchant", "notes", "transactionDate", "transferId", "updatedAt", "userId") SELECT "accountId", "amountMinor", "categoryId", "createdAt", "currency", "deletedAt", "description", "id", "kind", "merchant", "notes", "transactionDate", "transferId", "updatedAt", "userId" FROM "transactions";
DROP TABLE "transactions";
ALTER TABLE "new_transactions" RENAME TO "transactions";
CREATE INDEX "transactions_userId_transactionDate_idx" ON "transactions"("userId", "transactionDate");
CREATE INDEX "transactions_accountId_idx" ON "transactions"("accountId");
CREATE INDEX "transactions_categoryId_idx" ON "transactions"("categoryId");
CREATE TABLE "new_transfers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" TEXT,
    "transactionDate" DATETIME NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transfers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_transfers" ("amountMinor", "createdAt", "currency", "deletedAt", "description", "fromAccountId", "id", "notes", "toAccountId", "transactionDate", "updatedAt", "userId") SELECT "amountMinor", "createdAt", "currency", "deletedAt", "description", "fromAccountId", "id", "notes", "toAccountId", "transactionDate", "updatedAt", "userId" FROM "transfers";
DROP TABLE "transfers";
ALTER TABLE "new_transfers" RENAME TO "transfers";
CREATE INDEX "transfers_userId_transactionDate_idx" ON "transfers"("userId", "transactionDate");
CREATE INDEX "transfers_fromAccountId_idx" ON "transfers"("fromAccountId");
CREATE INDEX "transfers_toAccountId_idx" ON "transfers"("toAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "budgets_userId_period_idx" ON "budgets"("userId", "period");

-- CreateIndex
CREATE INDEX "budgets_categoryId_idx" ON "budgets"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_userId_period_name_key" ON "budgets"("userId", "period", "name");

-- CreateIndex
CREATE INDEX "debts_userId_idx" ON "debts"("userId");

-- CreateIndex
CREATE INDEX "debts_categoryId_idx" ON "debts"("categoryId");

-- CreateIndex
CREATE INDEX "bills_userId_idx" ON "bills"("userId");

-- CreateIndex
CREATE INDEX "bills_categoryId_idx" ON "bills"("categoryId");

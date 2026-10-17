-- CreateTable
CREATE TABLE "recurring_income" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payee" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "payDay" INTEGER NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_receipts" (
    "id" TEXT NOT NULL,
    "incomeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "paidFor" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "income_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "income_receipts_transactionId_key" ON "income_receipts"("transactionId");

-- CreateIndex
CREATE INDEX "income_receipts_userId_paidFor_idx" ON "income_receipts"("userId", "paidFor");

-- CreateIndex
CREATE INDEX "income_receipts_incomeId_idx" ON "income_receipts"("incomeId");

-- CreateIndex
CREATE UNIQUE INDEX "income_receipts_incomeId_paidFor_key" ON "income_receipts"("incomeId", "paidFor");

-- AddForeignKey
ALTER TABLE "recurring_income" ADD CONSTRAINT "recurring_income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_income" ADD CONSTRAINT "recurring_income_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_receipts" ADD CONSTRAINT "income_receipts_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "recurring_income"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_receipts" ADD CONSTRAINT "income_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_receipts" ADD CONSTRAINT "income_receipts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing category-only payments remain unallocated; never guess a creditor.
ALTER TABLE "transactions" ADD COLUMN "debtId" TEXT;
CREATE INDEX "transactions_debtId_idx" ON "transactions"("debtId");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

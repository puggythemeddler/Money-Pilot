import {
  AppError,
  ErrorCodes,
  billCreateSchema,
  billPaySchema,
  billUpdateSchema,
  minorToNumber,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { getOwnedAccount } from "./accounts";
import { getOwnedCategory } from "./categories";
import { currentPeriod, toUtcMidnight } from "./dates";

export type BillCreateInput = z.infer<typeof billCreateSchema>;
export type BillUpdateInput = z.infer<typeof billUpdateSchema>;
export type BillPayInput = z.infer<typeof billPaySchema>;

export interface BillItem {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  dueDay: number;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  /** Payment recorded for the current calendar period (YYYY-MM), derived. */
  paidFor: string | null;
  paidMinor: number;
}

export async function listBills(userId: string, includeArchived = false) {
  const rows = await prisma.bill.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: { category: { select: { name: true } } },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { dueDay: "asc" }, { createdAt: "asc" }],
    take: 200,
  });

  const current = currentPeriod();
  const paidByBillId = new Map<string, { paidFor: string | null; paidMinor: number }>();
  if (rows.length > 0) {
    const payments = await prisma.billPayment.groupBy({
      by: ["billId", "paidFor"],
      where: { userId, billId: { in: rows.map((r) => r.id) } },
      _sum: { amountMinor: true },
    });
    for (const p of payments) {
      const entry = paidByBillId.get(p.billId) ?? { paidFor: null, paidMinor: 0 };
      if (p.paidFor === current) {
        entry.paidFor = p.paidFor;
        entry.paidMinor += minorToNumber(p._sum.amountMinor ?? 0);
      }
      if (!entry.paidFor && p.paidFor < current) entry.paidFor = p.paidFor;
      paidByBillId.set(p.billId, entry);
    }
  }

  return rows.map((b): BillItem => ({
    id: b.id,
    name: b.name,
    amountMinor: minorToNumber(b.amountMinor),
    currency: b.currency,
    dueDay: b.dueDay,
    categoryId: b.categoryId,
    categoryName: b.category?.name ?? null,
    notes: b.notes,
    archived: b.archivedAt !== null,
    paidFor: paidByBillId.get(b.id)?.paidFor ?? null,
    paidMinor: paidByBillId.get(b.id)?.paidMinor ?? 0,
  }));
}

export async function createBill(
  userId: string,
  input: BillCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const category = input.categoryId ? await getOwnedCategory(userId, input.categoryId) : null;
  if (category) {
    if (category.archivedAt !== null) {
      throw new AppError(ErrorCodes.FORBIDDEN, "Archived categories cannot be used for a bill.", 400);
    }
    if (category.kind !== "EXPENSE") {
      throw new AppError(
        ErrorCodes.VALIDATION,
        "Bills are expenses, so they can only be linked to expense categories.",
        400,
      );
    }
  }
  const bill = await prisma.bill.create({
    data: {
      userId,
      name: input.name,
      amountMinor: input.amount,
      currency: input.currency,
      dueDay: input.dueDay,
      categoryId: category?.id ?? null,
      notes: input.notes ?? null,
    },
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.BILL_CREATED,
    entityType: "Bill",
    entityId: bill.id,
    metadata: { name: bill.name, amountMinor: input.amount, currency: bill.currency, dueDay: bill.dueDay },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return bill;
}

export async function getOwnedBill(userId: string, billId: string) {
  const bill = await prisma.bill.findFirst({ where: { id: billId, userId } });
  if (!bill) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Bill not found.", 404);
  }
  return bill;
}

export async function updateBill(
  userId: string,
  billId: string,
  input: BillUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  await getOwnedBill(userId, billId);
  const category = input.categoryId ? await getOwnedCategory(userId, input.categoryId) : undefined;
  if (category) {
    if (category.archivedAt !== null) {
      throw new AppError(ErrorCodes.FORBIDDEN, "Archived categories cannot be used for a bill.", 400);
    }
    if (category.kind !== "EXPENSE") {
      throw new AppError(ErrorCodes.VALIDATION, "Bills can only be linked to expense categories.", 400);
    }
  }
  const data: {
    name?: string;
    amountMinor?: number;
    dueDay?: number;
    categoryId?: string | null;
    notes?: string | null;
    archivedAt?: Date | null;
  } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.amount !== undefined) data.amountMinor = input.amount;
  if (input.dueDay !== undefined) data.dueDay = input.dueDay;
  if (input.categoryId !== undefined) data.categoryId = category?.id ?? null;
  if (input.notes !== undefined) data.notes = input.notes ?? null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;

  const bill = await prisma.bill.update({ where: { id: billId }, data });
  await writeAudit({
    userId,
    action: input.archived ? AUDIT_ACTIONS.BILL_ARCHIVED : AUDIT_ACTIONS.BILL_UPDATED,
    entityType: "Bill",
    entityId: billId,
    metadata: { name: input.name, archived: input.archived },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return bill;
}

/**
 * Pays a bill for a period: records a real EXPENSE transaction on the chosen
 * account (the bill's amount and category) and links a BillPayment row so the
 * bill shows as paid without double-counting the month. The amount must match
 * the bill currency, which must match the account currency.
 */
export async function payBill(
  userId: string,
  billId: string,
  input: BillPayInput,
  audit: { ip?: string; userAgent?: string },
) {
  const bill = await getOwnedBill(userId, billId);
  if (bill.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived bills cannot be paid.", 400);
  }
  const account = await getOwnedAccount(userId, input.accountId);
  if (account.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived accounts cannot receive payments.", 400);
  }
  if (bill.currency !== account.currency) {
    throw new AppError(
      ErrorCodes.VALIDATION,
      `The bill is in ${bill.currency} but this account is in ${account.currency}.`,
      400,
    );
  }

  const paidFor = currentPeriod();
  const transactionDate = input.transactionDate ? toUtcMidnight(input.transactionDate) : toUtcMidnight(new Date());
  const amountMinor = minorToNumber(bill.amountMinor);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          categoryId: bill.categoryId,
          kind: "EXPENSE",
          amountMinor: -amountMinor,
          currency: bill.currency,
          description: `Bill: ${bill.name}`,
          notes: `Paid via bill '${bill.name}' for ${paidFor}.`,
          merchant: null,
          transactionDate,
        },
      });
      const payment = await tx.billPayment.create({
        data: {
          billId: bill.id,
          userId,
          transactionId: transaction.id,
          paidFor,
          amountMinor,
          currency: bill.currency,
        },
      });
      return { payment, transaction };
    });

    await writeAudit({
      userId,
      action: AUDIT_ACTIONS.BILL_PAID,
      entityType: "Bill",
      entityId: bill.id,
      metadata: {
        amountMinor,
        currency: bill.currency,
        paidFor,
        accountId: account.id,
        transactionId: result.transaction.id,
      },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return {
      payment: {
        id: result.payment.id,
        billId: bill.id,
        paidFor: result.payment.paidFor,
        amountMinor: minorToNumber(result.payment.amountMinor),
        currency: result.payment.currency,
      },
      transaction: {
        id: result.transaction.id,
        amountMinor,
        currency: bill.currency,
        transactionDate: result.transaction.transactionDate.toISOString(),
        accountId: account.id,
        categoryId: bill.categoryId,
      },
    };
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2002"
    ) {
      throw new AppError(ErrorCodes.CONFLICT, `This bill was already paid for ${paidFor}.`, 409);
    }
    throw err;
  }
}
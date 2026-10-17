import {
  AppError,
  ErrorCodes,
  incomeRecordSchema,
  minorToNumber,
  parseMoneyInputToMinorUnits,
  recurringIncomeCreateSchema,
  recurringIncomeUpdateSchema,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { resolveAccountForUser } from "./households";
import { getOwnedCategory } from "./categories";
import { currentPeriod, toUtcMidnight } from "./dates";

export type RecurringIncomeCreateInput = z.infer<typeof recurringIncomeCreateSchema>;
export type RecurringIncomeUpdateInput = z.infer<typeof recurringIncomeUpdateSchema>;
export type IncomeRecordInput = z.infer<typeof incomeRecordSchema>;

export interface RecurringIncomeItem {
  id: string;
  name: string;
  payee: string | null;
  amountMinor: number;
  currency: string;
  payDay: number;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  /** Receipt recorded for the current calendar period (YYYY-MM), derived. */
  receivedFor: string | null;
  receivedMinor: number;
}

async function validateIncomeCategory(userId: string, categoryId: string) {
  const category = await getOwnedCategory(userId, categoryId);
  if (category.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived categories cannot be used for income.", 400);
  }
  if (category.kind !== "INCOME") {
    throw new AppError(
      ErrorCodes.VALIDATION,
      "Recurring income can only be linked to income categories.",
      400,
    );
  }
  return category;
}

export async function listRecurringIncomes(userId: string, includeArchived = false) {
  const rows = await prisma.recurringIncome.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: { category: { select: { name: true } } },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { payDay: "asc" }, { createdAt: "asc" }],
    take: 200,
  });

  const current = currentPeriod();
  const receivedByIncomeId = new Map<string, { receivedFor: string | null; receivedMinor: number }>();
  if (rows.length > 0) {
    const receipts = await prisma.incomeReceipt.groupBy({
      by: ["incomeId", "paidFor"],
      where: { userId, incomeId: { in: rows.map((r) => r.id) } },
      _sum: { amountMinor: true },
    });
    for (const r of receipts) {
      const entry = receivedByIncomeId.get(r.incomeId) ?? { receivedFor: null, receivedMinor: 0 };
      if (r.paidFor === current) {
        entry.receivedFor = r.paidFor;
        entry.receivedMinor += minorToNumber(r._sum.amountMinor ?? 0);
      }
      if (!entry.receivedFor && r.paidFor < current) entry.receivedFor = r.paidFor;
      receivedByIncomeId.set(r.incomeId, entry);
    }
  }

  return rows.map((i): RecurringIncomeItem => ({
    id: i.id,
    name: i.name,
    payee: i.payee,
    amountMinor: minorToNumber(i.amountMinor),
    currency: i.currency,
    payDay: i.payDay,
    categoryId: i.categoryId,
    categoryName: i.category?.name ?? null,
    notes: i.notes,
    archived: i.archivedAt !== null,
    receivedFor: receivedByIncomeId.get(i.id)?.receivedFor ?? null,
    receivedMinor: receivedByIncomeId.get(i.id)?.receivedMinor ?? 0,
  }));
}

export async function createRecurringIncome(
  userId: string,
  input: RecurringIncomeCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const category = input.categoryId ? await validateIncomeCategory(userId, input.categoryId) : null;
  const amountMinor = parseMoneyInputToMinorUnits(input.amount, input.currency);
  const income = await prisma.recurringIncome.create({
    data: {
      userId,
      name: input.name,
      payee: input.payee ?? null,
      amountMinor,
      currency: input.currency,
      payDay: input.payDay,
      categoryId: category?.id ?? null,
      notes: input.notes ?? null,
    },
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.RECURRING_INCOME_CREATED,
    entityType: "RecurringIncome",
    entityId: income.id,
    metadata: { name: income.name, payee: income.payee, amountMinor, currency: income.currency, payDay: income.payDay },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return income;
}

export async function getOwnedRecurringIncome(userId: string, incomeId: string) {
  const income = await prisma.recurringIncome.findFirst({ where: { id: incomeId, userId } });
  if (!income) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Recurring income not found.", 404);
  }
  return income;
}

export async function updateRecurringIncome(
  userId: string,
  incomeId: string,
  input: RecurringIncomeUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const existing = await getOwnedRecurringIncome(userId, incomeId);
  const category = input.categoryId ? await validateIncomeCategory(userId, input.categoryId) : undefined;

  const data: {
    name?: string;
    payee?: string | null;
    amountMinor?: number;
    payDay?: number;
    categoryId?: string | null;
    notes?: string | null;
    archivedAt?: Date | null;
  } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.payee !== undefined) data.payee = input.payee ?? null;
  if (input.amount !== undefined) data.amountMinor = parseMoneyInputToMinorUnits(input.amount, existing.currency);
  if (input.payDay !== undefined) data.payDay = input.payDay;
  if (input.categoryId !== undefined) data.categoryId = category?.id ?? null;
  if (input.notes !== undefined) data.notes = input.notes ?? null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;

  const income = await prisma.recurringIncome.update({ where: { id: incomeId }, data });
  await writeAudit({
    userId,
    action: input.archived ? AUDIT_ACTIONS.RECURRING_INCOME_ARCHIVED : AUDIT_ACTIONS.RECURRING_INCOME_UPDATED,
    entityType: "RecurringIncome",
    entityId: incomeId,
    metadata: { name: input.name, archived: input.archived },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return income;
}

/**
 * Records a month of a recurring income: creates a real INCOME transaction on
 * the chosen account (the income's amount, payee and category) and links an
 * IncomeReceipt row so the month is not recorded twice. The account currency
 * must match the income's currency. This is the salary flow — a recorded month
 * is a genuine money movement, not a decorative status flag.
 */
export async function recordIncome(
  userId: string,
  incomeId: string,
  input: IncomeRecordInput,
  audit: { ip?: string; userAgent?: string },
) {
  const income = await getOwnedRecurringIncome(userId, incomeId);
  if (income.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived incomes cannot be recorded.", 400);
  }
  const account = await resolveAccountForUser(userId, input.accountId, { write: true });
  if (account.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived accounts cannot receive income.", 400);
  }
  if (income.currency !== account.currency) {
    throw new AppError(
      ErrorCodes.VALIDATION,
      `The income is in ${income.currency} but this account is in ${account.currency}.`,
      400,
    );
  }

  const paidFor = currentPeriod();
  const transactionDate = input.transactionDate ? toUtcMidnight(input.transactionDate) : toUtcMidnight(new Date());
  const amountMinor = minorToNumber(income.amountMinor);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          categoryId: income.categoryId,
          kind: "INCOME",
          amountMinor, // income is stored as a positive amount
          currency: income.currency,
          description: `Income: ${income.name}`,
          notes: `Recorded via recurring income '${income.name}' for ${paidFor}.`,
          merchant: income.payee ?? null,
          transactionDate,
        },
      });
      const receipt = await tx.incomeReceipt.create({
        data: {
          incomeId: income.id,
          userId,
          transactionId: transaction.id,
          paidFor,
          amountMinor,
          currency: income.currency,
        },
      });
      return { receipt, transaction };
    });

    await writeAudit({
      userId,
      action: AUDIT_ACTIONS.INCOME_RECORDED,
      entityType: "RecurringIncome",
      entityId: income.id,
      metadata: {
        amountMinor,
        currency: income.currency,
        paidFor,
        accountId: account.id,
        transactionId: result.transaction.id,
      },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return {
      receipt: {
        id: result.receipt.id,
        incomeId: income.id,
        paidFor: result.receipt.paidFor,
        amountMinor: minorToNumber(result.receipt.amountMinor),
        currency: result.receipt.currency,
      },
      transaction: {
        id: result.transaction.id,
        amountMinor,
        currency: income.currency,
        transactionDate: result.transaction.transactionDate.toISOString(),
        accountId: account.id,
        categoryId: income.categoryId,
      },
    };
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2002"
    ) {
      throw new AppError(ErrorCodes.CONFLICT, `This income was already recorded for ${paidFor}.`, 409);
    }
    throw err;
  }
}

export interface IncomeOverview {
  currency: string;
  expectedMinor: number;
  receivedMinor: number;
  activeCount: number;
  receivedCount: number;
  others: { currency: string; expectedMinor: number; receivedMinor: number }[];
}

/**
 * Expected vs received income for the dashboard: the current period's totals in
 * the user's preferred currency, with any other-currency totals listed
 * separately so the headline is never a dishonest cross-currency sum. Built on
 * listRecurringIncomes so the current-period receipt rule lives in exactly one
 * place. Only active (non-archived) incomes count as expected.
 */
export async function incomeOverview(userId: string, preferredCurrency: string): Promise<IncomeOverview> {
  const incomes = await listRecurringIncomes(userId);
  const expected = new Map<string, number>();
  const received = new Map<string, number>();
  let receivedCount = 0;

  for (const i of incomes) {
    expected.set(i.currency, (expected.get(i.currency) ?? 0) + i.amountMinor);
    if (i.receivedFor === currentPeriod() && i.receivedMinor > 0) {
      received.set(i.currency, (received.get(i.currency) ?? 0) + i.receivedMinor);
      receivedCount += 1;
    }
  }

  const currencies = new Set([...expected.keys(), ...received.keys()]);
  const others = [...currencies]
    .filter((currency) => currency !== preferredCurrency)
    .map((currency) => ({
      currency,
      expectedMinor: expected.get(currency) ?? 0,
      receivedMinor: received.get(currency) ?? 0,
    }))
    .sort((a, b) => b.expectedMinor - a.expectedMinor);

  return {
    currency: preferredCurrency,
    expectedMinor: expected.get(preferredCurrency) ?? 0,
    receivedMinor: received.get(preferredCurrency) ?? 0,
    activeCount: incomes.length,
    receivedCount,
    others,
  };
}

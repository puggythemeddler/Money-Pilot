import {
  AppError,
  ErrorCodes,
  budgetCreateSchema,
  budgetUpdateSchema,
  minorToNumber,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { getOwnedCategory } from "./categories";
import { periodRange } from "./dates";

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;

export interface BudgetItem {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  period: string;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  /** Spent so far in the period, derived from the transaction log. */
  spentMinor: number;
  remainingMinor: number;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Sums the EXPENSE transactions a budget covers (its category scope) for the
 *  period and currency, derived from the transaction log — never stored. */
async function spentForBudget(
  userId: string,
  from: Date,
  to: Date,
  currency: string,
  categoryId: string | null,
): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    where: {
      userId,
      kind: "EXPENSE",
      deletedAt: null,
      currency,
      transactionDate: { gte: from, lt: to },
      ...(categoryId ? { categoryId } : {}),
    },
    _sum: { amountMinor: true },
  });
  return -minorToNumber(agg._sum.amountMinor ?? 0);
}

export async function listBudgets(userId: string, period?: string) {
  const rows = await prisma.budget.findMany({
    where: {
      userId,
      archivedAt: null,
      ...(period ? { period } : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: [{ period: "desc" }, { createdAt: "asc" }],
    take: 200,
  });

  const spentByKey = new Map<string, number>();
  for (const b of rows) {
    const { from, to } = periodRange(b.period);
    spentByKey.set(
      `${b.id}::${b.currency}::${b.categoryId ?? ""}`,
      await spentForBudget(userId, from, to, b.currency, b.categoryId),
    );
  }

  return rows.map((b): BudgetItem => {
    const spentMinor = spentByKey.get(`${b.id}::${b.currency}::${b.categoryId ?? ""}`) ?? 0;
    const amountMinor = minorToNumber(b.amountMinor);
    return {
      id: b.id,
      name: b.name,
      amountMinor,
      currency: b.currency,
      period: b.period,
      categoryId: b.categoryId,
      categoryName: b.category?.name ?? null,
      notes: b.notes,
      archived: b.archivedAt !== null,
      spentMinor,
      remainingMinor: amountMinor - spentMinor,
    };
  });
}

export async function createBudget(
  userId: string,
  input: BudgetCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  periodRange(input.period); // validate the period key

  let category = null;
  if (input.categoryId) {
    category = await getOwnedCategory(userId, input.categoryId);
    if (category.archivedAt !== null) {
      throw new AppError(ErrorCodes.FORBIDDEN, "Archived categories cannot be used for a budget.", 400);
    }
    if (category.kind !== "EXPENSE") {
      throw new AppError(
        ErrorCodes.VALIDATION,
        "Budgets track spending, so they can only be scoped to expense categories.",
        400,
      );
    }
  }

  try {
    const budget = await prisma.budget.create({
      data: {
        userId,
        name: input.name,
        amountMinor: input.amount,
        currency: input.currency,
        period: input.period,
        categoryId: category?.id ?? null,
        notes: input.notes ?? null,
      },
    });
    await writeAudit({
      userId,
      action: AUDIT_ACTIONS.BUDGET_CREATED,
      entityType: "Budget",
      entityId: budget.id,
      metadata: { name: budget.name, amountMinor: input.amount, currency: budget.currency, period: budget.period },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return budget;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(ErrorCodes.CONFLICT, "You already have a budget with that name in this period.", 409);
    }
    throw err;
  }
}

export async function getOwnedBudget(userId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, userId } });
  if (!budget) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Budget not found.", 404);
  }
  return budget;
}

export async function updateBudget(
  userId: string,
  budgetId: string,
  input: BudgetUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  await getOwnedBudget(userId, budgetId);
  const data: { name?: string; amountMinor?: number; notes?: string | null; archivedAt?: Date | null } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.amount !== undefined) data.amountMinor = input.amount;
  if (input.notes !== undefined) data.notes = input.notes ?? null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;

  try {
    const budget = await prisma.budget.update({ where: { id: budgetId }, data });
    await writeAudit({
      userId,
      action: input.archived ? AUDIT_ACTIONS.BUDGET_ARCHIVED : AUDIT_ACTIONS.BUDGET_UPDATED,
      entityType: "Budget",
      entityId: budgetId,
      metadata: { name: input.name, archived: input.archived },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return budget;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(ErrorCodes.CONFLICT, "You already have a budget with that name in this period.", 409);
    }
    throw err;
  }
}

export async function listBudgetPeriods(userId: string): Promise<string[]> {
  const rows = await prisma.budget.findMany({
    where: { userId, archivedAt: null },
    select: { period: true },
    distinct: ["period"],
    orderBy: { period: "desc" },
  });
  return rows.map((r) => r.period);
}
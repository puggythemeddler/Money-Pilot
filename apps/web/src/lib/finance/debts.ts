import {
  AppError,
  ErrorCodes,
  debtCreateSchema,
  debtUpdateSchema,
  minorToNumber,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { getOwnedCategory } from "./categories";

export type DebtCreateInput = z.infer<typeof debtCreateSchema>;
export type DebtUpdateInput = z.infer<typeof debtUpdateSchema>;

export interface DebtItem {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  principalMinor: number;
  currency: string;
  interestRate: string | null;
  minimumPaymentMinor: number | null;
  dueDay: number | null;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  /** Sum of payments (expenses tagged in the linked category), derived. */
  paidMinor: number;
  /** principal − paid. */
  balanceMinor: number;
}

/** Sums payments recorded against a debt: EXPENSE transactions in the linked
 *  category, in the debt's currency (derived from the transaction log). */
async function paymentsForCategory(userId: string, categoryId: string | null, currency: string): Promise<number> {
  if (!categoryId) return 0;
  const agg = await prisma.transaction.aggregate({
    where: { userId, kind: "EXPENSE", categoryId, currency, deletedAt: null },
    _sum: { amountMinor: true },
  });
  return -minorToNumber(agg._sum.amountMinor ?? 0);
}

export async function listDebts(userId: string, includeArchived = false) {
  const rows = await prisma.debt.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: { category: { select: { name: true } } },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 200,
  });

  const paidByKey = new Map<string, number>();
  for (const d of rows) {
    paidByKey.set(
      `${d.id}::${d.currency}`,
      await paymentsForCategory(userId, d.categoryId, d.currency),
    );
  }

  return rows.map((d): DebtItem => {
    const principalMinor = minorToNumber(d.principalMinor);
    const paidMinor = paidByKey.get(`${d.id}::${d.currency}`) ?? 0;
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      institution: d.institution,
      principalMinor,
      currency: d.currency,
      interestRate: d.interestRate,
      minimumPaymentMinor: d.minimumPaymentMinor !== null ? minorToNumber(d.minimumPaymentMinor) : null,
      dueDay: d.dueDay,
      categoryId: d.categoryId,
      categoryName: d.category?.name ?? null,
      notes: d.notes,
      archived: d.archivedAt !== null,
      paidMinor,
      balanceMinor: principalMinor - paidMinor,
    };
  });
}

async function validateCategory(userId: string, categoryId: string) {
  const category = await getOwnedCategory(userId, categoryId);
  if (category.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived categories cannot be used for a debt.", 400);
  }
  if (category.kind !== "EXPENSE") {
    throw new AppError(
      ErrorCodes.VALIDATION,
      "Debts track payments, so they can only be linked to expense categories.",
      400,
    );
  }
  return category;
}

export async function createDebt(
  userId: string,
  input: DebtCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const category = input.categoryId ? await validateCategory(userId, input.categoryId) : null;
  const debt = await prisma.debt.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      institution: input.institution ?? null,
      principalMinor: input.principal,
      currency: input.currency,
      interestRate: input.interestRate ?? null,
      minimumPaymentMinor: input.minimumPayment ?? null,
      dueDay: input.dueDay ?? null,
      categoryId: category?.id ?? null,
      notes: input.notes ?? null,
    },
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.DEBT_CREATED,
    entityType: "Debt",
    entityId: debt.id,
    metadata: { name: debt.name, type: debt.type, principalMinor: input.principal, currency: debt.currency },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return debt;
}

export async function getOwnedDebt(userId: string, debtId: string) {
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Debt not found.", 404);
  }
  return debt;
}

export async function updateDebt(
  userId: string,
  debtId: string,
  input: DebtUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  await getOwnedDebt(userId, debtId);
  const category = input.categoryId ? await validateCategory(userId, input.categoryId) : undefined;

  const data: {
    name?: string;
    type?: string;
    institution?: string | null;
    principalMinor?: number;
    interestRate?: string | null;
    minimumPaymentMinor?: number | null;
    dueDay?: number | null;
    categoryId?: string | null;
    notes?: string | null;
    archivedAt?: Date | null;
  } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.institution !== undefined) data.institution = input.institution ?? null;
  if (input.principal !== undefined) data.principalMinor = input.principal;
  if (input.interestRate !== undefined) data.interestRate = input.interestRate ?? null;
  if (input.minimumPayment !== undefined) data.minimumPaymentMinor = input.minimumPayment ?? null;
  if (input.dueDay !== undefined) data.dueDay = input.dueDay ?? null;
  if (input.categoryId !== undefined) data.categoryId = category?.id ?? null;
  if (input.notes !== undefined) data.notes = input.notes ?? null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;

  const debt = await prisma.debt.update({ where: { id: debtId }, data });
  await writeAudit({
    userId,
    action: input.archived ? AUDIT_ACTIONS.DEBT_ARCHIVED : AUDIT_ACTIONS.DEBT_UPDATED,
    entityType: "Debt",
    entityId: debtId,
    metadata: { name: input.name, archived: input.archived },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return debt;
}
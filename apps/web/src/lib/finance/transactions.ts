import {
  AppError,
  ErrorCodes,
  transactionCreateSchema,
  transactionUpdateSchema,
  transactionQuerySchema,
  minorToNumber,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { getOwnedAccount } from "./accounts";
import { getOwnedCategory } from "./categories";
import { toUtcMidnight } from "./dates";

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export interface TransactionItem {
  id: string;
  kind: string;
  amountMinor: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  transactionDate: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  transferId: string | null;
  createdAt: string;
}

export async function listTransactions(userId: string, query: TransactionQuery) {
  const where = {
    userId,
    deletedAt: null,
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.from ? { transactionDate: { gte: toUtcMidnight(query.from) } } : {}),
    ...(query.to ? { transactionDate: { lt: new Date(toUtcMidnight(query.to).getTime() + 86_400_000) } } : {}),
    ...(query.q
      ? {
          OR: [
            { description: { contains: query.q } },
            { merchant: { contains: query.q } },
            { notes: { contains: query.q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: query.limit,
      skip: query.offset,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: rows.map((t): TransactionItem => ({
      id: t.id,
      kind: t.kind,
      amountMinor: minorToNumber(t.amountMinor),
      currency: t.currency,
      description: t.description,
      merchant: t.merchant,
      notes: t.notes,
      transactionDate: t.transactionDate.toISOString(),
      accountId: t.accountId,
      accountName: t.account.name,
      categoryId: t.categoryId,
      categoryName: t.category?.name ?? null,
      categoryColor: t.category?.color ?? null,
      transferId: t.transferId,
      createdAt: t.createdAt.toISOString(),
    })),
    pagination: { limit: query.limit, offset: query.offset, total },
  };
}

export async function createTransaction(
  userId: string,
  input: TransactionCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const account = await getOwnedAccount(userId, input.accountId);
  if (account.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived accounts cannot receive new transactions.", 400);
  }
  const currency = input.currency ?? account.currency;
  if (currency !== account.currency) {
    throw new AppError(
      ErrorCodes.VALIDATION,
      `The account is in ${account.currency}; amount currency must match.`,
      400,
    );
  }

  const category = input.categoryId ? await getOwnedCategory(userId, input.categoryId) : null;
  if (category) {
    if (category.archivedAt !== null) {
      throw new AppError(ErrorCodes.FORBIDDEN, "Archived categories cannot be used.", 400);
    }
    if (category.kind !== input.kind) {
      throw new AppError(
        ErrorCodes.VALIDATION,
        `Categories of kind ${category.kind} cannot be used for ${input.kind} transactions.`,
        400,
      );
    }
  }

  const signed = input.kind === "EXPENSE" ? -input.amount : input.amount;
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      accountId: account.id,
      categoryId: category?.id ?? null,
      kind: input.kind,
      amountMinor: signed,
      currency,
      description: input.description ?? null,
      merchant: input.merchant ?? null,
      notes: input.notes ?? null,
      transactionDate: toUtcMidnight(input.transactionDate),
    },
  });

  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.TRANSACTION_CREATED,
    entityType: "Transaction",
    entityId: transaction.id,
    metadata: { kind: input.kind, amountMinor: signed, currency, accountId: account.id },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return transaction;
}

export async function getOwnedTransaction(userId: string, transactionId: string) {
  const row = await prisma.transaction.findFirst({ where: { id: transactionId, userId } });
  if (!row || row.deletedAt !== null) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Transaction not found.", 404);
  }
  return row;
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: TransactionUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const existing = await getOwnedTransaction(userId, transactionId);
  if (existing.transferId) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "Edit transfer legs by editing the transfer itself.",
      400,
    );
  }

  const data: {
    amountMinor?: number;
    transactionDate?: Date;
    description?: string | null;
    merchant?: string | null;
    notes?: string | null;
    categoryId?: string | null;
  } = {};
  if (input.amount !== undefined) {
    data.amountMinor = existing.kind === "EXPENSE" ? -input.amount : input.amount;
  }
  if (input.transactionDate !== undefined) data.transactionDate = toUtcMidnight(input.transactionDate);
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.merchant !== undefined) data.merchant = input.merchant ?? null;
  if (input.notes !== undefined) data.notes = input.notes ?? null;
  if (input.categoryId !== undefined) {
    if (input.categoryId) {
      const category = await getOwnedCategory(userId, input.categoryId);
      if (category.archivedAt !== null) {
        throw new AppError(ErrorCodes.FORBIDDEN, "Archived categories cannot be used.", 400);
      }
      if (category.kind !== existing.kind) {
        throw new AppError(ErrorCodes.VALIDATION, "Category kind does not match this transaction.", 400);
      }
      data.categoryId = category.id;
    } else {
      data.categoryId = null;
    }
  }

  const updated = await prisma.transaction.update({ where: { id: transactionId }, data });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.TRANSACTION_UPDATED,
    entityType: "Transaction",
    entityId: transactionId,
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return updated;
}

/**
 * Soft-deletes a transaction. Deleting a transfer leg removes the whole
 * transfer bundle (both legs + the Transfer row) so balances stay consistent.
 */
export async function deleteTransaction(
  userId: string,
  transactionId: string,
  audit: { ip?: string; userAgent?: string },
): Promise<void> {
  const existing = await getOwnedTransaction(userId, transactionId);

  if (existing.transferId) {
    await prisma.$transaction([
      prisma.transfer.update({
        where: { id: existing.transferId },
        data: { deletedAt: new Date() },
      }),
      prisma.transaction.updateMany({
        where: { transferId: existing.transferId, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
    ]);
    await writeAudit({
      userId,
      action: AUDIT_ACTIONS.TRANSFER_DELETED,
      entityType: "Transfer",
      entityId: existing.transferId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return;
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { deletedAt: new Date() },
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.TRANSACTION_DELETED,
    entityType: "Transaction",
    entityId: transactionId,
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
}
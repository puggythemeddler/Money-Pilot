import { AppError, ErrorCodes, transferCreateSchema } from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { getOwnedAccount } from "./accounts";
import { toUtcMidnight } from "./dates";

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;

export interface TransferItem {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amountMinor: number;
  currency: string;
  description: string | null;
  transactionDate: string;
  createdAt: string;
}

export async function deleteTransfer(
  userId: string,
  transferId: string,
  audit: { ip?: string; userAgent?: string },
): Promise<void> {
  const transfer = await prisma.transfer.findFirst({ where: { id: transferId, userId } });
  if (!transfer || transfer.deletedAt !== null) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Transfer not found.", 404);
  }
  await prisma.$transaction([
    prisma.transfer.update({ where: { id: transferId }, data: { deletedAt: new Date() } }),
    prisma.transaction.updateMany({
      where: { transferId, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
  ]);
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.TRANSFER_DELETED,
    entityType: "Transfer",
    entityId: transferId,
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
}

export async function listTransfers(userId: string) {
  const rows = await prisma.transfer.findMany({
    where: { userId, deletedAt: null },
    include: {
      fromAccount: { select: { name: true } },
      toAccount: { select: { name: true } },
    },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((t): TransferItem => ({
    id: t.id,
    fromAccountId: t.fromAccountId,
    fromAccountName: t.fromAccount.name,
    toAccountId: t.toAccountId,
    toAccountName: t.toAccount.name,
    amountMinor: t.amountMinor,
    currency: t.currency,
    description: t.description,
    transactionDate: t.transactionDate.toISOString(),
    createdAt: t.createdAt.toISOString(),
  }));
}

/**
 * Creates a transfer between two of the user's own accounts. One Transfer row
 * and two linked Transaction legs (out = negative, in = positive) are written
 * in a single transaction so money never appears or disappears mid-way.
 * Transfers are same-currency only; insufficient-balance is intentionally NOT
 * enforced because credit accounts and overdrafts are legitimate.
 */
export async function createTransfer(
  userId: string,
  input: TransferCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  if (input.fromAccountId === input.toAccountId) {
    throw new AppError(ErrorCodes.VALIDATION, "Source and destination must be different.", 400);
  }

  const [fromAccount, toAccount] = await Promise.all([
    getOwnedAccount(userId, input.fromAccountId),
    getOwnedAccount(userId, input.toAccountId),
  ]);
  if (fromAccount.archivedAt !== null || toAccount.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived accounts cannot be used for transfers.", 400);
  }
  if (fromAccount.currency !== toAccount.currency) {
    throw new AppError(
      ErrorCodes.VALIDATION,
      "Both accounts must use the same currency for a transfer.",
      400,
    );
  }
  const currency = input.currency ?? fromAccount.currency;
  if (currency !== fromAccount.currency) {
    throw new AppError(
      ErrorCodes.VALIDATION,
      `These accounts are in ${fromAccount.currency}; amount currency must match.`,
      400,
    );
  }

  const transactionDate = toUtcMidnight(input.transactionDate);
  const outLeg = {
    userId,
    kind: "TRANSFER",
    amountMinor: -input.amount,
    currency,
    transactionDate,
    description: input.description ?? null,
    notes: input.notes ?? null,
  } as const;

  const result = await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        userId,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amountMinor: input.amount,
        currency,
        transactionDate,
        description: input.description ?? null,
        notes: input.notes ?? null,
      },
    });
    const [left, right] = await Promise.all([
      tx.transaction.create({
        data: {
          ...outLeg,
          accountId: fromAccount.id,
          transferId: transfer.id,
        },
      }),
      tx.transaction.create({
        data: {
          ...outLeg,
          accountId: toAccount.id,
          amountMinor: input.amount,
          transferId: transfer.id,
        },
      }),
    ]);
    return { transfer, left, right };
  });

  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.TRANSFER_CREATED,
    entityType: "Transfer",
    entityId: result.transfer.id,
    metadata: {
      amountMinor: input.amount,
      currency,
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      leftLeg: result.left.id,
      rightLeg: result.right.id,
    },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return {
    id: result.transfer.id,
    fromAccountId: fromAccount.id,
    toAccountId: toAccount.id,
    amountMinor: input.amount,
    currency,
    description: input.description ?? null,
    transactionDate: transactionDate.toISOString(),
  };
}
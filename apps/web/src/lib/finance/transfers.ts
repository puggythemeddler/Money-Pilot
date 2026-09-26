import {
  AppError,
  ErrorCodes,
  transferCreateSchema,
  transferUpdateSchema,
  convertMinorUnitsWithRate,
  currencyMinorUnitDigits,
  minorToNumber,
  parseMoneyInputToMinorUnits,
  parseRateFraction,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { getMembership, resolveAccountForUser, visibleAccountWhere } from "./households";
import { toUtcMidnight } from "./dates";

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
export type TransferUpdateInput = z.infer<typeof transferUpdateSchema>;

export interface TransferItem {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  /** Amount moved out of the source account, in the source account's currency. */
  amountMinor: number;
  currency: string;
  /** Amount received into the destination account, in the destination currency. */
  toAmountMinor: number;
  toCurrency: string;
  /** Decimal exchange rate used (null for same-currency transfers). */
  rate: string | null;
  description: string | null;
  notes: string | null;
  transactionDate: string;
  createdAt: string;
}

/**
 * Fetches a transfer the user can act on. A transfer is visible when BOTH of
 * its accounts are visible (a personal account and the household's joint
 * account, both personal, or both joint); writes additionally require record
 * permission on the joint side. Anything else is a 404.
 */
async function getAccessibleTransfer(
  userId: string,
  transferId: string,
  opts: { write?: boolean } = {},
) {
  const [row, membership] = await Promise.all([
    prisma.transfer.findFirst({
      where: { id: transferId, deletedAt: null },
      include: {
        fromAccount: true,
        toAccount: true,
        transactions: { select: { accountId: true, amountMinor: true, currency: true } },
      },
    }),
    getMembership(userId),
  ]);
  if (!row) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Transfer not found.", 404);
  }
  const canSee = (account: { userId: string; householdId: string | null }) =>
    account.householdId === null
      ? account.userId === userId
      : membership?.householdId === account.householdId;
  const canUse = (account: { userId: string; householdId: string | null }) =>
    account.householdId === null
      ? account.userId === userId
      : membership?.householdId === account.householdId && membership.canRecord === true;
  if (!canSee(row.fromAccount) || !canSee(row.toAccount)) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Transfer not found.", 404);
  }
  if (opts.write && (!canUse(row.fromAccount) || !canUse(row.toAccount))) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "You have read-only access to this household's shared accounts.",
      403,
    );
  }
  return row;
}

/**
 * Works out the destination leg's minor units, converting with an exact
 * decimal-rate fraction for cross-currency transfers. Same-currency transfers
 * keep amount and currency untouched (a rate is rejected as redundant).
 */
function legAmounts(opts: {
  fromCurrency: string;
  toCurrency: string;
  amountMinor: number;
  rate?: string;
}): { toAmountMinor: number; toCurrency: string; rate: string | null } {
  const { fromCurrency, toCurrency, amountMinor, rate } = opts;
  if (fromCurrency === toCurrency) {
    if (rate !== undefined) {
      throw new AppError(
        ErrorCodes.VALIDATION,
        "An exchange rate is only needed when the two accounts use different currencies.",
        400,
      );
    }
    return { toAmountMinor: amountMinor, toCurrency, rate: null };
  }
  if (rate === undefined) {
    throw new AppError(
      ErrorCodes.VALIDATION,
      `Cross-currency transfers need an exchange rate (1 ${fromCurrency} = ? ${toCurrency}).`,
      400,
    );
  }
  const fraction = parseRateFraction(rate);
  const toAmountMinor = convertMinorUnitsWithRate(
    amountMinor,
    fraction,
    currencyMinorUnitDigits(fromCurrency),
    currencyMinorUnitDigits(toCurrency),
  );
  if (toAmountMinor <= 0) {
    throw new AppError(ErrorCodes.VALIDATION, "The exchange rate produced an invalid destination amount.", 400);
  }
  return { toAmountMinor, toCurrency, rate: rate.trim() };
}

export async function listTransfers(userId: string) {
  // A transfer is listed when BOTH of its accounts are visible to the user
  // (their personal accounts and/or their household's joint accounts).
  const membership = await getMembership(userId);
  const visible = await prisma.account.findMany({
    where: visibleAccountWhere(userId, membership),
    select: { id: true },
  });
  const visibleIds = visible.map((a) => a.id);
  const rows = await prisma.transfer.findMany({
    where: { fromAccountId: { in: visibleIds }, toAccountId: { in: visibleIds }, deletedAt: null },
    include: {
      fromAccount: { select: { name: true } },
      toAccount: { select: { name: true } },
      transactions: { select: { accountId: true, amountMinor: true, currency: true } },
    },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((t): TransferItem => {
    const toLeg = t.transactions.find((x) => x.accountId === t.toAccountId);
    return {
      id: t.id,
      fromAccountId: t.fromAccountId,
      fromAccountName: t.fromAccount.name,
      toAccountId: t.toAccountId,
      toAccountName: t.toAccount.name,
      amountMinor: minorToNumber(t.amountMinor),
      currency: t.currency,
      toAmountMinor: toLeg ? minorToNumber(toLeg.amountMinor) : minorToNumber(t.amountMinor),
      toCurrency: toLeg?.currency ?? t.currency,
      rate: t.rate,
      description: t.description,
      notes: t.notes,
      transactionDate: t.transactionDate.toISOString(),
      createdAt: t.createdAt.toISOString(),
    };
  });
}

/**
 * Creates a transfer between two of the user's own accounts. One Transfer row
 * and two linked Transaction legs (out = negative, in = positive) are written
 * in a single transaction so money never appears or disappears mid-way.
 * Cross-currency transfers carry a decimal exchange rate (1 from-currency =
 * `rate` to-currency); the destination leg is converted exactly and stored in
 * the destination account's own currency. Insufficient-balance is
 * intentionally NOT enforced because credit accounts and overdrafts are
 * legitimate.
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
    resolveAccountForUser(userId, input.fromAccountId, { write: true }),
    resolveAccountForUser(userId, input.toAccountId, { write: true }),
  ]);
  if (fromAccount.archivedAt !== null || toAccount.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Archived accounts cannot be used for transfers.", 400);
  }
  const currency = input.currency ?? fromAccount.currency;
  if (currency !== fromAccount.currency) {
    throw new AppError(
      ErrorCodes.VALIDATION,
      `The source account is in ${fromAccount.currency}; amount currency must match.`,
      400,
    );
  }

  const amountMinor = parseMoneyInputToMinorUnits(input.amount, fromAccount.currency);
  const leg = legAmounts({
    fromCurrency: fromAccount.currency,
    toCurrency: toAccount.currency,
    amountMinor,
    rate: input.rate,
  });

  const transactionDate = toUtcMidnight(input.transactionDate);
  const description = input.description ?? null;
  const notes = input.notes ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        userId,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amountMinor,
        currency,
        rate: leg.rate,
        transactionDate,
        description,
        notes,
      },
    });
    const [outLeg, inLeg] = await Promise.all([
      tx.transaction.create({
        data: {
          userId,
          kind: "TRANSFER",
          accountId: fromAccount.id,
          transferId: transfer.id,
          amountMinor: -amountMinor,
          currency,
          transactionDate,
          description,
          notes,
        },
      }),
      tx.transaction.create({
        data: {
          userId,
          kind: "TRANSFER",
          accountId: toAccount.id,
          transferId: transfer.id,
          amountMinor: leg.toAmountMinor,
          currency: leg.toCurrency,
          transactionDate,
          description,
          notes,
        },
      }),
    ]);
    return { transfer, outLeg, inLeg };
  });

  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.TRANSFER_CREATED,
    entityType: "Transfer",
    entityId: result.transfer.id,
    metadata: {
      amountMinor,
      currency,
      rate: leg.rate,
      toAmountMinor: leg.toAmountMinor,
      toCurrency: leg.toCurrency,
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      outLeg: result.outLeg.id,
      inLeg: result.inLeg.id,
    },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return {
    id: result.transfer.id,
    fromAccountId: fromAccount.id,
    toAccountId: toAccount.id,
    amountMinor,
    currency,
    toAmountMinor: leg.toAmountMinor,
    toCurrency: leg.toCurrency,
    rate: leg.rate,
    description,
    notes,
    transactionDate: transactionDate.toISOString(),
  };
}

/**
 * Edits a transfer in place: the amount, rate, date, description and notes can
 * change, and both linked legs are recomputed atomically. The source and
 * destination accounts are fixed (moving money to a different pair of accounts
 * means deleting and re-creating the transfer).
 */
export async function updateTransfer(
  userId: string,
  transferId: string,
  input: TransferUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const existing = await getAccessibleTransfer(userId, transferId, { write: true });

  const fromAccount = existing.fromAccount;
  const toAccount = existing.toAccount;
  const amountMinor =
    input.amount !== undefined
      ? parseMoneyInputToMinorUnits(input.amount, fromAccount.currency)
      : minorToNumber(existing.amountMinor);
  const leg = legAmounts({
    fromCurrency: fromAccount.currency,
    toCurrency: toAccount.currency,
    amountMinor,
    rate: input.rate ?? existing.rate ?? undefined,
  });
  const transactionDate = input.transactionDate ? toUtcMidnight(input.transactionDate) : existing.transactionDate;
  const description = input.description !== undefined ? (input.description ?? null) : existing.description;
  const notes = input.notes !== undefined ? (input.notes ?? null) : existing.notes;

  await prisma.$transaction(async (tx) => {
    await tx.transfer.update({
      where: { id: transferId },
      data: {
        amountMinor,
        rate: leg.rate,
        transactionDate,
        description,
        notes,
      },
    });
    await tx.transaction.updateMany({
      where: { transferId, accountId: fromAccount.id, deletedAt: null },
      data: {
        amountMinor: -amountMinor,
        currency: fromAccount.currency,
        transactionDate,
        description,
        notes,
      },
    });
    await tx.transaction.updateMany({
      where: { transferId, accountId: toAccount.id, deletedAt: null },
      data: {
        amountMinor: leg.toAmountMinor,
        currency: leg.toCurrency,
        transactionDate,
        description,
        notes,
      },
    });
  });

  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.TRANSFER_UPDATED,
    entityType: "Transfer",
    entityId: transferId,
    metadata: {
      amountMinor,
      currency: fromAccount.currency,
      rate: leg.rate,
      toAmountMinor: leg.toAmountMinor,
      toCurrency: leg.toCurrency,
    },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });

  return {
    id: transferId,
    fromAccountId: fromAccount.id,
    toAccountId: toAccount.id,
    amountMinor,
    currency: fromAccount.currency,
    toAmountMinor: leg.toAmountMinor,
    toCurrency: leg.toCurrency,
    rate: leg.rate,
    description,
    notes,
    transactionDate: transactionDate.toISOString(),
  };
}

export async function deleteTransfer(
  userId: string,
  transferId: string,
  audit: { ip?: string; userAgent?: string },
): Promise<void> {
  await getAccessibleTransfer(userId, transferId, { write: true });
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
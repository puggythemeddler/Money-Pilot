import {
  AppError,
  ErrorCodes,
  accountCreateSchema,
  accountUpdateSchema,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { accountBalances } from "./balances";

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

export interface AccountWithBalance {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalanceMinor: number;
  balanceMinor: number;
  archived: boolean;
  createdAt: string;
}

async function withBalances(
  userId: string,
  rows: { id: string; openingBalanceMinor: number }[],
): Promise<Record<string, number>> {
  const balances = await accountBalances(
    userId,
    rows.map((r) => r.id),
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.id] = r.openingBalanceMinor + (balances[r.id]?.balanceMinor ?? 0);
  }
  return out;
}

export async function listAccounts(userId: string, includeArchived = false) {
  const rows = await prisma.account.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });
  const current = await withBalances(userId, rows);
  return rows.map((a): AccountWithBalance => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    openingBalanceMinor: a.openingBalanceMinor,
    balanceMinor: current[a.id] ?? a.openingBalanceMinor,
    archived: a.archivedAt !== null,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function createAccount(
  userId: string,
  input: AccountCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const data = {
    userId,
    name: input.name,
    type: input.type,
    currency: input.currency,
    openingBalanceMinor: input.openingBalance ?? 0,
  };
  try {
    const account = await prisma.account.create({ data });
    await writeAudit({
      userId,
      action: AUDIT_ACTIONS.ACCOUNT_CREATED,
      entityType: "Account",
      entityId: account.id,
      metadata: { name: account.name, type: account.type, currency: account.currency },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return account;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(ErrorCodes.CONFLICT, "You already have an account with that name.", 409);
    }
    throw err;
  }
}

export async function getOwnedAccount(userId: string, accountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Account not found.", 404);
  }
  return account;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: AccountUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  await getOwnedAccount(userId, accountId);
  const data: { name?: string; archivedAt?: Date | null } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;

  try {
    const account = await prisma.account.update({ where: { id: accountId }, data });
    await writeAudit({
      userId,
      action: input.archived ? AUDIT_ACTIONS.ACCOUNT_ARCHIVED : AUDIT_ACTIONS.ACCOUNT_UPDATED,
      entityType: "Account",
      entityId: accountId,
      metadata: { name: input.name, archived: input.archived },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return account;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(ErrorCodes.CONFLICT, "You already have an account with that name.", 409);
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
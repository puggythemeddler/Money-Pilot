import {
  AppError,
  ErrorCodes,
  minorToNumber,
  parseMoneyInputToMinorUnits,
} from "@moneypilot/shared";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  AUDIT_ACTIONS,
  HOUSEHOLD_INVITE_STATUS,
  HOUSEHOLD_INVITE_TTL_MS,
  HOUSEHOLD_ROLES,
} from "@/lib/constants";
import { hashToken, randomToken } from "@/lib/tokens";
import { accountBalances } from "./balances";
import type { Prisma } from "@prisma/client";

/** My membership + household, or null when I am not in a household. */
export async function getMembership(userId: string) {
  return prisma.householdMember.findUnique({
    where: { userId },
    include: { household: true },
  });
}

/** The household owner's membership (with household), or a thrown error. */async function requireOwner(userId: string) {
  const membership = await getMembership(userId);
  if (!membership) {
    throw new AppError(ErrorCodes.FORBIDDEN, "You are not in a household.", 404);
  }
  if (membership.role !== HOUSEHOLD_ROLES.OWNER) {
    throw new AppError(ErrorCodes.NOT_HOUSEHOLD_OWNER, "Only the household owner can do this.", 403);
  }
  return membership;
}

/**
 * Prisma `where` matching every account visible to the user: their personal
 * accounts plus the joint accounts of their household. An account that is
 * neither (another user's personal account or another household's joint
 * account) stays invisible — not a 403, simply never returned.
 */
export function visibleAccountWhere(
  userId: string,
  membership: { householdId: string } | null,
): Prisma.AccountWhereInput {
  return {
    OR: [
      { userId, householdId: null },
      ...(membership ? [{ householdId: membership.householdId }] : []),
    ],
  };
}

/**
 * THE account authorization resolver. Personal accounts resolve for their
 * owner; joint accounts resolve for every member of the household (read) and
 * for members with record permission (write). Invisible accounts throw 404 so
 * existence is never leaked across users.
 */
export async function resolveAccountForUser(
  userId: string,
  accountId: string,
  opts: { write?: boolean } = {},
) {
  const [account, membership] = await Promise.all([
    prisma.account.findUnique({ where: { id: accountId } }),
    prisma.householdMember.findUnique({ where: { userId } }),
  ]);
  if (!account) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Account not found.", 404);
  }
  const isJoint = account.householdId !== null;
  const isPersonalMine = !isJoint && account.userId === userId;
  const isMemberOfHousehold = isJoint && membership?.householdId === account.householdId;
  if (!isPersonalMine && !isMemberOfHousehold) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Account not found.", 404);
  }
  if (opts.write && isJoint && membership?.canRecord !== true) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "You have read-only access to this household's shared accounts.",
      403,
    );
  }
  return account;
}

export async function createHousehold(
  userId: string,
  input: { name: string },
  audit: { ip?: string; userAgent?: string },
) {
  const existing = await prisma.householdMember.findUnique({ where: { userId } });
  if (existing) {
    throw new AppError(
      ErrorCodes.ALREADY_IN_HOUSEHOLD,
      "You are already in a household. Leave it before creating another.",
      409,
    );
  }
  const household = await prisma.$transaction(async (tx) => {
    const h = await tx.household.create({ data: { name: input.name } });
    await tx.householdMember.create({
      data: {
        householdId: h.id,
        userId,
        role: HOUSEHOLD_ROLES.OWNER,
        canRecord: true,
      },
    });
    return h;
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_CREATED,
    entityType: "Household",
    entityId: household.id,
    metadata: { name: household.name },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return household;
}

export async function renameHousehold(
  userId: string,
  input: { name: string },
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await requireOwner(userId);
  const household = await prisma.household.update({
    where: { id: membership.householdId },
    data: { name: input.name },
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_RENAMED,
    entityType: "Household",
    entityId: household.id,
    metadata: { name: household.name },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return household;
}

export async function createHouseholdInvite(
  userId: string,
  input: { canRecord?: boolean; expiresInDays?: number },
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await requireOwner(userId);
  if (membership.household.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "This household is archived.", 400);
  }
  const canRecord = input.canRecord ?? true;
  const ttl =
    input.expiresInDays !== undefined
      ? input.expiresInDays * 24 * 60 * 60 * 1000
      : HOUSEHOLD_INVITE_TTL_MS;
  const plain = randomToken(32);
  const row = await prisma.householdInvite.create({
    data: {
      householdId: membership.householdId,
      tokenHash: hashToken(plain),
      canRecord,
      status: HOUSEHOLD_INVITE_STATUS.PENDING,
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_INVITE_CREATED,
    entityType: "HouseholdInvite",
    entityId: row.id,
    metadata: { householdId: membership.householdId, canRecord },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return { id: row.id, token: plain, canRecord, expiresAt: row.expiresAt };
}

export async function listHouseholdInvites(userId: string) {
  const membership = await requireOwner(userId);
  const rows = await prisma.householdInvite.findMany({
    where: { householdId: membership.householdId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    canRecord: r.canRecord,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    usedAt: r.usedAt?.toISOString() ?? null,
    acceptedUserId: r.acceptedUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokeHouseholdInvite(
  userId: string,
  inviteId: string,
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await requireOwner(userId);
  const { count } = await prisma.householdInvite.updateMany({
    where: {
      id: inviteId,
      householdId: membership.householdId,
      status: HOUSEHOLD_INVITE_STATUS.PENDING,
    },
    data: { status: HOUSEHOLD_INVITE_STATUS.REVOKED },
  });
  if (count === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Invitation not found.", 404);
  }
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_INVITE_REVOKED,
    entityType: "HouseholdInvite",
    entityId: inviteId,
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
}

/**
 * Accepts a household invitation atomically: the invite is consumed and the
 * member row created in one transaction, so a failed join never burns the
 * invite. Joining while already in a household is rejected.
 */
export async function acceptHouseholdInvite(
  userId: string,
  input: { token: string },
  audit: { ip?: string; userAgent?: string },
) {
  const tokenHash = hashToken(input.token);
  const invite = await prisma.$transaction(async (tx) => {
    const row = await tx.householdInvite.findUnique({
      where: { tokenHash },
      include: { household: true },
    });
    if (
      !row ||
      row.status !== HOUSEHOLD_INVITE_STATUS.PENDING ||
      row.expiresAt <= new Date() ||
      row.household.archivedAt !== null
    ) {
      throw new AppError(
        ErrorCodes.HOUSEHOLD_INVITE_INVALID,
        "This invitation is invalid, expired, or already used.",
        403,
      );
    }
    const existing = await tx.householdMember.findUnique({ where: { userId } });
    if (existing) {
      throw new AppError(
        ErrorCodes.ALREADY_IN_HOUSEHOLD,
        "You are already in a household. Leave it before joining another.",
        409,
      );
    }
    await tx.householdInvite.update({
      where: { id: row.id },
      data: {
        status: HOUSEHOLD_INVITE_STATUS.ACCEPTED,
        usedAt: new Date(),
        acceptedUserId: userId,
      },
    });
    await tx.householdMember.create({
      data: { householdId: row.householdId, userId, canRecord: row.canRecord },
    });
    return row;
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_JOINED,
    entityType: "Household",
    entityId: invite.householdId,
    metadata: { canRecord: invite.canRecord, inviteId: invite.id },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return { householdId: invite.householdId, canRecord: invite.canRecord };
}

export async function updateHouseholdMemberPermission(
  userId: string,
  memberId: string,
  input: { canRecord: boolean },
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await requireOwner(userId);
  const target = await prisma.householdMember.findFirst({
    where: { id: memberId, householdId: membership.householdId },
  });
  if (!target) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Member not found.", 404);
  }
  if (target.role === HOUSEHOLD_ROLES.OWNER) {
    throw new AppError(ErrorCodes.FORBIDDEN, "The owner's permissions cannot be changed.", 403);
  }
  await prisma.householdMember.update({
    where: { id: target.id },
    data: { canRecord: input.canRecord },
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_PERMISSION_UPDATED,
    entityType: "HouseholdMember",
    entityId: target.id,
    metadata: { canRecord: input.canRecord, householdId: membership.householdId },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
}

export async function removeHouseholdMember(
  userId: string,
  memberId: string,
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await requireOwner(userId);
  if (membership.id === memberId) {
    throw new AppError(ErrorCodes.VALIDATION, "Use leave to remove yourself from the household.", 400);
  }
  const target = await prisma.householdMember.findFirst({
    where: { id: memberId, householdId: membership.householdId },
  });
  if (!target) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Member not found.", 404);
  }
  await prisma.householdMember.delete({ where: { id: target.id } });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_REMOVED,
    entityType: "HouseholdMember",
    entityId: target.id,
    metadata: { householdId: membership.householdId, removedUserId: target.userId },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
}

/**
 * Leaves the household. Ownership passes to the longest-standing remaining
 * member; when the last member leaves, the household and its joint accounts
 * are archived (never deleted) so history is preserved.
 */
export async function leaveHousehold(
  userId: string,
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await prisma.householdMember.findUnique({ where: { userId } });
  if (!membership) {
    throw new AppError(ErrorCodes.FORBIDDEN, "You are not in a household.", 404);
  }
  let archived = false;
  await prisma.$transaction(async (tx) => {
    const others = await tx.householdMember.findMany({
      where: { householdId: membership.householdId, id: { not: membership.id } },
      orderBy: { joinedAt: "asc" },
    });
    if (others.length === 0) {
      await tx.household.update({
        where: { id: membership.householdId },
        data: { archivedAt: new Date() },
      });
      await tx.account.updateMany({
        where: { householdId: membership.householdId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      archived = true;
    } else if (membership.role === HOUSEHOLD_ROLES.OWNER) {
      const successor = others[0];
      if (successor) {
        await tx.householdMember.update({
          where: { id: successor.id },
          data: { role: HOUSEHOLD_ROLES.OWNER },
        });
      }
    }
    await tx.householdMember.delete({ where: { id: membership.id } });
  });
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_LEFT,
    entityType: "Household",
    entityId: membership.householdId,
    metadata: { archivedHousehold: archived },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return { archivedHousehold: archived };
}

export interface JointAccountInput {
  name: string;
  type?: string;
  currency?: string;
  openingBalance?: string | number;
}

/** Owner-only: joint accounts belong to the household, not to a user. */
export async function createJointAccount(
  userId: string,
  input: JointAccountInput,
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await requireOwner(userId);
  if (membership.household.archivedAt !== null) {
    throw new AppError(ErrorCodes.FORBIDDEN, "This household is archived.", 400);
  }
  const currency = input.currency ?? "KES";
  const data = {
    userId,
    householdId: membership.householdId,
    name: input.name,
    type: input.type ?? "BANK",
    currency,
    openingBalanceMinor:
      input.openingBalance !== undefined
        ? parseMoneyInputToMinorUnits(input.openingBalance, currency, { allowZero: true })
        : 0,
  };
  let account;
  try {
    account = await prisma.account.create({ data });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        ErrorCodes.CONFLICT,
        "You already have an account with that name.",
        409,
      );
    }
    throw err;
  }
  await writeAudit({
    userId,
    action: AUDIT_ACTIONS.JOINT_ACCOUNT_CREATED,
    entityType: "Account",
    entityId: account.id,
    metadata: {
      name: account.name,
      type: account.type,
      currency: account.currency,
      householdId: membership.householdId,
    },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return account;
}

export async function updateJointAccount(
  userId: string,
  accountId: string,
  input: { name?: string; archived?: boolean },
  audit: { ip?: string; userAgent?: string },
) {
  const membership = await requireOwner(userId);
  const account = await prisma.account.findFirst({
    where: { id: accountId, householdId: membership.householdId },
  });
  if (!account) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Shared account not found.", 404);
  }
  const data: { name?: string; archivedAt?: Date | null } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  let updated;
  try {
    updated = await prisma.account.update({ where: { id: accountId }, data });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(ErrorCodes.CONFLICT, "You already have an account with that name.", 409);
    }
    throw err;
  }
  await writeAudit({
    userId,
    action: input.archived
      ? AUDIT_ACTIONS.JOINT_ACCOUNT_ARCHIVED
      : AUDIT_ACTIONS.JOINT_ACCOUNT_UPDATED,
    entityType: "Account",
    entityId: accountId,
    metadata: { name: input.name, archived: input.archived, householdId: membership.householdId },
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  return updated;
}

/** The household page payload: household, my role, members, joint accounts. */
export async function getHouseholdView(userId: string) {
  const membership = await getMembership(userId);
  if (!membership || membership.household.archivedAt !== null) return null;

  const [members, accounts] = await Promise.all([
    prisma.householdMember.findMany({
      where: { householdId: membership.householdId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.account.findMany({
      where: { householdId: membership.householdId },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    }),
  ]);
  const balances = await accountBalances(accounts.map((a) => a.id));

  const invites =
    membership.role === HOUSEHOLD_ROLES.OWNER
      ? (
          await prisma.householdInvite.findMany({
            where: { householdId: membership.householdId },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        ).map((r) => ({
          id: r.id,
          canRecord: r.canRecord,
          status: r.status,
          expiresAt: r.expiresAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }))
      : undefined;

  return {
    household: {
      id: membership.household.id,
      name: membership.household.name,
      createdAt: membership.household.createdAt.toISOString(),
    },
    me: {
      role: membership.role,
      canRecord: membership.canRecord,
      joinedAt: membership.joinedAt.toISOString(),
    },
    members: members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      canRecord: m.canRecord,
      joinedAt: m.joinedAt.toISOString(),
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      openingBalanceMinor: minorToNumber(a.openingBalanceMinor),
      balanceMinor:
        minorToNumber(a.openingBalanceMinor) + (balances[a.id]?.balanceMinor ?? 0),
      archived: a.archivedAt !== null,
      createdAt: a.createdAt.toISOString(),
    })),
    invites,
  };
}

/** Aggregated joint finances: month totals, per-member spending, recent activity. */
export async function getHouseholdOverview(userId: string) {
  const membership = await getMembership(userId);
  if (!membership || membership.household.archivedAt !== null) return null;

  const accounts = await prisma.account.findMany({
    where: { householdId: membership.householdId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const accountIds = accounts.map((a) => a.id);
  const balances = await accountBalances(accountIds);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [kindTotals, memberTotals, recent] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["kind"],
      where: {
        accountId: { in: accountIds },
        deletedAt: null,
        kind: { in: ["INCOME", "EXPENSE", "ADJUSTMENT"] },
        transactionDate: { gte: monthStart, lt: nextMonth },
      },
      _sum: { amountMinor: true },
    }),
    prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        accountId: { in: accountIds },
        deletedAt: null,
        kind: "EXPENSE",
        transactionDate: { gte: monthStart, lt: nextMonth },
      },
      _sum: { amountMinor: true },
    }),
    accountIds.length === 0
      ? Promise.resolve([])
      : prisma.transaction.findMany({
          where: { accountId: { in: accountIds }, deletedAt: null },
          include: {
            account: { select: { name: true } },
            user: { select: { name: true } },
          },
          orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
          take: 12,
        }),
  ]);

  let income = 0;
  let expense = 0;
  for (const r of kindTotals) {
    const v = minorToNumber(r._sum.amountMinor ?? 0);
    if (r.kind === "INCOME") income += v;
    else if (r.kind === "EXPENSE") expense += v;
  }

  const memberIds = new Set(memberTotals.map((m) => m.userId));
  const memberRows = await prisma.householdMember.findMany({
    where: { householdId: membership.householdId },
    include: { user: { select: { id: true, name: true } } },
  });
  const spentByUser = new Map(
    memberTotals.map((m) => [m.userId, -minorToNumber(m._sum.amountMinor ?? 0)]),
  );

  return {
    household: { id: membership.household.id, name: membership.household.name },
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balanceMinor: minorToNumber(a.openingBalanceMinor) + (balances[a.id]?.balanceMinor ?? 0),
    })),
    month: {
      incomeMinor: income,
      expenseMinor: -expense,
      netMinor: income + expense,
    },
    memberSpending: memberRows
      .map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        spentMinor: spentByUser.get(m.user.id) ?? 0,
        active: memberIds.has(m.user.id),
      }))
      .sort((a, b) => b.spentMinor - a.spentMinor),
    recentActivity: recent.map((t) => ({
      id: t.id,
      kind: t.kind,
      amountMinor: minorToNumber(t.amountMinor),
      currency: t.currency,
      description: t.description,
      transactionDate: t.transactionDate.toISOString(),
      accountName: t.account.name,
      recordedByName: t.user.name,
    })),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

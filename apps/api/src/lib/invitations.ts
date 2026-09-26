import { prisma } from "./db";
import { hashToken, randomToken } from "./tokens";
import { INVITE_STATUS } from "./constants";
import { AppError, ErrorCodes } from "@moneypilot/shared";
import type { Prisma } from "@prisma/client";

export interface InvitationOptions {
  email?: string;
  role?: string;
  expiresInDays?: number;
}

/**
 * Creates a single-use registration invitation and returns the plain token
 * to share with the invitee. Only the digest is persisted.
 */
export async function createInvitation(
  createdById: string,
  options: InvitationOptions = {},
): Promise<{ id: string; token: string; expiresAt: Date; email?: string; role: string }> {
  const plain = randomToken(32);
  const expiresAt = new Date(
    Date.now() + (options.expiresInDays ?? 30) * 24 * 60 * 60 * 1000,
  );
  const row = await prisma.invitation.create({
    data: {
      tokenHash: hashToken(plain),
      email: options.email,
      role: options.role ?? "USER",
      status: INVITE_STATUS.PENDING,
      expiresAt,
      createdById,
    },
  });
  return { id: row.id, token: plain, expiresAt, email: options.email, role: options.role ?? "USER" };
}

/** Resolves a plain invite token to its row when still usable, else null. */
export async function findInvitationByToken(plain: string) {
  const row = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(plain) },
  });
  if (
    !row ||
    row.status !== INVITE_STATUS.PENDING ||
    row.expiresAt <= new Date()
  ) {
    return null;
  }
  return row;
}

/**
 * Atomically marks an invitation as used and returns the role to grant.
 * Runs inside the caller's transaction so a failed signup never burns the
 * invite. Throws when the invitation is missing, used, or expired.
 */
export async function consumeInvitation(
  plain: string,
  registeredUserId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<{ role: string }> {
  const row = await tx.invitation.findUnique({
    where: { tokenHash: hashToken(plain) },
  });
  if (
    !row ||
    row.status !== INVITE_STATUS.PENDING ||
    row.expiresAt <= new Date()
  ) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "This invitation is invalid or has already been used.",
      403,
    );
  }
  await tx.invitation.update({
    where: { id: row.id },
    data: {
      status: INVITE_STATUS.USED,
      usedAt: new Date(),
      registeredUserId,
    },
  });
  return { role: row.role };
}

/** Revokes a pending invitation so its token stops working. */
export async function revokeInvitation(id: string): Promise<void> {
  await prisma.invitation.updateMany({
    where: { id, status: INVITE_STATUS.PENDING },
    data: { status: INVITE_STATUS.REVOKED },
  });
}

export async function listInvitations(options: { limit?: number; offset?: number; status?: string }) {
  const [items, total] = await Promise.all([
    prisma.invitation.findMany({
      where: options.status ? { status: options.status } : {},
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.invitation.count({
      where: options.status ? { status: options.status } : {},
    }),
  ]);
  return { items, total };
}
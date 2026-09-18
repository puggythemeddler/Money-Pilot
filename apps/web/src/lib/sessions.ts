import { prisma } from "./db";
import { SESSION_DEFAULT_TTL_MS, SESSION_REMEMBER_TTL_MS } from "./constants";
import { hashToken, randomToken } from "./tokens";
import { AppError, ErrorCodes } from "@moneypilot/shared";

export interface NewSessionResult {
  /** Sentinel so callers never touch the raw token. */
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

export function sessionTtlMs(remember: boolean): number {
  return remember ? SESSION_REMEMBER_TTL_MS : SESSION_DEFAULT_TTL_MS;
}

/** Creates a new session row for a device and returns the plain refresh token. */
export async function createSession(
  userId: string,
  deviceId: string,
  remember: boolean,
): Promise<NewSessionResult> {
  const refreshToken = randomToken(48);
  const ttl = sessionTtlMs(remember);
  const row = await prisma.session.create({
    data: {
      userId,
      deviceId,
      tokenHash: hashToken(refreshToken),
      remember,
      expiresAt: new Date(Date.now() + ttl),
      lastUsedAt: new Date(),
    },
  });
  return { refreshToken, sessionId: row.id, expiresAt: row.expiresAt };
}

/**
 * Rotates a refresh token: revokes the presented session and creates a fresh
 * one so a leaked refresh token is only usable once. Returns the new token or
 * null when the presented token is invalid, expired, or revoked.
 * The new session inherits the device and lifetime class of the old session.
 */
export async function rotateSession(refreshToken: string): Promise<NewSessionResult | null> {
  const digest = hashToken(refreshToken);
  const old = await prisma.session.findUnique({ where: { tokenHash: digest } });

  if (!old || old.revokedAt !== null || old.expiresAt <= new Date()) {
    return null;
  }

  const nextPlain = randomToken(48);
  const created = await prisma.$transaction(async (tx) => {
    const next = await tx.session.create({
      data: {
        userId: old.userId,
        deviceId: old.deviceId,
        tokenHash: hashToken(nextPlain),
        remember: old.remember,
        expiresAt: new Date(Date.now() + sessionTtlMs(old.remember)),
        lastUsedAt: new Date(),
      },
    });
    await tx.session.update({
      where: { id: old.id },
      data: { revokedAt: new Date(), replacedById: next.id },
    });
    return next;
  });

  return { refreshToken: nextPlain, sessionId: created.id, expiresAt: created.expiresAt };
}

/**
 * Finds the active session row matching a given refresh token, returning the
 * canonical digest so the caller can rotate it. Null means invalid.
 */
export async function resolveSessionByToken(userId: string, refreshToken: string) {
  const digest = hashToken(refreshToken);
  const row = await prisma.session.findUnique({ where: { tokenHash: digest } });
  if (!row || row.userId !== userId || row.revokedAt !== null || row.expiresAt <= new Date()) {
    return null;
  }
  return row;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeDeviceSessions(userId: string, deviceId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, deviceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Resolves a refresh token to its active session row, or null. */
export async function findSessionByToken(refreshToken: string) {
  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!row || row.revokedAt !== null || row.expiresAt <= new Date()) return null;
  return row;
}

export async function requireValidSession(userId: string, refreshToken: string) {
  const session = await resolveSessionByToken(userId, refreshToken);
  if (!session) {
    throw new AppError(ErrorCodes.INVALID_TOKEN, "Your session has expired. Please sign in again.", 401);
  }
  return session;
}
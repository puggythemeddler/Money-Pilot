import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { SESSION_DEFAULT_TTL_MS, SESSION_REMEMBER_TTL_MS } from "./constants";
import { hashToken, randomToken } from "./tokens";
import { AppError, ErrorCodes } from "@moneypilot/shared";

type Tx = Prisma.TransactionClient;

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
 * Walk the `replacedById` chain from the given session and revoke every
 * descendant. Called when a previously rotated (revoked) refresh token is
 * presented again — a sure sign the old token was stolen or leaked, so the
 * entire session lineage is killed.
 */
async function revokeDescendantChain(tx: Tx, fromSessionId: string): Promise<void> {
  const now = new Date();
  let currentId: string | null = fromSessionId;
  // Cap the walk to avoid pathological chains.
  for (let i = 0; i < 100 && currentId; i++) {
    const row: { id: string; replacedById: string | null } | null =
      await tx.session.findUnique({
        where: { id: currentId },
        select: { id: true, replacedById: true },
      });
    if (!row) break;
    await tx.session.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: now },
    });
    currentId = row.replacedById;
  }
}

/**
 * In-flight rotations keyed by token hash. Two (or more) requests presenting
 * the same refresh token within the same process are serialized: the first
 * performs the rotation and the joiners deterministically receive null, which
 * keeps SQLite/PostgreSQL write contention (and busy errors) out of the hot
 * path. Cross-process/cross-instance races are still covered by the atomic
 * `updateMany(... revokedAt: null)` consume below, so the guarantee holds even
 * with several server replicas behind a load balancer.
 */
const inflightRotations = new Map<string, Promise<NewSessionResult | null>>();

export function rotateSession(refreshToken: string): Promise<NewSessionResult | null> {
  const digest = hashToken(refreshToken);
  const running = inflightRotations.get(digest);
  if (running) {
    // Concurrent rotation for the same token: sit out and report a loss.
    return running.then(() => null);
  }
  const run = doRotate(digest);
  inflightRotations.set(digest, run);
  return run.finally(() => inflightRotations.delete(digest));
}

async function doRotate(digest: string): Promise<NewSessionResult | null> {
  const now = new Date();
  const existing = await prisma.session.findUnique({ where: { tokenHash: digest } });

  if (!existing) return null;

  // Reuse of an already-revoked token: kill the whole lineage. Best effort —
  // a database hiccup here still answers 401, never returns a new token.
  if (existing.revokedAt !== null) {
    if (existing.replacedById) {
      try {
        await prisma.$transaction((tx) => revokeDescendantChain(tx, existing.id));
      } catch {
        // Ignored: the presented token is already dead regardless.
      }
    }
    return null;
  }
  if (existing.expiresAt <= now) return null;

  const nextPlain = randomToken(48);
  const created = await prisma.session.create({
    data: {
      userId: existing.userId,
      deviceId: existing.deviceId,
      tokenHash: hashToken(nextPlain),
      remember: existing.remember,
      expiresAt: new Date(Date.now() + sessionTtlMs(existing.remember)),
      lastUsedAt: new Date(),
    },
  });

  // Atomic consume: exactly one concurrent rotation can claim this session.
  const consumed = await prisma.session.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: now, replacedById: created.id },
  });
  if (consumed.count !== 1) {
    // Lost the race: the row created above was never issued to anyone.
    await prisma.session.delete({ where: { id: created.id } }).catch(() => {});
    return null;
  }

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
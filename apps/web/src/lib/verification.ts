import { prisma } from "./db";
import { hashToken, randomToken } from "./tokens";

/**
 * Issues a single-use verification token for a user. Any outstanding unused
 * tokens of the same kind are invalidated first so only the latest email
 * link works. Returns the plain token (sent to the user by email); only its
 * digest is stored.
 */
export async function issueVerificationToken(
  userId: string,
  kind: "EMAIL_VERIFY" | "PASSWORD_RESET",
  ttlMs: number,
): Promise<string> {
  const plain = randomToken(32);
  await prisma.verificationToken.updateMany({
    where: { userId, kind, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.verificationToken.create({
    data: {
      userId,
      kind,
      tokenHash: hashToken(plain),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return plain;
}

/**
 * Consumes a verification token. Returns the owning user id on success or
 * null when the token is unknown, expired, already used, or of the wrong kind.
 */
export async function consumeVerificationToken(
  kind: "EMAIL_VERIFY" | "PASSWORD_RESET",
  plain: string,
): Promise<{ userId: string } | null> {
  const row = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(plain) },
  });
  if (!row || row.kind !== kind || row.usedAt !== null || row.expiresAt <= new Date()) {
    return null;
  }
  await prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return { userId: row.userId };
}
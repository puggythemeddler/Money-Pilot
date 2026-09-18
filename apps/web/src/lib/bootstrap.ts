import { env } from "./env";
import { prisma } from "./db";
import { hashPassword } from "./password";
import { USER_ROLES } from "./constants";

let bootstrapped = false;
let inflight: Promise<void> | null = null;

/**
 * Creates the bootstrap administrator described by SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD. Idempotent, safe to call on every request, and only
 * ever creates — it never resets or promotes an existing account.
 * Useful for private deployments where no one can self-register yet.
 */
export function ensureBootstrapAdmin(): Promise<void> {
  if (bootstrapped) return Promise.resolve();
  if (!inflight) {
    inflight = bootstrapOnce().finally(() => {
      bootstrapped = true;
      inflight = null;
    });
  }
  return inflight;
}

async function bootstrapOnce(): Promise<void> {
  const email = env.seedAdmin.email?.trim().toLowerCase();
  const password = env.seedAdmin.password;
  if (!email || !password) return;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return;

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const admin = await tx.user.create({
      data: { email, name: "Administrator", passwordHash, role: USER_ROLES.ADMIN },
    });
    await tx.userProfile.create({ data: { userId: admin.id, financialMonthStartDay: 1 } });
  });
  console.log("[bootstrap] created admin account for", email);
}
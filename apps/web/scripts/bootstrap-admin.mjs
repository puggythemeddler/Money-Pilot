#!/usr/bin/env node
/**
 * Explicit bootstrap for private (invite-only) deployments.
 *
 * Creates the initial ADMIN account described by SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD. Idempotent: it never changes or promotes an existing
 * account, and exits quietly if the admin already exists.
 *
 * This is a plain Node script (not compiled by Next) so it can run before any
 * HTTP request — the previous "bootstrap on login" behaviour was removed for
 * security.
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs
 *   SEED_ADMIN_EMAIL=admin@x.com SEED_ADMIN_PASSWORD=... node scripts/bootstrap-admin.mjs
 *
 * Environment: DATABASE_URL (defaults to the schema default file:./dev.db),
 * SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const PASSWORD_HASH_ROUNDS = 12;

async function bootstrap() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

  if (!email || !password) {
    console.error(
      "[bootstrap-admin] Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD.",
    );
    console.error(
      "[bootstrap-admin] Set them in your environment (or .env) and re-run this script.",
    );
    process.exitCode = 2;
    return;
  }
  if (password.length < 8) {
    console.error("[bootstrap-admin] SEED_ADMIN_PASSWORD must be at least 8 characters.");
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      console.log(`[bootstrap-admin] Admin "${email}" already exists; nothing to do.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    await prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: { email, name: "Administrator", passwordHash, role: "ADMIN" },
      });
      await tx.userProfile.create({ data: { userId: admin.id, financialMonthStartDay: 1 } });
    });
    console.log(`[bootstrap-admin] Created admin account for "${email}".`);
  } catch (err) {
    console.error("[bootstrap-admin] Failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap();
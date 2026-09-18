import path from "path";
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/**
 * Prisma resolves relative SQLite URLs (e.g. "file:./dev.db") against the
 * schema directory when using the CLI, but against the process working
 * directory at runtime. We normalize relative paths to the prisma/ schema
 * directory of this app so `prisma migrate dev` and the runtime client always
 * target the same database file. Absolute paths and remote URLs (PostgreSQL)
 * pass through unchanged.
 */
function resolvedDatabaseUrl(): string {
  const url = env.databaseUrl;
  if (!url.startsWith("file:")) return url;
  const raw = url.slice("file:".length);
  if (path.isAbsolute(raw)) return url;
  return `file:${path.join(process.cwd(), "prisma", raw).split("\\").join("/")}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolvedDatabaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
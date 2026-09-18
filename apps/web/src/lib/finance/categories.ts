import {
  AppError,
  ErrorCodes,
  categoryCreateSchema,
  categoryUpdateSchema,
  DEFAULT_CATEGORIES,
} from "@moneypilot/shared";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

/**
 * Creates the default category set for a user when they have no categories at
 * all. Called lazily from listCategories so pre-existing accounts (created
 * before the finance phase) get a working set without a migration.
 */
export async function ensureDefaultCategories(userId: string): Promise<void> {
  const existing = await prisma.category.count({ where: { userId } });
  if (existing > 0) return;
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      userId,
      name: c.name,
      kind: c.kind,
      color: c.color,
    })),
  });
}

export async function listCategories(
  userId: string,
  opts: { includeArchived?: boolean; kind?: string } = {},
) {
  await ensureDefaultCategories(userId);
  const rows = await prisma.category.findMany({
    where: {
      userId,
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const counts = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, deletedAt: null, categoryId: { not: null } },
    _count: { _all: true },
  });
  const countByCategory = new Map<string, number>();
  for (const c of counts) {
    if (c.categoryId) countByCategory.set(c.categoryId, c._count._all);
  }
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    color: c.color,
    archived: c.archivedAt !== null,
    transactionCount: countByCategory.get(c.id) ?? 0,
  }));
}

export async function createCategory(
  userId: string,
  input: CategoryCreateInput,
  audit: { ip?: string; userAgent?: string },
) {
  const data = {
    userId,
    name: input.name,
    kind: input.kind,
    color: input.color,
  };
  try {
    const category = await prisma.category.create({ data });
    await writeAudit({
      userId,
      action: AUDIT_ACTIONS.CATEGORY_CREATED,
      entityType: "Category",
      entityId: category.id,
      metadata: { name: category.name, kind: category.kind },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return category;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(ErrorCodes.CONFLICT, "You already have a category with that name.", 409);
    }
    throw err;
  }
}

export async function getOwnedCategory(userId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Category not found.", 404);
  }
  return category;
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: CategoryUpdateInput,
  audit: { ip?: string; userAgent?: string },
) {
  await getOwnedCategory(userId, categoryId);
  const data: { name?: string; color?: string; archivedAt?: Date | null } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.color !== undefined) data.color = input.color;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;

  try {
    const category = await prisma.category.update({ where: { id: categoryId }, data });
    await writeAudit({
      userId,
      action: input.archived ? AUDIT_ACTIONS.CATEGORY_ARCHIVED : AUDIT_ACTIONS.CATEGORY_UPDATED,
      entityType: "Category",
      entityId: categoryId,
      metadata: { name: input.name, archived: input.archived },
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
    return category;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(ErrorCodes.CONFLICT, "You already have a category with that name.", 409);
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
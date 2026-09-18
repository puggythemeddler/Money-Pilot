import { prisma } from "./db";

export interface AuditInput {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends an audit record. Audit failures never break the originating request:
 * the event is logged and the request continues.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit record:", err);
  }
}
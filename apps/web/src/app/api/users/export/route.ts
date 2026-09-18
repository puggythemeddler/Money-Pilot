import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { fail, getClientIp, newRequestId, ok } from "@/lib/api";

/**
 * Exports the user's own data as a JSON bundle. This endpoint grows with each
 * phase as financial entity tables are introduced; spreads must never include
 * raw tokens, password hashes, or other secrets.
 */
export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    const context = await requireUser({ headers: req.headers });
    const userId = context.user.id;

    const [user, profile, devices, auditCount] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          preferredCurrency: true,
          timezone: true,
          createdAt: true,
        },
      }),
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.device.findMany({
        where: { userId },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          name: true,
          platform: true,
          lastSeenAt: true,
          revokedAt: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where: { userId } }),
    ]);

    await writeAudit({
      userId,
      action: AUDIT_ACTIONS.DATA_EXPORTED,
      entityType: "User",
      entityId: userId,
      ip,
    });

    return ok({
      format: "moneypilot-export/v1",
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerifiedAt !== null,
        preferredCurrency: user.preferredCurrency,
        timezone: user.timezone,
        createdAt: user.createdAt.toISOString(),
        profile: {
          financialMonthStartDay: profile?.financialMonthStartDay ?? 1,
          settings: (() => {
            try {
              return JSON.parse(profile?.settingsJson ?? "{}");
            } catch {
              return {};
            }
          })(),
        },
      },
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        lastSeenAt: d.lastSeenAt.toISOString(),
        revokedAt: d.revokedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
      // Financial entities (accounts, transactions, debts, budgets, ...) will
      // be appended by later phases.
      auditRecordCount: auditCount,
    });
  } catch (err) {
    return fail(err, requestId);
  }
}
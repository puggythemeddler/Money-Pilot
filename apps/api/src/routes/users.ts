import { Hono } from "hono";
import { randomBytes } from "crypto";
import { AppError, ErrorCodes, deleteAccountSchema } from "@moneypilot/shared";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS, USER_STATUS } from "@/lib/constants";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { clearAuthCookies } from "@/lib/cookies";

/**
 * Self-service user routes mounted at /api: data export and account deletion.
 * Ported verbatim from the Next.js route handlers.
 */

const users = new Hono();

/**
 * Exports the user's own data as a JSON bundle. This endpoint grows with each
 * phase as financial entity tables are introduced; spreads must never include
 * raw tokens, password hashes, or other secrets.
 */
users.get("/users/export", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const ip = getClientIp(req);
    const context = await requireUser(req);
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
});

/**
 * Deletes the calling user's account. For safety the password must be
 * re-entered and the literal "DELETE" supplied as confirmation.
 *
 * The user's PII is anonymized, the account is marked deleted (a hard stop
 * for auth), and every session is revoked. Audit rows are retained for
 * compliance but are stripped of personally identifying references.
 */
users.post("/users/delete-account", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const ip = getClientIp(req);
    const context = await requireUser(req);

    const raw = await parseJson(req);
    const input = validate(deleteAccountSchema, raw);

    const user = await prisma.user.findUnique({ where: { id: context.user.id } });
    if (!user) throw new AppError(ErrorCodes.NOT_FOUND, "Account not found.", 404);

    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, "Incorrect password.", 401);
    }

    const pseudonym = `deleted-${randomBytes(12).toString("hex")}`;
    await prisma.$transaction([
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          deletedAt: new Date(),
          status: USER_STATUS.DISABLED,
          email: `${pseudonym}@deleted.local`,
          name: "Deleted User",
        },
      }),
    ]);

    await writeAudit({
      userId: undefined,
      action: AUDIT_ACTIONS.ACCOUNT_DELETED,
      entityType: "User",
      entityId: context.user.id,
      ip,
    });

    return clearAuthCookies(ok({ deleted: true }));
  } catch (err) {
    return fail(err, requestId);
  }
});

export const userRoutes = users;

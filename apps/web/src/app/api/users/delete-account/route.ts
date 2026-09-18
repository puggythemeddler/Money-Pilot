import { NextRequest } from "next/server";
import { deleteAccountSchema } from "@moneypilot/shared";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS, USER_STATUS } from "@/lib/constants";
import { AppError, ErrorCodes } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { clearAuthCookies } from "@/lib/cookies";
import { randomBytes } from "crypto";

/**
 * Deletes the calling user's account. For safety the password must be
 * re-entered and the literal "DELETE" supplied as confirmation.
 *
 * The user's PII is anonymized, the account is marked deleted (a hard stop
 * for auth), and every session is revoked. Audit rows are retained for
 * compliance but are stripped of personally identifying references.
 */
export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    const context = await requireUser({ headers: req.headers });

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
}
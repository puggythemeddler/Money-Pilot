import { NextRequest, NextResponse } from "next/server";
import { AppError, ErrorCodes, resetPasswordSchema } from "@moneypilot/shared";
import { AUDIT_ACTIONS, TOKEN_KINDS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { consumeVerificationToken } from "@/lib/verification";
import { revokeAllSessions } from "@/lib/sessions";
import { writeAudit } from "@/lib/audit";
import { fail, getClientIp, newRequestId, parseJson, validate } from "@/lib/api";
import { authRateLimit } from "@/lib/rateLimit";
import { clearAuthCookies } from "@/lib/cookies";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    authRateLimit(`reset-password:${ip}`);

    const raw = await parseJson(req);
    const input = validate(resetPasswordSchema, raw);

    const res = await consumeVerificationToken(TOKEN_KINDS.PASSWORD_RESET, input.token);
    if (!res) {
      throw new AppError(ErrorCodes.INVALID_TOKEN, "This reset link is invalid or has expired.", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: res.userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Account not found.", 404);
    }

    // Possession of the emailed link proves control of the inbox, so a
    // successful reset also verifies the email if it was never verified.
    const passwordHash = await hashPassword(input.password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });

    // Force re-authentication on every device after a password reset.
    await revokeAllSessions(user.id);
    await writeAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      entityType: "User",
      entityId: user.id,
      ip,
    });

    const response = NextResponse.json({ data: { reset: true } });
    return clearAuthCookies(response);
  } catch (err) {
    return fail(err, requestId);
  }
}
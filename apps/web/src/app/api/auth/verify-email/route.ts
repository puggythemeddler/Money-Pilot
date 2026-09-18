import { NextRequest } from "next/server";
import { AppError, ErrorCodes, verifyEmailSchema } from "@moneypilot/shared";
import { AUDIT_ACTIONS, TOKEN_KINDS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { consumeVerificationToken } from "@/lib/verification";
import { writeAudit } from "@/lib/audit";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { authRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    authRateLimit(`verify-email:${ip}`);

    const raw = await parseJson(req);
    const input = validate(verifyEmailSchema, raw);

    const res = await consumeVerificationToken(TOKEN_KINDS.EMAIL_VERIFY, input.token);
    if (!res) {
      throw new AppError(ErrorCodes.INVALID_TOKEN, "This verification link is invalid or has expired.", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: res.userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Account not found.", 404);
    }

    if (user.emailVerifiedAt !== null) {
      return ok({ verified: true, alreadyVerified: true });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    await writeAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.EMAIL_VERIFIED,
      entityType: "User",
      entityId: user.id,
      ip,
    });

    return ok({ verified: true, alreadyVerified: false });
  } catch (err) {
    return fail(err, requestId);
  }
}
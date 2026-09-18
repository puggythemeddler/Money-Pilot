import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@moneypilot/shared";
import { PASSWORD_RESET_TTL_MS, TOKEN_KINDS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { issueVerificationToken } from "@/lib/verification";
import { sendPasswordResetEmail } from "@/lib/email";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { authRateLimit } from "@/lib/rateLimit";

/**
 * Always responds as if the email was sent to avoid leaking which addresses
 * have accounts. Actual delivery only happens for existing, active accounts.
 */
export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    authRateLimit(`forgot-password:${ip}`);

    const raw = await parseJson(req);
    const input = validate(forgotPasswordSchema, raw);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (user && user.deletedAt === null && user.status === "ACTIVE" && user.emailVerifiedAt !== null) {
      const token = await issueVerificationToken(
        user.id,
        TOKEN_KINDS.PASSWORD_RESET,
        PASSWORD_RESET_TTL_MS,
      );
      await sendPasswordResetEmail({ name: user.name, email: user.email }, token);
    }

    return ok({ sent: true });
  } catch (err) {
    return fail(err, requestId);
  }
}
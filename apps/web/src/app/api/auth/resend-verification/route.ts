import { NextRequest } from "next/server";
import { AUDIT_ACTIONS, EMAIL_VERIFY_TTL_MS, TOKEN_KINDS } from "@/lib/constants";
import { issueVerificationToken } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { fail, getClientIp, newRequestId, ok } from "@/lib/api";
import { authRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    authRateLimit(`resend-verification:${ip}:${context.user.id}`);

    if (context.user.emailVerified) {
      return ok({ sent: false, reason: "already_verified" });
    }

    const token = await issueVerificationToken(
      context.user.id,
      TOKEN_KINDS.EMAIL_VERIFY,
      EMAIL_VERIFY_TTL_MS,
    );
    await sendVerificationEmail({ name: context.user.name, email: context.user.email }, token);
    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.RESEND_VERIFICATION,
      entityType: "User",
      entityId: context.user.id,
      ip,
    });

    return ok({ sent: true, reason: "sent" });
  } catch (err) {
    return fail(err, requestId);
  }
}
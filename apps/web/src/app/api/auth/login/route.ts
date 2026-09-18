import { NextRequest } from "next/server";
import { AppError, ErrorCodes, loginSchema } from "@moneypilot/shared";
import { AUDIT_ACTIONS, USER_STATUS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { upsertDevice } from "@/lib/devices";
import { createSession } from "@/lib/sessions";
import { signAccessToken } from "@/lib/jwt";
import { writeAudit } from "@/lib/audit";
import { fail, getClientIp, newRequestId, parseJson, validate } from "@/lib/api";
import { authRateLimit } from "@/lib/rateLimit";
import { authJsonResponse } from "@/lib/cookies";
import { ensureBootstrapAdmin } from "@/lib/bootstrap";
import type { AuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    authRateLimit(`login:${ip}`);

    // Private deployments have no way to create the first admin through the
    // UI, so a seeding attempt on login makes the described bootstrap admin
    // available to sign in for the first time (idempotent, never resets).
    await ensureBootstrapAdmin();

    const raw = await parseJson(req);
    const input = validate(loginSchema, raw);
    const ua = req.headers.get("user-agent") ?? undefined;

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.deletedAt !== null) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, "Incorrect email or password.", 401);
    }
    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, "Incorrect email or password.", 401);
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new AppError(ErrorCodes.ACCOUNT_DISABLED, "This account has been disabled.", 403);
    }

    const device = await upsertDevice(user.id, input.device ?? {}, ip, ua);
    const session = await createSession(user.id, device.id, input.remember ?? false);
    const accessToken = await signAccessToken({ sub: user.id, sid: session.sessionId, did: device.id });

    await writeAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      entityType: "Device",
      entityId: device.id,
      ip,
      userAgent: ua,
    });

    const me: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
      preferredCurrency: user.preferredCurrency,
      timezone: user.timezone,
    };
    return authJsonResponse(me, accessToken, session.refreshToken, input.remember ?? false);
  } catch (err) {
    return fail(err, requestId);
  }
}
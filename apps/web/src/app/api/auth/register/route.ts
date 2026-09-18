import { NextRequest } from "next/server";
import { AppError, ErrorCodes, registerSchema } from "@moneypilot/shared";
import {
  EMAIL_VERIFY_TTL_MS,
  TOKEN_KINDS,
  AUDIT_ACTIONS,
  USER_ROLES,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { upsertDevice } from "@/lib/devices";
import { createSession } from "@/lib/sessions";
import { signAccessToken } from "@/lib/jwt";
import { issueVerificationToken } from "@/lib/verification";
import { findInvitationByToken, consumeInvitation } from "@/lib/invitations";
import { sendVerificationEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { fail, getClientIp, newRequestId, parseJson, validate } from "@/lib/api";
import { authRateLimit } from "@/lib/rateLimit";
import { authJsonResponse, isTokenMode } from "@/lib/cookies";
import type { AuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const tokenMode = isTokenMode(req);
  try {
    const ip = getClientIp(req);
    authRateLimit(`register:${ip}`);

    const raw = await parseJson(req);
    const input = validate(registerSchema, raw);
    const ua = req.headers.get("user-agent") ?? undefined;

    // In private mode every new account requires a valid invitation.
    let invite: { role: string } | null = null;
    if (env.privateMode && !input.inviteToken) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        "Registration is invite-only. You need an invitation to create an account.",
        403,
      );
    }
    if (input.inviteToken) {
      const row = await findInvitationByToken(input.inviteToken);
      if (!row) {
        throw new AppError(
          ErrorCodes.FORBIDDEN,
          "This invitation is invalid or has already been used.",
          403,
        );
      }
      invite = { role: row.role };
      if (row.email && row.email.toLowerCase() !== input.email.toLowerCase()) {
        throw new AppError(
          ErrorCodes.FORBIDDEN,
          "This invitation was issued to a different email address.",
          403,
        );
      }
    }

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(ErrorCodes.EMAIL_IN_USE, "An account with this email already exists.", 409);
    }

    const passwordHash = await hashPassword(input.password);
    const role = invite?.role ?? USER_ROLES.USER;
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          role,
          preferredCurrency: input.preferredCurrency,
        },
      });
      await tx.userProfile.create({ data: { userId: created.id, financialMonthStartDay: 1 } });
      if (input.inviteToken) {
        await consumeInvitation(input.inviteToken, created.id, tx);
      }
      return created;
    });

    const device = await upsertDevice(user.id, input.device ?? {}, ip, ua);
    const session = await createSession(user.id, device.id, true);
    const accessToken = await signAccessToken({ sub: user.id, sid: session.sessionId, did: device.id });

    const verifyToken = await issueVerificationToken(
      user.id,
      TOKEN_KINDS.EMAIL_VERIFY,
      EMAIL_VERIFY_TTL_MS,
    );
    await sendVerificationEmail({ name: user.name, email: user.email }, verifyToken);

    await writeAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.REGISTER,
      entityType: "User",
      entityId: user.id,
      metadata: { role, invited: Boolean(input.inviteToken) },
      ip,
      userAgent: ua,
    });
    if (input.inviteToken) {
      await writeAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.INVITE_USED,
        entityType: "Invitation",
        entityId: user.id,
        ip,
        userAgent: ua,
      });
    }

    const me: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: false,
      role: role === USER_ROLES.ADMIN ? "ADMIN" : "USER",
      preferredCurrency: user.preferredCurrency,
      timezone: user.timezone,
    };
    return authJsonResponse(me, accessToken, session.refreshToken, true, { tokenMode });
  } catch (err) {
    return fail(err, requestId);
  }
}
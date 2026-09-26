import { Hono } from "hono";
import { z } from "zod";
import {
  AppError,
  ErrorCodes,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
  type AuthUser,
} from "@moneypilot/shared";
import { AUDIT_ACTIONS, EMAIL_VERIFY_TTL_MS, PASSWORD_RESET_TTL_MS, TOKEN_KINDS, USER_ROLES, USER_STATUS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { upsertDevice, getDeviceForUser, listDevicesForUser } from "@/lib/devices";
import {
  createSession,
  findSessionByToken,
  revokeAllSessions,
  revokeDeviceSessions,
  revokeSession,
  rotateSession,
} from "@/lib/sessions";
import { signAccessToken } from "@/lib/jwt";
import { issueVerificationToken, consumeVerificationToken } from "@/lib/verification";
import { findInvitationByToken, consumeInvitation } from "@/lib/invitations";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { authRateLimit } from "@/lib/rateLimit";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { authJsonResponse, clearAuthCookies, isTokenMode } from "@/lib/cookies";
import { getAuthContext, readRefreshToken, requireUser, toPublicUser } from "@/lib/auth";

/**
 * Auth routes mounted at /api: login, register, refresh, logout, logout-all,
 * me, forgot/reset password, verify-email, resend-verification and device
 * management. Ported verbatim from the Next.js route handlers; request
 * objects are the standard fetch Request, responses plain Response.
 */

/** Reads the JSON body, tolerating an empty body in cookie-mode refreshes. */
async function readBodyOrEmpty(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(ErrorCodes.VALIDATION, "Request body must be valid JSON.", 400);
  }
}

function toAuthUser(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerifiedAt: Date | null;
  preferredCurrency: string;
  timezone: string;
}) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerifiedAt !== null,
    role: row.role === "ADMIN" ? ("ADMIN" as const) : ("USER" as const),
    preferredCurrency: row.preferredCurrency,
    timezone: row.timezone,
  };
}

const auth = new Hono();

auth.post("/auth/login", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  const tokenMode = isTokenMode(req);
  try {
    const ip = getClientIp(req);
    authRateLimit(`login:${ip}`);
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

    return authJsonResponse(toAuthUser(user), accessToken, session.refreshToken, input.remember ?? false, {
      tokenMode,
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

auth.post("/auth/register", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
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
      ...toAuthUser(user),
      emailVerified: false,
      role: role === USER_ROLES.ADMIN ? "ADMIN" : "USER",
    };
    return authJsonResponse(me, accessToken, session.refreshToken, true, { tokenMode });
  } catch (err) {
    return fail(err, requestId);
  }
});

auth.post("/auth/refresh", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  const tokenMode = isTokenMode(req);
  let shouldClearCookies = false;
  try {
    const raw = await readBodyOrEmpty(req);
    const input = validate(refreshSchema, raw);
    const cookieToken = readRefreshToken(req);
    const refreshToken = input.refreshToken || cookieToken;
    if (!refreshToken) {
      throw new AppError(ErrorCodes.AUTHENTICATION, "No refresh token provided.", 401);
    }

    const session = await findSessionByToken(refreshToken);
    if (!session) {
      // Invalid, expired, or already-rotated token. If it was rotated, the
      // reuse is handled (and the lineage revoked) inside rotateSession.
      await rotateSession(refreshToken);
      shouldClearCookies = true;
      throw new AppError(ErrorCodes.INVALID_TOKEN, "Your session has expired. Please sign in again.", 401);
    }
    const user = session.user;
    if (user.deletedAt !== null || user.status !== "ACTIVE") {
      shouldClearCookies = true;
      throw new AppError(ErrorCodes.INVALID_TOKEN, "Your account is no longer active.", 401);
    }

    const next = await rotateSession(refreshToken);
    if (!next) {
      shouldClearCookies = true;
      throw new AppError(ErrorCodes.INVALID_TOKEN, "Your session has expired. Please sign in again.", 401);
    }

    const accessToken = await signAccessToken({ sub: user.id, sid: next.sessionId, did: session.deviceId });

    await prisma.session.update({ where: { id: next.sessionId }, data: { lastUsedAt: new Date() } });

    return authJsonResponse(toAuthUser(user), accessToken, next.refreshToken, session.remember, { tokenMode });
  } catch (err) {
    if (shouldClearCookies && !tokenMode) {
      return clearAuthCookies(fail(err, requestId));
    }
    return fail(err, requestId);
  }
});

auth.post("/auth/logout", async (c) => {
  const req = c.req.raw;
  try {
    const context = await getAuthContext(req);
    if (context) {
      await revokeSession(context.sessionId);
      await writeAudit({
        userId: context.user.id,
        action: AUDIT_ACTIONS.LOGOUT,
        entityType: "Session",
        entityId: context.sessionId,
      });
    }
    return clearAuthCookies(ok({ loggedOut: true }));
  } catch {
    // Logout is best-effort: pretend success and clear cookies regardless.
    return clearAuthCookies(ok({ loggedOut: true }));
  }
});

auth.post("/auth/logout-all", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    await revokeAllSessions(context.user.id);
    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.LOGOUT_ALL,
      entityType: "User",
      entityId: context.user.id,
    });
    return clearAuthCookies(ok({ loggedOutAll: true }));
  } catch (err) {
    return fail(err, requestId);
  }
});

auth.get("/auth/me", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    return ok({
      user: toPublicUser(context.user),
      sessionId: context.sessionId,
      deviceId: context.deviceId,
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

auth.patch("/auth/me", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await getAuthContext(req);
    if (!context) {
      throw new AppError(ErrorCodes.AUTHENTICATION, "Please sign in to continue.", 401);
    }
    const ip = getClientIp(req);

    const raw = await parseJson(req);
    const input = validate(updateProfileSchema, raw);

    const [user, profile] = await prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: context.user.id },
        data: {
          name: input.name ?? context.user.name,
          preferredCurrency: input.preferredCurrency ?? context.user.preferredCurrency,
          timezone: input.timezone ?? context.user.timezone,
        },
      });
      const nextProfile = await tx.userProfile.upsert({
        where: { userId: context.user.id },
        create: {
          userId: context.user.id,
          financialMonthStartDay: input.financialMonthStartDay ?? 1,
        },
        update: {
          financialMonthStartDay: input.financialMonthStartDay ?? undefined,
        },
      });
      return [next, nextProfile] as const;
    });

    await writeAudit({
      userId: context.user.id,
      action: "PROFILE_UPDATED",
      entityType: "User",
      entityId: context.user.id,
      metadata: { currency: user.preferredCurrency, ip },
      ip,
    });

    return ok({
      user: toPublicUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
        emailVerified: user.emailVerifiedAt !== null,
        preferredCurrency: user.preferredCurrency,
        timezone: user.timezone,
      }),
      profile: { financialMonthStartDay: profile.financialMonthStartDay },
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

auth.post("/auth/forgot-password", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
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
});

auth.post("/auth/reset-password", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
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

    return clearAuthCookies(ok({ reset: true }));
  } catch (err) {
    return fail(err, requestId);
  }
});

auth.post("/auth/verify-email", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
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
});

auth.post("/auth/resend-verification", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
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
});

const revokeDeviceSchema = z.object({ deviceId: z.string().min(1) });

auth.get("/auth/devices", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const devices = await listDevicesForUser(context.user.id);
    return ok({
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        lastSeenAt: d.lastSeenAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
        activeSessions: d._count.sessions,
        isCurrent: d.id === context.deviceId,
      })),
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

auth.post("/auth/devices", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const raw = await parseJson(req);
    const input = validate(revokeDeviceSchema, raw);

    const device = await getDeviceForUser(context.user.id, input.deviceId);
    if (!device) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Device not found.", 404);
    }

    await revokeDeviceSessions(context.user.id, device.id);
    await prisma.device.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.DEVICE_REVOKED,
      entityType: "Device",
      entityId: device.id,
    });

    const isCurrent = device.id === context.deviceId;
    const res = ok({ revoked: true, currentDevice: isCurrent });
    if (isCurrent) {
      return clearAuthCookies(res);
    }
    return res;
  } catch (err) {
    return fail(err, requestId);
  }
});

export const authRoutes = auth;

import { Hono } from "hono";
import { z } from "zod";
import {
  AppError,
  ErrorCodes,
  changePasswordSchema,
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
  revokeOtherSessions,
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
import { authJsonResponse, clearAuthCookies, isTokenMode, setAuthCookies } from "@/lib/cookies";
import { getAuthContext, readRefreshToken, requireUser, toPublicUser } from "@/lib/auth";
import { decideGoogleAction, normalizeEmailForMatch, type ExistingUserInput, type GoogleRefusalReason } from "@/lib/google-linking";
import {
  buildGoogleAuthUrl,
  clearOAuthTxCookie,
  exchangeGoogleCode,
  generatePkce,
  generateState,
  readOAuthTxCookie,
  setOAuthTxCookie,
  signOAuthTx,
  verifyGoogleIdToken,
  verifyOAuthTx,
} from "@/lib/google-oauth";
import { randomToken } from "@/lib/tokens";

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
    const profile = await prisma.userProfile.findUnique({
      where: { userId: context.user.id },
      select: { financialMonthStartDay: true },
    });
    return ok({
      user: toPublicUser(context.user),
      sessionId: context.sessionId,
      deviceId: context.deviceId,
      profile: { financialMonthStartDay: profile?.financialMonthStartDay ?? 1 },
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

auth.post("/auth/change-password", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    authRateLimit(`change-password:${context.user.id}:${ip}`);

    const raw = await parseJson(req);
    const input = validate(changePasswordSchema, raw);

    const user = await prisma.user.findUnique({
      where: { id: context.user.id },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, "Your current password is incorrect.", 401);
    }

    const passwordHash = await hashPassword(input.password);
    await prisma.user.update({ where: { id: context.user.id }, data: { passwordHash } });

    // The device that changed the password stays signed in; every other
    // session is revoked immediately.
    await revokeOtherSessions(context.user.id, context.sessionId);
    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: "User",
      entityId: context.user.id,
      ip,
    });

    return ok({ changed: true });
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

// ---------------------------------------------------------------------
// Google OAuth ("Continue with Google")
//
// The flow is redirect-based and browser-only, so both endpoints answer
// with redirects (JSON errors would be invisible to a top-level
// navigation). The in-flight state + PKCE verifier live in a signed,
// HttpOnly, 10-minute cookie scoped to /api/auth/google.
// ---------------------------------------------------------------------

const GOOGLE_REDIRECT_PATH = "/api/auth/google/callback";

/** Maps a refusal reason to the error code the web UI renders. */
const GOOGLE_REFUSAL_CODES: Record<GoogleRefusalReason, string> = {
  NO_EMAIL: "google_email",
  EMAIL_NOT_VERIFIED: "google_email_unverified",
  ACCOUNT_DELETED: "google_account_disabled",
  ACCOUNT_DISABLED: "google_account_disabled",
  EMAIL_TAKEN_UNVERIFIED: "google_email_taken",
  ALREADY_LINKED: "google_already_linked",
  NOT_SIGNED_IN: "google_state",
  PRIVATE_MODE: "invite_required",
};

function redirect(path: string): Response {
  const res = new Response(null, { status: 302 });
  res.headers.set("Location", path);
  return res;
}

auth.get("/auth/google/start", async (c) => {
  const req = c.req.raw;
  try {
    const url = new URL(req.url);
    const linkMode = url.searchParams.get("link") === "1";
    const backTo = linkMode ? `${env.appBaseUrl}/dashboard/settings` : `${env.appBaseUrl}/login`;

    if (!env.google.configured) {
      return redirect(`${backTo}?error=google_not_configured`);
    }

    // Linking requires a signed-in user; the user id is bound into the signed
    // transaction cookie so the callback links to whoever initiated the flow.
    let sessionUserId: string | undefined;
    if (linkMode) {
      const context = await getAuthContext(req);
      if (!context) return redirect(`${env.appBaseUrl}/login`);
      sessionUserId = context.user.id;
    }

    const state = generateState();
    const pkce = generatePkce();
    const txToken = await signOAuthTx({
      mode: linkMode ? "LINK" : "LOGIN",
      state,
      codeVerifier: pkce.verifier,
      ...(sessionUserId ? { userId: sessionUserId } : {}),
    });

    const authUrl = buildGoogleAuthUrl({
      clientId: env.google.clientId,
      redirectUri: `${env.appBaseUrl}${GOOGLE_REDIRECT_PATH}`,
      state,
      codeChallenge: pkce.challenge,
    });

    const res = redirect(authUrl);
    return setOAuthTxCookie(res, txToken);
  } catch (err) {
    return fail(err, newRequestId());
  }
});

auth.get("/auth/google/callback", async (c) => {
  const req = c.req.raw;
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    authRateLimit(`google:${ip}`);

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    const tx = await verifyOAuthTx(readOAuthTxCookie(req));
    const linkMode = tx?.mode === "LINK";
    const backTo = linkMode ? `${env.appBaseUrl}/dashboard/settings` : `${env.appBaseUrl}/login`;
    const redirectTo = (path: string) => clearOAuthTxCookie(redirect(path));

    if (googleError) return redirectTo(`${backTo}?error=google_cancelled`);
    // The transaction is validated before anything else so a forged or
    // replayed callback is refused identically whether Google is configured.
    if (!code || !state || !tx || tx.state !== state) return redirectTo(`${backTo}?error=google_state`);
    if (!env.google.configured) return redirectTo(`${backTo}?error=google_not_configured`);

    const { idToken } = await exchangeGoogleCode({
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
      code,
      codeVerifier: tx.codeVerifier,
      redirectUri: `${env.appBaseUrl}${GOOGLE_REDIRECT_PATH}`,
    });
    const claims = await verifyGoogleIdToken(idToken, env.google.clientId);
    const email = claims.email ? normalizeEmailForMatch(claims.email) : null;

    const toExisting = (u: {
      id: string;
      status: string;
      deletedAt: Date | null;
      emailVerifiedAt: Date | null;
    }): ExistingUserInput => ({
      id: u.id,
      status: u.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      deletedAt: u.deletedAt,
      emailVerified: u.emailVerifiedAt !== null,
    });

    const identityRow = await prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: "google", providerSubject: claims.subject } },
      include: { user: { select: { id: true, status: true, deletedAt: true, emailVerifiedAt: true } } },
    });
    const identityOwner = identityRow ? toExisting(identityRow.user) : null;

    let userByEmail: ExistingUserInput | null = null;
    if (!linkMode && email && !identityOwner) {
      const row = await prisma.user.findUnique({
        where: { email },
        select: { id: true, status: true, deletedAt: true, emailVerifiedAt: true },
      });
      userByEmail = row ? toExisting(row) : null;
    }

    // LINK flows bind the initiating user at start; confirm the account is
    // still usable so identities are never attached to dead accounts.
    let sessionUserId: string | null = null;
    if (linkMode) {
      if (!tx.userId) return redirectTo(`${backTo}?error=google_state`);
      const row = await prisma.user.findUnique({
        where: { id: tx.userId },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!row || row.deletedAt !== null || row.status !== "ACTIVE") {
        return redirectTo(`${env.appBaseUrl}/login`);
      }
      sessionUserId = row.id;
    }

    const decision = decideGoogleAction({
      mode: linkMode ? "LINK" : "LOGIN",
      profile: { subject: claims.subject, email, emailVerified: claims.emailVerified },
      identityOwner,
      userByEmail,
      sessionUserId,
      privateMode: env.privateMode,
    });

    const ua = req.headers.get("user-agent") ?? undefined;

    if (decision.action === "REFUSE") {
      return redirectTo(`${backTo}?error=${GOOGLE_REFUSAL_CODES[decision.reason]}`);
    }

    if (decision.action === "LINK") {
      const created = await prisma.userIdentity.create({
        data: {
          userId: decision.userId,
          provider: "google",
          providerSubject: claims.subject,
          emailAtLink: email ?? "",
        },
      });
      await writeAudit({
        userId: decision.userId,
        action: AUDIT_ACTIONS.GOOGLE_LINK,
        entityType: "UserIdentity",
        entityId: created.id,
        ip,
        userAgent: ua,
      });
      return redirectTo(`${env.appBaseUrl}/dashboard/settings?linked=google`);
    }

    if (decision.action === "CREATE") {
      // Google-only account: the password hash is bcrypt of a random 48-byte
      // token, so password login is impossible until the user sets a real
      // password through the (email-verified) forgot-password flow.
      const passwordHash = await hashPassword(randomToken(48));
      const name = claims.name?.trim() || (email ? email.split("@")[0]! : "New user");
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: email!, name, passwordHash, emailVerifiedAt: new Date() },
        });
        await tx.userProfile.create({ data: { userId: created.id, financialMonthStartDay: 1 } });
        await tx.userIdentity.create({
          data: {
            userId: created.id,
            provider: "google",
            providerSubject: claims.subject,
            emailAtLink: email!,
          },
        });
        return created;
      });

      const device = await upsertDevice(user.id, {}, ip, ua);
      const session = await createSession(user.id, device.id, true);
      const accessToken = await signAccessToken({ sub: user.id, sid: session.sessionId, did: device.id });
      await writeAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.GOOGLE_SIGNUP,
        entityType: "User",
        entityId: user.id,
        ip,
        userAgent: ua,
      });

      const res = redirect(`${env.appBaseUrl}/dashboard`);
      setAuthCookies(res, accessToken, session.refreshToken, true);
      return clearOAuthTxCookie(res);
    }

    // LOGIN (with or without auto-link)
    if (decision.autoLink) {
      const created = await prisma.userIdentity
        .create({
          data: {
            userId: decision.userId,
            provider: "google",
            providerSubject: claims.subject,
            emailAtLink: email ?? "",
          },
        })
        .catch(() => null); // unique race: linked concurrently — treat as linked
      if (created) {
        await writeAudit({
          userId: decision.userId,
          action: AUDIT_ACTIONS.GOOGLE_LINK,
          entityType: "UserIdentity",
          entityId: created.id,
          ip,
          userAgent: ua,
        });
      }
    }

    const device = await upsertDevice(decision.userId, {}, ip, ua);
    const session = await createSession(decision.userId, device.id, true);
    const accessToken = await signAccessToken({ sub: decision.userId, sid: session.sessionId, did: device.id });
    await writeAudit({
      userId: decision.userId,
      action: AUDIT_ACTIONS.GOOGLE_LOGIN,
      entityType: "Device",
      entityId: device.id,
      ip,
      userAgent: ua,
    });

    const res = redirect(`${env.appBaseUrl}/dashboard`);
    setAuthCookies(res, accessToken, session.refreshToken, true);
    return clearOAuthTxCookie(res);
  } catch (err) {
    return fail(err, requestId);
  }
});

/** Lists the social identities connected to the signed-in account. */
auth.get("/auth/identities", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const rows = await prisma.userIdentity.findMany({
      where: { userId: context.user.id },
      orderBy: { createdAt: "asc" },
    });
    return ok({
      identities: rows.map((row) => ({
        provider: row.provider,
        emailAtLink: row.emailAtLink,
        linkedAt: row.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

const unlinkIdentitySchema = z.object({ password: z.string().min(1) });

/**
 * Disconnects a social identity. Re-authentication with the account password
 * is required, so Google-only accounts (whose stored hash is unguessable)
 * must first set a password through the forgot-password flow.
 */
auth.delete("/auth/identities/:provider", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    authRateLimit(`unlink:${context.user.id}:${ip}`);

    const raw = await parseJson(req);
    const input = validate(unlinkIdentitySchema, raw);

    const identity = await prisma.userIdentity.findFirst({
      where: { userId: context.user.id, provider: c.req.param("provider") },
    });
    if (!identity) {
      throw new AppError(ErrorCodes.NOT_FOUND, "This account is not connected.", 404);
    }

    const user = await prisma.user.findUnique({
      where: { id: context.user.id },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, "Incorrect password.", 401);
    }

    await prisma.userIdentity.delete({ where: { id: identity.id } });
    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.GOOGLE_UNLINK,
      entityType: "UserIdentity",
      entityId: identity.id,
      ip,
    });

    return ok({ unlinked: true, provider: identity.provider });
  } catch (err) {
    return fail(err, requestId);
  }
});

export const authRoutes = auth;

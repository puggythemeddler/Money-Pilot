import { NextRequest } from "next/server";
import { AppError, ErrorCodes, refreshSchema } from "@moneypilot/shared";
import { prisma } from "@/lib/db";
import { findSessionByToken, rotateSession } from "@/lib/sessions";
import { signAccessToken } from "@/lib/jwt";
import { fail, newRequestId, parseJson, validate } from "@/lib/api";
import { authJsonResponse, clearAuthCookies } from "@/lib/cookies";
import { readRefreshCookie, type AuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  let shouldClearCookies = false;
  try {
    const raw = await parseJson(req);
    const input = validate(refreshSchema, raw);
    const cookieToken = await readRefreshCookie();
    const refreshToken = input.refreshToken || cookieToken;
    if (!refreshToken) {
      throw new AppError(ErrorCodes.AUTHENTICATION, "No refresh token provided.", 401);
    }

    const session = await findSessionByToken(refreshToken);
    if (!session) {
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

    const me: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
      preferredCurrency: user.preferredCurrency,
      timezone: user.timezone,
    };
    return authJsonResponse(me, accessToken, next.refreshToken, session.remember);
  } catch (err) {
    if (shouldClearCookies) {
      return clearAuthCookies(fail(err, requestId));
    }
    return fail(err, requestId);
  }
}
import { NextRequest, NextResponse } from "next/server";
import { COOKIES } from "./constants";
import { env } from "./env";
import { accessTokenTtlSeconds } from "./jwt";
import { toPublicUser, type AuthUser } from "./auth";

/**
 * Auth transport contract:
 * - Cookie-mode (browsers, default): tokens are only ever sent as httpOnly
 *   `__Host-` cookies and are NEVER included in the JSON body. A request that
 *   sets the `X-Use-Token-Auth: true` header opts into token-mode instead.
 * - Token-mode (native/mobile clients): no cookies are set; the raw access
 *   and refresh tokens are returned in the JSON body and the caller is
 *   responsible for storing them securely (e.g. Keychain/Keystore).
 */
export function isTokenMode(req: NextRequest): boolean {
  return req.headers.get("x-use-token-auth")?.toLowerCase() === "true";
}

/** Sets httpOnly auth cookies on a response (cookie-mode only). */
export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
  remember: boolean,
): NextResponse {
  const secure = env.isProd;
  const refreshMaxAge = remember ? env.refreshTtlDays * 86_400 : 12 * 3_600;
  const base = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  res.cookies.set(COOKIES.access, accessToken, { ...base, maxAge: accessTokenTtlSeconds });
  res.cookies.set(COOKIES.refresh, refreshToken, { ...base, maxAge: refreshMaxAge });
  return res;
}

/** Clears httpOnly auth cookies on a response. */
export function clearAuthCookies(res: NextResponse): NextResponse {
  const secure = env.isProd;
  const maxAge = 0;
  const base = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge };
  res.cookies.set(COOKIES.access, "", base);
  res.cookies.set(COOKIES.refresh, "", base);
  return res;
}

interface AuthJsonOptions {
  /** Token-mode: include raw tokens in the body and skip cookies. */
  tokenMode?: boolean;
}

/**
 * Builds the JSON body plus auth cookies shared by login/register/refresh.
 * The token-mode body contains the raw access and refresh tokens; the
 * cookie-mode body deliberately omits them.
 */
export function authJsonResponse(
  user: AuthUser,
  accessToken: string,
  refreshToken: string,
  remember: boolean,
  options: AuthJsonOptions = {},
): NextResponse {
  const { tokenMode } = options;
  const data: Record<string, unknown> = {
    user: toPublicUser(user),
    expiresIn: accessTokenTtlSeconds,
  };
  if (tokenMode) {
    data.accessToken = accessToken;
    data.refreshToken = refreshToken;
  }
  const res = NextResponse.json({ data });
  if (!tokenMode) {
    setAuthCookies(res, accessToken, refreshToken, remember);
  }
  return res;
}
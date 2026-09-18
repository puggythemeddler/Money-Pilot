import { NextResponse } from "next/server";
import { COOKIES } from "./constants";
import { env } from "./env";
import { accessTokenTtlSeconds } from "./jwt";
import { toPublicUser, type AuthUser } from "./auth";

/** Sets httpOnly auth cookies on the response. Returns the response for chaining. */
export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
  remember: boolean,
): NextResponse {
  const secure = env.isProd;
  const refreshMaxAge = remember ? env.refreshTtlDays * 86_400 : 12 * 3_600;
  res.cookies.set(COOKIES.access, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: accessTokenTtlSeconds,
  });
  res.cookies.set(COOKIES.refresh, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: refreshMaxAge,
  });
  return res;
}

/** Clears httpOnly auth cookies on the response. Returns the response for chaining. */
export function clearAuthCookies(res: NextResponse): NextResponse {
  const secure = env.isProd;
  res.cookies.set(COOKIES.access, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(COOKIES.refresh, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

/** Builds the JSON body plus auth cookies shared by login/register/refresh. */
export function authJsonResponse(
  user: AuthUser,
  accessToken: string,
  refreshToken: string,
  remember: boolean,
): NextResponse {
  const res = NextResponse.json({
    data: {
      user: toPublicUser(user),
      accessToken,
      refreshToken,
      expiresIn: accessTokenTtlSeconds,
    },
  });
  setAuthCookies(res, accessToken, refreshToken, remember);
  return res;
}
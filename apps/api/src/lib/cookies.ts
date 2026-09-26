import { type AuthUser } from "@moneypilot/shared";
import { COOKIES } from "./constants";
import { env } from "./env";
import { accessTokenTtlSeconds } from "./jwt";
import { toPublicUser } from "./auth";

/**
 * Auth transport contract:
 * - Cookie-mode (browsers, default): tokens are only ever sent as httpOnly
 *   `__Host-` cookies and are NEVER included in the JSON body. A request that
 *   sets the `X-Use-Token-Auth: true` header opts into token-mode instead.
 * - Token-mode (native/mobile clients): no cookies are set; the raw access
 *   and refresh tokens are returned in the JSON body and the caller is
 *   responsible for storing them securely (e.g. Keychain/Keystore).
 *
 * Browser requests reach this API through the web app's same-origin /api/*
 * proxy, so the Set-Cookie headers below land on the web origin the browser
 * is talking to.
 */
export function isTokenMode(req: Request): boolean {
  return req.headers.get("x-use-token-auth")?.toLowerCase() === "true";
}

interface CookieOptions {
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
}

/** Serializes one Set-Cookie header value. */
function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  let cookie = `${name}=${value}`;
  cookie += `; Path=${opts.path}`;
  cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.httpOnly) cookie += "; HttpOnly";
  if (opts.secure) cookie += "; Secure";
  cookie += `; SameSite=${opts.sameSite.replace(/^./, (c) => c.toUpperCase())}`;
  return cookie;
}

/** Appends httpOnly auth cookies to a response (cookie-mode only). */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  remember: boolean,
): Response {
  const secure = env.isProd;
  const refreshMaxAge = remember ? env.refreshTtlDays * 86_400 : 12 * 3_600;
  const base = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  res.headers.append("Set-Cookie", serializeCookie(COOKIES.access, accessToken, { ...base, maxAge: accessTokenTtlSeconds }));
  res.headers.append("Set-Cookie", serializeCookie(COOKIES.refresh, refreshToken, { ...base, maxAge: refreshMaxAge }));
  return res;
}

/** Appends expiring auth cookies to a response. */
export function clearAuthCookies(res: Response): Response {
  const secure = env.isProd;
  const base = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 0 };
  res.headers.append("Set-Cookie", serializeCookie(COOKIES.access, "", base));
  res.headers.append("Set-Cookie", serializeCookie(COOKIES.refresh, "", base));
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
): Response {
  const { tokenMode } = options;
  const data: Record<string, unknown> = {
    user: toPublicUser(user),
    expiresIn: accessTokenTtlSeconds,
  };
  if (tokenMode) {
    data.accessToken = accessToken;
    data.refreshToken = refreshToken;
  }
  const res = Response.json({ data });
  if (!tokenMode) {
    setAuthCookies(res, accessToken, refreshToken, remember);
  }
  return res;
}

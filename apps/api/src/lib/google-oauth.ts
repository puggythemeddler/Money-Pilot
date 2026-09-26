import { createHash } from "crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { AppError, ErrorCodes } from "@moneypilot/shared";
import { getJwtSecret } from "./env";
import { randomToken } from "./tokens";
import type { GoogleLinkMode } from "./google-linking";

/**
 * Google OAuth 2.0 helpers: authorization URL with PKCE (S256), the
 * authorization-code exchange, and ID-token verification against Google's
 * published JWKS. The state + PKCE verifier of an in-flight flow are stored
 * in a short-lived HttpOnly cookie (signed with the API's HMAC secret), never
 * in query strings.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const GOOGLE_OAUTH_TX_COOKIE = "mp_oauth_tx";
const TX_TTL_S = 10 * 60;
const TX_ISSUER = "moneypilot-oauth";

// Google's JWKS are cached by jose and refreshed on key rotation.
const JWKS = createRemoteJWKSet(JWKS_URL);

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function generatePkce(): PkcePair {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateState(): string {
  return randomToken(32);
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  loginHint?: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Always show the account chooser: prevents silent re-login into whatever
  // Google account the browser last used.
  url.searchParams.set("prompt", "select_account");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

export interface GoogleCodeExchangeResult {
  idToken: string;
}

export async function exchangeGoogleCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleCodeExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new AppError(ErrorCodes.INTERNAL, "Could not reach Google. Please try again.", 502);
  }
  if (!res.ok) {
    throw new AppError(ErrorCodes.INTERNAL, "Google rejected the sign-in request. Please try again.", 502);
  }
  const json = (await res.json()) as { id_token?: unknown };
  if (typeof json.id_token !== "string" || !json.id_token) {
    throw new AppError(ErrorCodes.INTERNAL, "Google did not return an ID token. Please try again.", 502);
  }
  return { idToken: json.id_token };
}

export interface GoogleIdClaims {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleIdClaims> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, JWKS, { issuer: ISSUERS, audience: clientId }));
  } catch {
    throw new AppError(ErrorCodes.INTERNAL, "Google sign-in could not be verified. Please try again.", 502);
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new AppError(ErrorCodes.INTERNAL, "Google sign-in could not be verified. Please try again.", 502);
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" && payload.email ? payload.email : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" && payload.name ? payload.name : null,
  };
}

export interface OAuthTxPayload {
  mode: GoogleLinkMode;
  state: string;
  codeVerifier: string;
  /** Session user who initiated a LINK flow (bound at start, not at callback). */
  userId?: string;
}

async function txKey(): Promise<Uint8Array> {
  return new TextEncoder().encode(`${getJwtSecret()}:oauth-tx`);
}

export async function signOAuthTx(payload: OAuthTxPayload): Promise<string> {
  return new SignJWT({
    mode: payload.mode,
    st: payload.state,
    cv: payload.codeVerifier,
    ...(payload.userId ? { uid: payload.userId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(TX_ISSUER)
    .setAudience(TX_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TX_TTL_S}s`)
    .sign(await txKey());
}

export async function verifyOAuthTx(token: string | undefined): Promise<OAuthTxPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await txKey(), { issuer: TX_ISSUER, audience: TX_ISSUER });
    if (typeof payload.st !== "string" || typeof payload.cv !== "string" || typeof payload.mode !== "string") {
      return null;
    }
    if (payload.mode !== "LOGIN" && payload.mode !== "LINK") return null;
    if (payload.uid !== undefined && typeof payload.uid !== "string") return null;
    return {
      mode: payload.mode,
      state: payload.st,
      codeVerifier: payload.cv,
      ...(typeof payload.uid === "string" ? { userId: payload.uid } : {}),
    };
  } catch {
    return null;
  }
}

/** Reads the in-flight OAuth transaction cookie. */
export function readOAuthTxCookie(req: Request): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === GOOGLE_OAUTH_TX_COOKIE) return rest.join("=");
  }
  return undefined;
}

/** Appends the HttpOnly OAuth transaction cookie to a response (10 minutes). */
export function setOAuthTxCookie(res: Response, txToken: string): Response {
  res.headers.append(
    "Set-Cookie",
    `${GOOGLE_OAUTH_TX_COOKIE}=${txToken}; Path=/api/auth/google; Max-Age=${TX_TTL_S}; HttpOnly; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return res;
}

/** Clears the OAuth transaction cookie (always, once used or refused). */
export function clearOAuthTxCookie(res: Response): Response {
  res.headers.append(
    "Set-Cookie",
    `${GOOGLE_OAUTH_TX_COOKIE}=; Path=/api/auth/google; Max-Age=0; HttpOnly; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return res;
}

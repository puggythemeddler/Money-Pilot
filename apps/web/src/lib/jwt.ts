import { SignJWT, jwtVerify } from "jose";
import { ACCESS_TOKEN_TTL_JOSE, ACCESS_TOKEN_TTL_S } from "./constants";
import { getJwtSecret } from "./env";

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id (allows targeted logout). */
  sid: string;
  /** Device id. */
  did: string;
}

const ISSUER = "moneypilot";
const AUDIENCE = "moneypilot";

function key(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid, did: claims.did })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL_JOSE)
    .sign(key());
}

/** Returns claims for a valid, unexpired access token, or null. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.did !== "string") {
      return null;
    }
    return { sub: payload.sub, sid: payload.sid, did: payload.did };
  } catch {
    return null;
  }
}

export const accessTokenTtlSeconds = ACCESS_TOKEN_TTL_S;
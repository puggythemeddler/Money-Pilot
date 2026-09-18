import { createHash, randomBytes } from "crypto";

/** Cryptographically random opaque token, URL-safe base64 by default. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Deterministic SHA-256 digest of a token. Only digests are persisted so a
 * database leak does not expose usable refresh/verification tokens.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
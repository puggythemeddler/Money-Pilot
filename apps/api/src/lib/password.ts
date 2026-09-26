import bcrypt from "bcryptjs";

/**
 * Password hashing with bcrypt.
 * Round count of 12 balances cost against the pure-JS implementation; a
 * production deployment may raise this to 13–14 when using a native bcrypt.
 * Plain-text passwords are never stored and never logged.
 */
export const PASSWORD_HASH_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
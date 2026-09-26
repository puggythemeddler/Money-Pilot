/**
 * Cross-cutting value types shared by the API and the web client.
 * Deliberately framework-free and free of any auth internals.
 */

/** Authenticated user as resolved by the API from a session or bearer token. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: "USER" | "ADMIN";
  preferredCurrency: string;
  timezone: string;
}

/**
 * User shape returned to clients. Structurally identical to AuthUser: the
 * distinction documents intent (safe to serialize) without keeping two
 * divergent copies of the same fields.
 */
export type PublicUser = AuthUser;

import { env } from "./env";
import { emailDeliveryAvailable } from "./mail";

/**
 * Public, non-sensitive deployment capabilities the web (and future native)
 * clients read to avoid promising features this server cannot deliver yet.
 * Deliberately minimal: no secrets, no counts, no environment names.
 */
export interface AuthCapabilities {
  /** Google OAuth is fully configured (both client id and secret present). */
  googleSignIn: boolean;
  /** Transactional email (verification, password reset) reaches an inbox. */
  emailDelivery: boolean;
}

/** Resolves the current deployment's auth capabilities. */
export function authCapabilities(): AuthCapabilities {
  return {
    googleSignIn: env.google.configured,
    emailDelivery: emailDeliveryAvailable,
  };
}

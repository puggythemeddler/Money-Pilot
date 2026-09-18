import { env } from "./env";

/** Names of the auth cookies set on the web origin. */
export const COOKIES = {
  access: "mp_access",
  refresh: "mp_refresh",
} as const;

/** Access-token lifetime. Access tokens are short-lived; they are refreshed
 *  through the opaque rotating refresh token. */
export const ACCESS_TOKEN_TTL_S = 15 * 60; // 15 minutes
export const ACCESS_TOKEN_TTL_JOSE = "15m";

/** Session lifetime when "remember me" is not selected. */
export const SESSION_DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Session lifetime when "remember me" is selected. */
export const SESSION_REMEMBER_TTL_MS = env.refreshTtlDays * 24 * 60 * 60 * 1000;

export const TOKEN_KINDS = {
  EMAIL_VERIFY: "EMAIL_VERIFY",
  PASSWORD_RESET: "PASSWORD_RESET",
} as const;

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export const AUDIT_ACTIONS = {
  REGISTER: "AUTH_REGISTER",
  LOGIN: "AUTH_LOGIN",
  LOGOUT: "AUTH_LOGOUT",
  LOGOUT_ALL: "AUTH_LOGOUT_ALL",
  REFRESH: "AUTH_REFRESH",
  SESSION_REVOKED: "AUTH_SESSION_REVOKED",
  DEVICE_REVOKED: "AUTH_DEVICE_REVOKED",
  EMAIL_VERIFIED: "AUTH_EMAIL_VERIFIED",
  RESEND_VERIFICATION: "AUTH_RESEND_VERIFICATION",
  PASSWORD_RESET: "AUTH_PASSWORD_RESET",
  INVITE_CREATED: "ADMIN_INVITE_CREATED",
  INVITE_REVOKED: "ADMIN_INVITE_REVOKED",
  INVITE_USED: "AUTH_INVITE_USED",
  DATA_EXPORTED: "PRIVACY_DATA_EXPORTED",
  ACCOUNT_DELETED: "PRIVACY_ACCOUNT_DELETED",
} as const;

export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export const USER_ROLES = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;

export const INVITE_STATUS = {
  PENDING: "PENDING",
  USED: "USED",
  REVOKED: "REVOKED",
} as const;

/** Lifetime of a registration invitation link. */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
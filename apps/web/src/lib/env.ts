/**
 * Central place for environment-derived configuration.
 * Values are read lazily so tests and local dev with partial `.env` files
 * still boot. Anything marked "required" throws when actually used and
 * missing in a production environment.
 */

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : /^(1|true|yes|on)$/i.test(v);

const int = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

export const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  appBaseUrl: (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  /** Invite-only registration mode: new users can only register with an invite. */
  privateMode: bool(process.env.PRIVATE_MODE, false),
  /** Optional bootstrap admin, created on first boot when the email is not taken. */
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  },
  refreshTtlDays: int(process.env.AUTH_REFRESH_TTL_DAYS, 30),
  rateLimit: {
    authMax: int(process.env.RATE_LIMIT_AUTH_MAX, 20),
    authWindowSeconds: int(process.env.RATE_LIMIT_AUTH_WINDOW_SECONDS, 60),
  },
  mail: {
    host: process.env.SMTP_HOST,
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? "MoneyPilot <no-reply@moneypilot.local>",
    secure: bool(process.env.SMTP_SECURE, false),
  },
};

/**
 * The HMAC secret used to sign access tokens.
 * In development a missing secret falls back to a per-process random value so
 * the app boots with zero configuration. Production refuses to run without it.
 */
export function getJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (!isProd) {
    return `dev-${crypto.randomUUID()}${crypto.randomUUID()}`;
  }
  throw new Error(
    "AUTH_JWT_SECRET is required in production (at least 32 characters). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
  );
}
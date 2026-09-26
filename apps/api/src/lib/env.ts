/**
 * Central place for environment-derived configuration.
 * Values are read lazily so tests and local dev with partial `.env` files
 * still boot. Anything marked "required" throws when actually used and
 * missing in a production environment.
 *
 * APP_BASE_URL here is the public URL of the WEB app (the origin browsers
 * visit), not this API service: it is used to build email links and as the
 * default allowed origin for CSRF checks, since browser requests reach this
 * API through the web app's /api/* proxy and therefore carry the web
 * origin's Host.
 */

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : /^(1|true|yes|on)$/i.test(v);

const int = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

/** Splits a comma/newline separated list into trimmed, non-empty entries. */
function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  /** Public URL of the web app (email links, default CSRF-allowed origin). */
  appBaseUrl: (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  /** Extra origins explicitly allowed for API requests (exact origins). */
  allowedOrigins: splitList(process.env.ALLOWED_ORIGINS).map((o) => o.replace(/\/+$/, "")),
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
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    /** True only when both credentials are present (partial config = off). */
    get configured(): boolean {
      return this.clientId.length > 0 && this.clientSecret.length > 0;
    },
  },
};

/**
 * The HMAC secret used to sign access tokens.
 * In development a missing secret falls back to a per-process random value so
 * the app boots with zero configuration. Production refuses to run without it.
 */
export function getJwtSecret(): string {
  assertProdConfig();
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

/**
 * Fails fast on misconfigured production deployments. The web app's public URL
 * must be HTTPS so the `__Host-` auth cookies (set through the proxy on the
 * web origin) are accepted by browsers; loopback development/staging instances
 * may use plain http because browsers treat localhost as a secure context.
 */
export function assertProdConfig(): void {
  if (!isProd) return;
  const base = process.env.APP_BASE_URL?.trim() ?? "";
  if (!base) {
    throw new Error("APP_BASE_URL is required in production (the public URL of the web app).");
  }
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`APP_BASE_URL must be a valid URL (got: "${base}").`);
  }
  if (parsed.protocol === "https:") return;
  const loopback =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]" || parsed.hostname === "::1";
  if (parsed.protocol === "http:" && loopback) return;
  throw new Error(
    `APP_BASE_URL must be an https:// URL in production so __Host- cookies are accepted by browsers (got: "${base}").`,
  );
}

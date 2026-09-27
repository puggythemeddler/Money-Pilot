// Render pre-deploy check: fails the deployment with a clear message when
// required production environment variables are missing or malformed.
// Deliberately not run inside the app: local smoke tests run with
// NODE_ENV=production and a SQLite URL, so the guard lives at deployment
// time instead. APP_BASE_URL is the public https:// URL of the WEB app (the
// origin browsers visit and where auth cookies land), not this API service.
const problems = [];

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  problems.push(
    `DATABASE_URL must be a PostgreSQL (Neon) connection string (got: "${databaseUrl.slice(0, 24)}…").`,
  );
}

// Neon split: DATABASE_URL = pooled endpoint for the long-running api process;
// DIRECT_DATABASE_URL = direct (non-pooled) endpoint for prisma migrate, which
// needs real sessions/advisory locks that Neon's transaction-mode pooler
// breaks (fails with "string contains embedded null" / P3018 mid-migration).
const directUrl = process.env.DIRECT_DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//.test(directUrl)) {
  problems.push(
    `DIRECT_DATABASE_URL must be the direct (non-pooled) PostgreSQL connection string (got: "${directUrl.slice(0, 24)}…").`,
  );
}

const jwtSecret = process.env.AUTH_JWT_SECRET ?? "";
if (jwtSecret.length < 32) {
  problems.push(
    "AUTH_JWT_SECRET is required and must be at least 32 characters. Generate one with: " +
      'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
  );
}

const appBaseUrl = (process.env.APP_BASE_URL ?? "").trim();
if (!appBaseUrl) {
  problems.push("APP_BASE_URL is required (the public https:// URL of the web app).");
} else {
  try {
    if (new URL(appBaseUrl).protocol !== "https:") {
      problems.push(`APP_BASE_URL must be https:// in production (got: "${appBaseUrl}").`);
    }
  } catch {
    problems.push(`APP_BASE_URL must be a valid URL (got: "${appBaseUrl}").`);
  }
}

if (problems.length > 0) {
  console.error("Production environment check failed:\n  - " + problems.join("\n  - "));
  process.exit(1);
}

console.log(
  "Production environment check passed (DATABASE_URL, DIRECT_DATABASE_URL, AUTH_JWT_SECRET, APP_BASE_URL).",
);

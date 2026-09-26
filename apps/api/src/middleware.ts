import type { Context, Next } from "hono";
import { env } from "./lib/env";

/**
 * Security middleware: CSRF protection for the API plus hardening headers.
 *
 * The app is same-origin by design — the browser UI talks to /api on its own
 * origin through the web app's /api/* proxy, and native/mobile clients opt
 * into token-mode auth (no cookies), so no CORS headers are ever emitted. A
 * request whose Origin does not match the request's own authority (or the
 * explicitly allowed origins) and that uses a state-changing method is
 * assumed to be a forged cross-site form/fetch and rejected with 403.
 *
 * The comparison uses the Host / X-Forwarded-Host headers rather than the
 * local server URL: browsers set Origin to the initiating site while routing
 * forces Host to the addressed site, so the two can only match for genuinely
 * same-origin requests. Because browser requests are proxied from the web
 * origin, the web app's public URL (APP_BASE_URL) and any extra origins
 * (ALLOWED_ORIGINS) are allowed explicitly.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // Non-browser and same-origin navigations send no Origin.
  let originHost: string | null;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // Malformed Origin is never legitimate.
  }
  if (!originHost) return false;
  const normalized = originHost.toLowerCase();

  // Exact matches against the explicitly allowed origin list.
  for (const allowed of env.allowedOrigins) {
    if (allowed.toLowerCase() === origin.replace(/\/+$/, "").toLowerCase()) return true;
  }

  const candidates = new Set<string>();
  for (const header of [req.headers.get("host"), req.headers.get("x-forwarded-host")]) {
    if (header) {
      // A proxy may forward a list; the first entry is the original host.
      const first = header.split(",")[0]?.trim().toLowerCase();
      if (first) candidates.add(first);
    }
  }
  try {
    candidates.add(new URL(env.appBaseUrl).host.toLowerCase());
  } catch {
    /* an invalid APP_BASE_URL fails elsewhere, with a clear message */
  }
  return candidates.has(normalized);
}

export async function csrfMiddleware(c: Context, next: Next) {
  const req = c.req.raw;
  if (UNSAFE_METHODS.has(req.method) && !isAllowedOrigin(req)) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Cross-origin requests are not allowed." } },
      403,
      { "Content-Type": "application/json" },
    );
  }
  await next();
}

export async function securityHeaders(c: Context, next: Next) {
  await next();
  const res = c.res;
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // TLS usually terminates at the proxy, so trust x-forwarded-proto too.
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  if (process.env.NODE_ENV === "production" || forwardedProto === "https") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}

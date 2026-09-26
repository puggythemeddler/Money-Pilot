import { NextResponse, type NextRequest } from "next/server";

/**
 * Security middleware: CSRF protection for the API plus hardening headers.
 *
 * This app is same-origin by design — the browser UI talks to /api on its own
 * origin and native/mobile clients opt into token-mode auth (no cookies), so
 * no CORS headers are ever emitted. A request whose Origin does not match the
 * request's own authority and that uses a state-changing method is assumed to
 * be a forged cross-site form/fetch and rejected with 403.
 *
 * The comparison uses the Host / X-Forwarded-Host headers rather than
 * `req.nextUrl.origin`: since Next.js 15.5 the middleware URL no longer
 * reflects request headers under `next start` (it stays pinned to
 * `http://localhost:<port>`), which would reject every same-origin browser
 * request behind a proxy. Browsers set Origin to the initiating site while
 * routing forces Host to the addressed site, so the two can only match for
 * genuinely same-origin requests.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // Non-browser and same-origin navigations send no Origin.
  let originHost: string | null;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // Malformed Origin is never legitimate.
  }
  if (!originHost) return false;

  const candidates = new Set<string>();
  for (const header of [req.headers.get("host"), req.headers.get("x-forwarded-host")]) {
    if (header) {
      // A proxy may forward a list; the first entry is the original host.
      const first = header.split(",")[0]?.trim().toLowerCase();
      if (first) candidates.add(first);
    }
  }
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (base) {
    try {
      candidates.add(new URL(base).host.toLowerCase());
    } catch {
      /* an invalid APP_BASE_URL fails elsewhere, with a clear message */
    }
  }
  return candidates.has(originHost.toLowerCase());
}

export function middleware(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  if (isApi && UNSAFE_METHODS.has(req.method) && !isAllowedOrigin(req)) {
    return new NextResponse(JSON.stringify({ error: { code: "FORBIDDEN", message: "Cross-origin requests are not allowed." } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // TLS usually terminates at the proxy, so trust x-forwarded-proto too
  // (the middleware URL itself stays pinned to http://localhost).
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (process.env.NODE_ENV === "production" || req.nextUrl.protocol === "https:" || forwardedProto === "https") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
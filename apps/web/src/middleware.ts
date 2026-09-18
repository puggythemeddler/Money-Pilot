import { NextResponse, type NextRequest } from "next/server";

/**
 * Security middleware: CSRF protection for the API plus hardening headers.
 *
 * This app is same-origin by design — the browser UI talks to /api on its own
 * origin and native/mobile clients opt into token-mode auth (no cookies), so
 * no CORS headers are ever emitted. A request whose Origin does not match the
 * request URL origin and that uses a state-changing method is assumed to be a
 * forged cross-site form/fetch and rejected with 403.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

export function middleware(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  if (isApi && UNSAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      const requestOrigin = req.nextUrl.origin;
      if (origin !== requestOrigin) {
        return new NextResponse(JSON.stringify({ error: { code: "FORBIDDEN", message: "Cross-origin requests are not allowed." } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production" || req.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
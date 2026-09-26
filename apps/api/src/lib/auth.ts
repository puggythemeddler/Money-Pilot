import { AppError, ErrorCodes, type AuthUser } from "@moneypilot/shared";
import { COOKIES } from "./constants";
import { prisma } from "./db";
import { verifyAccessToken } from "./jwt";

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  deviceId: string;
}

/** Reads a named cookie from the request's Cookie header. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      const value = part.slice(idx + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function readAccessToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return readCookie(req, COOKIES.access);
}

/**
 * Resolves the authenticated user from a bearer token or the access-token
 * cookie. Returns null when unauthenticated. Every authenticated request
 * cross-checks the session and device rows so session/device revocation
 * (logout, logout-all, device revocation, account disable/delete) takes effect
 * immediately, not only when the access token expires. The access token is a
 * signed *handle* to a server-side session; it is never trusted on its own.
 */
export async function getAuthContext(req: Request): Promise<AuthContext | null> {
  const token = readAccessToken(req);
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    select: {
      id: true,
      userId: true,
      deviceId: true,
      revokedAt: true,
      expiresAt: true,
      device: { select: { revokedAt: true, userId: true } },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerifiedAt: true,
          preferredCurrency: true,
          timezone: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!session) return null;
  const { user, device } = session;
  if (
    session.userId !== claims.sub ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date() ||
    device.revokedAt !== null ||
    device.userId !== claims.sub
  ) {
    return null;
  }
  if (!user || user.deletedAt !== null || user.status !== "ACTIVE") return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
      preferredCurrency: user.preferredCurrency,
      timezone: user.timezone,
    },
    sessionId: session.id,
    deviceId: session.deviceId,
  };
}

/** Convenience that throws a 401 so route handlers can use it directly. */
export async function requireUser(req: Request): Promise<AuthContext> {
  const context = await getAuthContext(req);
  if (!context) {
    throw new AppError(ErrorCodes.AUTHENTICATION, "Please sign in to continue.", 401);
  }
  return context;
}

/** Requires an authenticated user with the ADMIN role, else 403. */
export async function requireAdmin(req: Request): Promise<AuthContext> {
  const context = await requireUser(req);
  if (context.user.role !== "ADMIN") {
    throw new AppError(ErrorCodes.FORBIDDEN, "Administrator access is required.", 403);
  }
  return context;
}

/** Read the refresh token from its cookie (web flow). */
export function readRefreshToken(req: Request): string | null {
  return readCookie(req, COOKIES.refresh);
}

/** Shape returned to clients; deliberately excludes auth internals. */
export function toPublicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    role: user.role,
    preferredCurrency: user.preferredCurrency,
    timezone: user.timezone,
  };
}

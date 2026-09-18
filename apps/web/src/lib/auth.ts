import { cookies } from "next/headers";
import { AppError, ErrorCodes } from "@moneypilot/shared";
import { COOKIES } from "./constants";
import { prisma } from "./db";
import { verifyAccessToken } from "./jwt";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: "USER" | "ADMIN";
  preferredCurrency: string;
  timezone: string;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  deviceId: string;
}

async function readAccessToken(request?: { headers?: Headers }): Promise<string | null> {
  if (request?.headers) {
    const auth = request.headers.get("authorization");
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      if (token) return token;
    }
  }
  const store = await cookies();
  return store.get(COOKIES.access)?.value ?? null;
}

/**
 * Resolves the authenticated user from a bearer token or the access-token
 * cookie. Returns null when unauthenticated. Every authenticated request
 * cross-checks the session and device rows so session/device revocation
 * (logout, logout-all, device revocation, account disable/delete) takes effect
 * immediately, not only when the access token expires. The access token is a
 * signed *handle* to a server-side session; it is never trusted on its own.
 */
export async function getAuthContext(request?: { headers?: Headers }): Promise<AuthContext | null> {
  const token = await readAccessToken(request);
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
export async function requireUser(request?: { headers?: Headers }): Promise<AuthContext> {
  const context = await getAuthContext(request);
  if (!context) {
    throw new AppError(ErrorCodes.AUTHENTICATION, "Please sign in to continue.", 401);
  }
  return context;
}

/** Requires an authenticated user with the ADMIN role, else 403. */
export async function requireAdmin(request?: { headers?: Headers }): Promise<AuthContext> {
  const context = await requireUser(request);
  if (context.user.role !== "ADMIN") {
    throw new AppError(ErrorCodes.FORBIDDEN, "Administrator access is required.", 403);
  }
  return context;
}

/** Read the refresh token from cookie (web flow). */
export async function readRefreshCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIES.refresh)?.value ?? null;
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
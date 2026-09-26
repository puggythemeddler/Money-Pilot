import { cookies } from "next/headers";
import type { AuthUser } from "@moneypilot/shared";

/**
 * Server-side fetch helper for React Server Components.
 *
 * The web app is frontend-only: data comes from the MoneyPilot API. Client
 * components keep using the same-origin `/api/*` proxy through
 * `api-client.ts`; server components call the API directly here, forwarding
 * the incoming request's cookies (the `__Host-` auth cookies) so
 * authenticated reads render on the server.
 */

const API_ORIGIN = (process.env.MONEYPILOT_API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

export class ServerApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message);
    this.name = "ServerApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

/** Fetches an API endpoint with the incoming request's cookies. */
export async function serverFetch<T>(path: string): Promise<T> {
  const store = await cookies();
  const headers: Record<string, string> = {};
  const cookie = store.toString();
  if (cookie) {
    headers.cookie = cookie;
  }

  const res = await fetch(`${API_ORIGIN}${path}`, { cache: "no-store", headers });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body; handled below as a generic failure.
  }

  if (!res.ok) {
    const body = payload as { error?: { code?: string; message?: string; requestId?: string } } | null;
    throw new ServerApiError(
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? `API request failed with status ${res.status}.`,
      res.status,
      body?.error?.requestId,
    );
  }

  return (payload as { data?: T } | null)?.data as T;
}

export interface ServerAuthContext {
  user: AuthUser;
  sessionId: string;
  deviceId: string;
  profile: { financialMonthStartDay: number };
}

/**
 * Resolves the signed-in user (or null when unauthenticated) for server
 * components. Non-401 failures propagate: the page renders an error rather
 * than silently treating a broken API as "signed out".
 */
export async function getServerUser(): Promise<ServerAuthContext | null> {
  try {
    return await serverFetch<ServerAuthContext>("/api/auth/me");
  } catch (err) {
    if (err instanceof ServerApiError && err.status === 401) return null;
    throw err;
  }
}

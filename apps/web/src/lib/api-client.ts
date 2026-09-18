"use client";

/** Client-side fetch wrapper producing consistent JSON + error handling. */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(body: ApiErrorBody, status: number) {
    super(body.error.message);
    this.name = "ApiClientError";
    this.code = body.error.code;
    this.status = status;
    this.details = body.error.details;
    this.requestId = body.error.requestId;
  }
}

/** Reads a JSON API response, throwing ApiClientError for error bodies. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body; handled below as a generic failure.
  }

  if (!res.ok) {
    const body = (payload ?? {}) as Partial<ApiErrorBody>;
    throw new ApiClientError(
      body.error
        ? (payload as ApiErrorBody)
        : { error: { code: "INTERNAL_ERROR", message: `Request failed with status ${res.status}.` } },
      res.status,
    );
  }

  const data = (payload as { data?: T } | null)?.data;
  return data as T;
}
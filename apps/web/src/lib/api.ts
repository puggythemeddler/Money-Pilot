import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ZodError, type ZodType } from "zod";
import { AppError, ErrorCodes, isAppError, type ApiErrorBody } from "@moneypilot/shared";
import { Prisma } from "@prisma/client";

export function newRequestId(): string {
  return randomUUID();
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json({ data }, { ...init, headers });
}

export async function parseJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(ErrorCodes.VALIDATION, "Request body must be valid JSON.", 400);
  }
}

/** Parses raw JSON through a Zod schema, converting failures into AppErrors. */
export function validate<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError(ErrorCodes.VALIDATION, "Invalid input.", 400, {
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return result.data;
}

/**
 * IP used for rate limiting and audit. Only trust forwarded headers when the
 * deployment sits behind a trusted proxy that sets them.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function logError(context: string, err: unknown, requestId?: string): void {
  const id = requestId ?? newRequestId();
  if (err instanceof Error) {
    console.error(`[api:${id}] ${context}: ${err.message}`);
    if (process.env.NODE_ENV === "development") {
      console.error(err);
    }
  } else {
    console.error(`[api:${id}] ${context}:`, err);
  }
}

/** Maps any thrown value to a consistent error response. Never leaks internals. */
export function fail(err: unknown, requestId?: string): NextResponse {
  const id = requestId ?? newRequestId();

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: ErrorCodes.VALIDATION,
          message: "Invalid input.",
          details: { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          requestId: id,
        },
      } satisfies ApiErrorBody,
      { status: 400 },
    );
  }

  if (isAppError(err)) {
    return NextResponse.json(err.toBody(id), { status: err.status });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json(
        {
          error: {
            code: ErrorCodes.CONFLICT,
            message: "A record with that value already exists.",
            requestId: id,
          },
        } satisfies ApiErrorBody,
        { status: 409 },
      );
    }
    logError("db-error", err, id);
    return NextResponse.json(
      { error: { code: ErrorCodes.INTERNAL, message: "Something went wrong. Please try again.", requestId: id } },
      { status: 500 },
    );
  }

  logError("unhandled", err, id);
  return NextResponse.json(
    { error: { code: ErrorCodes.INTERNAL, message: "Something went wrong. Please try again.", requestId: id } },
    { status: 500 },
  );
}
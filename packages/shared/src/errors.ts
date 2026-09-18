/**
 * Application error contract shared between the API and clients.
 * API routes translate AppError instances into a consistent error body.
 */
export const ErrorCodes = {
  VALIDATION: "VALIDATION_ERROR",
  AUTHENTICATION: "AUTHENTICATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL_ERROR",
  EMAIL_IN_USE: "EMAIL_IN_USE",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_TOKEN: "INVALID_TOKEN",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Standard error shape returned by the API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.isOperational = true;
  }

  toBody(requestId?: string): ApiErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details, requestId } };
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;
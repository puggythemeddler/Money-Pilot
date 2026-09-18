import { AppError, ErrorCodes } from "@moneypilot/shared";

/** Parses a date input into a UTC-midnight Date (day-granular money dates). */
export function toUtcMidnight(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  throw new AppError(ErrorCodes.VALIDATION, "Enter a valid date.", 400);
}

/** Formats a Date as an ISO date (YYYY-MM-DD) for display round-trips. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive UTC-midnight range for a single day. */
export function dayRange(date: Date | string): { from: Date; to: Date } {
  const day = toUtcMidnight(date);
  return { from: day, to: new Date(day.getTime() + 86_400_000) };
}
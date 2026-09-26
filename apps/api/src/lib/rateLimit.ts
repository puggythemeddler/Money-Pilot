import { AppError, ErrorCodes } from "@moneypilot/shared";
import { env } from "./env";

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/**
 * In-memory sliding-window rate limiter.
 *
 * NOTE: this is per-instance state (cleared on restart, not shared across
 * instances). It is suitable for development and single-instance hosting; a
 * multi-instance deployment must back this with shared storage (e.g. Redis).
 */
const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const recent = hits.filter((t) => now - t < 60_000);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, recent);
  }
}

export function rateLimit(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  sweep(now);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    throw new AppError(
      ErrorCodes.RATE_LIMITED,
      "Too many requests. Please wait a moment and try again.",
      429,
    );
  }
  hits.push(now);
  buckets.set(key, hits);
}

/** Rate limiter used on authentication endpoints. */
export function authRateLimit(key: string): void {
  rateLimit(key, {
    limit: env.rateLimit.authMax,
    windowMs: env.rateLimit.authWindowSeconds * 1000,
  });
}
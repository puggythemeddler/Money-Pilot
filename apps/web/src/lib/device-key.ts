"use client";

/**
 * Stable, anonymous device identifier stored in localStorage. It lets the
 * same browser reuse one Device record across logins, which keeps the
 * device list tidy and sessions tied to a recognizable device.
 */
const KEY = "mp_device_key";

export function getOrCreateDeviceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
}
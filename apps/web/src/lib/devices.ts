import { prisma } from "./db";
import type { DeviceInfoInput } from "@moneypilot/shared";

export interface DeviceDescriptor {
  clientKey?: string;
  name?: string;
  platform?: "WEB" | "IOS" | "ANDROID";
}

function detectPlatform(userAgent: string | undefined): "WEB" | "IOS" | "ANDROID" | "UNKNOWN" {
  if (!userAgent) return "UNKNOWN";
  if (/android/i.test(userAgent)) return "ANDROID";
  if (/ip(hone|ad|od)/i.test(userAgent)) return "IOS";
  return "WEB";
}

function deviceName(userAgent: string | undefined, provided?: string): string {
  if (provided && provided.trim()) return provided.trim();
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  if (/android/i.test(ua)) {
    const m = ua.match(/Android [\d.]+/);
    return m ? `Android ${m[0].replace("Android ", "")}` : "Android device";
  }
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  const m = ua.match(/Firefox\/([\d.]+)/) ?? ua.match(/Edg\/([\d.]+)/) ?? ua.match(/Chrome\/([\d.]+)/);
  if (m) {
    const key = /Firefox/.test(ua) ? "Firefox" : /Edg/.test(ua) ? "Edge" : "Chrome";
    return `${key} for desktop`;
  }
  const plain = /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${plain} (unknown OS)`;
}

/**
 * Upserts a device for the calling client. Idempotent per (user, clientKey):
 * the same browser or handset re-using its stored clientKey reuses the same
 * device row and only refreshes its metadata.
 */
export async function upsertDevice(userId: string, info: DeviceInfoInput, ip?: string, userAgent?: string) {
  const platform = info.platform ?? detectPlatform(userAgent);
  const name = deviceName(userAgent, info.name);
  const clientKey = info.clientKey && info.clientKey.length >= 8 ? info.clientKey : undefined;

  if (clientKey) {
    const existing = await prisma.device.findUnique({
      where: { userId_clientKey: { userId, clientKey } },
    });
    if (existing) {
      return prisma.device.update({
        where: { id: existing.id },
        data: { name, platform, ip, userAgent, lastSeenAt: new Date() },
      });
    }
  }

  return prisma.device.create({
    data: { userId, clientKey, name, platform, ip, userAgent, lastSeenAt: new Date() },
  });
}

export async function listDevicesForUser(userId: string) {
  return prisma.device.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    include: { _count: { select: { sessions: { where: { revokedAt: null } } } } },
  });
}

export async function getDeviceForUser(userId: string, deviceId: string) {
  return prisma.device.findFirst({ where: { id: deviceId, userId, revokedAt: null } });
}
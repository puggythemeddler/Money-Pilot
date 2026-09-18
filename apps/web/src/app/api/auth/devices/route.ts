import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ErrorCodes } from "@moneypilot/shared";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { getDeviceForUser, listDevicesForUser } from "@/lib/devices";
import { revokeDeviceSessions } from "@/lib/sessions";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { fail, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { clearAuthCookies } from "@/lib/cookies";
import { requireUser } from "@/lib/auth";
import { NextResponse } from "next/server";

const revokeDeviceSchema = z.object({ deviceId: z.string().min(1) });

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const devices = await listDevicesForUser(context.user.id);
    return ok({
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        lastSeenAt: d.lastSeenAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
        activeSessions: d._count.sessions,
        isCurrent: d.id === context.deviceId,
      })),
    });
  } catch (err) {
    return fail(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const raw = await parseJson(req);
    const input = validate(revokeDeviceSchema, raw);

    const device = await getDeviceForUser(context.user.id, input.deviceId);
    if (!device) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Device not found.", 404);
    }

    await revokeDeviceSessions(context.user.id, device.id);
    await prisma.device.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.DEVICE_REVOKED,
      entityType: "Device",
      entityId: device.id,
    });

    const isCurrent = device.id === context.deviceId;
    const res = NextResponse.json({ data: { revoked: true, currentDevice: isCurrent } });
    if (isCurrent) {
      return clearAuthCookies(res);
    }
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    return fail(err, requestId);
  }
}
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, newRequestId, ok } from "@/lib/api";
import { ensureBootstrapAdmin } from "@/lib/bootstrap";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    await ensureBootstrapAdmin();
    const context = await requireAdmin({ headers: req.headers });
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          deletedAt: true,
          _count: { select: { devices: true, sessions: true } },
        },
      }),
      prisma.user.count(),
    ]);

    // Administrators get account metadata only, never financial details.
    return ok({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        emailVerified: u.emailVerifiedAt !== null,
        createdAt: u.createdAt.toISOString(),
        deleted: u.deletedAt !== null,
        deviceCount: u._count.devices,
        sessionCount: u._count.sessions,
      })),
      pagination: { limit, offset, total },
      viewerRole: context.user.role,
    });
  } catch (err) {
    return fail(err, requestId);
  }
}
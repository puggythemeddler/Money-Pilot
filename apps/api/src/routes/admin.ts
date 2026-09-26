import { Hono } from "hono";
import { createInvitationSchema } from "@moneypilot/shared";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { requireAdmin } from "@/lib/auth";
import { createInvitation, listInvitations, revokeInvitation } from "@/lib/invitations";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";

/**
 * Admin routes mounted at /api: user listing (account metadata only, never
 * financial details) and registration-invitation management. Ported verbatim
 * from the Next.js route handlers.
 */

const admin = new Hono();

admin.get("/admin/users", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireAdmin(req);
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
});

admin.post("/admin/invitations", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const ip = getClientIp(req);
    const context = await requireAdmin(req);

    const raw = await parseJson(req);
    const input = validate(createInvitationSchema, raw);
    const invite = await createInvitation(context.user.id, {
      email: input.email,
      role: input.role,
      expiresInDays: input.expiresInDays,
    });

    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.INVITE_CREATED,
      entityType: "Invitation",
      entityId: invite.id,
      metadata: { email: invite.email, role: invite.role },
      ip,
    });

    // The register link points at the web app, not this API service.
    const registerUrl = `${env.appBaseUrl}/register?invite=${invite.token}`;
    return ok(
      {
        id: invite.id,
        token: invite.token,
        registerUrl,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
});

admin.get("/admin/invitations", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireAdmin(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0);

    const { items, total } = await listInvitations({ limit, offset, status });

    return ok({
      invitations: items.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        expiresAt: i.expiresAt.toISOString(),
        usedAt: i.usedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
      pagination: { limit, offset, total },
      adminUserId: context.user.id,
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

admin.delete("/admin/invitations/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const ip = getClientIp(req);
    const admin = await requireAdmin(req);
    const id = c.req.param("id");

    await revokeInvitation(id);

    await writeAudit({
      userId: admin.user.id,
      action: AUDIT_ACTIONS.INVITE_REVOKED,
      entityType: "Invitation",
      entityId: id,
      ip,
    });

    return ok({ revoked: id });
  } catch (err) {
    return fail(err, requestId);
  }
});

export const adminRoutes = admin;

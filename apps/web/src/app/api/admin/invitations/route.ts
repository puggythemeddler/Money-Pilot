import { NextRequest } from "next/server";
import { createInvitationSchema } from "@moneypilot/shared";
import { requireAdmin } from "@/lib/auth";
import { createInvitation, listInvitations } from "@/lib/invitations";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const ip = getClientIp(req);
    const context = await requireAdmin({ headers: req.headers });

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

    const registerUrl = `${new URL(req.url).origin}/register?invite=${invite.token}`;
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
}

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireAdmin({ headers: req.headers });
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
}
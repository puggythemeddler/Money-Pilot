import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revokeInvitation } from "@/lib/invitations";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { fail, getClientIp, newRequestId, ok } from "@/lib/api";
import { ensureBootstrapAdmin } from "@/lib/bootstrap";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    await ensureBootstrapAdmin();
    const ip = getClientIp(req);
    const admin = await requireAdmin({ headers: req.headers });
    const { id } = await ctx.params;

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
}
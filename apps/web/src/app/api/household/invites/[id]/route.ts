import { NextRequest } from "next/server";
import { fail, getClientIp, newRequestId, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { revokeHouseholdInvite } from "@/lib/finance/households";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Revokes a pending invitation (owner only). */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    await revokeHouseholdInvite(context.user.id, id, { ip, userAgent: ua });
    return ok({ revoked: true });
  } catch (err) {
    return fail(err, requestId);
  }
}

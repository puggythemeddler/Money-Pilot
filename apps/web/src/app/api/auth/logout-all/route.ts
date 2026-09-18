import { NextRequest, NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { revokeAllSessions } from "@/lib/sessions";
import { writeAudit } from "@/lib/audit";
import { fail, newRequestId } from "@/lib/api";
import { clearAuthCookies } from "@/lib/cookies";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    await revokeAllSessions(context.user.id);
    await writeAudit({
      userId: context.user.id,
      action: AUDIT_ACTIONS.LOGOUT_ALL,
      entityType: "User",
      entityId: context.user.id,
    });
    return clearAuthCookies(NextResponse.json({ data: { loggedOutAll: true } }));
  } catch (err) {
    return fail(err, requestId);
  }
}
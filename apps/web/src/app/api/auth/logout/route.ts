import { NextRequest, NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { revokeSession } from "@/lib/sessions";
import { writeAudit } from "@/lib/audit";
import { clearAuthCookies } from "@/lib/cookies";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext({ headers: req.headers });
    if (context) {
      await revokeSession(context.sessionId);
      await writeAudit({
        userId: context.user.id,
        action: AUDIT_ACTIONS.LOGOUT,
        entityType: "Session",
        entityId: context.sessionId,
      });
    }
    return clearAuthCookies(NextResponse.json({ data: { loggedOut: true } }));
  } catch {
    // Logout is best-effort: pretend success and clear cookies regardless.
    return clearAuthCookies(NextResponse.json({ data: { loggedOut: true } }));
  }
}
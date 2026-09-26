import { NextRequest } from "next/server";
import { householdInviteCreateSchema } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createHouseholdInvite, listHouseholdInvites } from "@/lib/finance/households";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const invites = await listHouseholdInvites(context.user.id);
    return ok({ invites });
  } catch (err) {
    return fail(err, requestId);
  }
}

/**
 * Creates an invitation link. The plain token is returned exactly once — only
 * its SHA-256 digest is stored, so a leaked database cannot leak live invites.
 */
export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(householdInviteCreateSchema, raw);
    const invite = await createHouseholdInvite(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        invite: {
          id: invite.id,
          token: invite.token,
          canRecord: invite.canRecord,
          expiresAt: invite.expiresAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
}

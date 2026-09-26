import { NextRequest } from "next/server";
import { householdInviteAcceptSchema } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { acceptHouseholdInvite } from "@/lib/finance/households";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(householdInviteAcceptSchema, raw);
    const result = await acceptHouseholdInvite(context.user.id, input, { ip, userAgent: ua });
    return ok({ joined: true, householdId: result.householdId, canRecord: result.canRecord });
  } catch (err) {
    return fail(err, requestId);
  }
}

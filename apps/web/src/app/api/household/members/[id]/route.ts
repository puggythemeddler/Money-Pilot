import { NextRequest } from "next/server";
import { householdMemberUpdateSchema } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { removeHouseholdMember, updateHouseholdMemberPermission } from "@/lib/finance/households";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Grants or withdraws a member's record permission (owner only). */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    const raw = await parseJson(req);
    const input = validate(householdMemberUpdateSchema, raw);
    await updateHouseholdMemberPermission(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ member: { id, canRecord: input.canRecord } });
  } catch (err) {
    return fail(err, requestId);
  }
}

/** Removes a member from the household (owner only). */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    await removeHouseholdMember(context.user.id, id, { ip, userAgent: ua });
    return ok({ removed: true });
  } catch (err) {
    return fail(err, requestId);
  }
}

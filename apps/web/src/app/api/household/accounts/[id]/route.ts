import { NextRequest } from "next/server";
import { accountUpdateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { updateJointAccount } from "@/lib/finance/households";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Renames or archives a joint account (owner only). */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    const raw = await parseJson(req);
    const input = validate(accountUpdateSchema, raw);
    const account = await updateJointAccount(context.user.id, id, input, { ip, userAgent: ua });
    return ok({
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalanceMinor: minorToNumber(account.openingBalanceMinor),
        archived: account.archivedAt !== null,
        shared: true,
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
}

import { NextRequest } from "next/server";
import { accountUpdateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOwnedAccount, updateAccount } from "@/lib/finance/accounts";
import { accountBalances } from "@/lib/finance/balances";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const { id } = await ctx.params;
    const account = await getOwnedAccount(context.user.id, id);
    const balance = await accountBalances(context.user.id, [id]);
    const opening = minorToNumber(account.openingBalanceMinor);
    return ok({
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalanceMinor: opening,
        balanceMinor: opening + (balance[id]?.balanceMinor ?? 0),
        archived: account.archivedAt !== null,
        createdAt: account.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    const raw = await parseJson(req);
    const input = validate(accountUpdateSchema, raw);
    const account = await updateAccount(context.user.id, id, input, { ip, userAgent: ua });
    return ok({
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalanceMinor: minorToNumber(account.openingBalanceMinor),
        archived: account.archivedAt !== null,
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
}
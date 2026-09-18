import { NextRequest } from "next/server";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createAccount, listAccounts } from "@/lib/finance/accounts";
import { accountCreateSchema } from "@moneypilot/shared";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("archived") === "1" || url.searchParams.get("archived") === "true";
    const accounts = await listAccounts(context.user.id, includeArchived);
    return ok({ accounts });
  } catch (err) {
    return fail(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(accountCreateSchema, raw);
    const account = await createAccount(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        account: {
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalanceMinor: account.openingBalanceMinor,
          archived: false,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
}
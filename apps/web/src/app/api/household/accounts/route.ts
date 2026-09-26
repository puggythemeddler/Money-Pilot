import { NextRequest } from "next/server";
import { accountCreateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createJointAccount } from "@/lib/finance/households";

/** Creates a joint account owned by the household (owner only). */
export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(accountCreateSchema, raw);
    const account = await createJointAccount(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        account: {
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalanceMinor: minorToNumber(account.openingBalanceMinor),
          archived: false,
          shared: true,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
}

import { NextRequest } from "next/server";
import { transferCreateSchema } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createTransfer, listTransfers } from "@/lib/finance/transfers";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const transfers = await listTransfers(context.user.id);
    return ok({ transfers });
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
    const input = validate(transferCreateSchema, raw);
    const transfer = await createTransfer(context.user.id, input, { ip, userAgent: ua });
    return ok({ transfer }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
}
import { NextRequest } from "next/server";
import { fail, getClientIp, newRequestId, ok, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { transferUpdateSchema } from "@moneypilot/shared";
import { updateTransfer, deleteTransfer } from "@/lib/finance/transfers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const input = validate(transferUpdateSchema, body);
    const updated = await updateTransfer(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ transfer: updated });
  } catch (err) {
    return fail(err, requestId);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    await deleteTransfer(context.user.id, id, { ip, userAgent: ua });
    return ok({ deleted: id });
  } catch (err) {
    return fail(err, requestId);
  }
}
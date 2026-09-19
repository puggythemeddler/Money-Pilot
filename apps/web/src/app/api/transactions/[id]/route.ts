import { NextRequest } from "next/server";
import { transactionUpdateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deleteTransaction, updateTransaction } from "@/lib/finance/transactions";

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
    const raw = await parseJson(req);
    const input = validate(transactionUpdateSchema, raw);
    const transaction = await updateTransaction(context.user.id, id, input, { ip, userAgent: ua });
    return ok({
      transaction: {
        id: transaction.id,
        amountMinor: minorToNumber(transaction.amountMinor),
        transactionDate: transaction.transactionDate.toISOString(),
        categoryId: transaction.categoryId,
      },
    });
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
    await deleteTransaction(context.user.id, id, { ip, userAgent: ua });
    return ok({ deleted: id });
  } catch (err) {
    return fail(err, requestId);
  }
}
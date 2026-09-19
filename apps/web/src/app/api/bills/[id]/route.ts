import { NextRequest } from "next/server";
import { billPaySchema, billUpdateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { payBill, updateBill } from "@/lib/finance/bills";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serializeBill(bill: {
  id: string;
  name: string;
  amountMinor: bigint;
  currency: string;
  dueDay: number;
  categoryId: string | null;
  notes: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: bill.id,
    name: bill.name,
    amountMinor: minorToNumber(bill.amountMinor),
    currency: bill.currency,
    dueDay: bill.dueDay,
    categoryId: bill.categoryId,
    notes: bill.notes,
    archived: bill.archivedAt !== null,
  };
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    const raw = await parseJson(req);
    const input = validate(billUpdateSchema, raw);
    const bill = await updateBill(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ bill: serializeBill(bill) });
  } catch (err) {
    return fail(err, requestId);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
    const raw = await parseJson(req);
    const input = validate(billPaySchema, raw);
    const result = await payBill(context.user.id, id, input, { ip, userAgent: ua });
    return ok(result, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
}
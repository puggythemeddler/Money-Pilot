import { NextRequest } from "next/server";
import { debtUpdateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { updateDebt } from "@/lib/finance/debts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serializeDebt(debt: {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  principalMinor: bigint;
  currency: string;
  interestRate: string | null;
  minimumPaymentMinor: bigint | null;
  dueDay: number | null;
  categoryId: string | null;
  notes: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: debt.id,
    name: debt.name,
    type: debt.type,
    institution: debt.institution,
    principalMinor: minorToNumber(debt.principalMinor),
    currency: debt.currency,
    interestRate: debt.interestRate,
    minimumPaymentMinor: debt.minimumPaymentMinor !== null ? minorToNumber(debt.minimumPaymentMinor) : null,
    dueDay: debt.dueDay,
    categoryId: debt.categoryId,
    notes: debt.notes,
    archived: debt.archivedAt !== null,
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
    const input = validate(debtUpdateSchema, raw);
    const debt = await updateDebt(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ debt: serializeDebt(debt) });
  } catch (err) {
    return fail(err, requestId);
  }
}
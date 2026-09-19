import { NextRequest } from "next/server";
import { budgetUpdateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { updateBudget } from "@/lib/finance/budgets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serializeBudget(budget: {
  id: string;
  name: string;
  amountMinor: bigint;
  currency: string;
  period: string;
  categoryId: string | null;
  notes: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: budget.id,
    name: budget.name,
    amountMinor: minorToNumber(budget.amountMinor),
    currency: budget.currency,
    period: budget.period,
    categoryId: budget.categoryId,
    notes: budget.notes,
    archived: budget.archivedAt !== null,
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
    const input = validate(budgetUpdateSchema, raw);
    const budget = await updateBudget(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ budget: serializeBudget(budget) });
  } catch (err) {
    return fail(err, requestId);
  }
}
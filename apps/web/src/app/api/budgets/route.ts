import { NextRequest } from "next/server";
import { budgetCreateSchema, budgetQuerySchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createBudget, listBudgets } from "@/lib/finance/budgets";

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

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const url = new URL(req.url);
    const query = validate(budgetQuerySchema, {
      period: url.searchParams.get("period") ?? undefined,
    });
    const budgets = await listBudgets(context.user.id, query.period);
    return ok({ budgets });
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
    const input = validate(budgetCreateSchema, raw);
    const budget = await createBudget(context.user.id, input, { ip, userAgent: ua });
    return ok({ budget: serializeBudget(budget) }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
}
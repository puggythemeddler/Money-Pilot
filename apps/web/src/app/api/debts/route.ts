import { NextRequest } from "next/server";
import { debtCreateSchema, debtQuerySchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createDebt, listDebts } from "@/lib/finance/debts";

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

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const url = new URL(req.url);
    const query = validate(debtQuerySchema, {
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    });
    const debts = await listDebts(context.user.id, query.includeArchived ?? false);
    return ok({ debts });
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
    const input = validate(debtCreateSchema, raw);
    const debt = await createDebt(context.user.id, input, { ip, userAgent: ua });
    return ok({ debt: serializeDebt(debt) }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
}